import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import type { Campaign, Lead, SequenceEnrollment, SequenceStep } from "@/types/database";

const uuidSchema = z.string().uuid("Invalid campaign ID");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/campaigns/:id/start
 *
 * Transitions a draft or paused campaign to active:
 *  - draft  → creates sequence_enrollments for all eligible leads, starting from step 1
 *  - paused → re-activates existing paused enrollments (preserving their current_step)
 *
 * Rejects campaigns that are already active, completed, or archived.
 */
export async function POST(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
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

    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid campaign ID", correlationId },
        { status: 400 }
      );
    }

    log.info({ userId: user.id, campaignId: id }, "start campaign request");

    // ── Fetch campaign ────────────────────────────────────────────────────
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id) // belt-and-suspenders RLS check
      .single();

    if (campaignError?.code === "PGRST116" || !campaignData) {
      return NextResponse.json(
        { error: "Campaign not found", correlationId },
        { status: 404 }
      );
    }
    if (campaignError) {
      throw new AppError("Failed to fetch campaign", { statusCode: 500, correlationId });
    }

    const campaign = campaignData as Campaign;

    if (campaign.status === "active") {
      return NextResponse.json(
        { error: "Campaign is already active", correlationId },
        { status: 409 }
      );
    }
    if (campaign.status === "completed" || campaign.status === "archived") {
      return NextResponse.json(
        { error: `Cannot start a ${campaign.status} campaign`, correlationId },
        { status: 409 }
      );
    }
    if (!campaign.sequence_id) {
      return NextResponse.json(
        { error: "Campaign has no sequence assigned", correlationId },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    let enrolledCount = 0;
    let skippedCount = 0;

    if (campaign.status === "paused") {
      // ── Re-activate paused enrollments (preserve current_step) ─────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: reactivateError } = await (supabase as any)
        .from("sequence_enrollments")
        .update({
          status: "active",
          next_execution_at: now, // due immediately
          error_message: null,
        })
        .eq("campaign_id", id)
        .eq("status", "paused");

      if (reactivateError) {
        throw new AppError("Failed to re-activate enrollments", {
          statusCode: 500,
          correlationId,
          context: { code: reactivateError.code },
        });
      }

      // Count re-activated enrollments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from("sequence_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "active");

      enrolledCount = count ?? 0;
    } else {
      // ── Draft (or failed) → create new enrollments from step 1 ─────────

      // Fetch first step of the sequence
      const { data: stepsData, error: stepsError } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", campaign.sequence_id)
        .order("step_order", { ascending: true })
        .limit(1);

      if (stepsError) {
        throw new AppError("Failed to fetch sequence steps", { statusCode: 500, correlationId });
      }

      const steps = (stepsData ?? []) as SequenceStep[];
      if (steps.length === 0) {
        return NextResponse.json(
          { error: "Sequence has no steps", correlationId },
          { status: 422 }
        );
      }
      const firstStep = steps[0];

      // Fetch all leads for this campaign
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsData, error: leadsError } = await (supabase as any)
        .from("leads")
        .select("id, status")
        .eq("campaign_id", id);

      if (leadsError) {
        throw new AppError("Failed to fetch campaign leads", { statusCode: 500, correlationId });
      }

      const leads = (leadsData ?? []) as Pick<Lead, "id" | "status">[];
      if (leads.length === 0) {
        return NextResponse.json(
          { error: "Campaign has no leads to enroll", correlationId },
          { status: 422 }
        );
      }

      // Skip do_not_contact leads
      const eligible = leads.filter((l) => l.status !== "do_not_contact");
      skippedCount = leads.length - eligible.length;

      const enrollments: Omit<
        SequenceEnrollment,
        "id" | "created_at" | "updated_at"
      >[] = eligible.map((lead) => ({
        lead_id: lead.id,
        campaign_id: id,
        sequence_id: campaign.sequence_id as string,
        current_step: firstStep.step_order,
        status: "active",
        next_execution_at: now,
        last_executed_at: null,
        error_message: null,
      }));

      // Upsert — on conflict (lead_id, campaign_id) reset the enrollment to active from step 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: enrollError } = await (supabase as any)
        .from("sequence_enrollments")
        .upsert(enrollments, { onConflict: "lead_id,campaign_id" });

      if (enrollError) {
        throw new AppError("Failed to create enrollments", {
          statusCode: 500,
          correlationId,
          context: { code: enrollError.code },
        });
      }

      enrolledCount = eligible.length;

      // Update total_leads denormalised counter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("campaigns")
        .update({ total_leads: leads.length })
        .eq("id", id);
    }

    // ── Update campaign status → active ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedData, error: updateError } = await (supabase as any)
      .from("campaigns")
      .update({
        status: "active",
        started_at: now,
        paused_at: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw new AppError("Failed to update campaign status", { statusCode: 500, correlationId });
    }

    // ── Log activity ──────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("activities").insert({
      user_id: user.id,
      lead_id: null,
      campaign_id: id,
      activity_type: "campaign_started",
      description: `Campaign started — ${enrolledCount} leads enrolled`,
      metadata: {
        enrolled_count: enrolledCount,
        skipped_dnc: skippedCount,
        sequence_id: campaign.sequence_id,
        from_status: campaign.status,
      },
    });

    log.info({ campaignId: id, enrolledCount, skippedCount }, "campaign started");

    return NextResponse.json({
      campaign: updatedData as Campaign,
      enrolled_count: enrolledCount,
      skipped_count: skippedCount,
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "start campaign error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode }
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/campaigns/[id]/start");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 }
    );
  }
}
