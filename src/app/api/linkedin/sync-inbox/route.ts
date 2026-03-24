/**
 * POST /api/linkedin/sync-inbox
 *
 * Manual fallback sync that pulls recent Unipile chats and stores any
 * messages we haven't seen yet.  Useful when webhooks miss events.
 *
 * For each chat:
 *  1. Matches a lead by unipile_chat_id, then by attendee provider_id
 *  2. Backfills unipile_chat_id on the lead if missing
 *  3. Fetches chat messages and inserts those not already in the DB
 *  4. Upgrades lead status to "replied" when new inbound messages are found
 *     (unless the lead is already at a higher-intent status)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getUnipileClient } from "@/lib/unipile/client";
import type { Lead, LeadStatus } from "@/types/database";

// Don't overwrite these statuses — they represent higher intent or terminal states
const PRESERVE_STATUSES: LeadStatus[] = [
  "replied",
  "interested",
  "not_interested",
  "meeting_booked",
  "converted",
  "do_not_contact",
];

export async function POST(_request: NextRequest) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const logCtx = log.child({ userId: user.id });
    logCtx.info("starting manual inbox sync");

    // ── Fetch recent chats from Unipile ──────────────────────────────────────
    const client = getUnipileClient();
    const chatsResponse = await client.getChats(undefined, undefined, correlationId);
    const chats = chatsResponse.items;

    logCtx.info({ chatCount: chats.length }, "chats fetched from unipile");

    let messagesInserted = 0;
    let leadsUpdated = 0;

    for (const chat of chats) {
      try {
        // ── Find matching lead ──────────────────────────────────────────────
        let lead: Lead | null = null;

        // 1. Match by chat_id (direct — fastest path)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: byChatId } = await (supabase as any)
          .from("leads")
          .select("*")
          .eq("unipile_chat_id", chat.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (byChatId) {
          lead = byChatId as Lead;
        }

        // 2. Fallback: match by attendee provider_id
        if (!lead) {
          for (const attendee of chat.attendees) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: byProviderId } = await (supabase as any)
              .from("leads")
              .select("*")
              .eq("linkedin_provider_id", attendee.provider_id)
              .eq("user_id", user.id)
              .maybeSingle();

            if (byProviderId) {
              lead = byProviderId as Lead;
              break;
            }
          }
        }

        if (!lead) continue; // No matching lead — skip this chat

        // ── Backfill unipile_chat_id if missing ─────────────────────────────
        if (!lead.unipile_chat_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("leads")
            .update({ unipile_chat_id: chat.id })
            .eq("id", lead.id);

          leadsUpdated++;
          logCtx.info({ leadId: lead.id, chatId: chat.id }, "backfilled unipile_chat_id on lead");
        }

        // ── Fetch messages for this chat ────────────────────────────────────
        const messagesResponse = await client.getChatMessages(
          chat.id,
          undefined,
          correlationId,
        );
        const messages = messagesResponse.items;

        if (messages.length === 0) continue;

        // ── Deduplicate: find which message IDs are already stored ──────────
        const messageIds = messages.map((m) => m.id).filter(Boolean);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingRows } = await (supabase as any)
          .from("messages")
          .select("unipile_message_id")
          .eq("unipile_chat_id", chat.id)
          .in("unipile_message_id", messageIds);

        const existingIds = new Set<string>(
          (
            (existingRows ?? []) as { unipile_message_id: string | null }[]
          )
            .map((r) => r.unipile_message_id)
            .filter((id): id is string => id !== null),
        );

        // ── Insert only new messages ────────────────────────────────────────
        const now = new Date().toISOString();
        let hasNewInbound = false;

        for (const msg of messages) {
          if (existingIds.has(msg.id)) continue;
          if (msg.is_event) continue; // skip system events (call started, user joined, etc.)

          const direction = msg.is_sender ? "outbound" : "inbound";
          if (direction === "inbound") hasNewInbound = true;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("messages").insert({
            user_id: user.id,
            lead_id: lead.id,
            campaign_id: lead.campaign_id ?? null,
            unipile_chat_id: chat.id,
            unipile_message_id: msg.id,
            direction,
            message_text: msg.text ?? "",
            message_type: "linkedin_message",
            sent_at: msg.timestamp ?? now,
            delivered_at: msg.timestamp ?? now,
            read_at: null,
            is_automated: false,
            sequence_step_id: null,
            personalization_variables: {},
          });

          messagesInserted++;
        }

        // ── Upgrade lead status to "replied" if new inbound messages ────────
        if (hasNewInbound && !PRESERVE_STATUSES.includes(lead.status)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("leads")
            .update({ status: "replied" as LeadStatus, last_replied_at: now })
            .eq("id", lead.id);

          logCtx.info(
            { leadId: lead.id, prevStatus: lead.status },
            "lead status upgraded to replied",
          );
        }
      } catch (chatErr) {
        // Per-chat errors are non-fatal — log and continue
        logCtx.error({ chatId: chat.id, error: chatErr }, "error syncing chat — skipping");
      }
    }

    logCtx.info(
      { chatsProcessed: chats.length, messagesInserted, leadsUpdated },
      "inbox sync complete",
    );

    return NextResponse.json({
      synced: {
        chats: chats.length,
        messages: messagesInserted,
        leadsUpdated,
      },
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "app error in POST /api/linkedin/sync-inbox");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/linkedin/sync-inbox");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
