/**
 * Unipile webhook receiver.
 *
 * Handles two event types:
 *  - message.received  → store inbound message, update lead status, pause/fail enrollment
 *  - relation.new      → mark invite accepted, advance wait_for_acceptance enrollment step
 *
 * Uses the service-role Supabase client (bypasses RLS) because webhooks arrive
 * without a user session.
 *
 * Signature verification: HMAC-SHA256 over the raw request body using WEBHOOK_SECRET.
 * Unipile sends the digest in the `X-Unipile-Signature` header as `sha256=<hex>`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import type { Database, Lead, LeadStatus, ActivityType } from "@/types/database";

// ── Opt-out detection ─────────────────────────────────────────────────────────

const OPT_OUT_KEYWORDS = [
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

// ── Unipile payload types ─────────────────────────────────────────────────────

interface UnipileMessageReceivedPayload {
  event_type: "message.received";
  account_id?: string;
  data: {
    id: string;
    chat_id: string;
    text: string;
    timestamp?: string;
    sender: {
      provider_id: string;
      name?: string;
      public_identifier?: string;
    };
  };
}

interface UnipileRelationNewPayload {
  event_type: "relation.new";
  account_id?: string;
  data: {
    provider_id: string;
    name?: string;
    public_identifier?: string;
  };
}

type UnipileWebhookPayload =
  | UnipileMessageReceivedPayload
  | UnipileRelationNewPayload
  | { event_type: string; [key: string]: unknown };

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  // ── 1. Read raw body (required for HMAC) ──────────────────────────────────
  const rawBody = await request.text();

  // ── 2. Verify HMAC-SHA256 signature ──────────────────────────────────────
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error("WEBHOOK_SECRET env var is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signatureHeader =
    request.headers.get("x-unipile-signature") ?? request.headers.get("x-signature");

  if (!signatureHeader) {
    log.warn({ correlationId }, "incoming webhook missing signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  if (!verifySignature(rawBody, signatureHeader, webhookSecret)) {
    log.warn({ correlationId }, "invalid webhook signature — rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 3. Parse payload ──────────────────────────────────────────────────────
  let payload: UnipileWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as UnipileWebhookPayload;
  } catch {
    log.error({ correlationId }, "invalid JSON in webhook body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.event_type;
  log.info({ eventType, correlationId }, "webhook received");

  // ── 4. Admin Supabase client (bypasses RLS — no user session in webhooks) ─
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── 5. Persist raw payload to webhook_logs ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logRow, error: logError } = await (supabase as any)
    .from("webhook_logs")
    .insert({
      event_type: eventType,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
      processing_error: null,
    })
    .select("id")
    .single();

  if (logError) {
    // Non-fatal — log the error but continue processing
    log.error({ error: logError, correlationId }, "failed to write webhook_log row");
  }

  const webhookLogId = logRow?.id ?? null;

  // ── 6. Route and process ──────────────────────────────────────────────────
  // We process synchronously: Supabase writes are fast (~50 ms) and Unipile
  // expects a 200 within a few seconds. For Vercel deployments that need true
  // background execution, wrap processWebhook() with waitUntil() from
  // @vercel/functions and return the 200 first.
  try {
    if (eventType === "message.received") {
      await handleNewMessage(
        supabase,
        payload as UnipileMessageReceivedPayload,
        correlationId
      );
    } else if (eventType === "relation.new") {
      await handleNewRelation(
        supabase,
        payload as UnipileRelationNewPayload,
        correlationId
      );
    } else {
      log.info({ eventType, correlationId }, "unhandled webhook event type — ignored");
    }

    // Mark log row as processed
    if (webhookLogId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("webhook_logs")
        .update({ processed: true })
        .eq("id", webhookLogId);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ error: err, eventType, correlationId }, "webhook processing failed");

    if (webhookLogId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("webhook_logs")
        .update({ processing_error: errMsg })
        .eq("id", webhookLogId);
    }
    // Return 200 anyway — Unipile should not retry for application-level errors
  }

  return NextResponse.json({ received: true, correlationId }, { status: 200 });
}

// ── HMAC-SHA256 verification ──────────────────────────────────────────────────

/**
 * Constant-time HMAC-SHA256 comparison.
 * Accepts both `sha256=<hex>` (standard webhook format) and raw hex.
 */
