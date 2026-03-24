import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateSequenceSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import type { Sequence, SequenceStep } from "@/types/database";

const uuidSchema = z.string().uuid("Invalid sequence ID");

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
        { error: "Invalid sequence ID", correlationId },
        { status: 400 },
      );
    }

    log.info({ userId: user.id, sequenceId: id }, "get sequence request");

    const { data: sequence, error: dbError } = await supabase
      .from("sequences")
      .select("*")
      .eq("id", id)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Sequence not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to fetch sequence");
      throw new AppError("Failed to fetch sequence", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    // Fetch steps ordered by step_order
    const { data: steps, error: stepsError } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", id)
      .order("step_order", { ascending: true });

    if (stepsError) {
      log.error({ error: stepsError }, "failed to fetch sequence steps");
      throw new AppError("Failed to fetch sequence steps", {
        statusCode: 500,
        correlationId,
        context: { code: stepsError.code },
      });
    }

    // Fetch usage count
    const { count: usageCount } = await supabase
      .from("sequence_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("sequence_id", id);

    return NextResponse.json({
      sequence: {
        ...sequence,
        steps: steps ?? [],
        step_count: steps?.length ?? 0,
        usage_count: usageCount ?? 0,
      },
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "get sequence error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/sequences/[id]");
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
        { error: "Invalid sequence ID", correlationId },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateSequenceSchema.safeParse(body);

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
      { userId: user.id, sequenceId: id, fields: Object.keys(parsed.data) },
      "update sequence request",
    );

    const { steps, ...sequenceFields } = parsed.data;

    // Update sequence metadata if any fields provided
    if (Object.keys(sequenceFields).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
      const { error: updateError } = await (supabase as any)
        .from("sequences")
        .update(sequenceFields)
        .eq("id", id);

      if (updateError) {
        log.error({ error: updateError }, "failed to update sequence");
        throw new AppError("Failed to update sequence", {
          statusCode: 500,
          correlationId,
          context: { code: updateError.code },
        });
      }
    }

    // Sync steps if provided: delete existing and re-insert
    if (steps) {
      const { error: deleteError } = await supabase
        .from("sequence_steps")
        .delete()
        .eq("sequence_id", id);

      if (deleteError) {
        log.error({ error: deleteError }, "failed to delete old steps");
        throw new AppError("Failed to update sequence steps", {
          statusCode: 500,
          correlationId,
          context: { code: deleteError.code },
        });
      }

      if (steps.length > 0) {
        const stepsToInsert = steps.map((step, index) => ({
          sequence_id: id,
          step_order: step.step_order ?? index,
          step_type: step.step_type,
          template_id: step.template_id ?? null,
          message_body: step.message_body ?? null,
          delay_hours: step.delay_hours ?? null,
          delay_days: step.delay_days ?? null,
          condition_field: step.condition_field ?? null,
          condition_value: step.condition_value ?? null,
          on_true_step: step.on_true_step ?? null,
          on_false_step: step.on_false_step ?? null,
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
        const { error: insertError } = await (supabase as any)
          .from("sequence_steps")
          .insert(stepsToInsert);

        if (insertError) {
          log.error({ error: insertError }, "failed to insert steps");
          throw new AppError("Failed to create sequence steps", {
            statusCode: 500,
            correlationId,
            context: { code: insertError.code },
          });
        }
      }
    }

    // Re-fetch full sequence with steps
    const { data: sequence, error: fetchError } = await supabase
      .from("sequences")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Sequence not found", correlationId },
          { status: 404 },
        );
      }
      throw new AppError("Failed to fetch updated sequence", {
        statusCode: 500,
        correlationId,
        context: { code: fetchError.code },
      });
    }

    const { data: updatedSteps } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", id)
      .order("step_order", { ascending: true });

    log.info({ sequenceId: id }, "sequence updated");

    return NextResponse.json({
      sequence: {
        ...(sequence as Sequence),
        steps: (updatedSteps ?? []) as SequenceStep[],
        step_count: updatedSteps?.length ?? 0,
      },
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "update sequence error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in PATCH /api/sequences/[id]");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
        { error: "Invalid sequence ID", correlationId },
        { status: 400 },
      );
    }

    log.info({ userId: user.id, sequenceId: id }, "delete sequence request");

    // Delete steps first (cascade may not be set)
    await supabase
      .from("sequence_steps")
      .delete()
      .eq("sequence_id", id);

    const { data: sequence, error: dbError } = await supabase
      .from("sequences")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Sequence not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to delete sequence");
      throw new AppError("Failed to delete sequence", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ sequenceId: id }, "sequence deleted");

    return NextResponse.json({ sequence, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "delete sequence error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in DELETE /api/sequences/[id]");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
