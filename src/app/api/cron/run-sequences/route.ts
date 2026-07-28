/**
 * GET|POST /api/cron/run-sequences
 *
 * Cron entry point for the sequence execution engine. Without this route
 * nothing ever calls runSequenceExecutor, so enrollments sit in the queue
 * forever. Trigger it from Vercel Cron (vercel.json), pg_cron + pg_net, or
 * any external scheduler.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` — Vercel Cron sends this
 * automatically when the CRON_SECRET env var is set on the project.
 *
 * Uses the service-role Supabase client because the executor processes
 * enrollments across all users (no session in a cron context).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { runSequenceExecutor } from "@/lib/queue/sequenceExecutor";
import { autoPauseLowAcceptanceCampaigns } from "@/lib/queue/accountGuard";
import { n8nOwnsExecution } from "@/lib/automation";
import type { Database } from "@/types/database";

// Executor batches can take minutes (30–120 s human-pacing delays between
// LinkedIn actions), so allow the maximum function duration.
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);

  if (!process.env.CRON_SECRET) {
    log.error("CRON_SECRET env var is not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (!isAuthorized(request)) {
    log.warn({ correlationId }, "unauthorized cron request rejected");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Account guard ───────────────────────────────────────────────────────
    // Runs before the cutover check and regardless of which engine sends:
    // protecting the LinkedIn account from a collapsing acceptance rate matters
    // just as much when n8n owns execution. Previously this lived in
    // GET /api/health, where a browser poll drove it.
    const campaignsAutoPaused = await autoPauseLowAcceptanceCampaigns(
      supabase,
      correlationId,
    );

    // ── Cutover guard ───────────────────────────────────────────────────────
    // When n8n owns execution the local sequence executor must not run, or both
    // engines would send to the same leads. Return a logged no-op.
    if (n8nOwnsExecution()) {
      log.info({ correlationId }, "sequence executor skipped — AUTOMATION_ENGINE=n8n");
      return NextResponse.json(
        { skipped: true, engine: "n8n", campaignsAutoPaused, correlationId },
        { status: 200 },
      );
    }

    const result = await runSequenceExecutor(supabase);

    log.info(
      { ...result, campaignsAutoPaused, correlationId },
      "cron sequence executor run completed",
    );
    return NextResponse.json(
      { ...result, campaignsAutoPaused, correlationId },
      { status: 200 },
    );
  } catch (err) {
    log.error({ error: err, correlationId }, "cron sequence executor run failed");
    return NextResponse.json(
      { error: "Sequence executor failed", correlationId },
      { status: 500 }
    );
  }
}

// pg_cron / external schedulers often POST — same behavior either way
export const POST = GET;
