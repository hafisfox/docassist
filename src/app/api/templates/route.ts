import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTemplateSchema, listTemplatesQuerySchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Template } from "@/types/database";

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

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listTemplatesQuerySchema.safeParse(searchParams);

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

    const { category, search } = parsed.data;

    log.info(
      { userId: user.id, category, search },
      "list templates request",
    );

    let query = supabase
      .from("templates")
      .select("*");

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,body.ilike.%${search}%`,
      );
    }

    query = query.order("updated_at", { ascending: false });

    const { data: templates, error: dbError } = await query;

    if (dbError) {
      log.error({ error: dbError }, "failed to fetch templates");
      throw new AppError("Failed to fetch templates", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info(
      { resultCount: templates?.length ?? 0 },
      "templates fetched",
    );

    return NextResponse.json({
      templates: templates ?? [],
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "templates list error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/templates");
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
    const parsed = createTemplateSchema.safeParse(body);

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
      { userId: user.id, name: parsed.data.name, category: parsed.data.category },
      "create template request",
    );

    // Extract variables from body ({{variable_name}} patterns)
    const variableMatches = parsed.data.body.match(/\{\{(\w+)\}\}/g) ?? [];
    const variables = [...new Set(variableMatches.map((v) => v.replace(/\{\{|\}\}/g, "")))];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data, error: dbError } = await (supabase as any)
      .from("templates")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        category: parsed.data.category ?? "message",
        subject: parsed.data.subject ?? null,
        body: parsed.data.body,
        variables: parsed.data.variables ?? variables,
        is_ai_generated: parsed.data.is_ai_generated ?? false,
        performance_score: null,
      })
      .select()
      .single();
    const template = data as Template | null;

    if (dbError) {
      log.error({ error: dbError }, "failed to create template");
      throw new AppError("Failed to create template", {
        statusCode: 500,
        correlationId,
        context: { code: dbError.code },
      });
    }

    log.info({ templateId: template?.id }, "template created");

    return NextResponse.json({ template, correlationId }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "create template error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/templates");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
