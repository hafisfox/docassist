import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateTemplateSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import type { Template } from "@/types/database";

const uuidSchema = z.string().uuid("Invalid template ID");

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
        { error: "Invalid template ID", correlationId },
        { status: 400 },
      );
    }

    log.info({ userId: user.id, templateId: id }, "get template request");

    const { data: template, error: dbError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", id)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Template not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to fetch template");
      throw new AppError("Failed to fetch template", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    return NextResponse.json({ template, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "get template error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/templates/[id]");
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
        { error: "Invalid template ID", correlationId },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

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
      { userId: user.id, templateId: id, fields: Object.keys(parsed.data) },
      "update template request",
    );

    // Enforce the 300-char connection-request cap against the *effective*
    // category. updateTemplateSchema can only check it when `category` is in
    // the same payload, so `PATCH { body: <400 chars> }` on an existing
    // connection-request template slipped through and was silently truncated
    // mid-word at send time.
    if (parsed.data.body && parsed.data.category !== "connection_request") {
      const { data: existing } = await supabase
        .from("templates")
        .select("category")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      const effectiveCategory =
        parsed.data.category ?? (existing as { category: string } | null)?.category;

      if (effectiveCategory === "connection_request" && parsed.data.body.length > 300) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: {
              body: ["Connection request messages must be 300 characters or fewer"],
            },
            correlationId,
          },
          { status: 400 },
        );
      }
    }

    // Re-extract variables if body changed
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.body && !parsed.data.variables) {
      const variableMatches = parsed.data.body.match(/\{\{(\w+)\}\}/g) ?? [];
      updateData.variables = [...new Set(variableMatches.map((v) => v.replace(/\{\{|\}\}/g, "")))];
    }

    const { data, error: dbError } = await supabase
      .from("templates")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    const template = data as Template | null;

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Template not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to update template");
      throw new AppError("Failed to update template", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ templateId: id }, "template updated");

    return NextResponse.json({ template, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "update template error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in PATCH /api/templates/[id]");
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
        { error: "Invalid template ID", correlationId },
        { status: 400 },
      );
    }

    log.info({ userId: user.id, templateId: id }, "delete template request");

    const { data: template, error: dbError } = await supabase
      .from("templates")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Template not found", correlationId },
          { status: 404 },
        );
      }
      log.error({ error: dbError }, "failed to delete template");
      throw new AppError("Failed to delete template", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ templateId: id }, "template deleted");

    return NextResponse.json({ template, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "delete template error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in DELETE /api/templates/[id]");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
