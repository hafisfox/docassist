import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { scrapeLinkedInProfile } from "@/lib/apify/scraper";
import type { Lead } from "@/types/database";

const enrichRequestSchema = z.object({
  lead_id: z.string().uuid("Invalid lead ID"),
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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = enrichRequestSchema.safeParse(body);

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

    const { lead_id } = parsed.data;
    log.info({ userId: user.id, leadId: lead_id }, "enrich lead request");

    // Fetch the lead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data, error: fetchError } = await (supabase as any)
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();
    const lead = data as Lead | null;

    if (fetchError || !lead) {
      if (fetchError?.code === "PGRST116" || !lead) {
        return NextResponse.json(
          { error: "Lead not found", correlationId },
          { status: 404 },
        );
      }
      if (fetchError) {
        log.error({ error: fetchError }, "failed to fetch lead for enrichment");
      }
      throw new AppError("Failed to fetch lead", {
        statusCode: 500,
        correlationId,
        context: { code: fetchError?.code },
      });
    }

    if (!lead.linkedin_profile_url) {
      return NextResponse.json(
        { error: "Lead has no LinkedIn profile URL", correlationId },
        { status: 400 },
      );
    }

    // Run the Apify scraper
    log.info(
      { leadId: lead_id, profileUrl: lead.linkedin_profile_url },
      "starting apify profile scrape",
    );

    const enriched = await scrapeLinkedInProfile(
      lead.linkedin_profile_url,
      correlationId,
    );

    // Update the lead with enriched data
    const updatePayload: Record<string, unknown> = {
      status: "enriched",
      enrichment_data: enriched.raw,
      skills: enriched.skills,
      education: enriched.education,
      experience: enriched.experience,
    };

    // Only overwrite fields that are currently empty
    if (!lead.headline && enriched.headline) {
      updatePayload.headline = enriched.headline;
    }
    if (!lead.company && enriched.company) {
      updatePayload.company = enriched.company;
    }
    if (!lead.location && enriched.location) {
      updatePayload.location = enriched.location;
    }
    if (!lead.linkedin_profile_picture_url && enriched.profile_picture_url) {
      updatePayload.linkedin_profile_picture_url = enriched.profile_picture_url;
    }
    if (!lead.first_name && enriched.first_name) {
      updatePayload.first_name = enriched.first_name;
    }
    if (!lead.last_name && enriched.last_name) {
      updatePayload.last_name = enriched.last_name;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data: updatedLead, error: updateError } = await (supabase as any)
      .from("leads")
      .update(updatePayload)
      .eq("id", lead_id)
      .select()
      .single();

    if (updateError) {
      log.error({ error: updateError }, "failed to update lead with enrichment data");
      throw new AppError("Failed to update lead with enrichment data", {
        statusCode: 500,
        correlationId,
        context: { code: updateError.code },
      });
    }

    // Log activity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    await (supabase as any).from("activities").insert({
      user_id: user.id,
      lead_id,
      activity_type: "lead_enriched",
      description: `Profile enriched via Apify — ${enriched.skills.length} skills, ${enriched.experience.length} experience entries, ${enriched.education.length} education entries`,
      metadata: {
        skills_count: enriched.skills.length,
        experience_count: enriched.experience.length,
        education_count: enriched.education.length,
        profile_url: lead.linkedin_profile_url,
      },
    });

    log.info(
      {
        leadId: lead_id,
        skillsCount: enriched.skills.length,
        experienceCount: enriched.experience.length,
        educationCount: enriched.education.length,
      },
      "lead enriched successfully",
    );

    return NextResponse.json({
      lead: updatedLead as Lead,
      enrichment: {
        skills_count: enriched.skills.length,
        experience_count: enriched.experience.length,
        education_count: enriched.education.length,
      },
      correlationId,
    });
  } catch (err) {
    if (err instanceof AppError) {
      log.error({ error: err.toJSON() }, "enrich lead error");
      return NextResponse.json(
        { error: err.message, correlationId: err.correlationId ?? correlationId },
        { status: err.statusCode },
      );
    }

    log.error({ error: err }, "unexpected error in POST /api/leads/enrich");
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 },
    );
  }
}
