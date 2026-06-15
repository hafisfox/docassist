/**
 * Unipile webhook receiver.
 *
 * Handles two event types:
 *  - message.received  → store inbound message, update lead status, pause/fail enrollment
 *  - relation.new      → mark invite accepted, advance wait_for_acceptance enrollment step
 *
 * The actual lead-sync logic lives in src/lib/webhooks/leadSync.ts and is shared
 * with the n8n ingest webhook so both stay consistent.
 *
 * Cutover guard: when AUTOMATION_ENGINE=n8n the dashboard does not own
 * execution — n8n receives the (repointed) Unipile webhooks directly and mirrors
 * state via /api/webhooks/n8n. In that mode this route stands down (returns
 * skipped) so the two engines can never double-process the same event.
 *
 * Auth: Unipile echoes a configured `Unipile-Auth: <secret>` header verbatim on
 * every POST; we constant-time compare it against WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { n8nOwnsExecution } from "@/lib/automation";
import {
  findLeadByChatId,
  findLeadByProviderId,
  recordInboundMessage,
  markInviteAccepted,
} from "@/lib/webhooks/leadSync";
import type { Database } from "@/types/database";

// The typed client resolves Insert/rpc types to `never` here, so we operate
// through an `any`-typed handle (consistent with the rest of this codebase).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

// ── Unipile payload types ─────────────────────────────────────────────────────

interface UnipileMessageReceivedPayload {
  event_type: "message.received";
  account_id?: string;
  data: {
    id: string;
    chat_id: string;
    text: string;
    timestamp?: string;
    sender: { provider_id: string; name?: string; public_identifier?: string };
  };
}

interface UnipileRelationNewPayload {
  event_type: "relation.new";
  account_id?: string;
  data: { provider_id: string; name?: string; public_identifier?: string };
}

type UnipileWebhookPayload =
  | UnipileMessageReceivedPayload
  | UnipileRelationNewPayload
  | { event_type: string; [key: string]: unknown };

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  // ── Cutover guard ─────────────────────────────────────────────────────────
  if (n8nOwnsExecution()) {
    log.info({ correlationId }, "unipile webhook skipped — AUTOMATION_ENGINE=n8n");
    return NextResponse.json({ received: true, skipped: true, engine: "n8n" }, { status: 200 });
  }

  const rawBody = await request.text();

  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error("WEBHOOK_SECRET env var is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signatureHeader = request.headers.get("unipile-auth");
  if (!signatureHeader) {
    log.warn({ correlationId }, "incoming webhook missing Unipile-Auth header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  if (!verifySignature(signatureHeader, webhookSecret)) {
    log.warn({ correlationId }, "invalid webhook signature — rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: UnipileWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as UnipileWebhookPayload;
  } catch {
    log.error({ correlationId }, "invalid JSON in webhook body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.event_type;
  log.info({ eventType, correlationId }, "webhook received");

  const supabase: DB = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Persist raw payload to webhook_logs
  const { data: logRow, error: logError } = await supabase
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
    log.error({ error: logError, correlationId }, "failed to write webhook_log row");
  }
  const webhookLogId = (logRow as { id: string } | null)?.id ?? null;

  try {
    if (eventType === "message.received") {
      await handleNewMessage(supabase, payload as UnipileMessageReceivedPayload, correlationId);
    } else if (eventType === "relation.new") {
      await handleNewRelation(supabase, payload as UnipileRelationNewPayload, correlationId);
    } else {
      log.info({ eventType, correlationId }, "unhandled webhook event type — ignored");
    }

    if (webhookLogId) {
      await supabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ error: err, eventType, correlationId }, "webhook processing failed");
    if (webhookLogId) {
      await supabase.from("webhook_logs").update({ processing_error: errMsg }).eq("id", webhookLogId);
    }
  }

  return NextResponse.json({ received: true, correlationId }, { status: 200 });
}

// ── Webhook auth verification ─────────────────────────────────────────────────

function verifySignature(header: string, secret: string): boolean {
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Handlers (lookup + delegate to shared leadSync) ────────────────────────────

async function handleNewMessage(
  supabase: DB,
  payload: UnipileMessageReceivedPayload,
  correlationId: string,
): Promise<void> {
  const log = withCorrelationId(correlationId);
  const { id: messageId, chat_id, text, sender, timestamp } = payload.data;

  let lead = chat_id ? await findLeadByChatId(supabase, chat_id) : null;
  if (!lead && sender.provider_id) {
    lead = await findLeadByProviderId(supabase, sender.provider_id);
  }
  if (!lead) {
    log.warn({ chatId: chat_id, senderId: sender.provider_id }, "no lead for inbound message — skipping");
    return;
  }

  await recordInboundMessage(supabase, {
    lead,
    text,
    messageId,
    chatId: chat_id,
    timestamp,
    correlationId,
  });
}

async function handleNewRelation(
  supabase: DB,
  payload: UnipileRelationNewPayload,
  correlationId: string,
): Promise<void> {
  const log = withCorrelationId(correlationId);
  const { provider_id } = payload.data;

  const lead = await findLeadByProviderId(supabase, provider_id);
  if (!lead) {
    log.warn({ providerId: provider_id }, "no lead for relation.new — skipping");
    return;
  }

  await markInviteAccepted(supabase, {
    lead,
    providerId: provider_id,
    publicIdentifier: payload.data.public_identifier,
    correlationId,
  });
}
