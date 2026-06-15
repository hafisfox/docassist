/**
 * POST /api/automations/:id/run — trigger a manual run of a managed workflow.
 *
 * n8n's public REST API can't manually run a schedule-triggered workflow, so
 * each runnable v2 workflow exposes a dedicated "run now" Webhook trigger whose
 * path lives in the registry. We POST to that production webhook. Workflows that
 * are purely event-triggered (runWebhookPath = null) reject with 422.
 */
import { NextResponse } from "next/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { requireUser, requireManaged, errorResponse } from "@/lib/n8n/guard";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext): Promise<NextResponse> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);
  try {
    await requireUser();
    const { id } = await context.params;
    const def = requireManaged(id);

    if (!def.runWebhookPath) {
      throw new AppError("This workflow has no manual run trigger", { statusCode: 422 });
    }

    const baseUrl = process.env.N8N_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) throw new AppError("N8N_BASE_URL not configured", { statusCode: 500 });

    const url = `${baseUrl}/webhook/${def.runWebhookPath}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-n8n-auth": process.env.N8N_WEBHOOK_SECRET ?? "",
        },
        body: JSON.stringify({ source: "dashboard", triggeredAt: new Date().toISOString() }),
      });
    } catch (cause) {
      throw new AppError("Failed to reach n8n run webhook", { statusCode: 502, correlationId, cause });
    }

    if (!res.ok) {
      // 404 here usually means the workflow is inactive (production webhook not registered)
      const hint =
        res.status === 404
          ? "Run webhook not registered — is the workflow active?"
          : `n8n run webhook returned ${res.status}`;
      throw new AppError(hint, { statusCode: 502, correlationId, context: { status: res.status } });
    }

    log.info({ workflowId: id, name: def.name }, "workflow run triggered");
    return NextResponse.json({ id, triggered: true, correlationId });
  } catch (err) {
    log.error({ error: err }, "run workflow failed");
    return errorResponse(err, correlationId);
  }
}
