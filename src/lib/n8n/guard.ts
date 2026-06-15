/**
 * Shared auth + scoping helpers for the /api/automations routes.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { getWorkflowDef, type WorkflowDef } from "@/lib/n8n/workflows";

/** Throws AppError(401) if there is no authenticated dashboard user. */
export async function requireUser(): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AppError("Unauthorized", { statusCode: 401 });
  }
  return { id: user.id };
}

/** Throws AppError(404) for any workflow id we don't explicitly manage. */
export function requireManaged(id: string): WorkflowDef {
  const def = getWorkflowDef(id);
  if (!def) {
    throw new AppError("Unknown or unmanaged workflow", { statusCode: 404 });
  }
  return def;
}

/** Map an error to a JSON response with the right status. */
export function errorResponse(err: unknown, correlationId: string): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.message, correlationId: err.correlationId ?? correlationId },
      { status: err.statusCode },
    );
  }
  return NextResponse.json({ error: "Internal server error", correlationId }, { status: 500 });
}
