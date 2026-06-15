/**
 * GET /api/automations/:id/executions — recent n8n executions for one workflow.
 * Query: ?limit=20
 */
import { NextRequest, NextResponse } from "next/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { getN8nClient } from "@/lib/n8n/client";
import { requireUser, requireManaged, errorResponse } from "@/lib/n8n/guard";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);
  try {
    await requireUser();
    const { id } = await context.params;
    requireManaged(id);

    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;

    const executions = await getN8nClient().getExecutions({
      workflowId: id,
      limit,
      correlationId,
    });

    return NextResponse.json({
      executions: executions.map((e) => ({
        id: e.id,
        status: e.status,
        mode: e.mode,
        startedAt: e.startedAt,
        stoppedAt: e.stoppedAt,
        finished: e.finished,
      })),
      correlationId,
    });
  } catch (err) {
    log.error({ error: err }, "list executions failed");
    return errorResponse(err, correlationId);
  }
}
