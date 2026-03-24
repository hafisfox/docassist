import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateSettingsSchema } from "@/lib/validators";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import type { Settings } from "@/types/database";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SettingsWithUsage extends Settings {
  /** How many invites remain for today */
  remaining_daily_invites: number;
  /** How many messages remain for today */
  remaining_daily_messages: number;
  /** Profile view remaining (no DB counter yet — returns the configured max) */
  remaining_daily_profile_views: number;
}

/** Reset today's counters if the UTC calendar day has rolled over. */
async function resetCountersIfNewDay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  settings: Settings
): Promise<Settings> {
  const resetAt = new Date(settings.counters_reset_at);
  const now = new Date();
  const isNewDay =
    now.getUTCFullYear() !== resetAt.getUTCFullYear() ||
    now.getUTCMonth() !== resetAt.getUTCMonth() ||
    now.getUTCDate() !== resetAt.getUTCDate();

  if (!isNewDay) return settings;

  const { data: updated, error } = await supabase
    .from("settings")
    .update({
      invites_sent_today: 0,
      messages_sent_today: 0,
      counters_reset_at: now.toISOString(),
    })
    .eq("user_id", settings.user_id)
    .select("*")
    .single();

  if (error || !updated) return settings;
  return updated as Settings;
}

function withUsageCounts(settings: Settings): SettingsWithUsage {
  return {
    ...settings,
    remaining_daily_invites: Math.max(
      0,
      settings.max_daily_invites - settings.invites_sent_today
    ),
    remaining_daily_messages: Math.max(
      0,
      settings.max_daily_messages - settings.messages_sent_today
    ),
    // profile_views_today not tracked in DB yet
    remaining_daily_profile_views: settings.max_daily_profile_views,
  };
}

export async function GET() {
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
        { status: 401 }
      );
    }

    const { data: settings, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code === "PGRST116") {
      // No settings row yet — create one with defaults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
      const { data: newSettings, error: insertError } = await (supabase as any)
        .from("settings")
        .insert({ user_id: user.id })
        .select("*")
        .single();
      const typedNewSettings = newSettings as Settings | null;

      if (insertError || !typedNewSettings) {
        log.error({ error: insertError }, "Failed to create default settings");
        return NextResponse.json(
          { error: "Failed to create settings" },
          { status: 500 }
        );
      }
      return NextResponse.json(withUsageCounts(typedNewSettings));
    }

    if (error) {
      log.error({ error }, "Failed to fetch settings");
      return NextResponse.json(
        { error: "Failed to fetch settings" },
        { status: 500 }
      );
    }

    const fresh = await resetCountersIfNewDay(supabase, settings as unknown as Settings);
    return NextResponse.json(withUsageCounts(fresh));
  } catch (err) {
    log.error({ error: err }, "Unexpected error in GET /api/settings");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Ensure min_delay < max_delay when both are provided
    const updates = parsed.data;
    if (
      updates.min_delay_seconds != null &&
      updates.max_delay_seconds != null &&
      updates.min_delay_seconds >= updates.max_delay_seconds
    ) {
      return NextResponse.json(
        { error: "min_delay_seconds must be less than max_delay_seconds" },
        { status: 400 }
      );
    }

    // Ensure start_hour < end_hour when both are provided
    if (
      updates.outreach_start_hour != null &&
      updates.outreach_end_hour != null &&
      updates.outreach_start_hour >= updates.outreach_end_hour
    ) {
      return NextResponse.json(
        { error: "outreach_start_hour must be less than outreach_end_hour" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2.100 generic resolution issue
    const { data: settings, error } = await (supabase as any)
      .from("settings")
      .update(updates)
      .eq("user_id", user.id)
      .select("*")
      .single();
    const typedSettings = settings as Settings | null;

    if (error) {
      log.error({ error }, "Failed to update settings");
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    log.info({ userId: user.id, correlationId }, "Settings updated");

    return NextResponse.json(typedSettings ? withUsageCounts(typedSettings) : null);
  } catch (err) {
    log.error({ error: err }, "Unexpected error in PATCH /api/settings");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
