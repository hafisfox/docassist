import type { SequenceStepType } from "@/types/database";

// ── Timing constants ──────────────────────────────────────────────────────────

/** How many days to wait for an invite to be accepted before giving up */
export const WAIT_FOR_ACCEPTANCE_TIMEOUT_DAYS = 30;

/** How often (hours) to re-check whether an invite was accepted */
export const WAIT_FOR_ACCEPTANCE_CHECK_INTERVAL_HOURS = 24;

// ── Default sequence template ─────────────────────────────────────────────────

export const DEFAULT_ONCOLOGIST_SEQUENCE_NAME =
  "DoctorAssist Standard Oncologist Outreach";

export const DEFAULT_ONCOLOGIST_SEQUENCE_DESCRIPTION =
  "7-step outreach sequence for medical oncologists. Sends a personalised " +
  "connection request, waits for acceptance, then delivers a warm intro " +
  "message followed by a 3-day delayed follow-up with a condition branch.";

// Template variables available for personalisation:
//   {{first_name}}, {{last_name}}, {{full_name}},
//   {{company}}, {{job_title}}, {{specialty}}, {{location}}

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
 * 7-step default outreach sequence for oncologists.
 *
 * Flow:
 *  1  connection_request  — personalised invite (≤ 300 chars after substitution)
 *  2  wait_for_acceptance — polls until lead.status = 'invite_accepted'
 *  3  delay               — 24 h grace period before first message
 *  4  message             — warm intro + value proposition
 *  5  delay               — 3-day wait before follow-up
 *  6  condition           — if lead.status = 'replied' → null (SDR takes over)
 *                           else → step 7
 *  7  message             — follow-up nudge
 */
export const DEFAULT_ONCOLOGIST_SEQUENCE_STEPS: DefaultSequenceStep[] = [
  {
    step_order: 1,
    step_type: "connection_request",
    // Must stay ≤ 300 chars after variable substitution.
    // Worst-case expansion: ~30 extra chars for name + company, so keep template ≤ 270.
    message_body:
      "Hi {{first_name}}, I work with DoctorAssist.AI — an AI tool that cuts oncologist " +
      "documentation time by 50% and improves diagnostic accuracy. Your work at {{company}} " +
      "caught my attention. Would love to connect!",
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
      "I know oncologists handle 40–80 patients a day with complex protocols — the documentation " +
      "pressure is real. DoctorAssist.AI addresses this directly:\n\n" +
      "• 50% reduction in documentation time\n" +
      "• ~95% accurate clinical transcription with auto-generated SOAP/H&P notes\n" +
      "• Real-time evidence-based guidance linked to the latest treatment guidelines\n" +
      "• Integrates with your existing HMS/EHR at {{company}}\n\n" +
      "Would you be open to a 15-minute call to see how it fits your workflow?",
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
    // If lead has already replied, let the SDR handle — don't send automated follow-up.
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
      "Hi {{first_name}}, just a quick follow-up on DoctorAssist.AI.\n\n" +
      "Oncology teams report up to 35% improvement in diagnostic accuracy and significant " +
      "time savings on documentation — especially during busy clinic days.\n\n" +
      "Happy to share a short demo tailored to {{company}}. " +
      "Would Thursday or Friday work for a 15-minute call?",
    delay_hours: null,
    delay_days: null,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  },
];
