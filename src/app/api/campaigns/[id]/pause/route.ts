import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import type { Campaign } from "@/types/database";

const uuidSchema = z.string().uuid("Invalid campaign ID");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/campaigns/:id/pause
 *
 * Pauses an active campaign:
 *  1. Sets all active sequence_enrollments for this campaign to 'paused'
 *  2. Updates campaign.status → 'paused'
 *
 * Returns 409 if the campaign is not currently active.
 */
export async function POST(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid campaign ID", correlationId },
        { status: 400 }
      );
    }

    log.info({ userId: user.id, campaignId: id }, "pause campaign request");

    // ── Fetch campaign ────────────────────────────────────────────────────
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id) // belt-and-suspenders RLS check
      .single();

    if (campaignError?.code === "PGRST116" || !campaignData) {
      return NextResponse.json(
        { error: "Campaign not found", correlationId },
        { status: 404 }
      );
    }
    if (campaignError) {
      throw new AppError("Failed to fetch campaign", { statusCode: 500, correlationId });
    }

    const campaign = campaignData as Campaign;

    if (campaign.status !== "active") {
      return NextResponse.json(
        {
          error: `Cannot pause a campaign with status '${campaign.status}'`,
          correlationId,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    // ── Pause all active enrollments ──────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: enrollError } = await (supabase as any)
      .from("sequence_enrollments")
      .update({ status: "paused" })
      .eq("campaign_id", id)
      .eq("status", "active");

    if (enrollError) {
      throw new AppError("Failed to pause enrollments", {
        statusCode: 500,
        correlationId,
        context: { code: enrollError.code },
      });
    }

    // Count paused enrollments for the activity log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: pausedCount } = await (supabase as any)
      .from("sequence_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "paused");

    // ── Update campaign status → paused ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedData, error: updateError } = await (supabase as any)
      .from("campaigns")
      .update({ status: "paused", paused_at: now })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw new AppError("Failed to update campaign status", { statusCode: 500, correlationId });
    }

    // ── Log activity ──────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("activities").insert({
      user_id: user.id,
      lead_id: null,
      campaign_id: id,
      activity_type: "campaign_paused",
      description: `Campaign paused — ${pausedCount ?? 0} enrollments paused`,
      metadata: { paused_enrollment_count: pausedCount ?? 0 },
    });

    log.info({ campaignId: id, pausedCount }, "campaign paused");

    return NextResponse.json({
      campaign: updatedData as Campaign,
      paused_enrollment_count: pausedCount ?? 0,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "pause campaign error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode }
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/campaigns/[id]/pause");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 }
    );
  }
}
