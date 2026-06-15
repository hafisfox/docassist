/**
 * POST /api/automations/:id/activate — activate a managed v2 workflow in n8n.
 */
import { NextResponse } from "next/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { getN8nClient } from "@/lib/n8n/client";
import { requireUser, requireManaged, errorResponse } from "@/lib/n8n/guard";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext): Promise<NextResponse> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);
  try {
    await requireUser();
    const { id } = await context.params;
    const def = requireManaged(id);
    const result = await getN8nClient().activateWorkflow(id, { correlationId });
    log.info({ workflowId: id, name: def.name }, "workflow activated");
    return NextResponse.json({ id, active: result.active, correlationId });
  } catch (err) {
    log.error({ error: err }, "activate workflow failed");
    return errorResponse(err, correlationId);
  }
}
