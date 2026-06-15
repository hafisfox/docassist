/**
 * n8n → dashboard ingest webhook.
 *
 * The v2 LinkedIn workflows store their working state in Google Sheets. To keep
 * the dashboard's Supabase-backed UI (leads / inbox / campaigns) in sync, each
 * workflow POSTs a normalized event envelope here after a state change. We
 * upsert the corresponding Supabase rows using the shared leadSync helpers — the
 * same primitives the Unipile webhook uses — so both paths stay consistent.
 *
 * Auth: the n8n HTTP Request nodes send `x-n8n-auth: <N8N_WEBHOOK_SECRET>`,
 * which we constant-time compare (mirrors the Unipile webhook's header scheme).
 *
 * Envelope: { "event_type": "...", "data": { ... } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import type { Database, Lead, ActivityType } from "@/types/database";
import {
  findLeadByChatId,
  findLeadByProviderId,
  resolveOwnerUserId,
  upsertLeadByProvider,
  recordInboundMessage,
  recordOutboundMessage,
  markInviteAccepted,
  markInviteSent,
  markInviteExpired,
  type UpsertLeadInput,
} from "@/lib/webhooks/leadSync";

// The typed Supabase client resolves Insert/rpc types to `never` here (the
// generated Database type doesn't model Functions), so — as elsewhere in this
// codebase — we operate through an `any`-typed handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

interface N8nEnvelope {
  event_type: string;
  data: Record<string, unknown>;
}

function verifyAuth(header: string | null, secret: string): boolean {
  if (!header) return false;
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    log.error("N8N_WEBHOOK_SECRET env var is not configured");
    return NextResponse.json({ error: "Ingest secret not configured" }, { status: 500 });
  }

  if (!verifyAuth(request.headers.get("x-n8n-auth"), secret)) {
    log.warn({ correlationId }, "n8n ingest rejected — bad x-n8n-auth");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const rawBody = await request.text();
  let envelope: N8nEnvelope;
  try {
    envelope = JSON.parse(rawBody) as N8nEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = envelope.event_type;
  const data = envelope.data ?? {};
  log.info({ eventType, correlationId }, "n8n ingest received");

  const supabase: DB = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Audit trail (reuse the existing webhook_logs table)
  const { data: logRow } = await supabase
    .from("webhook_logs")
    .insert({
      event_type: `n8n:${eventType}`,
      payload: envelope as unknown as Record<string, unknown>,
      processed: false,
      processing_error: null,
    })
    .select("id")
    .single();
  const webhookLogId = (logRow as { id: string } | null)?.id ?? null;

  try {
    await routeEvent(supabase, eventType, data, correlationId);
    if (webhookLogId) {
      await supabase.from("webhook_logs").update({ processed: true }).eq("id", webhookLogId);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ error: err, eventType, correlationId }, "n8n ingest processing failed");
    if (webhookLogId) {
      await supabase.from("webhook_logs").update({ processing_error: errMsg }).eq("id", webhookLogId);
    }
    // 200 anyway — application-level failures should not trigger n8n retries
  }

  return NextResponse.json({ received: true, correlationId }, { status: 200 });
}

// ── Event router ────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Build the upsert payload shared by lead-bearing events. */
function leadInput(data: Record<string, unknown>, providerId: string): UpsertLeadInput {
  return {
    linkedin_provider_id: providerId,
    full_name: str(data.full_name) ?? str(data.name),
    public_identifier: str(data.public_identifier),
    linkedin_profile_url: str(data.profile_url),
    headline: str(data.headline),
    job_title: str(data.job_title) ?? str(data.title),
    company: str(data.company) ?? str(data.hospital_name),
    location: str(data.location),
    country: str(data.country),
    hospital_name: str(data.hospital_name),
    segment: str(data.segment),
    region: str(data.region),
    tier: str(data.tier),
  };
}

async function resolveLead(
  supabase: DB,
  data: Record<string, unknown>,
  ownerId: string | null,
  { create }: { create: boolean },
): Promise<Lead | null> {
  const providerId = str(data.provider_id);
  if (providerId) {
    if (create && ownerId) {
      return upsertLeadByProvider(supabase, ownerId, leadInput(data, providerId));
    }
    const found = await findLeadByProviderId(supabase, providerId);
    if (found) return found;
  }
  const chatId = str(data.chat_id);
  if (chatId) return findLeadByChatId(supabase, chatId);
  return null;
}

