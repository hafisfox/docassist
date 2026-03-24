import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkActionSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { ActivityType } from "@/types/database";

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

    // ── Validate input ───────────────────────────────────────────────
    const body = await request.json();
    const parsed = bulkActionSchema.safeParse(body);

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

    const { lead_ids, action, status, campaign_id, tags } = parsed.data;

    log.info(
      { userId: user.id, action, count: lead_ids.length },
      "bulk action request",
    );

    // ── add_tags: fetch-merge-update per lead ────────────────────────
    if (action === "add_tags" && tags) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsData, error: fetchError } = await (supabase as any)
        .from("leads")
        .select("id, tags, campaign_id")
        .in("id", lead_ids)
        .eq("user_id", user.id);

      if (fetchError) {
        log.error({ error: fetchError }, "failed to fetch leads for add_tags");
        throw new AppError("Failed to fetch leads", {
          statusCode: 500,
          correlationId,
          context: { code: fetchError.code },
        });
      }

      const leads = (leadsData ?? []) as Array<{
        id: string;
        tags: string[];
        campaign_id: string | null;
      }>;

      // Update each lead with merged tags (deduplicated)
      await Promise.all(
        leads.map((lead) => {
          const merged = Array.from(
            new Set([...(lead.tags ?? []), ...tags]),
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (supabase as any)
            .from("leads")
            .update({ tags: merged })
            .eq("id", lead.id);
        }),
      );

      // Log activities
      if (leads.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("activities").insert(
          leads.map((lead) => ({
            user_id: user.id,
            lead_id: lead.id,
            campaign_id: lead.campaign_id ?? null,
            activity_type: "status_changed" as ActivityType,
            description: `Tags added: ${tags.join(", ")}`,
            metadata: {
              action: "add_tags",
              tags_added: tags,
              correlation_id: correlationId,
            },
          })),
        );
      }

      log.info({ count: leads.length }, "bulk add_tags completed");
      return NextResponse.json({ updated: leads.length, correlationId });
    }

    // ── Validate campaign ownership for add_to_campaign ──────────────
    if (action === "add_to_campaign" && campaign_id) {
      const { data: campaignData, error: campaignError } = await supabase
        .from("campaigns")
        .select("id")
        .eq("id", campaign_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (campaignError || !campaignData) {
        return NextResponse.json(
          { error: "Campaign not found", correlationId },
          { status: 404 },
        );
      }
    }

    // ── Build update payload ──────────────────────────────────────────
    let updatePayload: Record<string, unknown>;
    let activityDescription: string;
    const activityType: ActivityType = "status_changed";

    switch (action) {
      case "change_status":
        updatePayload = { status };
        activityDescription = `Status changed to ${status}`;
        break;
      case "add_to_campaign":
        updatePayload = { campaign_id };
        activityDescription = "Added to campaign";
        break;
      case "delete":
        updatePayload = { status: "do_not_contact" };
        activityDescription = "Marked as Do Not Contact";
        break;
      default:
        return NextResponse.json(
          { error: "Unknown action", correlationId },
          { status: 400 },
        );
    }

    // ── Update leads (scoped to user via RLS + explicit filter) ──────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedData, error: updateError } = await (supabase as any)
      .from("leads")
      .update(updatePayload)
      .in("id", lead_ids)
      .eq("user_id", user.id)
      .select("id, campaign_id");

    if (updateError) {
      log.error({ error: updateError }, "failed to bulk update leads");
      throw new AppError("Failed to update leads", {
        statusCode: 500,
        correlationId,
        context: { code: updateError.code },
      });
    }

    const updated = (updatedData ?? []) as Array<{
      id: string;
      campaign_id: string | null;
    }>;

    // ── Log activities ────────────────────────────────────────────────
    if (updated.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("activities").insert(
        updated.map((lead) => ({
          user_id: user.id,
          lead_id: lead.id,
          campaign_id:
            action === "add_to_campaign"
              ? (campaign_id ?? null)
              : (lead.campaign_id ?? null),
          activity_type: activityType,
          description: activityDescription,
          metadata: {
            action,
            ...(status ? { new_status: status } : {}),
            ...(campaign_id ? { campaign_id } : {}),
            correlation_id: correlationId,
          },
        })),
      );
    }

    log.info({ action, updated: updated.length }, "bulk action completed");

    return NextResponse.json({ updated: updated.length, correlationId });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "bulk action error");
      return NextResponse.json(
        {
          error: err.message,
          correlationId: err.correlationId ?? correlationId,
        },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/leads/bulk-action");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
