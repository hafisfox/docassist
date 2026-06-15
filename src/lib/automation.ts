/**
 * Which engine is authoritative for LinkedIn outreach execution.
 *
 * When set to "n8n" the dashboard's local sequence executor
 * (/api/cron/run-sequences) and its Unipile webhook receiver
 * (/api/webhooks/unipile) stand down, so the two engines can never double-send.
 * n8n then drives sends and mirrors state back via /api/webhooks/n8n.
 */
export type AutomationEngine = "n8n" | "dashboard";

export function getAutomationEngine(): AutomationEngine {
  return process.env.AUTOMATION_ENGINE === "dashboard" ? "dashboard" : "n8n";
}

export function n8nOwnsExecution(): boolean {
  return getAutomationEngine() === "n8n";
}
