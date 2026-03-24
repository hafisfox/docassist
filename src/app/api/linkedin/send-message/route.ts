import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError, RateLimitError, UnipileError } from "@/lib/errors";
import { checkAndIncrementLimit } from "@/lib/queue/rateLimiter";
import { getUnipileClient } from "@/lib/unipile/client";
import { sendMessageSchema } from "@/lib/validators";
import type { Lead, Campaign } from "@/types/database";

export async function POST(request: NextRequest) {
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

    // ── Validate input ───────────────────────────────────────────────────────
    const body = await request.json();
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
          correlationId,
        },
        { status: 400 },
      );
    }

    const { lead_id, chat_id: directChatId, text } = parsed.data;
    logCtx.info({ leadId: lead_id, chatId: directChatId, textLength: text.length }, "send message request");

    // ── Check + increment daily message rate limit ───────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limitResult = await checkAndIncrementLimit(supabase as any, user.id, "message", correlationId);

    if (!limitResult.allowed) {
      logCtx.warn({ limitResult }, "daily message limit reached");
      return NextResponse.json(
        {
          error: "Daily message limit reached. Try again tomorrow.",
          remaining_daily_messages: 0,
          correlationId,
        },
        { status: 429 },
      );
    }

    logCtx.debug({ remaining: limitResult.remaining }, "rate limit check passed");

    // ── Fetch account ID from user settings ──────────────────────────────────
    const { data: settings } = await supabase
      .from("settings")
      .select("unipile_account_id")
      .eq("user_id", user.id)
      .single();

    const accountId = settings?.unipile_account_id;
    if (!accountId) {
      return NextResponse.json(
        {
          error: "Unipile account not configured. Please add your Account ID in Settings.",
          correlationId,
        },
        { status: 422 },
      );
    }

    const client = getUnipileClient();
    const now = new Date().toISOString();

    // ── Direct chat_id path (from inbox thread) ───────────────────────────────
    if (directChatId && !lead_id) {
      logCtx.info({ chatId: directChatId }, "sending message directly by chat_id");
      await client.sendMessageInChat({ chat_id: directChatId, text }, correlationId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("messages").insert({
        user_id: user.id,
        unipile_chat_id: directChatId,
        direction: "outbound",
        message_text: text,
        message_type: "message",
        sent_at: now,
        is_automated: false,
        personalization_variables: {},
      });

      logCtx.info({ chatId: directChatId, remaining: limitResult.remaining }, "direct chat send completed");

      return NextResponse.json({
        success: true,
        chat_id: directChatId,
        remaining_daily_messages: limitResult.remaining,
        correlationId,
      });
    }

    // ── Lead-based path ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadRow, error: leadError } = await (supabase as any)
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("user_id", user.id)
      .single();
    const lead = leadRow as Lead | null;

    if (leadError || !lead) {
      logCtx.error({ error: leadError, leadId: lead_id }, "lead not found");
      return NextResponse.json({ error: "Lead not found", correlationId }, { status: 404 });
    }

    let chatId = lead.unipile_chat_id ?? directChatId ?? null;

    // ── Route: existing chat vs. new chat ────────────────────────────────────
    if (chatId) {
      logCtx.info({ chatId }, "sending message in existing chat");
      await client.sendMessageInChat({ chat_id: chatId, text }, correlationId);
    } else {
      // Need provider_id to open a new chat — only possible with 1st-degree connections
      let providerId = lead.linkedin_provider_id;

      if (!providerId) {
        if (!lead.linkedin_public_id) {
          return NextResponse.json(
            {
              error: "Lead has no LinkedIn profile. Please enrich the profile first.",
              correlationId,
            },
            { status: 422 },
          );
        }

        logCtx.info({ publicId: lead.linkedin_public_id }, "resolving provider_id for new chat");
        const profile = await client.getProfile(lead.linkedin_public_id, accountId, correlationId);
        providerId = profile.provider_id;

        // Persist for future calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("leads")
          .update({ linkedin_provider_id: providerId })
          .eq("id", lead_id);

        logCtx.info({ providerId }, "provider_id resolved and stored");
      }

      logCtx.info({ providerId }, "opening new chat and sending message");
      const createChatResult = await client.sendMessage(
        { account_id: accountId, attendees_ids: [providerId], text },
        correlationId,
      );
      chatId = createChatResult.chat_id;

      // Persist chat_id on the lead for future messages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("leads")
        .update({ unipile_chat_id: chatId })
        .eq("id", lead_id);

      logCtx.info({ chatId }, "new chat created and chat_id stored");
    }

    // ── Update lead status → message_sent, stamp last_contacted_at ───────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("leads")
      .update({ status: "message_sent", last_contacted_at: now })
      .eq("id", lead_id);

    // ── Insert activity record ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("activities").insert({
      user_id: user.id,
      lead_id,
      campaign_id: lead.campaign_id,
      activity_type: "message_sent",
      description: `Message sent (${text.length} chars)`,
      metadata: {
        chat_id: chatId,
        text_length: text.length,
        correlation_id: correlationId,
      },
    });

    // ── Increment campaign messages_sent counter ──────────────────────────────
    if (lead.campaign_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campaignRow } = await (supabase as any)
        .from("campaigns")
        .select("messages_sent")
        .eq("id", lead.campaign_id)
        .single();
      const campaign = campaignRow as Pick<Campaign, "messages_sent"> | null;

      if (campaign != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("campaigns")
          .update({ messages_sent: campaign.messages_sent + 1 })
          .eq("id", lead.campaign_id);
      }
    }

    // ── Store message in messages table ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("messages").insert({
      user_id: user.id,
      lead_id,
      campaign_id: lead.campaign_id,
      unipile_chat_id: chatId,
      direction: "outbound",
      message_text: text,
      message_type: "message",
      sent_at: now,
      is_automated: false,
      personalization_variables: {},
    });

    logCtx.info(
      { leadId: lead_id, chatId, remaining: limitResult.remaining },
      "message send flow completed",
    );

    return NextResponse.json({
      success: true,
      chat_id: chatId,
      remaining_daily_messages: limitResult.remaining,
      correlationId,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      log.warn({ error: err.toJSON() }, "rate limit error in send-message");
      return NextResponse.json(
        {
          error: err.message,
          remaining_daily_messages: 0,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: 429 },
      );
    }

    if (err instanceof UnipileError && err.statusCode === 422) {
      log.warn({ error: err.toJSON() }, "linkedin rate limit hit (422) in send-message");
      return NextResponse.json(
        { error: "LinkedIn rate limit reached. Try again tomorrow.", correlationId },
        { status: 429 },
      );
    }

    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "app error in send-message");
      return NextResponse.json(
        {
          error: err.message,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/linkedin/send-message");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
