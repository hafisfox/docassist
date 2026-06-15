/**
 * Thin typed client over the n8n public REST API.
 *
 * The dashboard uses this to control and observe the v2 LinkedIn workflows:
 * list/activate/deactivate workflows, read executions, and patch workflow JSON
 * (for the curated parameter editor).
 *
 * Auth: a standard n8n public API key sent as `X-N8N-API-KEY`. This is NOT the
 * MCP JWT in `.mcp.json` (that only authenticates the MCP endpoint). Create a
 * key at n8n → Settings → API and put it in `N8N_API_KEY`.
 */

import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ── Types (subset of the n8n REST schema we actually use) ─────────────────────

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: { id: string; name: string }[];
}

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  [key: string]: unknown;
}

export interface N8nWorkflow extends N8nWorkflowSummary {
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown> | null;
}

export type N8nExecutionStatus =
  | "canceled"
  | "crashed"
  | "error"
  | "new"
  | "running"
  | "success"
  | "unknown"
  | "waiting";

export interface N8nExecution {
  id: string;
  workflowId: string;
  status: N8nExecutionStatus;
  mode: string;
  startedAt: string | null;
  stoppedAt: string | null;
  finished: boolean;
}

interface N8nListResponse<T> {
  data: T[];
  nextCursor?: string | null;
}

// ── Client ────────────────────────────────────────────────────────────────────

function getConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.N8N_BASE_URL;
  const apiKey = process.env.N8N_API_KEY;
  if (!baseUrl) {
    throw new AppError("N8N_BASE_URL env var is not configured", { statusCode: 500 });
  }
  if (!apiKey) {
    throw new AppError("N8N_API_KEY env var is not configured", { statusCode: 500 });
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function n8nFetch<T>(
  path: string,
  init: RequestInit & { correlationId?: string } = {},
): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const correlationId = init.correlationId ?? createCorrelationId();
  const log = withCorrelationId(correlationId);
  const url = `${baseUrl}/api/v1${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "X-N8N-API-KEY": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
        ...init.headers,
      },
    });
  } catch (cause) {
    log.error({ url, error: cause }, "n8n request failed (network)");
    throw new AppError("Failed to reach n8n", { statusCode: 502, correlationId, cause });
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    log.error({ url, status: res.status, body }, "n8n request returned error");
    const message =
      (body as { message?: string } | null)?.message ??
      `n8n API error (${res.status})`;
    throw new AppError(message, {
      statusCode: res.status === 404 ? 404 : 502,
      correlationId,
      context: { url, status: res.status },
    });
  }

  return body as T;
}

export interface N8nClient {
  listWorkflows(opts?: { correlationId?: string }): Promise<N8nWorkflowSummary[]>;
  getWorkflow(id: string, opts?: { correlationId?: string }): Promise<N8nWorkflow>;
  activateWorkflow(id: string, opts?: { correlationId?: string }): Promise<N8nWorkflowSummary>;
  deactivateWorkflow(id: string, opts?: { correlationId?: string }): Promise<N8nWorkflowSummary>;
  getExecutions(args: {
    workflowId?: string;
    limit?: number;
    status?: N8nExecutionStatus;
    correlationId?: string;
  }): Promise<N8nExecution[]>;
  updateWorkflow(
    id: string,
    workflow: N8nWorkflow,
    opts?: { correlationId?: string },
  ): Promise<N8nWorkflow>;
}

export function getN8nClient(): N8nClient {
  return {
    async listWorkflows(opts = {}) {
      const res = await n8nFetch<N8nListResponse<N8nWorkflowSummary>>(
        "/workflows?limit=200",
        { method: "GET", correlationId: opts.correlationId },
      );
      return res.data;
    },

    async getWorkflow(id, opts = {}) {
      return n8nFetch<N8nWorkflow>(`/workflows/${encodeURIComponent(id)}`, {
        method: "GET",
        correlationId: opts.correlationId,
      });
    },

    async activateWorkflow(id, opts = {}) {
      return n8nFetch<N8nWorkflowSummary>(
        `/workflows/${encodeURIComponent(id)}/activate`,
        { method: "POST", correlationId: opts.correlationId },
      );
    },

    async deactivateWorkflow(id, opts = {}) {
      return n8nFetch<N8nWorkflowSummary>(
        `/workflows/${encodeURIComponent(id)}/deactivate`,
        { method: "POST", correlationId: opts.correlationId },
      );
    },

    async getExecutions({ workflowId, limit = 20, status, correlationId }) {
      const params = new URLSearchParams();
      if (workflowId) params.set("workflowId", workflowId);
      if (status) params.set("status", status);
      params.set("limit", String(limit));
      const res = await n8nFetch<N8nListResponse<N8nExecution>>(
        `/executions?${params.toString()}`,
        { method: "GET", correlationId },
      );
      return res.data;
    },

    async updateWorkflow(id, workflow, opts = {}) {
      // n8n's PUT /workflows/{id} rejects read-only fields (id, active,
      // createdAt, updatedAt, tags). Send only the mutable shape.
      const payload = {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings ?? {},
        staticData: workflow.staticData ?? null,
      };
      return n8nFetch<N8nWorkflow>(`/workflows/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
        correlationId: opts.correlationId,
      });
    },
  };
}
