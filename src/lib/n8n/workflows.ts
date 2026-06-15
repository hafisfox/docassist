/**
 * Curated registry of the v2 LinkedIn workflows the dashboard controls.
 *
 * This is the single source of truth that maps our four v2 workflow IDs (live on
 * n8n.srv1183265.hstgr.cloud) to display metadata, their "run now" webhook
 * paths, and the allow-listed parameters the dashboard is permitted to edit.
 * Everything else on the n8n server is intentionally ignored.
 */

export type WorkflowRole = "scraper" | "invitations" | "new_connection" | "dms";

/** How an editable parameter is located + serialized inside the workflow JSON. */
export type ParamKind =
  /** A `const NAME = <number>;` line inside a Code node's jsCode. */
  | "jsNumber"
  /** A `const NAME = "<string>";` line inside a Code node's jsCode. */
  | "jsString";

export interface EditableParam {
  /** Stable key used by the API + form. */
  key: string;
  label: string;
  description: string;
  /** n8n node `name` that contains the constant. */
  node: string;
  /** The `const` identifier inside that node's jsCode. */
  constName: string;
  kind: ParamKind;
  /** Optional numeric bounds (jsNumber only). */
  min?: number;
  max?: number;
}

export interface WorkflowDef {
  id: string;
  role: WorkflowRole;
  name: string;
  description: string;
  /**
   * Production webhook path the dashboard POSTs to for "Run now". null = the
   * workflow has no manual-run entry point (e.g. it is purely event-triggered
   * and running it on demand is not meaningful).
   */
  runWebhookPath: string | null;
  editableParams: EditableParam[];
}

/**
 * v2 workflow IDs — confirmed live (inactive) via the n8n API. The v1 originals
 * (`8kAX7RM6EJI8bpt4`, `a5pgrpiaZUUX5LqN`, `AaJqhqS1MES7DuNB`, `tGhSgg0a4xcPBmKi`)
 * are deliberately excluded; cutover from v1→v2 is manual (see README-cutover.md).
 */
export const V2_WORKFLOWS: WorkflowDef[] = [
  {
    id: "JeIYSMWSlWquMEET",
    role: "scraper",
    name: "1. LinkedIn Scrapper (v2)",
    description:
      "Daily segmented prospector — rotates ICP segment by weekday and writes qualified leads to 1_LEADS.",
    runWebhookPath: "run-wf1-v2",
    editableParams: [
      {
        key: "active_wave",
        label: "Active wave",
        description: "Which geo wave (1–3) the scraper targets.",
        node: "segmentConfig",
        constName: "ACTIVE_WAVE",
        kind: "jsNumber",
        min: 1,
        max: 3,
      },
    ],
  },
  {
    id: "c6UgX57tI7cymMKA",
    role: "invitations",
    name: "2. LinkedIn Invitations (v2)",
    description:
      "Region/segment-aware invitation sender with daily ceiling, acceptance kill-switch and pending-pile guard.",
    runWebhookPath: "run-wf2-v2",
    // The guard thresholds (daily ceiling 20, kill-switch 25%, pending 150) are
    // currently inline literals in the `guards` Code node. They become editable
    // here once that node is refactored to named consts (DAILY_CEILING,
    // ACCEPTANCE_MIN_PCT, PENDING_MAX) — see README-cutover.md.
    editableParams: [],
  },
  {
    id: "Mu9azPqONf6AJuLF",
    role: "new_connection",
    name: "3. LinkedIn New Connection (v2)",
    description:
      "Per-segment nurture sequencer — opens a sequence on accept (no instant DM) and sends due touches hourly.",
    runWebhookPath: "run-wf3-v2",
    editableParams: [
      {
        key: "overview_link",
        label: "Overview link",
        description: "2-page overview URL used in decision-maker touches.",
        node: "pickDue",
        constName: "OVERVIEW_LINK",
        kind: "jsString",
      },
      {
        key: "doctor_trylink",
        label: "Doctor try-link",
        description: "“Try a case” URL (with UTM) used in doctor touches.",
        node: "pickDue",
        constName: "DOCTOR_TRYLINK",
        kind: "jsString",
      },
      {
        key: "calendly_link",
        label: "Calendly (20-min) link",
        description: "20-min walkthrough booking URL.",
        node: "pickDue",
        constName: "CALENDLY_20MIN",
        kind: "jsString",
      },
    ],
  },
  {
    id: "0T4qsQoAhlW7Q1VQ",
    role: "dms",
    name: "4. LinkedIn DMs (v2)",
    description:
      "Segment-briefed DM closer — replies with claude-sonnet-4-6 and fires a founder alert on WARM/HOT.",
    runWebhookPath: null, // purely message.received-triggered
    // The founder-alert recipient lives in the `alertEmail` send node (not a Code
    // node), so it isn't editable through the jsConst editor. Edit it in n8n.
    editableParams: [],
  },
];

const BY_ID = new Map(V2_WORKFLOWS.map((w) => [w.id, w]));

export function getWorkflowDef(id: string): WorkflowDef | undefined {
  return BY_ID.get(id);
}

export function isManagedWorkflow(id: string): boolean {
  return BY_ID.has(id);
}

export const MANAGED_WORKFLOW_IDS = V2_WORKFLOWS.map((w) => w.id);
