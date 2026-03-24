import Anthropic from "@anthropic-ai/sdk"
import { PERSONALIZATION_SYSTEM_PROMPT } from "./prompts"
import type { Lead, IcpSegment } from "@/types/database"

const client = new Anthropic()

const CHAR_LIMITS: Record<"connection_request" | "message" | "follow_up", number> = {
  connection_request: 300,
  message: 500,
  follow_up: 400,
}

const SEGMENT_LABELS: Record<IcpSegment, string> = {
  high_volume_chemo: "High-Volume Chemo Clinic (40–80 patients/day)",
  precision_oncology: "Precision Oncology Centre",
  insurance_heavy_urban: "Insurance-Heavy Urban Practice",
}

export interface PersonalizeOptions {
  /** The template body or current draft to work on */
  template: string
  /** Message category — determines character limit and message type context */
  category: "connection_request" | "message" | "follow_up"
  /**
   * Lead to personalise for.
   * If omitted the template is optimised without replacing variables
   * (useful for the template editor where no specific lead is in context).
   */
  lead?: Lead
}

/**
 * Calls the Claude API (claude-sonnet-4-20250514) to personalise or optimise a message.
 *
 * - With `lead`: replaces `{{variables}}` with real lead data and tailors copy to their profile.
 * - Without `lead`: rewrites the template to follow DoctorAssist style guidelines while
 *   keeping all `{{variable}}` placeholders intact.
 *
 * @returns The personalised / optimised message string (trimmed, no preamble or quotes).
 */
export async function personalizeMessage({
  template,
  category,
  lead,
}: PersonalizeOptions): Promise<string> {
  const charLimit = CHAR_LIMITS[category]

  let userPrompt: string

  if (lead) {
    const profileLines = [
      `Name: ${lead.full_name}`,
      lead.job_title ? `Title: ${lead.job_title}` : null,
      lead.company ? `Institution: ${lead.company}` : null,
      lead.city ? `City: ${lead.city}` : null,
      lead.specialty ? `Specialty: ${lead.specialty}` : null,
      lead.headline ? `LinkedIn headline: ${lead.headline}` : null,
      lead.icp_segment ? `Segment: ${SEGMENT_LABELS[lead.icp_segment]}` : null,
      lead.experience_years != null ? `Experience: ${lead.experience_years} years` : null,
    ]
      .filter(Boolean)
      .join("\n")

    const messageType =
      category === "connection_request"
        ? "LinkedIn connection request note"
        : "LinkedIn direct message"

    userPrompt = `Personalise this ${messageType} for the following lead.

Template:
${template}

Lead profile:
${profileLines}

Rules:
- Strictly under ${charLimit} characters (count carefully before outputting)
- Replace every {{variable}} placeholder with the appropriate value from the lead profile
- If a variable has no corresponding data, rephrase the sentence naturally to omit it
- Output the final message text only`
  } else {
    const messageType =
      category === "connection_request" ? "connection request template" : "message template"

    userPrompt = `Improve this ${messageType} for DoctorAssist.AI oncologist outreach.

Current template:
${template}

Rules:
- Strictly under ${charLimit} characters (count carefully before outputting)
- Preserve all {{variable}} placeholders exactly as written — do not replace them
- Output the improved template text only`
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: PERSONALIZATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  })

  const block = response.content[0]
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude API")
  }

  return block.text.trim()
}
