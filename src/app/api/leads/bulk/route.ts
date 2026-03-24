import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkImportLeadsSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Lead } from "@/types/database";

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
    const parsed = bulkImportLeadsSchema.safeParse(body);

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

    const { leads: leadsInput } = parsed.data;

    log.info(
      { userId: user.id, count: leadsInput.length },
      "bulk import leads request",
    );

    // ── Prepare rows with defaults ───────────────────────────────────
    const rows = leadsInput.map((lead) => ({
      user_id: user.id,
      ...lead,
      source: lead.source ?? "bulk_import",
      tags: lead.tags ?? [],
      status: "new" as const,
      icp_score: 0,
      enrichment_data: {},
      skills: [] as string[],
      education: [] as Record<string, unknown>[],
      experience: [] as Record<string, unknown>[],
    }));

    // ── Insert in batches of 100 to avoid payload limits ─────────────
    const BATCH_SIZE = 100;
    const inserted: Lead[] = [];
    const errors: Array<{ batch: number; error: string }> = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
      const { data, error: dbError } = await (supabase as any)
        .from("leads")
        .insert(batch)
        .select();

      if (dbError) {
        log.error(
          { error: dbError, batch: batchNum },
          "failed to insert batch",
        );
        errors.push({ batch: batchNum, error: dbError.message });
      } else if (data) {
        inserted.push(...(data as Lead[]));
      }
    }

    if (errors.length > 0 && inserted.length === 0) {
      throw new AppError("All batches failed to import", {
        statusCode: 500,
        correlationId,
        context: { errors },
      });
    }

    log.info(
      { insertedCount: inserted.length, errorCount: errors.length },
      "bulk import completed",
    );

    // ── Log a single aggregate activity for the bulk import ──────────
    if (inserted.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("activities").insert({
        user_id: user.id,
        lead_id: null,
        campaign_id: null,
        activity_type: "lead_created",
        description: `Bulk import: ${inserted.length} leads created`,
        metadata: {
          imported_count: inserted.length,
          failed_batches: errors.length,
          total_requested: leadsInput.length,
          source: "bulk_import",
          correlation_id: correlationId,
        },
      });
    }

    return NextResponse.json(
      {
        imported: inserted.length,
        failed: errors.length > 0 ? errors : undefined,
        total_requested: leadsInput.length,
        correlationId,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "bulk import error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/leads/bulk");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
