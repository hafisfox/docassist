import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkedinSearchApiInputSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { getUnipileClient } from "@/lib/unipile/client";
import { AppError } from "@/lib/errors";

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  try {
    // ── Auth ──────────────────────────────────────────────────────────
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
    const parsed = linkedinSearchApiInputSchema.safeParse(body);

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

    const { keywords, title, location, company, industry, api, page } =
      parsed.data;

    log.info(
      { userId: user.id, keywords, title, location, company, page },
      "linkedin search request",
    );

    // ── Call Unipile ─────────────────────────────────────────────────
    const client = getUnipileClient();
    const results = await client.searchPeople(
      {
        keywords,
        title,
        location,
        company,
        industry,
        api,
        page,
      },
      correlationId,
    );

    log.info(
      { resultCount: results.items.length, totalCount: results.total_count },
      "linkedin search completed",
    );

    return NextResponse.json({
      ...results,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error(
        { error: err.toJSON() },
        "linkedin search error",
      );
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/linkedin/search");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
