import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getUnipileClient } from "@/lib/unipile/client";
import { listChatsQuerySchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const logCtx = log.child({ userId: user.id });

    // ── Validate query params ────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const parsed = listChatsQuerySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
    });

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

    const { cursor } = parsed.data;
    logCtx.info({ cursor }, "listing linkedin chats");

    // ── Resolve the caller's Unipile account ─────────────────────────────────
    // See sync-inbox: undefined falls back to the env account, which is "" when
    // unset, so an account configured only in Settings would be ignored.
    const { data: settings } = await supabase
      .from("settings")
      .select("unipile_account_id")
      .eq("user_id", user.id)
      .single();

    const accountId = settings?.unipile_account_id;
    if (!accountId) {
      return NextResponse.json(
        {
          error: "Unipile account not configured. Please add your Account ID in Settings.",
          correlationId,
        },
        { status: 422 },
      );
    }

    // ── Fetch chats via Unipile ──────────────────────────────────────────────
    const client = getUnipileClient();
    const chatsResponse = await client.getChats(accountId, cursor, correlationId);

    logCtx.info(
      { count: chatsResponse.items.length, hasMore: !!chatsResponse.cursor },
      "chats fetched",
    );

    return NextResponse.json({
      ...chatsResponse,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "app error in GET /api/linkedin/chats");
      return NextResponse.json(
        {
          error: err.message,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/linkedin/chats");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
