import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateCampaignSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import type { Campaign, Lead, Sequence } from "@/types/database";

const uuidSchema = z.string().uuid("Invalid campaign ID");

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const idParsed = uuidSchema.safeParse(id);
    if (!idParsed.success) {
      return NextResponse.json(
        { error: "Invalid campaign ID", correlationId },
        { status: 400 },
      );
    }

    log.info({ userId: user.id, campaignId: id }, "get campaign request");

    const { data: campaign, error: dbError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Campaign not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to fetch campaign");
      throw new AppError("Failed to fetch campaign", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    const campaignRow = campaign as Campaign;

    // Fetch leads for this campaign
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data: leads, error: leadsError, count: leadCount } = await (supabase as any)
      .from("leads")
      .select("*", { count: "exact" })
      .eq("campaign_id", id)
      .order("created_at", { ascending: false });

    if (leadsError) {
      log.error({ error: leadsError }, "failed to fetch campaign leads");
    }

    // Fetch sequence if linked
    let sequence: Sequence | null = null;
    if (campaignRow.sequence_id) {
      const { data: seqData } = await supabase
        .from("sequences")
        .select("*")
        .eq("id", campaignRow.sequence_id)
        .single();
      sequence = seqData ? (seqData as Sequence) : null;
    }

    return NextResponse.json({
      campaign: {
        ...campaignRow,
        lead_count: leadCount ?? 0,
        sequence: sequence,
      },
      leads: ((leads ?? []) as Lead[]),
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "get campaign error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/campaigns/[id]");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const idParsed = uuidSchema.safeParse(id);
    if (!idParsed.success) {
      return NextResponse.json(
        { error: "Invalid campaign ID", correlationId },
        { status: 400 },
      );
    }

    const body = await request.json();

    // Handle lead_ids separately — not part of campaign update schema
    const { lead_ids, ...campaignFields } = body as { lead_ids?: string[] } & Record<string, unknown>;

    const parsed = updateCampaignSchema.safeParse(campaignFields);

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

    log.info(
      { userId: user.id, campaignId: id, fields: Object.keys(parsed.data) },
      "update campaign request",
    );

    // Update campaign fields
    const updateData: Record<string, unknown> = { ...parsed.data };

    // Set timestamps based on status transitions
    if (parsed.data.status === "active" && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
      updateData.paused_at = null;
    } else if (parsed.data.status === "paused") {
      updateData.paused_at = new Date().toISOString();
    } else if (parsed.data.status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
      const { error: updateError } = await (supabase as any)
        .from("campaigns")
        .update(updateData)
        .eq("id", id);

      if (updateError) {
        log.error({ error: updateError }, "failed to update campaign");
        throw new AppError("Failed to update campaign", {
          statusCode: 500,
          correlationId,
          context: { code: updateError.code },
        });
      }
    }

    // Assign leads to campaign if lead_ids provided
    if (lead_ids && lead_ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
      const { error: assignError } = await (supabase as any)
        .from("leads")
        .update({ campaign_id: id })
        .in("id", lead_ids);

      if (assignError) {
        log.error({ error: assignError }, "failed to assign leads to campaign");
        throw new AppError("Failed to assign leads", {
          statusCode: 500,
          correlationId,
          context: { code: assignError.code },
        });
      }

      // Update total_leads count
      const { count: leadCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
      await (supabase as any)
        .from("campaigns")
        .update({ total_leads: leadCount ?? 0 })
        .eq("id", id);
    }

    // Re-fetch updated campaign
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Campaign not found", correlationId },
          { status: 404 },
        );
      }
      throw new AppError("Failed to fetch updated campaign", {
        statusCode: 500,
        correlationId,
        context: { code: fetchError.code },
      });
    }

    log.info({ campaignId: id }, "campaign updated");

    return NextResponse.json({
      campaign: campaign as Campaign,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "update campaign error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in PATCH /api/campaigns/[id]");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
