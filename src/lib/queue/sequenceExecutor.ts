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

/** Maximum enrollments processed per executor run */
const BATCH_SIZE = 50;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: activeCampaigns } = await (supabase as any)
      .from("campaigns")
      .select("id")
      .eq("status", "active");

    if (!activeCampaigns || activeCampaigns.length === 0) return;

    const ids = (activeCampaigns as { id: string }[]).map((c) => c.id);

    // Pause all active sequence enrollments for these campaigns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("sequence_enrollments")
      .update({ status: "paused" })
      .in("campaign_id", ids)
      .eq("status", "active");

    // Pause the campaigns themselves
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("campaigns")
      .update({ status: "paused", paused_at: now })
      .in("id", ids);

    log.error(
      { pausedCampaignIds: ids, count: ids.length },
      "campaigns paused by circuit breaker"
    );
  });

  // Bail early if the circuit is already OPEN
  if (cb.getStatus().state === "OPEN") {
    log.warn("circuit breaker OPEN — sequence executor skipped");
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const enrollments = await fetchDueEnrollments(supabase);
  log.info({ count: enrollments.length }, "fetched due enrollments");

  const result: ExecutionResult = {
    processed: enrollments.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (let i = 0; i < enrollments.length; i++) {
    const enrollment = enrollments[i];
    const eid = createCorrelationId();

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

  log.info(result, "sequence executor finished");
  return result;
}

/**
 * Fetch active enrollments whose execution time has arrived, ordered by
 * next_execution_at ascending so oldest-due are processed first.
 */
export async function fetchDueEnrollments(
  supabase: SupabaseClient<Database>
): Promise<SequenceEnrollment[]> {
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sequence_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("next_execution_at", now)
    .order("next_execution_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    throw new Error(`fetchDueEnrollments: ${error.message}`);
  }

  return (data ?? []) as SequenceEnrollment[];
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
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

      if (targetStep != null) {
        nextStepOrder = targetStep;
      } else {
        // No branch target defined — advance linearly
        nextStepOrder = await getNextStepOrder(supabase, enrollment.sequence_id, step.step_order);
      }
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
  return body
    .replace(/\{\{first_name\}\}/gi, lead.first_name || "")
    .replace(/\{\{last_name\}\}/gi, lead.last_name || "")
    .replace(/\{\{full_name\}\}/gi, lead.full_name || "")
    .replace(/\{\{company\}\}/gi, lead.company || "")
    .replace(/\{\{job_title\}\}/gi, lead.job_title || "")
    .replace(/\{\{specialty\}\}/gi, lead.specialty || "")
    .replace(/\{\{location\}\}/gi, lead.location || "");
}

function evaluateCondition(lead: Lead, step: SequenceStep): boolean {
  if (!step.condition_field || step.condition_value == null) return false;
  const fieldValue = (lead as unknown as Record<string, unknown>)[step.condition_field];
  return String(fieldValue ?? "") === step.condition_value;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("leads").update({ status }).eq("id", leadId);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("messages").insert({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("activities").insert(payload);
}

/**
 * Non-atomic stat increment (fetch + update).
 * Sufficient for a single-instance deployment; use a Supabase RPC for
 * atomic increments in a distributed setup.
 */
async function incrementCampaignStat(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  field: "invites_sent" | "messages_sent" | "invites_accepted" | "replies_received"
): Promise<void> {
  const { data } = await supabase
    .from("campaigns")
    .select(field)
    .eq("id", campaignId)
    .maybeSingle();

  if (!data) return;

  const current = (data as Record<string, number>)[field] ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("campaigns")
    .update({ [field]: current + 1 })
    .eq("id", campaignId);
}
