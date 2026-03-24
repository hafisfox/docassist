import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportLeadsQuerySchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Lead } from "@/types/database";

// ── CSV helpers ───────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Full Name",
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Job Title",
  "Company",
  "Location",
  "City",
  "Country",
  "Specialty",
  "Status",
  "ICP Segment",
  "ICP Score",
  "Hospital Type",
  "Source",
  "Tags",
  "LinkedIn URL",
  "Last Contacted",
  "Last Replied",
  "Created At",
];

function escapeCSV(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function leadToCSVRow(lead: Lead): string {
  return [
    lead.full_name,
    lead.first_name,
    lead.last_name,
    lead.email,
    lead.phone,
    lead.job_title,
    lead.company,
    lead.location,
    lead.city,
    lead.country,
    lead.specialty,
    lead.status,
    lead.icp_segment,
    lead.icp_score,
    lead.hospital_type,
    lead.source,
    (lead.tags ?? []).join("; "),
    lead.linkedin_profile_url,
    lead.last_contacted_at,
    lead.last_replied_at,
    lead.created_at,
  ]
    .map(escapeCSV)
    .join(",");
}

// ── GET handler ───────────────────────────────────────────────────────────────

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse query params ───────────────────────────────────────────
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = exportLeadsQuerySchema.safeParse(searchParams);

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

    const { status, campaign_id, icp_segment, location, search, ids } =
      parsed.data;

    log.info(
      { userId: user.id, hasIds: !!ids, status, campaign_id },
      "export leads request",
    );

    // ── Build query ──────────────────────────────────────────────────
    let query = supabase.from("leads").select("*");

    if (ids) {
      const idList = ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (idList.length > 0) {
        query = query.in("id", idList);
      }
    } else {
      if (status) query = query.eq("status", status);
      if (campaign_id) query = query.eq("campaign_id", campaign_id);
      if (icp_segment) query = query.eq("icp_segment", icp_segment);
      if (location) query = query.ilike("location", `%${location}%`);
      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,company.ilike.%${search}%,job_title.ilike.%${search}%`,
        );
      }
    }

    // Cap at 10 000 rows to protect against runaway exports
    query = query.order("created_at", { ascending: false }).limit(10000);

    const { data: leads, error: dbError } = await query;

    if (dbError) {
      log.error({ error: dbError }, "failed to fetch leads for export");
      throw new AppError("Failed to export leads", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    const rows = (leads ?? []) as Lead[];

    // ── Build CSV ────────────────────────────────────────────────────
    const csv = [CSV_HEADERS.join(","), ...rows.map(leadToCSVRow)].join("\n");

    log.info({ count: rows.length }, "leads exported");

    const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "export leads error");
      return NextResponse.json(
        {
          error: err.message,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/leads/export");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
