/**
 * Persist an inbox "interested" / "not interested" decision onto the underlying
 * lead.
 *
 * The inbox renders chats sourced directly from Unipile, which carry no lead id,
 * so we resolve the lead here by `unipile_chat_id` (preferred) and fall back to
 * the attendee's `linkedin_provider_id`. The authenticated server client scopes
 * the lookup/update to the caller's own leads via RLS.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Lead } from "@/types/database";

const bodySchema = z.object({
  chat_id: z.string().min(1, "chat_id is required"),
  provider_id: z.string().min(1).optional(),
  status: z.enum(["interested", "not_interested"]),
});

export async function POST(request: Request) {
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

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
          correlationId,
        },
        { status: 400 },
      );
    }

    const { chat_id, provider_id, status } = parsed.data;

    // ── Resolve the lead: chat_id first, then provider_id fallback ──────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2 generic resolution
    let { data: lead } = await (supabase as any)
      .from("leads")
      .select("*")
      .eq("unipile_chat_id", chat_id)
      .maybeSingle();

    if (!lead && provider_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("leads")
        .select("*")
        .eq("linkedin_provider_id", provider_id)
        .maybeSingle();
      lead = data;
    }

    const typedLead = lead as Lead | null;

    if (!typedLead) {
      log.warn({ chatId: chat_id, providerId: provider_id }, "no lead found for inbox status update");
      return NextResponse.json(
        { error: "No tracked lead is linked to this conversation", correlationId },
        { status: 404 },
      );
    }

    log.info({ leadId: typedLead.id, status }, "inbox lead-status update");

    // ── Update lead status (and backfill chat id if missing) ───────────────
    const updateFields: Record<string, unknown> = { status };
    if (!typedLead.unipile_chat_id) updateFields.unipile_chat_id = chat_id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("leads")
      .update(updateFields)
      .eq("id", typedLead.id);

    if (updateError) {
      log.error({ error: updateError }, "failed to update lead status from inbox");
      throw new AppError("Failed to update lead status", {
        statusCode: 500,
        correlationId,
        context: { code: updateError.code },
      });
    }

    // ── Log activity ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("activities").insert({
      user_id: user.id,
      lead_id: typedLead.id,
      campaign_id: typedLead.campaign_id ?? null,
      activity_type: "status_changed",
      description: `Marked ${status === "interested" ? "interested" : "not interested"} from inbox`,
      metadata: { new_status: status, chat_id, correlation_id: correlationId },
    });

    return NextResponse.json({ leadId: typedLead.id, status, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "inbox lead-status error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }
    log.error({ error: err }, "unexpected error in POST /api/inbox/lead-status");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
