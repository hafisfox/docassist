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
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import type {
  Database,
  Lead,
  LeadStatus,
  ActivityType,
  CampaignStatField,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<Database> | any;

// ── Campaign stat counters ────────────────────────────────────────────────────

/**
 * Wrapper around the increment_campaign_stat RPC.
 *
 * The SQL function whitelists column names and raises on anything else.
 * supabase-js surfaces a PL/pgSQL exception as `.error` instead of throwing,
 * so discarding the return value silently swallows a bad `p_field` — which is
 * exactly how `positive_replies` went unrecorded. Always route through here.
 */
export async function incrementCampaignStat(
  supabase: DB,
  campaignId: string,
  field: CampaignStatField,
  correlationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("increment_campaign_stat", {
    p_campaign_id: campaignId,
    p_field: field,
    p_delta: 1,
  });

  if (error) {
    withCorrelationId(correlationId).error(
      { error, campaignId, field },
      "failed to increment campaign stat",
    );
  }
}

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

/**
 * Both lookups run on the service-role client, so RLS does NOT scope them.
 * Pass `userId` wherever the owner is known:
 *
 *  - `linkedin_provider_id` is unique only per (user_id, provider_id)
 *    (ux_leads_user_provider), so two tenants can legitimately hold the same
 *    provider. Unscoped, `.maybeSingle()` then errors with PGRST116 and — with
 *    the error discarded — the event looks like "no such lead" and is dropped.
 *  - `unipile_chat_id` has no uniqueness constraint at all, so an unscoped
 *    match can return another tenant's row, and the caller would then write
 *    messages and activities under that user's id.
 *
 * `limit(1)` keeps a duplicate from raising, and the error is now inspected so
 * a genuine failure is logged rather than silently read as "not found".
 */
async function findLead(
  supabase: DB,
  column: "unipile_chat_id" | "linkedin_provider_id",
  value: string,
  userId: string | null | undefined,
): Promise<Lead | null> {
  let query = supabase.from("leads").select("*").eq(column, value);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    withCorrelationId(createCorrelationId()).error(
      { error, column, scoped: !!userId },
      "lead lookup failed",
    );
    return null;
  }

  return (data as Lead | null) ?? null;
}

export async function findLeadByChatId(
  supabase: DB,
  chatId: string,
  userId?: string | null,
): Promise<Lead | null> {
  return findLead(supabase, "unipile_chat_id", chatId, userId);
}

export async function findLeadByProviderId(
  supabase: DB,
  providerId: string,
  userId?: string | null,
): Promise<Lead | null> {
  return findLead(supabase, "linkedin_provider_id", providerId, userId);
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
  account_name?: string | null;
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
  // Scoped to `ownerId` for the reason documented on findLead: this runs on the
  // service-role client, so an unscoped match can return another tenant's row —
  // and here that row would then be UPDATEd with this tenant's scrape data.
  // ux_leads_user_provider is unique per (user_id, provider_id), so the scoped
  // lookup is also the one that matches the constraint the insert races against.
  const existing = await findLeadByProviderId(
    supabase,
    input.linkedin_provider_id,
    ownerId,
  );
  const now = new Date().toISOString();

  const sharedFields = {
    headline: input.headline ?? undefined,
    job_title: input.job_title ?? undefined,
    company: input.company ?? undefined,
    location: input.location ?? undefined,
    country: input.country ?? undefined,
    account_name: input.account_name ?? undefined,
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
    const again = await findLeadByProviderId(
      supabase,
      input.linkedin_provider_id,
      ownerId,
    );
    if (again) return again;
    throw error;
  }
  return data as Lead;
}

// ── Message de-duplication ──────────────────────────────────────────────────────

/** Postgres `unique_violation`, surfaced by supabase-js on `error.code`. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/**
 * Has this provider message already been stored? Backed by
 * ux_messages_unipile_message_id, which is also what makes the check binding
 * under concurrency — see the note in recordInboundMessage.
 */
async function messageExists(supabase: DB, messageId: string): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("unipile_message_id", messageId)
    .limit(1)
    .maybeSingle();

  return !!data;
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

  // Cheap fast path — the overwhelming majority of replays are caught here
  // without attempting a write.
  if (messageId && (await messageExists(supabase, messageId))) {
    log.info({ messageId }, "inbound message already stored — skipping duplicate");
    return { skipped: true, newStatus: lead.status };
  }

  const isOptOut = detectOptOut(text);
  const preserveStatuses: LeadStatus[] = ["interested", "meeting_booked", "converted"];
  let newStatus: LeadStatus = isOptOut ? "do_not_contact" : "replied";
  if (!isOptOut && preserveStatuses.includes(lead.status)) newStatus = lead.status;

  // The insert — not the SELECT above — is the real idempotency gate, and it
  // runs before any of the side effects below. Webhook providers retry hard, so
  // two deliveries of one reply can both clear the SELECT; ordering the write
  // first means the loser is rejected by ux_messages_unipile_message_id
  // (migration 20240101000021) and returns here, instead of going on to bump
  // replies_received a second time and skew the funnel the operator steers on.
  const { error: insertError } = await supabase.from("messages").insert({
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

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      log.info({ messageId }, "inbound message lost insert race — skipping duplicate");
      return { skipped: true, newStatus: lead.status };
    }
    throw new Error(`recordInboundMessage: failed to store message: ${insertError.message}`);
  }

  // Backfill chat_id onto the lead
  if (chatId && !lead.unipile_chat_id) {
    await supabase.from("leads").update({ unipile_chat_id: chatId }).eq("id", lead.id);
  }

  await supabase
    .from("leads")
    .update({ status: newStatus, last_replied_at: now })
    .eq("id", lead.id);

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
    await incrementCampaignStat(
      supabase,
      lead.campaign_id,
      "replies_received",
      correlationId,
    );
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

  if (messageId && (await messageExists(supabase, messageId))) {
    return { skipped: true };
  }

  // Insert first, for the same reason as the inbound path: it is the gate that
  // actually holds under concurrent webhook deliveries.
  const { error: insertError } = await supabase.from("messages").insert({
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

  if (insertError) {
    if (isUniqueViolation(insertError)) return { skipped: true };
    throw new Error(`recordOutboundMessage: failed to store message: ${insertError.message}`);
  }

  if (chatId && !lead.unipile_chat_id) {
    await supabase.from("leads").update({ unipile_chat_id: chatId }).eq("id", lead.id);
  }

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
    await incrementCampaignStat(
      supabase,
      lead.campaign_id,
      "invites_accepted",
      correlationId,
    );
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
    await incrementCampaignStat(
      supabase,
      lead.campaign_id,
      "invites_sent",
      correlationId,
    );
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
