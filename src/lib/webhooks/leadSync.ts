/**
 * Shared lead-sync primitives used by both webhook receivers:
 *  - /api/webhooks/unipile  (Unipile → Supabase, when the dashboard owns execution)
 *  - /api/webhooks/n8n      (n8n v2 workflows → Supabase, when n8n owns execution)
 *
 * Keeping the lead lookup, status transitions, message storage, enrollment
 * pausing and counter increments here means both routes stay byte-for-byte
 * consistent instead of drifting copy-paste.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { withCorrelationId } from "@/lib/logger";
import type {
  Database,
  Lead,
  LeadStatus,
  ActivityType,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<Database> | any;

// ── Opt-out detection ─────────────────────────────────────────────────────────

export const OPT_OUT_KEYWORDS = [
  "not interested",
  "unsubscribe",
  "stop",
  "remove me",
  "don't contact",
  "do not contact",
  "no thanks",
  "no thank you",
  "please stop",
  "opt out",
  "opt-out",
  "leave me alone",
];

export function detectOptOut(text: string | null | undefined): boolean {
  const lower = (text ?? "").toLowerCase();
  return OPT_OUT_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Lead lookup ────────────────────────────────────────────────────────────────

export async function findLeadByChatId(
  supabase: DB,
  chatId: string,
): Promise<Lead | null> {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("unipile_chat_id", chatId)
    .maybeSingle();
  return (data as Lead | null) ?? null;
}

export async function findLeadByProviderId(
  supabase: DB,
  providerId: string,
): Promise<Lead | null> {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("linkedin_provider_id", providerId)
    .maybeSingle();
  return (data as Lead | null) ?? null;
}

// ── Owner resolution (n8n leads have no user session) ──────────────────────────

/**
 * The user that n8n-synced rows belong to. Single-operator system: prefer the
 * explicit env, else fall back to the sole settings row (every user has one).
 */
