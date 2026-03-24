import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError, RateLimitError, UnipileError } from "@/lib/errors";
import { checkAndIncrementLimit } from "@/lib/queue/rateLimiter";
import { getUnipileClient } from "@/lib/unipile/client";
import { sendInviteSchema } from "@/lib/validators";
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
    const parsed = sendInviteSchema.safeParse(body);

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

    const { lead_id, message } = parsed.data;
    logCtx.info({ leadId: lead_id, hasMessage: !!message }, "send connection request");

    // ── Check + increment daily rate limit ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limitResult = await checkAndIncrementLimit(supabase as any, user.id, "invite", correlationId);

    if (!limitResult.allowed) {
      logCtx.warn({ limitResult }, "daily invite limit reached");
      return NextResponse.json(
        {
          error: "Daily connection request limit reached. Try again tomorrow.",
          remaining_daily_invites: 0,
          correlationId,
        },
        { status: 429 },
      );
    }

    logCtx.debug({ remaining: limitResult.remaining }, "rate limit check passed");

    // ── Fetch lead (scoped to current user) ──────────────────────────────────
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

    // ── Resolve LinkedIn provider_id if not yet stored ───────────────────────
    let providerId = lead.linkedin_provider_id;

    if (!providerId) {
      if (!lead.linkedin_public_id) {
        return NextResponse.json(
          {
            error:
              "Lead has no LinkedIn profile. Please enrich the profile first.",
            correlationId,
          },
          { status: 422 },
        );
      }

      logCtx.info(
        { publicId: lead.linkedin_public_id },
        "resolving provider_id from public_id",
      );

      const client = getUnipileClient();
      const profile = await client.getProfile(
        lead.linkedin_public_id,
        undefined,
        correlationId,
      );
      providerId = profile.provider_id;

      // Persist for future calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("leads")
        .update({ linkedin_provider_id: providerId })
        .eq("id", lead_id);

      logCtx.info({ providerId }, "provider_id resolved and stored");
    }

    // ── Send invitation via Unipile ──────────────────────────────────────────
    const client = getUnipileClient();
    const inviteResult = await client.sendInvitation(
      { provider_id: providerId, message: message ?? undefined },
      correlationId,
    );

    logCtx.info({ providerId }, "invitation sent via Unipile");

    // ── Update lead: status → invite_sent, stamp last_contacted_at ───────────
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("leads")
      .update({ status: "invite_sent", last_contacted_at: now })
      .eq("id", lead_id);

    // ── Insert activity record ────────────────────────────────────────────────
    const activityDescription = message
      ? `Connection request sent with note (${message.length} chars)`
      : "Connection request sent";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("activities").insert({
      user_id: user.id,
      lead_id,
      campaign_id: lead.campaign_id,
      activity_type: "invite_sent",
      description: activityDescription,
      metadata: {
        provider_id: providerId,
        has_message: !!message,
        message_length: message?.length ?? 0,
        unipile_invite_id: (inviteResult as unknown as Record<string, unknown>).id ?? null,
        correlation_id: correlationId,
      },
    });

    // ── Increment campaign invites_sent counter ───────────────────────────────
    if (lead.campaign_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campaignRow } = await (supabase as any)
        .from("campaigns")
        .select("invites_sent")
        .eq("id", lead.campaign_id)
        .single();
      const campaign = campaignRow as Pick<Campaign, "invites_sent"> | null;

      if (campaign != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("campaigns")
          .update({ invites_sent: campaign.invites_sent + 1 })
          .eq("id", lead.campaign_id);
      }
    }

    // ── Store connection request note in messages table ───────────────────────
    if (message) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("messages").insert({
        user_id: user.id,
        lead_id,
        campaign_id: lead.campaign_id,
        direction: "outbound",
        message_text: message,
        message_type: "connection_request",
        sent_at: now,
        is_automated: false,
        personalization_variables: {},
      });
    }

    logCtx.info(
      { leadId: lead_id, remaining: limitResult.remaining },
      "connection request flow completed",
    );

    return NextResponse.json({
      success: true,
      remaining_daily_invites: limitResult.remaining,
      correlationId,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      log.warn({ error: err.toJSON() }, "rate limit error in send-invite");
      return NextResponse.json(
        {
          error: err.message,
          remaining_daily_invites: 0,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: 429 },
      );
    }

    if (err instanceof UnipileError && err.statusCode === 422) {
      log.warn({ error: err.toJSON() }, "linkedin rate limit hit (422) in send-invite");
      return NextResponse.json(
        { error: "LinkedIn rate limit reached. Try again tomorrow.", correlationId },
        { status: 429 },
      );
    }

    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "app error in send-invite");
      return NextResponse.json(
        {
          error: err.message,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/linkedin/send-invite");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
