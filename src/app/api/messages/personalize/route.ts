import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { personalizeMessage } from "@/lib/ai/personalize"
import { createCorrelationId, withCorrelationId } from "@/lib/logger"
import { AppError } from "@/lib/errors"
import type { Lead, Template } from "@/types/database"

const personalizeSchema = z
  .object({
    /** UUID of a saved template — its body and category are fetched from the DB */
    templateId: z.string().uuid().optional(),
    /** Raw template / draft text — required when templateId is not provided */
    template: z.string().min(1).max(2000).optional(),
    /** Category used when template text is provided directly */
    category: z.enum(["connection_request", "message", "follow_up"]).optional(),
    /** Personalise for a specific lead (full personalisation mode) */
    leadId: z.string().uuid().optional(),
    /** Resolve lead by their Unipile chat ID (inbox context) */
    chatId: z.string().min(1).optional(),
  })
  .refine((d) => d.templateId || d.template, {
    message: "Either templateId or template text is required",
  })

export async function POST(request: Request) {
  const correlationId = createCorrelationId()
  const log = withCorrelationId(correlationId)

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = personalizeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
          correlationId,
        },
        { status: 400 },
      )
    }

    const { templateId, leadId, chatId } = parsed.data
    let templateBody = parsed.data.template
    let templateCategory: "connection_request" | "message" | "follow_up" =
      parsed.data.category ?? "message"

    // ── Fetch template from DB when templateId is provided ─────────────────
    if (templateId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2 generic resolution
      const { data: tpl, error: tplError } = await (supabase as any)
        .from("templates")
        .select("body, category")
        .eq("id", templateId)
        .eq("user_id", user.id)
        .single()

      const template = tpl as Pick<Template, "body" | "category"> | null

      if (tplError || !template) {
        return NextResponse.json({ error: "Template not found", correlationId }, { status: 404 })
      }

      templateBody = template.body
      templateCategory = template.category as typeof templateCategory
    }

    if (!templateBody) {
      return NextResponse.json(
        { error: "Template body is required", correlationId },
        { status: 400 },
      )
    }

    // ── Resolve lead ───────────────────────────────────────────────────────
    let lead: Lead | null = null

    if (leadId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: leadError } = await (supabase as any)
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .eq("user_id", user.id)
        .single()

      lead = data as Lead | null

      if (leadError || !lead) {
        return NextResponse.json({ error: "Lead not found", correlationId }, { status: 404 })
      }
    } else if (chatId) {
      // Resolve lead by unipile_chat_id (inbox context — non-fatal if not found)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: leadError } = await (supabase as any)
        .from("leads")
        .select("*")
        .eq("unipile_chat_id", chatId)
        .eq("user_id", user.id)
        .maybeSingle()

      lead = data as Lead | null

      if (leadError) {
        log.warn({ chatId, error: leadError }, "could not resolve lead for chatId — proceeding without lead context")
      }
    }

    log.info(
      { leadId: lead?.id, hasLead: lead !== null, category: templateCategory },
      "personalize message request",
    )

    const text = await personalizeMessage({
      template: templateBody,
      category: templateCategory,
      lead: lead ?? undefined,
    })

    log.info({ charCount: text.length }, "personalization complete")

    return NextResponse.json({ text, correlationId })
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "personalize error")
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      )
    }

    log.error({ error: err }, "unexpected error in POST /api/messages/personalize")
    return NextResponse.json({ error: "Internal server error", correlationId }, { status: 500 })
  }
}
