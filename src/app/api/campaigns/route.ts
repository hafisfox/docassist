import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCampaignSchema, listCampaignsQuerySchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Campaign, Lead } from "@/types/database";

export async function GET(request: NextRequest) {
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

    // ── Parse query params ────────────────────────────────────────────
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listCampaignsQuerySchema.safeParse(searchParams);

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

    const { page, limit, status, search, sort_by, sort_order } = parsed.data;

    log.info(
      { userId: user.id, page, limit, status, search },
      "list campaigns request",
    );

    // ── Build query ───────────────────────────────────────────────────
    let query = supabase
      .from("campaigns")
      .select("*", { count: "exact" });

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }

    // ── Sorting & pagination ──────────────────────────────────────────
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order(sort_by, { ascending: sort_order === "asc" })
      .range(from, to);

    const { data: campaigns, error: dbError, count } = await query;

    if (dbError) {
      log.error({ error: dbError }, "failed to fetch campaigns");
      throw new AppError("Failed to fetch campaigns", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    // Fetch lead counts per campaign
    const campaignRows = (campaigns ?? []) as Campaign[];
    const campaignIds = campaignRows.map((c) => c.id);
    let leadCounts: Record<string, number> = {};

    if (campaignIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
      const { data: leads, error: leadsError } = await (supabase as any)
        .from("leads")
        .select("campaign_id")
        .in("campaign_id", campaignIds);
      const leadRows = (leads ?? []) as Pick<Lead, "campaign_id">[];

      if (!leadsError) {
        leadCounts = leadRows.reduce<Record<string, number>>((acc, l) => {
          if (l.campaign_id) {
            acc[l.campaign_id] = (acc[l.campaign_id] ?? 0) + 1;
          }
          return acc;
        }, {});
      }
    }

    const campaignsWithStats = campaignRows.map((c) => ({
      ...c,
      lead_count: leadCounts[c.id] ?? 0,
    }));

    log.info(
      { resultCount: campaignsWithStats.length, totalCount: count },
      "campaigns fetched",
    );

    return NextResponse.json({
      campaigns: campaignsWithStats,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "campaigns list error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/campaigns");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    // ── Validate input ───────────────────────────────────────────────
    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);

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
      { userId: user.id, name: parsed.data.name },
      "create campaign request",
    );

    // ── Insert ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data, error: dbError } = await (supabase as any)
      .from("campaigns")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        status: parsed.data.status ?? "draft",
        sequence_id: parsed.data.sequence_id ?? null,
        icp_segments: parsed.data.icp_segments ?? null,
        target_titles: parsed.data.target_titles ?? null,
        target_locations: parsed.data.target_locations ?? null,
        target_companies: parsed.data.target_companies ?? null,
        daily_invite_limit: parsed.data.daily_invite_limit ?? 25,
        daily_message_limit: parsed.data.daily_message_limit ?? 50,
        total_leads: 0,
        invites_sent: 0,
        invites_accepted: 0,
        messages_sent: 0,
        replies_received: 0,
        positive_replies: 0,
        meetings_booked: 0,
      })
      .select()
      .single();
    const campaign = data as Campaign | null;

    if (dbError) {
      log.error({ error: dbError }, "failed to create campaign");
      throw new AppError("Failed to create campaign", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ campaignId: campaign?.id }, "campaign created");

    return NextResponse.json(
      { campaign: { ...campaign, lead_count: 0 }, correlationId },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "create campaign error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/campaigns");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
