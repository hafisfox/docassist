import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSequenceSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Sequence } from "@/types/database";

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

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") ?? undefined;

    log.info(
      { userId: user.id, search },
      "list sequences request",
    );

    let query = supabase
      .from("sequences")
      .select("*");

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }

    query = query.order("updated_at", { ascending: false });

    const { data: sequences, error: dbError } = await query;

    if (dbError) {
      log.error({ error: dbError }, "failed to fetch sequences");
      throw new AppError("Failed to fetch sequences", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    // Fetch step counts for each sequence
    const sequenceIds = (sequences ?? []).map((s) => s.id);
    let stepCounts: Record<string, number> = {};

    if (sequenceIds.length > 0) {
      const { data: steps, error: stepsError } = await supabase
        .from("sequence_steps")
        .select("sequence_id")
        .in("sequence_id", sequenceIds);

      if (!stepsError && steps) {
        stepCounts = steps.reduce<Record<string, number>>((acc, step) => {
          acc[step.sequence_id] = (acc[step.sequence_id] ?? 0) + 1;
          return acc;
        }, {});
      }
    }

    // Fetch enrollment (usage) counts
    let usageCounts: Record<string, number> = {};

    if (sequenceIds.length > 0) {
      const { data: enrollments, error: enrollError } = await supabase
        .from("sequence_enrollments")
        .select("sequence_id")
        .in("sequence_id", sequenceIds);

      if (!enrollError && enrollments) {
        usageCounts = enrollments.reduce<Record<string, number>>((acc, e) => {
          acc[e.sequence_id] = (acc[e.sequence_id] ?? 0) + 1;
          return acc;
        }, {});
      }
    }

    const sequencesWithCounts = (sequences ?? []).map((s) => ({
      ...s,
      step_count: stepCounts[s.id] ?? 0,
      usage_count: usageCounts[s.id] ?? 0,
    }));

    log.info(
      { resultCount: sequencesWithCounts.length },
      "sequences fetched",
    );

    return NextResponse.json({
      sequences: sequencesWithCounts,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "sequences list error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/sequences");
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

    const body = await request.json();
    const parsed = createSequenceSchema.safeParse(body);

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
      "create sequence request",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data, error: dbError } = await (supabase as any)
      .from("sequences")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        is_default: parsed.data.is_default ?? false,
      })
      .select()
      .single();
    const sequence = data as Sequence | null;

    if (dbError) {
      log.error({ error: dbError }, "failed to create sequence");
      throw new AppError("Failed to create sequence", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ sequenceId: sequence?.id }, "sequence created");

    return NextResponse.json(
      { sequence: { ...sequence, step_count: 0, usage_count: 0 }, correlationId },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "create sequence error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/sequences");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
