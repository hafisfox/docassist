import type { SequenceStepType } from "@/types/database";

// ── Timing constants ──────────────────────────────────────────────────────────

/** How many days to wait for an invite to be accepted before giving up */
export const WAIT_FOR_ACCEPTANCE_TIMEOUT_DAYS = 30;

/** How often (hours) to re-check whether an invite was accepted */
export const WAIT_FOR_ACCEPTANCE_CHECK_INTERVAL_HOURS = 24;

// ── Default sequence template ─────────────────────────────────────────────────

export const DEFAULT_SEQUENCE_NAME = "Standard Outreach";

export const DEFAULT_SEQUENCE_DESCRIPTION =
  "7-step outreach sequence. Sends a personalised connection request, waits " +
  "for acceptance, then delivers a warm intro message followed by a 3-day " +
  "delayed follow-up with a condition branch.";

// Template variables available for personalisation are defined in
// src/constants/templateVariables.ts — that module is the single source of
// truth for which {{placeholders}} the send path actually substitutes.

export type DefaultSequenceStep = {
  step_order: number;
  step_type: SequenceStepType;
  /** Inline message body — null when step uses a template_id or has no message */
  message_body: string | null;
  delay_hours: number | null;
  delay_days: number | null;
  condition_field: string | null;
  condition_value: string | null;
  /** step_order to jump to when condition is true (null = end sequence) */
  on_true_step: number | null;
  /** step_order to jump to when condition is false (null = advance linearly) */
  on_false_step: number | null;
};

/**
 * 7-step default outreach sequence.
 *
 * Flow:
 *  1  connection_request  — personalised invite (≤ 300 chars after substitution)
 *  2  wait_for_acceptance — polls until lead.status = 'invite_accepted'
 *  3  delay               — 24 h grace period before first message
 *  4  message             — warm intro + value proposition
 *  5  delay               — 3-day wait before follow-up
 *  6  condition           — if lead.status = 'replied' → null (human takes over)
 *                           else → step 7
 *  7  message             — follow-up nudge
 */
export const DEFAULT_SEQUENCE_STEPS: DefaultSequenceStep[] = [
  {
    step_order: 1,
    step_type: "connection_request",
    // Must stay ≤ 300 chars after variable substitution.
    // Worst-case expansion: ~30 extra chars for name + company, so keep template ≤ 270.
    message_body:
      "Hi {{first_name}}, I came across your work at {{company}} and thought it'd be " +
      "worth connecting — we work with teams tackling similar problems. " +
      "Would be glad to swap notes.",
    delay_hours: null,
    delay_days: null,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  },
  {
    step_order: 2,
    step_type: "wait_for_acceptance",
    message_body: null,
    delay_hours: null,
    delay_days: null,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  },
  {
    step_order: 3,
    step_type: "delay",
    message_body: null,
    delay_hours: 24,
    delay_days: null,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  },
  {
    step_order: 4,
    step_type: "message",
    message_body:
      "Thanks for connecting, {{first_name}}!\n\n" +
      "Quick bit of context on why I reached out — teams in a {{job_title}} seat usually " +
      "tell us the same few things are eating their week, and that's the problem we work on.\n\n" +
      "Worth a 15-minute call to see whether it maps to how {{company}} runs things?",
    delay_hours: null,
    delay_days: null,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  },
  {
    step_order: 5,
    step_type: "delay",
    message_body: null,
    delay_hours: null,
    delay_days: 3,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  },
  {
    // If lead has already replied, let a human handle it — don't send automated follow-up.
    // If no reply yet, go to step 7 for a follow-up nudge.
    step_order: 6,
    step_type: "condition",
    message_body: null,
    delay_hours: null,
    delay_days: null,
    condition_field: "status",
    condition_value: "replied",
    on_true_step: null, // replied → sequence complete (human takes over)
    on_false_step: 7,  // no reply → send follow-up
  },
  {
    step_order: 7,
    step_type: "message",
    message_body:
      "Hi {{first_name}}, just following up on my note.\n\n" +
      "Happy to put together a short walkthrough tailored to {{company}} if it's useful — " +
      "and equally happy to leave it if the timing's wrong.\n\n" +
      "Would Thursday or Friday work for 15 minutes?",
    delay_hours: null,
    delay_days: null,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  },
];