function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    const providedHex = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    const expectedHex = createHmac("sha256", secret).update(body, "utf8").digest("hex");

    const expected = Buffer.from(expectedHex, "hex");
    const provided = Buffer.from(providedHex, "hex");

    // Length check prevents timingSafeEqual from throwing
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

// ── handleNewMessage ──────────────────────────────────────────────────────────

async function handleNewMessage(
  supabase: SupabaseClient<Database>,
  payload: UnipileMessageReceivedPayload,
  correlationId: string
): Promise<void> {
  const log = withCorrelationId(correlationId);
  const { id: messageId, chat_id, text, sender, timestamp } = payload.data;
  const now = new Date().toISOString();

  log.info({ chatId: chat_id, senderId: sender.provider_id }, "processing message.received");

  // ── Find lead: chat_id first, then provider_id fallback ───────────────────
  let lead: Lead | null = null;

  if (chat_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("leads")
      .select("*")
      .eq("unipile_chat_id", chat_id)
      .maybeSingle();
    lead = data as Lead | null;
  }

  if (!lead && sender.provider_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("leads")
      .select("*")
      .eq("linkedin_provider_id", sender.provider_id)
      .maybeSingle();
    lead = data as Lead | null;
  }

  if (!lead) {
    log.warn(
      { chatId: chat_id, senderId: sender.provider_id },
      "no lead found for inbound message — skipping"
    );
    return;
  }

  // Backfill chat_id onto the lead if not already stored
  if (chat_id && !lead.unipile_chat_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("leads")
      .update({ unipile_chat_id: chat_id })
      .eq("id", lead.id);
  }

  const userId = lead.user_id;

  // ── Opt-out detection ─────────────────────────────────────────────────────
  const lowerText = (text ?? "").toLowerCase();
  const isOptOut = OPT_OUT_KEYWORDS.some((kw) => lowerText.includes(kw));

  // ── Determine new lead status ─────────────────────────────────────────────
  // Don't downgrade statuses that signal high intent or existing human follow-up
  const preserveStatuses: LeadStatus[] = ["interested", "meeting_booked", "converted"];
  let newStatus: LeadStatus = isOptOut ? "do_not_contact" : "replied";
  if (!isOptOut && preserveStatuses.includes(lead.status)) {
    newStatus = lead.status;
  }

  // ── Update lead ───────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("leads")
    .update({ status: newStatus, last_replied_at: now })
    .eq("id", lead.id);

  // ── Store inbound message ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("messages").insert({
    user_id: userId,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    unipile_chat_id: chat_id ?? null,
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

  // ── Pause (or fail if opt-out) active sequence enrollments ───────────────
  const newEnrollmentStatus = isOptOut ? "failed" : "paused";
  const pauseReason = isOptOut
    ? `Lead opted out: "${text?.slice(0, 200)}"`
    : "Lead replied — paused for manual review";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollments } = await (supabase as any)
    .from("sequence_enrollments")
    .select("id")
    .eq("lead_id", lead.id)
    .in("status", ["active"])
    .limit(10);

  if (enrollments && enrollments.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("sequence_enrollments")
      .update({
        status: newEnrollmentStatus,
        error_message: isOptOut ? pauseReason : null,
        last_executed_at: now,
      })
      .in(
        "id",
        (enrollments as { id: string }[]).map((e) => e.id)
      );

    log.info(
      { enrollmentCount: enrollments.length, newStatus: newEnrollmentStatus },
      "sequence enrollments updated"
    );
  }

  // ── Log activity ──────────────────────────────────────────────────────────
  const activityType: ActivityType = isOptOut ? "status_changed" : "message_received";
  const activityDescription = isOptOut
    ? `Lead opted out: "${text?.slice(0, 100)}"`
    : `Inbound message received: "${text?.slice(0, 100)}"`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("activities").insert({
    user_id: userId,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    activity_type: activityType,
    description: activityDescription,
    metadata: {
      chat_id,
      message_id: messageId,
      sender_provider_id: sender.provider_id,
      is_opt_out: isOptOut,
      new_status: newStatus,
      correlation_id: correlationId,
    },
  });

  // ── Increment campaign replies_received counter ───────────────────────────
  if (lead.campaign_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campaignRow } = await (supabase as any)
      .from("campaigns")
      .select("replies_received")
      .eq("id", lead.campaign_id)
      .maybeSingle();

    if (campaignRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("campaigns")
        .update({ replies_received: (campaignRow as { replies_received: number }).replies_received + 1 })
        .eq("id", lead.campaign_id);
    }
  }

  log.info({ leadId: lead.id, newStatus, isOptOut }, "message.received processed");
}

