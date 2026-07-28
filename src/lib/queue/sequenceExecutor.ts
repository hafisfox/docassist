/**
 * Sequence execution engine.
 *
 * Call `runSequenceExecutor(supabase)` from a cron-triggered API route or
 * Supabase Edge Function (using the service-role client so RLS is bypassed).
 *
 * Each invocation:
 *  1. Fetches up to BATCH_SIZE enrollments where status='active' AND next_execution_at <= now()
 *  2. For each enrollment, resolves and executes the current step
 *  3. Advances the enrollment (or marks it completed/failed)
 *  4. Adds a small random delay between enrollments to pace Unipile API calls
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { checkAndIncrementLimit, randomDelay } from "@/lib/queue/rateLimiter";
import { getUnipileClient } from "@/lib/unipile/client";
import { getCircuitBreaker } from "@/lib/queue/circuitBreaker";
import { fillTemplate } from "@/constants/templateVariables";
import {
  WAIT_FOR_ACCEPTANCE_TIMEOUT_DAYS,
  WAIT_FOR_ACCEPTANCE_CHECK_INTERVAL_HOURS,
} from "@/constants/sequenceDefaults";
import type {
  Database,
  Lead,
  Campaign,
  Settings,
  SequenceEnrollment,
  SequenceStep,
  ActivityType,
  LeadStatus,
} from "@/types/database";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum enrollments processed per executor run.
 *
 * Sized to what actually fits the cron window, not to what we'd like to send.
 * Each enrollment costs a 30–120 s action delay plus a 3–10 s inter-enrollment
 * delay, and the route's maxDuration is 300 s — so ~2 (worst case) to ~9 (best
 * case) complete per run. Claiming 50 meant ~40 sat claimed-but-untouched and
 * invisible until the claim expired, cutting effective throughput rather than
 * raising it.
 */
const BATCH_SIZE = 10;

/**
 * Wall-clock budget for one run. Kept under the route's `maxDuration = 300`
 * so the executor stops starting new enrollments and releases the rest of its
 * claim, instead of being killed mid-step with rows still claimed.
 */
const RUN_BUDGET_MS = 240_000;
/** Random inter-enrollment delay to pace Unipile API calls */
const BETWEEN_MIN_MS = 3_000;
const BETWEEN_MAX_MS = 10_000;
/**
 * After executing an action step (connection_request / message / condition),
 * schedule the next step check this many ms from now.
 */
const NEXT_STEP_CHECK_DELAY_MS = 60_000; // 1 minute

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExecutionResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * Main entry point. Pass a service-role Supabase client so the executor can
 * read/write across all users without RLS restrictions.
 */