async function routeEvent(
  supabase: DB,
  eventType: string,
  data: Record<string, unknown>,
  correlationId: string,
): Promise<void> {
  const log = withCorrelationId(correlationId);
  const ownerId = await resolveOwnerUserId(supabase);

  switch (eventType) {
    case "lead.scraped": {
      if (!ownerId) throw new Error("No owner user resolved for lead.scraped");
      const providerId = str(data.provider_id);
      if (!providerId) {
        log.warn("lead.scraped missing provider_id — skipped");
        return;
      }
      const lead = await upsertLeadByProvider(supabase, ownerId, {
        ...leadInput(data, providerId),
        status: "new",
      });
      await supabase.from("activities").insert({
        user_id: lead.user_id,
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        activity_type: "lead_created" as ActivityType,
        description: "Lead scraped by n8n",
        metadata: { segment: str(data.segment), tier: str(data.tier), correlation_id: correlationId },
      });
      return;
    }

    case "invite.sent": {
      const lead = await resolveLead(supabase, data, ownerId, { create: true });
      if (!lead) return log.warn("invite.sent — no lead resolved");
      await markInviteSent(supabase, lead, correlationId);
      return;
    }

    case "invite.expired": {
      const lead = await resolveLead(supabase, data, ownerId, { create: false });
      if (!lead) return log.warn("invite.expired — no lead resolved");
      await markInviteExpired(supabase, lead, correlationId);
      return;
    }

    case "connection.new": {
      const lead = await resolveLead(supabase, data, ownerId, { create: true });
      if (!lead) return log.warn("connection.new — no lead resolved");
      await markInviteAccepted(supabase, {
        lead,
        providerId: str(data.provider_id) ?? lead.linkedin_provider_id ?? "",
        publicIdentifier: str(data.public_identifier),
        correlationId,
      });
      return;
    }

    case "sequence.touch_sent": {
      const lead = await resolveLead(supabase, data, ownerId, { create: true });
      if (!lead) return log.warn("sequence.touch_sent — no lead resolved");

      // Persist sequence progress from the 3_CONNECTIONS sheet
      const seqStep = typeof data.sequence_step === "number" ? data.sequence_step : null;
      const nextTouch = str(data.next_touch_at);
      if (seqStep != null || nextTouch) {
        await supabase
          .from("leads")
          .update({
            ...(seqStep != null ? { sequence_step: seqStep } : {}),
            ...(nextTouch ? { next_touch_at: nextTouch } : {}),
          })
          .eq("id", lead.id);
      }

      // Only store a message row when the touch carried its text; the step
      // state + counter are updated regardless (the send did happen).
      if (str(data.text)) {
        await recordOutboundMessage(supabase, {
          lead,
          text: str(data.text) as string,
          messageId: str(data.message_id),
          chatId: str(data.chat_id),
          timestamp: str(data.timestamp),
          correlationId,
        });
      } else if (str(data.chat_id) && !lead.unipile_chat_id) {
        await supabase.from("leads").update({ unipile_chat_id: str(data.chat_id) }).eq("id", lead.id);
      }

      if (lead.campaign_id) {
        await supabase.rpc("increment_campaign_stat", {
          p_campaign_id: lead.campaign_id,
          p_field: "messages_sent",
          p_delta: 1,
        });
      }
      return;
    }

    case "message.received": {
      const lead = await resolveLead(supabase, data, ownerId, { create: true });
      if (!lead) return log.warn("message.received — no lead resolved");
      await recordInboundMessage(supabase, {
        lead,
        text: str(data.text) ?? "",
        messageId: str(data.message_id),
        chatId: str(data.chat_id),
        timestamp: str(data.timestamp),
        correlationId,
      });
      return;
    }

    case "message.sent": {
      const lead = await resolveLead(supabase, data, ownerId, { create: true });
      if (!lead) return log.warn("message.sent — no lead resolved");
      await recordOutboundMessage(supabase, {
        lead,
        text: str(data.text) ?? "",
        messageId: str(data.message_id),
        chatId: str(data.chat_id),
        timestamp: str(data.timestamp),
        correlationId,
      });
      return;
    }

    case "lead.warmth_changed": {
      const lead = await resolveLead(supabase, data, ownerId, { create: false });
      if (!lead) return log.warn("lead.warmth_changed — no lead resolved");
      const warmth = (str(data.warmth) ?? "").toUpperCase();
      const isHot = warmth === "WARM" || warmth === "HOT";
      const preserve = ["meeting_booked", "converted", "do_not_contact"];
      if (isHot && !preserve.includes(lead.status)) {
        await supabase.from("leads").update({ status: "interested" }).eq("id", lead.id);
      }
      await supabase.from("activities").insert({
        user_id: lead.user_id,
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        activity_type: "status_changed" as ActivityType,
        description: `Lead warmth: ${warmth || "unknown"} (n8n DM agent)`,
        metadata: { warmth, correlation_id: correlationId },
      });
      if (isHot && lead.campaign_id) {
        await supabase.rpc("increment_campaign_stat", {
          p_campaign_id: lead.campaign_id,
          p_field: "positive_replies",
          p_delta: 1,
        });
      }
      return;
    }

    default:
      log.info({ eventType }, "unhandled n8n event type — ignored");
  }
}
