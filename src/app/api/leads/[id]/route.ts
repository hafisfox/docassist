import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateLeadSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import type { Lead } from "@/types/database";

const uuidSchema = z.string().uuid("Invalid lead ID");

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
        { error: "Invalid lead ID", correlationId },
        { status: 400 },
      );
    }

    log.info({ userId: user.id, leadId: id }, "get lead request");

    const { data: lead, error: dbError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Lead not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to fetch lead");
      throw new AppError("Failed to fetch lead", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    return NextResponse.json({ lead, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "get lead error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/leads/[id]");
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
        { error: "Invalid lead ID", correlationId },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateLeadSchema.safeParse(body);

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
      { userId: user.id, leadId: id, fields: Object.keys(parsed.data) },
      "update lead request",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data, error: dbError } = await (supabase as any)
      .from("leads")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();
    const lead = data as Lead | null;

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Lead not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to update lead");
      throw new AppError("Failed to update lead", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ leadId: id }, "lead updated");

    return NextResponse.json({ lead, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "update lead error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in PATCH /api/leads/[id]");
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
        { error: "Invalid lead ID", correlationId },
        { status: 400 },
      );
    }

    log.info({ userId: user.id, leadId: id }, "delete lead request (soft)");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data, error: dbError } = await (supabase as any)
      .from("leads")
      .update({ status: "do_not_contact" })
      .eq("id", id)
      .select()
      .single();
    const lead = data as Lead | null;

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Lead not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to soft-delete lead");
      throw new AppError("Failed to delete lead", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ leadId: id }, "lead soft-deleted");

    return NextResponse.json({ lead, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "delete lead error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in DELETE /api/leads/[id]");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
