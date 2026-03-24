import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { getCircuitBreaker } from "@/lib/queue/circuitBreaker";
import type { CircuitBreakerStatus } from "@/lib/queue/circuitBreaker";

// Minimum invites before flagging low acceptance rate (avoids false positives on new accounts)
const MIN_INVITES_FOR_ACCEPTANCE_CHECK = 20;
const ACCEPTANCE_RATE_WARNING_THRESHOLD = 20; // percent

// ── Response type ─────────────────────────────────────────────────────────────

export type HealthComponentStatus = "ok" | "error" | "circuit_open";

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    supabase: {
      status: HealthComponentStatus;
      latency_ms: number;
      message?: string;
    };
    unipile: {
      status: HealthComponentStatus;
      message?: string;
    };
    circuit_breaker: CircuitBreakerStatus;
  };
  account_health: {
    /** null if not enough invites to calculate meaningfully */
    acceptance_rate: number | null;
    invites_sent_total: number;
    invites_accepted_total: number;
    /** True when acceptance_rate < 20% and invites_sent >= MIN_INVITES_FOR_ACCEPTANCE_CHECK */
    acceptance_rate_warning: boolean;
    /** Active campaigns auto-paused on this request due to low acceptance rate */
    campaigns_auto_paused: number;
    /** Activity rows with type "error" in the last 7 days */
    recent_error_count: number;
  };
}

// ── Sub-checks ────────────────────────────────────────────────────────────────

async function checkSupabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ status: HealthComponentStatus; latency_ms: number; message?: string }> {
  const start = Date.now();
  try {
    const { error } = await supabase
      .from("settings")
      .select("id", { count: "exact", head: true })
      .limit(1);
    const latency_ms = Date.now() - start;
    if (error) return { status: "error", latency_ms, message: error.message };
    return { status: "ok", latency_ms };
  } catch (err) {
    return {
      status: "error",
      latency_ms: Date.now() - start,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkUnipile(): Promise<{
  status: HealthComponentStatus;
  message?: string;
}> {
  const dsn = process.env.UNIPILE_DSN;
  const apiKey = process.env.UNIPILE_API_KEY;

  if (!dsn || !apiKey) {
    return {
      status: "error",
      message: "UNIPILE_DSN or UNIPILE_API_KEY not configured",
    };
  }

  const cbState = getCircuitBreaker().getStatus().state;
  if (cbState === "OPEN") {
    return {
      status: "circuit_open",
      message: "Circuit breaker OPEN — Unipile calls blocked",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`https://${dsn}/api/v1/accounts?limit=1`, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // 200/401/403 all mean the API endpoint is reachable
    if (res.ok || res.status === 401 || res.status === 403) {
      return { status: "ok" };
    }
    return { status: "error", message: `HTTP ${res.status} from Unipile API` };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error ? err.message : "Network error reaching Unipile API",
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
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

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Run checks in parallel
    const [supabaseCheck, unipileCheck, campaignsResult, errorCountResult] =
      await Promise.all([
        checkSupabase(supabase),
        checkUnipile(),
        supabase
          .from("campaigns")
          .select("id, status, invites_sent, invites_accepted")
          .eq("user_id", user.id)
          .not("status", "eq", "draft"),
        supabase
          .from("activities")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("activity_type", "error")
          .gte("created_at", sevenDaysAgo),
      ]);

    const cbStatus = getCircuitBreaker().getStatus();

    // ── Acceptance rate ───────────────────────────────────────────────────────

    type CampaignRow = {
      id: string;
      status: string;
      invites_sent: number;
      invites_accepted: number;
    };

    const campaigns = (campaignsResult.data ?? []) as CampaignRow[];

    const totalInvitesSent = campaigns.reduce(
      (sum, c) => sum + (c.invites_sent ?? 0),
      0
    );
    const totalInvitesAccepted = campaigns.reduce(
      (sum, c) => sum + (c.invites_accepted ?? 0),
      0
    );

    const acceptanceRate =
      totalInvitesSent >= MIN_INVITES_FOR_ACCEPTANCE_CHECK
        ? Math.round((totalInvitesAccepted / totalInvitesSent) * 100)
        : null;

    const acceptanceRateWarning =
      acceptanceRate !== null &&
      acceptanceRate < ACCEPTANCE_RATE_WARNING_THRESHOLD;

    // ── Auto-pause active campaigns if acceptance rate is dangerously low ─────

    let campaignsAutoPaused = 0;

    if (acceptanceRateWarning) {
      const activeCampaigns = campaigns.filter((c) => c.status === "active");

      if (activeCampaigns.length > 0) {
        const now = new Date().toISOString();
        const campaignIds = activeCampaigns.map((c) => c.id);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: pauseError } = await (supabase as any)
          .from("campaigns")
          .update({ status: "paused", paused_at: now })
          .in("id", campaignIds);

        if (!pauseError) {
          campaignsAutoPaused = activeCampaigns.length;

          // Pause active sequence enrollments for these campaigns
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("sequence_enrollments")
            .update({ status: "paused" })
            .in("campaign_id", campaignIds)
            .eq("status", "active");

          // Log an activity for each auto-paused campaign
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("activities").insert(
            campaignIds.map((id) => ({
              user_id: user.id,
              campaign_id: id,
              activity_type: "campaign_paused",
              description: `Campaign auto-paused: invitation acceptance rate dropped below ${ACCEPTANCE_RATE_WARNING_THRESHOLD}%`,
              metadata: {
                reason: "low_acceptance_rate",
                acceptance_rate: acceptanceRate,
              },
            }))
          );

          log.warn(
            { acceptanceRate, campaignsAutoPaused, userId: user.id },
            "campaigns auto-paused due to low acceptance rate"
          );
        }
      }
    }

    const recentErrorCount = errorCountResult.count ?? 0;

    // ── Overall status ────────────────────────────────────────────────────────

    const isUnhealthy = supabaseCheck.status === "error";
    const isDegraded =
      unipileCheck.status !== "ok" ||
      cbStatus.state !== "CLOSED" ||
      acceptanceRateWarning;

    const overallStatus: HealthResponse["status"] = isUnhealthy
      ? "unhealthy"
      : isDegraded
        ? "degraded"
        : "healthy";

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: {
        supabase: supabaseCheck,
        unipile: unipileCheck,
        circuit_breaker: cbStatus,
      },
      account_health: {
        acceptance_rate: acceptanceRate,
        invites_sent_total: totalInvitesSent,
        invites_accepted_total: totalInvitesAccepted,
        acceptance_rate_warning: acceptanceRateWarning,
        campaigns_auto_paused: campaignsAutoPaused,
        recent_error_count: recentErrorCount,
      },
    };

    log.info(
      { status: overallStatus, userId: user.id, correlationId },
      "health check completed"
    );

    return NextResponse.json(response, {
      status: overallStatus === "unhealthy" ? 503 : 200,
    });
  } catch (err) {
    log.error({ error: err }, "Unexpected error in GET /api/health");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
