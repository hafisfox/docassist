import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { getUnipileClient } from "@/lib/unipile/client";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const profileQuerySchema = z.object({
  identifier: z.string().min(1, "LinkedIn identifier is required"),
});

export async function GET(request: NextRequest) {
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

    // ── Validate query params ────────────────────────────────────────
    const identifier = request.nextUrl.searchParams.get("identifier");
    const parsed = profileQuerySchema.safeParse({ identifier });

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
      { userId: user.id, identifier: parsed.data.identifier },
      "linkedin profile request",
    );

    // ── Call Unipile ─────────────────────────────────────────────────
    const client = getUnipileClient();
    const profile = await client.getProfile(
      parsed.data.identifier,
      undefined,
      correlationId,
    );

    log.info(
      { providerId: profile.provider_id },
      "linkedin profile fetched",
    );

    return NextResponse.json({
      ...profile,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error(
        { error: err.toJSON() },
        "linkedin profile error",
      );
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/linkedin/profile");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
