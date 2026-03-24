import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { getUnipileClient } from "@/lib/unipile/client";
import { AppError } from "@/lib/errors";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Allow overriding account ID from request body (for testing unsaved values)
    let accountId: string | null = null;
    try {
      const body = await request.json();
      accountId = body?.account_id ?? null;
    } catch {
      // no body is fine — fall through to settings lookup
    }

    if (!accountId) {
      const { data: settings } = await supabase
        .from("settings")
        .select("unipile_account_id")
        .eq("user_id", user.id)
        .single();
      accountId = settings?.unipile_account_id ?? null;
    }

    if (!accountId) {
      return NextResponse.json(
        { error: "No Account ID provided. Enter one above and try again.", correlationId },
        { status: 422 },
      );
    }

    log.info({ userId: user.id }, "testing unipile connection");

    const client = getUnipileClient();
    await client.testConnection(accountId, correlationId);

    // Persist connected status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("settings")
      .update({ unipile_account_status: "connected" })
      .eq("user_id", user.id);

    log.info({ userId: user.id }, "unipile connection test passed");

    return NextResponse.json({ connected: true, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      // Persist failed status
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("settings")
            .update({ unipile_account_status: "error" })
            .eq("user_id", user.id);
        }
      } catch { /* best-effort */ }

      log.error({ error: err.toJSON() }, "unipile connection test failed");
      return NextResponse.json(
        { connected: false, error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/linkedin/test-connection");
    return NextResponse.json(
      { connected: false, error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