// ── handleNewRelation ─────────────────────────────────────────────────────────

async function handleNewRelation(
  supabase: SupabaseClient<Database>,
  payload: UnipileRelationNewPayload,
  correlationId: string
): Promise<void> {
  const log = withCorrelationId(correlationId);
  const { provider_id } = payload.data;
  const now = new Date().toISOString();

  log.info({ providerId: provider_id }, "processing relation.new");

  // ── Find lead by provider_id ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadData } = await (supabase as any)
    .from("leads")
    .select("*")
    .eq("linkedin_provider_id", provider_id)
    .maybeSingle();

  const lead = leadData as Lead | null;

  if (!lead) {
    log.warn({ providerId: provider_id }, "no lead found for relation.new — skipping");
    return;
  }

  const userId = lead.user_id;

  // ── Update lead status (only if not already past invite_accepted) ─────────
  const preserveStatuses: LeadStatus[] = [
    "replied",
    "interested",
    "not_interested",
    "meeting_booked",
    "converted",
    "do_not_contact",
  ];
  if (!preserveStatuses.includes(lead.status)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("leads")
      .update({ status: "invite_accepted" })
      .eq("id", lead.id);
  }

  // ── Advance wait_for_acceptance enrollment steps ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollments } = await (supabase as any)
    .from("sequence_enrollments")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("status", "active")
    .limit(5);

  if (enrollments && (enrollments as unknown[]).length > 0) {
    for (const rawEnrollment of enrollments as Record<string, unknown>[]) {
      const enrollment = rawEnrollment as {
        id: string;
        sequence_id: string;
        current_step: number;
      };

      // Only act on enrollments currently sitting on a wait_for_acceptance step
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentStep } = await (supabase as any)
        .from("sequence_steps")
        .select("step_type, step_order")
        .eq("sequence_id", enrollment.sequence_id)
        .eq("step_order", enrollment.current_step)
        .maybeSingle();

      if (!currentStep || currentStep.step_type !== "wait_for_acceptance") continue;

      // Find the next step in the sequence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: nextStepData } = await (supabase as any)
        .from("sequence_steps")
        .select("step_order")
        .eq("sequence_id", enrollment.sequence_id)
        .gt("step_order", currentStep.step_order)
        .order("step_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextStepData) {
        // Advance enrollment — set next_execution_at to now so executor picks it up immediately
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("sequence_enrollments")
          .update({
            current_step: (nextStepData as { step_order: number }).step_order,
            next_execution_at: now,
            last_executed_at: now,
          })
          .eq("id", enrollment.id);

        log.info(
          {
            enrollmentId: enrollment.id,
            nextStep: (nextStepData as { step_order: number }).step_order,
          },
          "enrollment advanced past wait_for_acceptance"
        );
      } else {
        // No further steps — mark complete
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("sequence_enrollments")
          .update({
            status: "completed",
            last_executed_at: now,
            next_execution_at: null,
          })
          .eq("id", enrollment.id);

        log.info({ enrollmentId: enrollment.id }, "enrollment completed — no steps after wait_for_acceptance");
      }
    }
  }

  // ── Log activity ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("activities").insert({
    user_id: userId,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    activity_type: "invite_accepted" as ActivityType,
    description: "LinkedIn connection request accepted",
    metadata: {
      provider_id,
      public_identifier: payload.data.public_identifier ?? null,
      correlation_id: correlationId,
    },
  });

  // ── Increment campaign invites_accepted counter ───────────────────────────
  if (lead.campaign_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campaignRow } = await (supabase as any)
      .from("campaigns")
      .select("invites_accepted")
      .eq("id", lead.campaign_id)
      .maybeSingle();

    if (campaignRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("campaigns")
        .update({
          invites_accepted:
            (campaignRow as { invites_accepted: number }).invites_accepted + 1,
        })
        .eq("id", lead.campaign_id);
    }
  }

  log.info({ leadId: lead.id, providerId: provider_id }, "relation.new processed");
}