export async function runSequenceExecutor(
  supabase: SupabaseClient<Database>
): Promise<ExecutionResult> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  log.info("sequence executor started");

  // ── Circuit breaker setup ─────────────────────────────────────────────────
  // Register the onOpen callback with the current supabase client so that when
  // the circuit trips, all active campaigns are paused immediately.
  const cb = getCircuitBreaker();
  cb.setOnOpenCallback(async () => {
    log.error("circuit breaker OPENED — pausing all active campaigns");
    const now = new Date().toISOString();

    const { data: activeCampaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("status", "active");

    if (!activeCampaigns || activeCampaigns.length === 0) return;

    const ids = (activeCampaigns as { id: string }[]).map((c) => c.id);

    // Pause all active sequence enrollments for these campaigns
    await supabase
      .from("sequence_enrollments")
      .update({ status: "paused" })
      .in("campaign_id", ids)
      .eq("status", "active");

    // Pause the campaigns themselves
    await supabase
      .from("campaigns")
      .update({ status: "paused", paused_at: now })
      .in("id", ids);

    log.error(
      { pausedCampaignIds: ids, count: ids.length },
      "campaigns paused by circuit breaker"
    );
  });

  // Bail early if the circuit is already OPEN
  // The circuit is shared state; this cron invocation may never have seen the
  // failures that opened it.
  await cb.hydrate(true);

  if (cb.getStatus().state === "OPEN") {
    log.warn("circuit breaker OPEN — sequence executor skipped");
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const enrollments = await fetchDueEnrollments(supabase);
  log.info({ count: enrollments.length }, "fetched due enrollments");

  const result: ExecutionResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  const deadline = Date.now() + RUN_BUDGET_MS;
  let i = 0;

  for (; i < enrollments.length; i++) {
    // Stop before starting work we can't finish: an enrollment costs up to
    // ~130 s, and being killed mid-step leaves the row claimed.
    if (Date.now() >= deadline) {
      log.warn(
        { processed: result.processed, remaining: enrollments.length - i },
        "run budget exhausted — releasing remaining claims"
      );
      break;
    }

    const enrollment = enrollments[i];
    const eid = createCorrelationId();
    result.processed++;

    try {
      const outcome = await executeEnrollmentStep(supabase, enrollment, eid);
      if (outcome === "skipped") {
        result.skipped++;
      } else {
        result.succeeded++;
      }
    } catch (err) {
      result.failed++;
      withCorrelationId(eid).error(
        { error: err, enrollmentId: enrollment.id },
        "unhandled error processing enrollment"
      );
    }

    // Random delay between enrollments (skip after the last one)
    if (i < enrollments.length - 1) {
      await randomDelay(BETWEEN_MIN_MS, BETWEEN_MAX_MS);
    }
  }

  // Hand back anything we claimed but never touched so the next tick picks it
  // up immediately, rather than waiting out CLAIM_WINDOW_MS.
  if (i < enrollments.length) {
    await releaseClaims(
      supabase,
      enrollments.slice(i).map((e) => e.id)
    );
  }

  log.info(result, "sequence executor finished");
  return result;
}

/**
 * Undo the claim on enrollments this run never got to, making them due again
 * now. Best-effort: on failure they simply wait out CLAIM_WINDOW_MS.
 */
async function releaseClaims(
  supabase: SupabaseClient<Database>,
  enrollmentIds: string[]
): Promise<void> {
  if (enrollmentIds.length === 0) return;

  const { error } = await supabase
    .from("sequence_enrollments")
    .update({ next_execution_at: new Date().toISOString() })
    .in("id", enrollmentIds)
    .eq("status", "active");

  if (error) {
    withCorrelationId(createCorrelationId()).error(
      { error, count: enrollmentIds.length },
      "failed to release unprocessed enrollment claims"
    );
  }
}

/**
 * How far into the future fetched enrollments are "claimed" by bumping
 * next_execution_at. Every successful step execution overwrites this value,
 * so the claim only matters when a run overlaps with the next cron tick or
 * crashes mid-batch (the enrollment then retries after the claim expires).
 *
 * Kept just above the 5-minute cron interval: a claim that outlives the run
 * by much makes crashed-mid-batch enrollments invisible for that whole window.
 */
const CLAIM_WINDOW_MS = 6 * 60_000;

/**
 * Fetch active enrollments whose execution time has arrived, ordered by
 * next_execution_at ascending so oldest-due are processed first.
 *
 * The fetched rows are immediately claimed (next_execution_at pushed
 * CLAIM_WINDOW_MS into the future) so an overlapping executor run doesn't
 * pick up the same enrollments and double-send LinkedIn actions.
 */
export async function fetchDueEnrollments(
  supabase: SupabaseClient<Database>
): Promise<SequenceEnrollment[]> {
  const now = Date.now();

  const { data, error } = await supabase
    .from("sequence_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("next_execution_at", new Date(now).toISOString())
    .order("next_execution_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    throw new Error(`fetchDueEnrollments: ${error.message}`);
  }

  const enrollments = (data ?? []) as SequenceEnrollment[];
  if (enrollments.length === 0) return enrollments;

  const claimUntil = new Date(now + CLAIM_WINDOW_MS).toISOString();
  const { error: claimError } = await supabase
    .from("sequence_enrollments")
    .update({ next_execution_at: claimUntil })
    .in(
      "id",
      enrollments.map((e) => e.id)
    )
    .eq("status", "active");

  if (claimError) {
    // Not fatal — we just lose the overlap protection for this run
    withCorrelationId(createCorrelationId()).error(
      { error: claimError },
      "failed to claim due enrollments"
    );
  }

  return enrollments;
}

// ── Step execution ────────────────────────────────────────────────────────────

async function executeEnrollmentStep(
  supabase: SupabaseClient<Database>,
  enrollment: SequenceEnrollment,
  correlationId: string
): Promise<"ok" | "skipped"> {
  const log = withCorrelationId(correlationId).child({
    enrollmentId: enrollment.id,
    leadId: enrollment.lead_id,
  });

  // ── 1. Fetch lead ─────────────────────────────────────────────────────
  const { data: leadData, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", enrollment.lead_id)
    .single();

  if (leadError || !leadData) {
    log.error({ leadId: enrollment.lead_id }, "lead not found");
    await failEnrollment(supabase, enrollment.id, `Lead ${enrollment.lead_id} not found`);
    return "skipped";
  }
  const lead = leadData as Lead;

  // ── 2. Fetch campaign (provides user_id + active status) ──────────────
  const { data: campaignData, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", enrollment.campaign_id)
    .single();

  if (campaignError || !campaignData) {
    log.error({ campaignId: enrollment.campaign_id }, "campaign not found");
    await failEnrollment(supabase, enrollment.id, `Campaign ${enrollment.campaign_id} not found`);
    return "skipped";
  }
  const campaign = campaignData as Campaign;

  // If the campaign was paused/completed externally, pause this enrollment too
  if (campaign.status !== "active") {
    log.info({ campaignStatus: campaign.status }, "campaign not active — pausing enrollment");
    await updateEnrollmentFields(supabase, enrollment.id, { status: "paused" });
    return "skipped";
  }

  // ── 3. Fetch user settings (rate limits + working hours) ──────────────
  const settings = await getUserSettings(supabase, campaign.user_id);

  // ── 4. Check working hours — reschedule if outside window ────────────
  if (settings && !isWithinWorkingHours(settings)) {
    const nextWindow = getNextWorkingWindowStart(settings);
    log.info({ nextWindow: nextWindow.toISOString() }, "outside working hours — rescheduled");
    await updateEnrollmentFields(supabase, enrollment.id, {
      next_execution_at: nextWindow.toISOString(),
    });
    return "skipped";
  }

  // ── 5. Fetch current step ─────────────────────────────────────────────
  const { data: stepData } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", enrollment.sequence_id)
    .eq("step_order", enrollment.current_step)
    .maybeSingle();

  if (!stepData) {
    // No step at this order → sequence is complete
    log.info({ stepOrder: enrollment.current_step }, "no step found — enrollment complete");
    await updateEnrollmentFields(supabase, enrollment.id, {
      status: "completed",
      last_executed_at: new Date().toISOString(),
      next_execution_at: null,
    });
    return "ok";
  }
  const step = stepData as SequenceStep;

  // ── 6. Dispatch step ──────────────────────────────────────────────────
  try {
    await dispatchStep(supabase, enrollment, lead, campaign, settings, step, correlationId);
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ error: err, stepType: step.step_type, stepOrder: step.step_order }, "step failed");
    await failEnrollment(supabase, enrollment.id, msg);
    await insertActivity(supabase, {
      user_id: campaign.user_id,
      lead_id: lead.id,
      campaign_id: campaign.id,
      activity_type: "error",
      description: `Step ${step.step_order} (${step.step_type}) failed: ${msg}`,
      metadata: { step_order: step.step_order, step_type: step.step_type, error: msg },
    });
    return "skipped";
  }
}

// ── Step dispatch ─────────────────────────────────────────────────────────────

async function dispatchStep(
  supabase: SupabaseClient<Database>,
  enrollment: SequenceEnrollment,
  lead: Lead,
  campaign: Campaign,
  settings: Settings | null,
  step: SequenceStep,
  correlationId: string
): Promise<void> {
  const log = withCorrelationId(correlationId).child({
    stepType: step.step_type,
    stepOrder: step.step_order,
  });

  const now = new Date();
  const minDelayMs = (settings?.min_delay_seconds ?? 30) * 1_000;
  const maxDelayMs = (settings?.max_delay_seconds ?? 120) * 1_000;

  let nextStepOrder: number | null;
  let nextExecutionAt: Date;

  switch (step.step_type) {
    // ── connection_request ───────────────────────────────────────────────
    case "connection_request": {
      if (!lead.linkedin_provider_id) {
        throw new Error("Lead is missing linkedin_provider_id");
      }

      const limitResult = await checkAndIncrementLimit(
        supabase,
        campaign.user_id,
        "invite",
        correlationId
      );
      if (!limitResult.allowed) {
        log.warn("invite rate limit reached — rescheduled for tomorrow");
        await updateEnrollmentFields(supabase, enrollment.id, {
          next_execution_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
        });
        return;
      }

      let inviteMessage = await resolveMessageBody(supabase, step, lead);
      // Enforce LinkedIn's hard 300-char limit after variable substitution
      if (inviteMessage && inviteMessage.length > 300) {
        log.warn({ length: inviteMessage.length }, "invite message truncated to 300 chars");
        inviteMessage = inviteMessage.slice(0, 297) + "...";
      }

      await randomDelay(minDelayMs, maxDelayMs);

      const inviteResp = await getUnipileClient().sendInvitation(
        { provider_id: lead.linkedin_provider_id, message: inviteMessage ?? undefined },
        correlationId
      );

      await updateLeadStatus(supabase, lead.id, "invite_sent");
      await insertMessage(supabase, {
        user_id: campaign.user_id,
        lead_id: lead.id,
        campaign_id: campaign.id,
        direction: "outbound",
        message_text: inviteMessage ?? "",
        message_type: "connection_request",
        is_automated: true,
        sequence_step_id: step.id,
        sent_at: now.toISOString(),
      });
      await insertActivity(supabase, {
        user_id: campaign.user_id,
        lead_id: lead.id,
        campaign_id: campaign.id,
        activity_type: "invite_sent",
        description: "Connection request sent",
        metadata: { invite_id: inviteResp.invite_id, step_order: step.step_order },
      });
      await incrementCampaignStat(supabase, campaign.id, "invites_sent");

      nextStepOrder = await getNextStepOrder(supabase, enrollment.sequence_id, step.step_order);
      nextExecutionAt = new Date(now.getTime() + NEXT_STEP_CHECK_DELAY_MS);
      log.info({ inviteId: inviteResp.invite_id }, "connection request sent");
      break;
    }

    // ── wait_for_acceptance ──────────────────────────────────────────────
    case "wait_for_acceptance": {
      const daysSinceEnrolled =
        (now.getTime() - new Date(enrollment.created_at).getTime()) / 86_400_000;

      if (daysSinceEnrolled > WAIT_FOR_ACCEPTANCE_TIMEOUT_DAYS) {
        log.info({ daysSinceEnrolled }, "wait_for_acceptance timed out");
        await updateEnrollmentFields(supabase, enrollment.id, {
          status: "failed",
          error_message: `Acceptance timed out after ${WAIT_FOR_ACCEPTANCE_TIMEOUT_DAYS} days`,
          last_executed_at: now.toISOString(),
        });
        await insertActivity(supabase, {
          user_id: campaign.user_id,
          lead_id: lead.id,
          campaign_id: campaign.id,
          activity_type: "invite_expired",
          description: "Connection request expired — lead did not accept within the timeout period",
          metadata: { days_waited: Math.floor(daysSinceEnrolled) },
        });
        return;
      }

      if (lead.status === "do_not_contact") {
        await failEnrollment(supabase, enrollment.id, "Lead marked as do_not_contact");
        return;
      }

      if (lead.status === "invite_accepted") {
        log.info("invite accepted — advancing to next step");
        nextStepOrder = await getNextStepOrder(supabase, enrollment.sequence_id, step.step_order);
        nextExecutionAt = new Date(now.getTime() + NEXT_STEP_CHECK_DELAY_MS);
      } else {
        // Still pending — recheck after interval
        log.debug({ leadStatus: lead.status }, "invite not yet accepted — rechecking later");
        nextStepOrder = enrollment.current_step; // stay on this step
        nextExecutionAt = new Date(
          now.getTime() + WAIT_FOR_ACCEPTANCE_CHECK_INTERVAL_HOURS * 3_600_000
        );
      }
      break;
    }

    // ── message ──────────────────────────────────────────────────────────
    case "message": {
      if (!lead.linkedin_provider_id) {
        throw new Error("Lead is missing linkedin_provider_id");
      }

      const limitResult = await checkAndIncrementLimit(
        supabase,
        campaign.user_id,
        "message",
        correlationId
      );
      if (!limitResult.allowed) {
        log.warn("message rate limit reached — rescheduled for tomorrow");
        await updateEnrollmentFields(supabase, enrollment.id, {
          next_execution_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
        });
        return;
      }

      const messageBody = await resolveMessageBody(supabase, step, lead);
      if (!messageBody) throw new Error("Could not resolve message body for message step");

      await randomDelay(minDelayMs, maxDelayMs);

      const client = getUnipileClient();
      let chatId = lead.unipile_chat_id;

      if (chatId) {
        await client.sendMessageInChat({ chat_id: chatId, text: messageBody }, correlationId);
      } else {
        const chatResp = await client.sendMessage(
          { attendees_ids: [lead.linkedin_provider_id], text: messageBody },
          correlationId
        );
        chatId = chatResp.chat_id;
        await supabase
          .from("leads")
          .update({ unipile_chat_id: chatId })
          .eq("id", lead.id);
      }

      // Only downgrade status if lead hasn't already replied or moved further
      const preserveStatuses: LeadStatus[] = [
        "replied",
        "interested",
        "not_interested",
        "meeting_booked",
        "converted",
        "do_not_contact",
      ];
      if (!preserveStatuses.includes(lead.status)) {
        await updateLeadStatus(supabase, lead.id, "message_sent");
      }

      await insertMessage(supabase, {
        user_id: campaign.user_id,
        lead_id: lead.id,
        campaign_id: campaign.id,
        unipile_chat_id: chatId,
        direction: "outbound",
        message_text: messageBody,
        message_type: "linkedin_message",
        is_automated: true,
        sequence_step_id: step.id,
        sent_at: now.toISOString(),
      });
      await insertActivity(supabase, {
        user_id: campaign.user_id,
        lead_id: lead.id,
        campaign_id: campaign.id,
        activity_type: "message_sent",
        description: "Automated message sent",
        metadata: { chat_id: chatId, step_order: step.step_order },
      });
      await incrementCampaignStat(supabase, campaign.id, "messages_sent");

      nextStepOrder = await getNextStepOrder(supabase, enrollment.sequence_id, step.step_order);
      nextExecutionAt = new Date(now.getTime() + NEXT_STEP_CHECK_DELAY_MS);
      log.info({ chatId }, "message sent");
      break;
    }

    // ── delay ─────────────────────────────────────────────────────────────
    case "delay": {
      const delayMs =
        step.delay_hours != null
          ? step.delay_hours * 3_600_000
          : (step.delay_days ?? 1) * 86_400_000;

      nextStepOrder = await getNextStepOrder(supabase, enrollment.sequence_id, step.step_order);
      nextExecutionAt = new Date(now.getTime() + delayMs);
      log.info({ delayMs, nextExecutionAt: nextExecutionAt.toISOString() }, "delay scheduled");
      break;
    }

    // ── condition ─────────────────────────────────────────────────────────
    case "condition": {
      const conditionMet = evaluateCondition(lead, step);
      const targetStep = conditionMet ? step.on_true_step : step.on_false_step;

      log.info(
        { conditionField: step.condition_field, conditionMet, targetStep },
        "condition evaluated"
      );

      // A null branch target means "stop here", not "advance linearly".
      // constants/sequenceDefaults.ts encodes the canonical condition as
      // `on_true_step: null  // replied → sequence complete (human takes over)`,
      // so falling through would send the automated nudge to a lead who has
      // already replied. `nextStepOrder == null` completes the enrollment below.
      nextStepOrder = targetStep;
      nextExecutionAt = new Date(now.getTime() + NEXT_STEP_CHECK_DELAY_MS);
      break;
    }

    default: {
      // TypeScript exhaustiveness check
      const exhaustiveCheck: never = step.step_type as never;
      throw new Error(`Unknown step type: ${exhaustiveCheck}`);
    }
  }

  // ── Advance enrollment ────────────────────────────────────────────────────
  if (nextStepOrder == null) {
    // No further steps — sequence complete
    await updateEnrollmentFields(supabase, enrollment.id, {
      status: "completed",
      last_executed_at: now.toISOString(),
      next_execution_at: null,
    });
    log.info("enrollment completed — no more steps");
  } else {
    await updateEnrollmentFields(supabase, enrollment.id, {
      current_step: nextStepOrder,
      next_execution_at: nextExecutionAt.toISOString(),
      last_executed_at: now.toISOString(),
    });
  }
}

// ── Working hours helpers ─────────────────────────────────────────────────────

/** Returns the current hour (0–23) in the given IANA timezone */
function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  // hour12: false can return "24" for midnight — normalise with mod
  return parseInt(formatter.format(date), 10) % 24;
}

function isWithinWorkingHours(settings: Settings): boolean {
  const hour = getHourInTimezone(new Date(), settings.timezone || "UTC");
  return hour >= settings.outreach_start_hour && hour < settings.outreach_end_hour;
}

/**
 * Returns a Date for the next start of the outreach window.
 * Approximation: adds whole hours (ignores minutes/seconds) — sufficient for scheduling.
 */
function getNextWorkingWindowStart(settings: Settings): Date {
  const now = new Date();
  const hour = getHourInTimezone(now, settings.timezone || "UTC");
  const start = settings.outreach_start_hour;
  const end = settings.outreach_end_hour;

  let hoursToWait: number;
  if (hour < start) {
    hoursToWait = start - hour;
  } else if (hour >= end) {
    hoursToWait = 24 - hour + start;
  } else {
    hoursToWait = 0; // already in window (shouldn't be reached here)
  }

  return new Date(now.getTime() + hoursToWait * 3_600_000);
}

// ── Sequence helpers ──────────────────────────────────────────────────────────

/**
 * Returns the step_order of the next step after `currentStepOrder`,
 * or null if there are no more steps in the sequence.
 */
async function getNextStepOrder(
  supabase: SupabaseClient<Database>,
  sequenceId: string,
  currentStepOrder: number
): Promise<number | null> {
  const { data } = await supabase
    .from("sequence_steps")
    .select("step_order")
    .eq("sequence_id", sequenceId)
    .gt("step_order", currentStepOrder)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? (data as { step_order: number }).step_order : null;
}

function personalizeMessage(body: string, lead: Lead): string {
  return fillTemplate(body, lead);
}

/**
 * Statuses that all mean "this lead has responded". A `status == replied`
 * condition must match every one of them: a lead who replied and was then
 * marked `interested` or `meeting_booked` has still replied, and exact string
 * equality would let them fall through to the automated follow-up nudge.
 */
const REPLIED_STATUSES: ReadonlySet<string> = new Set<LeadStatus>([
  "replied",
  "interested",
  "not_interested",
  "meeting_booked",
  "converted",
]);

function evaluateCondition(lead: Lead, step: SequenceStep): boolean {
  if (!step.condition_field || step.condition_value == null) return false;
  const fieldValue = (lead as unknown as Record<string, unknown>)[step.condition_field];
  const actual = String(fieldValue ?? "");

  if (step.condition_field === "status" && step.condition_value === "replied") {
    return REPLIED_STATUSES.has(actual);
  }

  return actual === step.condition_value;
}

async function resolveMessageBody(
  supabase: SupabaseClient<Database>,
  step: SequenceStep,
  lead: Lead
): Promise<string | undefined> {
  let raw: string | undefined;

  if (step.template_id) {
    const { data: template } = await supabase
      .from("templates")
      .select("body")
      .eq("id", step.template_id)
      .maybeSingle();
    raw = (template as { body: string } | null)?.body;
  } else if (step.message_body) {
    raw = step.message_body;
  }

  return raw ? personalizeMessage(raw, lead) : undefined;
}

async function getUserSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Settings | null> {
  const { data } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? (data as Settings) : null;
}

// ── DB write helpers ──────────────────────────────────────────────────────────

async function updateEnrollmentFields(
  supabase: SupabaseClient<Database>,
  enrollmentId: string,
  fields: Partial<Omit<SequenceEnrollment, "id" | "created_at">>
): Promise<void> {
  const { error } = await supabase
    .from("sequence_enrollments")
    .update(fields)
    .eq("id", enrollmentId);

  if (error) {
    withCorrelationId(createCorrelationId()).error(
      { error, enrollmentId },
      "failed to update enrollment"
    );
  }
}

async function failEnrollment(
  supabase: SupabaseClient<Database>,
  enrollmentId: string,
  reason: string
): Promise<void> {
  await updateEnrollmentFields(supabase, enrollmentId, {
    status: "failed",
    error_message: reason,
    last_executed_at: new Date().toISOString(),
  });
}

async function updateLeadStatus(
  supabase: SupabaseClient<Database>,
  leadId: string,
  status: LeadStatus
): Promise<void> {
  await supabase.from("leads").update({ status }).eq("id", leadId);
}

interface InsertMessagePayload {
  user_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  unipile_chat_id?: string | null;
  direction: "outbound" | "inbound";
  message_text: string;
  message_type: string;
  is_automated: boolean;
  sequence_step_id: string | null;
  sent_at: string | null;
}

async function insertMessage(
  supabase: SupabaseClient<Database>,
  payload: InsertMessagePayload
): Promise<void> {
  await supabase.from("messages").insert({
    user_id: payload.user_id,
    lead_id: payload.lead_id,
    campaign_id: payload.campaign_id,
    unipile_chat_id: payload.unipile_chat_id ?? null,
    unipile_message_id: null,
    direction: payload.direction,
    message_text: payload.message_text,
    message_type: payload.message_type,
    is_automated: payload.is_automated,
    sequence_step_id: payload.sequence_step_id,
    personalization_variables: {},
    sent_at: payload.sent_at,
    delivered_at: null,
    read_at: null,
  });
}

interface InsertActivityPayload {
  user_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  activity_type: ActivityType;
  description: string | null;
  metadata: Record<string, unknown>;
}

async function insertActivity(
  supabase: SupabaseClient<Database>,
  payload: InsertActivityPayload
): Promise<void> {
  await supabase.from("activities").insert(payload);
}

/**
 * Atomic stat increment via the increment_campaign_stat RPC, so concurrent
 * bumps (e.g. webhook + executor) don't clobber each other.
 */
async function incrementCampaignStat(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  field: "invites_sent" | "messages_sent" | "invites_accepted" | "replies_received"
): Promise<void> {
  const { error } = await supabase.rpc("increment_campaign_stat", {
    p_campaign_id: campaignId,
    p_field: field,
    p_delta: 1,
  });
  if (error) {
    withCorrelationId(createCorrelationId()).error(
      { error, campaignId, field },
      "failed to increment campaign stat"
    );
  }
}