export async function resolveOwnerUserId(supabase: DB): Promise<string | null> {
  const fromEnv = process.env.DASHBOARD_OWNER_USER_ID;
  if (fromEnv) return fromEnv;

  const { data } = await supabase
    .from("settings")
    .select("user_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

// ── Lead upsert (scraped / new-connection events from n8n) ──────────────────────

export interface UpsertLeadInput {
  linkedin_provider_id: string;
  full_name?: string | null;
  public_identifier?: string | null;
  linkedin_profile_url?: string | null;
  headline?: string | null;
  job_title?: string | null;
  company?: string | null;
  location?: string | null;
  country?: string | null;
  hospital_name?: string | null;
  segment?: string | null;
  region?: string | null;
  tier?: string | null;
  status?: LeadStatus;
}

function splitName(full?: string | null): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "LinkedIn", last: "Lead" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Insert-or-update a lead keyed by (user_id, linkedin_provider_id). Used by the
 * n8n ingest where leads originate in Google Sheets and may not yet exist in
 * Supabase. Never downgrades an existing lead's status.
 */
export async function upsertLeadByProvider(
  supabase: DB,
  ownerId: string,
  input: UpsertLeadInput,
): Promise<Lead> {
  const existing = await findLeadByProviderId(supabase, input.linkedin_provider_id);
  const now = new Date().toISOString();

  const sharedFields = {
    headline: input.headline ?? undefined,
    job_title: input.job_title ?? undefined,
    company: input.company ?? undefined,
    location: input.location ?? undefined,
    country: input.country ?? undefined,
    hospital_name: input.hospital_name ?? undefined,
    segment: input.segment ?? undefined,
    region: input.region ?? undefined,
    tier: input.tier ?? undefined,
    linkedin_profile_url: input.linkedin_profile_url ?? undefined,
    linkedin_public_id: input.public_identifier ?? undefined,
  };

  if (existing) {
    const update: Record<string, unknown> = { ...sharedFields, updated_at: now };
    // Only set status if explicitly provided and it advances the funnel — the
    // caller (e.g. invite.sent / connection.new) owns explicit status moves.
    if (input.status) update.status = input.status;
    // Strip undefined so we don't clobber populated fields with nulls
    for (const k of Object.keys(update)) {
      if (update[k] === undefined) delete update[k];
    }
    const { data } = await supabase
      .from("leads")
      .update(update)
      .eq("id", existing.id)
      .select("*")
      .single();
    return (data as Lead) ?? existing;
  }

  const { first, last } = splitName(input.full_name);
  const insert: Record<string, unknown> = {
    user_id: ownerId,
    linkedin_provider_id: input.linkedin_provider_id,
    first_name: first,
    last_name: last,
    status: input.status ?? "new",
    source: "n8n",
    ...sharedFields,
  };
  for (const k of Object.keys(insert)) {
    if (insert[k] === undefined) delete insert[k];
  }

  const { data, error } = await supabase
    .from("leads")
    .insert(insert)
    .select("*")
    .single();

  // Race: a concurrent ingest may have inserted the same provider_id first.
  if (error) {
    const again = await findLeadByProviderId(supabase, input.linkedin_provider_id);
    if (again) return again;
    throw error;
  }
  return data as Lead;
}

// ── Inbound message (reply) ─────────────────────────────────────────────────────

export interface InboundMessageInput {
  lead: Lead;
  text: string;
  messageId?: string | null;
  chatId?: string | null;
  timestamp?: string | null;
  correlationId: string;
}

/**
 * Store an inbound message and react to it: opt-out detection, lead status,
 * pause/fail active enrollments, activity log, replies counter. Idempotent on
 * `unipile_message_id`. Returns `{ skipped }` when a duplicate is detected.
 */
export async function recordInboundMessage(
  supabase: DB,
  { lead, text, messageId, chatId, timestamp, correlationId }: InboundMessageInput,
): Promise<{ skipped: boolean; newStatus: LeadStatus }> {
  const log = withCorrelationId(correlationId);
  const now = new Date().toISOString();

  // Idempotency
  if (messageId) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("unipile_message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      log.info({ messageId }, "inbound message already stored — skipping duplicate");
      return { skipped: true, newStatus: lead.status };
    }
  }

  // Backfill chat_id onto the lead
  if (chatId && !lead.unipile_chat_id) {
    await supabase.from("leads").update({ unipile_chat_id: chatId }).eq("id", lead.id);
  }

  const isOptOut = detectOptOut(text);
  const preserveStatuses: LeadStatus[] = ["interested", "meeting_booked", "converted"];
  let newStatus: LeadStatus = isOptOut ? "do_not_contact" : "replied";
  if (!isOptOut && preserveStatuses.includes(lead.status)) newStatus = lead.status;

  await supabase
    .from("leads")
    .update({ status: newStatus, last_replied_at: now })
    .eq("id", lead.id);

  await supabase.from("messages").insert({
    user_id: lead.user_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    unipile_chat_id: chatId ?? null,
    unipile_message_id: messageId ?? null,
    direction: "inbound" as const,
    message_text: text ?? "",
    message_type: "linkedin_message",
    sent_at: timestamp ?? now,
    delivered_at: timestamp ?? now,
    read_at: null,
    is_automated: false,
    sequence_step_id: null,
    personalization_variables: {},
  });

  // Pause (or fail on opt-out) active enrollments
  const newEnrollmentStatus = isOptOut ? "failed" : "paused";
  const pauseReason = isOptOut
    ? `Lead opted out: "${text?.slice(0, 200)}"`
    : "Lead replied — paused for manual review";

  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select("id")
    .eq("lead_id", lead.id)
    .in("status", ["active"])
    .limit(10);

  if (enrollments && enrollments.length > 0) {
    await supabase
      .from("sequence_enrollments")
      .update({
        status: newEnrollmentStatus,
        error_message: isOptOut ? pauseReason : null,
        last_executed_at: now,
      })
      .in("id", (enrollments as { id: string }[]).map((e) => e.id));
  }

  const activityType: ActivityType = isOptOut ? "status_changed" : "message_received";
  await supabase.from("activities").insert({
    user_id: lead.user_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    activity_type: activityType,
    description: isOptOut
      ? `Lead opted out: "${text?.slice(0, 100)}"`
      : `Inbound message received: "${text?.slice(0, 100)}"`,
    metadata: {
      chat_id: chatId,
      message_id: messageId,
      is_opt_out: isOptOut,
      new_status: newStatus,
      correlation_id: correlationId,
    },
  });

  if (lead.campaign_id) {
    await supabase.rpc("increment_campaign_stat", {
      p_campaign_id: lead.campaign_id,
      p_field: "replies_received",
      p_delta: 1,
    });
  }

  log.info({ leadId: lead.id, newStatus, isOptOut }, "inbound message recorded");
  return { skipped: false, newStatus };
}

// ── Outbound message (automated send mirrored from n8n) ─────────────────────────

export interface OutboundMessageInput {
  lead: Lead;
  text: string;
  messageId?: string | null;
  chatId?: string | null;
  timestamp?: string | null;
  correlationId: string;
}

/**
 * Mirror an automated outbound message that n8n already sent via Unipile, so the
 * dashboard inbox/threads stay complete. Idempotent on `unipile_message_id` when
 * provided; otherwise best-effort.
 */
export async function recordOutboundMessage(
  supabase: DB,
  { lead, text, messageId, chatId, timestamp }: OutboundMessageInput,
): Promise<{ skipped: boolean }> {
  const now = new Date().toISOString();

  if (messageId) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("unipile_message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (existing) return { skipped: true };
  }

  if (chatId && !lead.unipile_chat_id) {
    await supabase.from("leads").update({ unipile_chat_id: chatId }).eq("id", lead.id);
  }

  await supabase.from("messages").insert({
    user_id: lead.user_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    unipile_chat_id: chatId ?? null,
    unipile_message_id: messageId ?? null,
    direction: "outbound" as const,
    message_text: text ?? "",
    message_type: "linkedin_message",
    sent_at: timestamp ?? now,
    delivered_at: timestamp ?? now,
    read_at: null,
    is_automated: true,
    sequence_step_id: null,
    personalization_variables: {},
  });

  await supabase
    .from("leads")
    .update({ last_contacted_at: now })
    .eq("id", lead.id);

  return { skipped: false };
}

// ── Invite accepted (relation.new / connection.new) ─────────────────────────────

export interface InviteAcceptedInput {
  lead: Lead;
  providerId: string;
  publicIdentifier?: string | null;
  correlationId: string;
}

export async function markInviteAccepted(
  supabase: DB,
  { lead, providerId, publicIdentifier, correlationId }: InviteAcceptedInput,
): Promise<void> {
  const log = withCorrelationId(correlationId);
  const now = new Date().toISOString();

  const preserveStatuses: LeadStatus[] = [
    "replied",
    "interested",
    "not_interested",
    "meeting_booked",
    "converted",
    "do_not_contact",
  ];
  if (!preserveStatuses.includes(lead.status)) {
    await supabase.from("leads").update({ status: "invite_accepted" }).eq("id", lead.id);
  }

  // Advance any wait_for_acceptance enrollments (dashboard-engine sequences)
  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("status", "active")
    .limit(5);

  for (const rawEnrollment of (enrollments ?? []) as Record<string, unknown>[]) {
    const enrollment = rawEnrollment as {
      id: string;
      sequence_id: string;
      current_step: number;
    };
    const { data: currentStep } = await supabase
      .from("sequence_steps")
      .select("step_type, step_order")
      .eq("sequence_id", enrollment.sequence_id)
      .eq("step_order", enrollment.current_step)
      .maybeSingle();
    if (!currentStep || currentStep.step_type !== "wait_for_acceptance") continue;

    const { data: nextStepData } = await supabase
      .from("sequence_steps")
      .select("step_order")
      .eq("sequence_id", enrollment.sequence_id)
      .gt("step_order", currentStep.step_order)
      .order("step_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextStepData) {
      await supabase
        .from("sequence_enrollments")
        .update({
          current_step: (nextStepData as { step_order: number }).step_order,
          next_execution_at: now,
          last_executed_at: now,
        })
        .eq("id", enrollment.id);
    } else {
      await supabase
        .from("sequence_enrollments")
        .update({ status: "completed", last_executed_at: now, next_execution_at: null })
        .eq("id", enrollment.id);
    }
  }

  await supabase.from("activities").insert({
    user_id: lead.user_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    activity_type: "invite_accepted" as ActivityType,
    description: "LinkedIn connection request accepted",
    metadata: {
      provider_id: providerId,
      public_identifier: publicIdentifier ?? null,
      correlation_id: correlationId,
    },
  });

  if (lead.campaign_id) {
    await supabase.rpc("increment_campaign_stat", {
      p_campaign_id: lead.campaign_id,
      p_field: "invites_accepted",
      p_delta: 1,
    });
  }

  log.info({ leadId: lead.id, providerId }, "invite acceptance recorded");
}

// ── Invite status moves (n8n invite.sent / invite.expired) ─────────────────────

export async function markInviteSent(
  supabase: DB,
  lead: Lead,
  correlationId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const preserve: LeadStatus[] = [
    "invite_accepted",
    "replied",
    "interested",
    "not_interested",
    "meeting_booked",
    "converted",
    "do_not_contact",
  ];
  if (!preserve.includes(lead.status)) {
    await supabase
      .from("leads")
      .update({ status: "invite_sent", last_contacted_at: now })
      .eq("id", lead.id);
  }

  await supabase.from("activities").insert({
    user_id: lead.user_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    activity_type: "invite_sent" as ActivityType,
    description: "LinkedIn invitation sent (n8n)",
    metadata: { correlation_id: correlationId },
  });

  if (lead.campaign_id) {
    await supabase.rpc("increment_campaign_stat", {
      p_campaign_id: lead.campaign_id,
      p_field: "invites_sent",
      p_delta: 1,
    });
  }
}

export async function markInviteExpired(
  supabase: DB,
  lead: Lead,
  correlationId: string,
): Promise<void> {
  const preserve: LeadStatus[] = [
    "invite_accepted",
    "replied",
    "interested",
    "not_interested",
    "meeting_booked",
    "converted",
    "do_not_contact",
  ];
  if (!preserve.includes(lead.status)) {
    await supabase.from("leads").update({ status: "invite_expired" }).eq("id", lead.id);
  }
  await supabase.from("activities").insert({
    user_id: lead.user_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    activity_type: "invite_expired" as ActivityType,
    description: "LinkedIn invitation withdrawn/expired (n8n)",
    metadata: { correlation_id: correlationId },
  });
}
