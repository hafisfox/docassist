/**
 * GET   /api/automations/:id/params — read the allow-listed editable params.
 * PATCH /api/automations/:id/params — update one or more params.
 *
 * Updates patch only the named constants inside the workflow's Code nodes and
 * write the workflow back through the n8n API (which remains the source of
 * truth), then read back to confirm the values round-tripped.
 */
import { NextRequest, NextResponse } from "next/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getN8nClient } from "@/lib/n8n/client";
import { requireUser, requireManaged, errorResponse } from "@/lib/n8n/guard";
import { readAllParams, setParam } from "@/lib/n8n/params";
import { updateAutomationParamsSchema } from "@/lib/validators";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);
  try {
    await requireUser();
    const { id } = await context.params;
    const def = requireManaged(id);
    const workflow = await getN8nClient().getWorkflow(id, { correlationId });
    return NextResponse.json({ id, values: readAllParams(workflow, def), correlationId });
  } catch (err) {
    log.error({ error: err }, "get params failed");
    return errorResponse(err, correlationId);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const correlationId = createCorrelationId();
  const log = withCorrelationId(correlationId);
  try {
    await requireUser();
    const { id } = await context.params;
    const def = requireManaged(id);

    const parsed = updateAutomationParamsSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid params", { statusCode: 400 });
    }

    const client = getN8nClient();
    const workflow = await client.getWorkflow(id, { correlationId });

    const applied: string[] = [];
    for (const [key, value] of Object.entries(parsed.data.params)) {
      const param = def.editableParams.find((p) => p.key === key);
      if (!param) {
        throw new AppError(`Unknown parameter "${key}" for this workflow`, { statusCode: 400 });
      }
      setParam(workflow, param, value); // validates type + bounds, throws on mismatch
      applied.push(key);
    }

    const updated = await client.updateWorkflow(id, workflow, { correlationId });
    log.info({ workflowId: id, applied }, "workflow params updated");

    return NextResponse.json({
      id,
      applied,
      values: readAllParams(updated, def),
      correlationId,
    });
  } catch (err) {
    log.error({ error: err }, "update params failed");
    return errorResponse(err, correlationId);
  }
}
