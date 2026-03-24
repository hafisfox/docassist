import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { getCircuitBreaker } from "@/lib/queue/circuitBreaker";

/**
 * GET /api/circuit-breaker/status
 * Returns the current circuit breaker state and metrics.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getCircuitBreaker().getStatus());
}

/**
 * POST /api/circuit-breaker/status
 * Body: { action: "reset" }
 * Manually resets the circuit breaker to CLOSED state.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "reset") {
    return NextResponse.json(
      { error: "Unknown action. Supported: reset" },
      { status: 400 }
    );
  }

  getCircuitBreaker().reset();
  log.info({ userId: user.id }, "circuit breaker manually reset by user");

  return NextResponse.json(getCircuitBreaker().getStatus());
}
