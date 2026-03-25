import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getUnipileClient } from "@/lib/unipile/client";
import { getChatMessagesQuerySchema } from "@/lib/validators";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
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

    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json({ error: "chatId is required", correlationId }, { status: 400 });
    }

    const logCtx = log.child({ userId: user.id, chatId });

    // ── Validate query params ────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const parsed = getChatMessagesQuerySchema.safeParse({
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
    logCtx.info({ cursor }, "fetching messages for chat");

    // ── Fetch messages via Unipile ───────────────────────────────────────────
    const client = getUnipileClient();
    const messagesResponse = await client.getChatMessages(chatId, cursor, correlationId);

    logCtx.info(
      { count: messagesResponse.items.length, hasMore: !!messagesResponse.cursor },
      "chat messages fetched",
    );

    return NextResponse.json({
      ...messagesResponse,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "app error in GET /api/linkedin/chats/[chatId]/messages");
      return NextResponse.json(
        {
          error: err.message,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in GET /api/linkedin/chats/[chatId]/messages");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
