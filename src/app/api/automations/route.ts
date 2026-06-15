/**
 * GET /api/automations
 *
 * Lists the four managed v2 LinkedIn workflows merged with their live n8n state
 * (active flag) and most recent execution. This is the dashboard's control +
 * observability surface over n8n.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getAutomationEngine } from "@/lib/automation";
import { getN8nClient, type N8nExecution } from "@/lib/n8n/client";
import { V2_WORKFLOWS } from "@/lib/n8n/workflows";

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

    const client = getN8nClient();
    const live = await client.listWorkflows({ correlationId });
    const liveById = new Map(live.map((w) => [w.id, w]));

    const automations = await Promise.all(
      V2_WORKFLOWS.map(async (def) => {
        const liveWf = liveById.get(def.id);
        let lastExecution: N8nExecution | null = null;
        try {
          const execs = await client.getExecutions({
            workflowId: def.id,
            limit: 1,
            correlationId,
          });
          lastExecution = execs[0] ?? null;
        } catch (err) {
          log.warn({ workflowId: def.id, error: err }, "failed to fetch last execution");
        }

        return {
          id: def.id,
          role: def.role,
          name: def.name,
          description: def.description,
          active: liveWf?.active ?? false,
          exists: Boolean(liveWf),
          runnable: def.runWebhookPath != null,
          updatedAt: liveWf?.updatedAt ?? null,
          editableParams: def.editableParams.map((p) => ({
            key: p.key,
            label: p.label,
            description: p.description,
            kind: p.kind,
            min: p.min ?? null,
            max: p.max ?? null,
          })),
          lastExecution: lastExecution
            ? {
                id: lastExecution.id,
                status: lastExecution.status,
                startedAt: lastExecution.startedAt,
                stoppedAt: lastExecution.stoppedAt,
              }
            : null,
        };
      }),
    );

    return NextResponse.json({
      engine: getAutomationEngine(),
      automations,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "list automations error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }
    log.error({ error: err }, "unexpected error in GET /api/automations");
    return NextResponse.json({ error: "Internal server error", correlationId }, { status: 500 });
  }
}
