/**
 * Read/write the allow-listed editable parameters of a v2 workflow.
 *
 * The editable constants live as `const NAME = <value>;` lines inside the
 * jsCode of specific n8n Code nodes (e.g. `guards`, `segmentConfig`, `pickDue`).
 * We locate the node by name and patch only that single constant — never the
 * surrounding logic — so the dashboard form is a thin, safe editor over n8n,
 * which remains the source of truth.
 */

import { AppError } from "@/lib/errors";
import type { N8nWorkflow, N8nNode } from "@/lib/n8n/client";
import type { EditableParam, WorkflowDef } from "@/lib/n8n/workflows";

export type ParamValue = number | string;

function findNode(workflow: N8nWorkflow, nodeName: string): N8nNode {
  const node = workflow.nodes.find((n) => n.name === nodeName);
  if (!node) {
    throw new AppError(`Workflow node "${nodeName}" not found`, {
      statusCode: 422,
      context: { nodeName },
    });
  }
  return node;
}

function getJsCode(node: N8nNode): string {
  const code = node.parameters?.jsCode;
  if (typeof code !== "string") {
    throw new AppError(`Node "${node.name}" is not a Code node with jsCode`, {
      statusCode: 422,
      context: { nodeName: node.name },
    });
  }
  return code;
}

function numberRegex(constName: string): RegExp {
  return new RegExp(`(const\\s+${constName}\\s*=\\s*)(-?[0-9]+(?:\\.[0-9]+)?)(\\s*;)`);
}

function stringRegex(constName: string): RegExp {
  // Captures the opening quote + content + closing quote.
  return new RegExp(`(const\\s+${constName}\\s*=\\s*)(['"])((?:\\\\.|(?!\\2).)*)(\\2)(\\s*;)`);
}

/** Read one editable param's current value from the workflow JSON, or null. */
export function readParam(
  workflow: N8nWorkflow,
  param: EditableParam,
): ParamValue | null {
  const node = workflow.nodes.find((n) => n.name === param.node);
  if (!node || typeof node.parameters?.jsCode !== "string") return null;
  const code = node.parameters.jsCode as string;

  if (param.kind === "jsNumber") {
    const m = code.match(numberRegex(param.constName));
    return m ? Number(m[2]) : null;
  }
  const m = code.match(stringRegex(param.constName));
  return m ? m[3].replace(/\\(['"\\])/g, "$1") : null;
}

/** Read all editable params declared for a workflow. */
export function readAllParams(
  workflow: N8nWorkflow,
  def: WorkflowDef,
): Record<string, ParamValue | null> {
  const out: Record<string, ParamValue | null> = {};
  for (const param of def.editableParams) {
    out[param.key] = readParam(workflow, param);
  }
  return out;
}

/**
 * Mutate the workflow JSON in place, setting one param's constant to `value`.
 * Throws if the constant is not present (we never inject new code).
 */
export function setParam(
  workflow: N8nWorkflow,
  param: EditableParam,
  value: ParamValue,
): void {
  const node = findNode(workflow, param.node);
  const code = getJsCode(node);

  if (param.kind === "jsNumber") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new AppError(`"${param.key}" must be a number`, { statusCode: 400 });
    }
    if (param.min != null && value < param.min) {
      throw new AppError(`"${param.key}" must be ≥ ${param.min}`, { statusCode: 400 });
    }
    if (param.max != null && value > param.max) {
      throw new AppError(`"${param.key}" must be ≤ ${param.max}`, { statusCode: 400 });
    }
    const re = numberRegex(param.constName);
    if (!re.test(code)) {
      throw new AppError(
        `Constant "${param.constName}" not found in node "${param.node}"`,
        { statusCode: 422 },
      );
    }
    node.parameters.jsCode = code.replace(re, `$1${value}$3`);
    return;
  }

  // jsString
  if (typeof value !== "string") {
    throw new AppError(`"${param.key}" must be a string`, { statusCode: 400 });
  }
  const re = stringRegex(param.constName);
  if (!re.test(code)) {
    throw new AppError(
      `Constant "${param.constName}" not found in node "${param.node}"`,
      { statusCode: 422 },
    );
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  node.parameters.jsCode = code.replace(re, `$1"${escaped}"$5`);
}
