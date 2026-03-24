import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLeadSchema, listLeadsQuerySchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Lead } from "@/types/database";

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
    const parsed = listLeadsQuerySchema.safeParse(searchParams);

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

    const {
      page,
      limit,
      status,
      campaign_id,
      icp_segment,
      location,
      search,
      sort_by,
      sort_order,
    } = parsed.data;

    log.info(
      { userId: user.id, page, limit, status, search },
      "list leads request",
    );

    // ── Build query ───────────────────────────────────────────────────
    let query = supabase
      .from("leads")
      .select("*", { count: "exact" });

    if (status) {
      query = query.eq("status", status);
    }

    if (campaign_id) {
      query = query.eq("campaign_id", campaign_id);
    }

    if (icp_segment) {
      query = query.eq("icp_segment", icp_segment);
    }

    if (location) {
      query = query.ilike("location", `%${location}%`);
    }

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,company.ilike.%${search}%,job_title.ilike.%${search}%`,
      );
    }

    // ── Sorting & pagination ──────────────────────────────────────────
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order(sort_by, { ascending: sort_order === "asc" })
      .range(from, to);

    const { data: leads, error: dbError, count } = await query;

    if (dbError) {
      log.error({ error: dbError }, "failed to fetch leads");
      throw new AppError("Failed to fetch leads", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info(
      { resultCount: leads?.length ?? 0, totalCount: count },
      "leads fetched",
    );

    return NextResponse.json({
      leads: leads ?? [],
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
      log.error({ error: err.toJSON() }, "leads list error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/leads");
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
    const parsed = createLeadSchema.safeParse(body);

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
      { userId: user.id, firstName: parsed.data.first_name, lastName: parsed.data.last_name },
      "create lead request",
    );

    // ── Insert ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data, error: dbError } = await (supabase as any)
      .from("leads")
      .insert({
        user_id: user.id,
        ...parsed.data,
        source: parsed.data.source ?? "manual",
        tags: parsed.data.tags ?? [],
        status: "new",
        icp_score: 0,
        enrichment_data: {},
        skills: [],
        education: [],
        experience: [],
      })
      .select()
      .single();
    const lead = data as Lead | null;

    if (dbError) {
      log.error({ error: dbError }, "failed to create lead");
      throw new AppError("Failed to create lead", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ leadId: lead?.id }, "lead created");

    return NextResponse.json({ lead, correlationId }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "create lead error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/leads");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
