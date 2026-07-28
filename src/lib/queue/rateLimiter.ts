import { SupabaseClient } from "@supabase/supabase-js";
import { withCorrelationId } from "@/lib/logger";
import { MAX_DAILY_INVITES, MAX_DAILY_MESSAGES, MAX_DAILY_PROFILE_VIEWS } from "@/constants/linkedinLimits";
import type { Database, Settings, SettingsCounterField } from "@/types/database";

export type LimitType = "invite" | "message" | "profile_view";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Counter value after this call (undefined when the action was not allowed) */
  current?: number;
}

const LIMIT_DEFAULTS: Record<LimitType, number> = {
  invite: MAX_DAILY_INVITES,
  message: MAX_DAILY_MESSAGES,
  profile_view: MAX_DAILY_PROFILE_VIEWS,
};

// Maps LimitType to settings counter column names.
const COUNTER_COLUMN: Record<LimitType, keyof Settings> = {
  invite: "invites_sent_today",
  message: "messages_sent_today",
  profile_view: "profile_views_today",
};

const LIMIT_COLUMN: Record<LimitType, keyof Settings> = {
  invite: "max_daily_invites",
  message: "max_daily_messages",
  profile_view: "max_daily_profile_views",
};

/**
 * Checks whether a LinkedIn action is within the daily rate limit and, if so,
 * claims a slot by incrementing the counter through the
 * `increment_settings_counter` RPC, which does the read and write in one
 * statement. An increment that turns out to exceed the limit is rolled back.
 *
 * Also resets daily counters when the calendar day (UTC) has rolled over since
 * `counters_reset_at`.
 *
 * @returns `{ allowed: true, remaining }` when the action can proceed, or
 *          `{ allowed: false, remaining: 0 }` when the daily limit is reached.
 */
export async function checkAndIncrementLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: LimitType,
  correlationId?: string
): Promise<RateLimitResult> {
  const log = correlationId
    ? withCorrelationId(correlationId).child({ userId, limitType: type })
    : undefined;

  // ── 1. Fetch current settings ────────────────────────────────────────────
  const { data: settings, error: fetchError } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  const typedSettings = settings as Settings | null;

  if (fetchError || !typedSettings) {
    log?.error({ error: fetchError }, "Failed to fetch settings for rate limit check");
    // Fail open with default limit so a missing settings row doesn't block the app
    return { allowed: true, remaining: LIMIT_DEFAULTS[type] };
  }

  // ── 2. Reset counters if the calendar day (UTC) has rolled over ──────────
  const resetAt = new Date(typedSettings.counters_reset_at);
  const now = new Date();
  const isNewDay =
    now.getUTCFullYear() !== resetAt.getUTCFullYear() ||
    now.getUTCMonth() !== resetAt.getUTCMonth() ||
    now.getUTCDate() !== resetAt.getUTCDate();

  if (isNewDay) {
    const { error: resetError } = await supabase
      .from("settings")
      .update({
        invites_sent_today: 0,
        messages_sent_today: 0,
        profile_views_today: 0,
        counters_reset_at: now.toISOString(),
      })
      .eq("user_id", userId);

    if (resetError) {
      // Fail closed: we can't trust the in-memory counters (still holding
      // yesterday's values) until the reset persists. Defer the action — the
      // caller retries on its next cycle once the DB write succeeds.
      log?.error({ error: resetError }, "Failed to reset daily counters — deferring action");
      return { allowed: false, remaining: 0 };
    }
    log?.info("Daily counters reset for new UTC day");
    typedSettings.invites_sent_today = 0;
    typedSettings.messages_sent_today = 0;
    typedSettings.profile_views_today = 0;
    typedSettings.counters_reset_at = now.toISOString();
  }

  // ── 3. Determine limit and current count ─────────────────────────────────
  const limit = typedSettings[LIMIT_COLUMN[type]] as number;
  const counterCol = COUNTER_COLUMN[type] as SettingsCounterField;
  const current = typedSettings[counterCol] as number;

  // Cheap pre-check so an obviously-exhausted quota costs no write.
  if (current >= limit) {
    log?.warn({ current, limit }, "Daily rate limit reached");
    return { allowed: false, remaining: 0 };
  }

  // ── 4. Claim a slot atomically ────────────────────────────────────────────
  // The counter is incremented in a single UPDATE … RETURNING (see migration
  // 20240101000017) rather than read-modify-written here. Under the previous
  // pattern two concurrent sends both read 24 and both wrote 25 — two LinkedIn
  // actions taken, one recorded — which is precisely the failure the daily
  // limits exist to prevent.
  const { data: newValue, error: updateError } = await supabase.rpc(
    "increment_settings_counter",
    { p_user_id: userId, p_field: counterCol, p_delta: 1 }
  );

  if (updateError || typeof newValue !== "number") {
    log?.error({ error: updateError }, "Failed to increment rate limit counter");
    // Fail open — don't block the action because of a DB write failure
    return { allowed: true, remaining: limit - current };
  }

  // We may have won the pre-check but lost the race. The increment already
  // landed, so hand the slot back rather than leaving the counter inflated.
  if (newValue > limit) {
    log?.warn({ current: newValue, limit }, "Daily rate limit reached (lost race)");
    const { error: rollbackError } = await supabase.rpc(
      "increment_settings_counter",
      { p_user_id: userId, p_field: counterCol, p_delta: -1 }
    );
    if (rollbackError) {
      log?.error({ error: rollbackError }, "Failed to roll back over-limit counter increment");
    }
    return { allowed: false, remaining: 0 };
  }

  const remaining = limit - newValue;
  log?.debug({ current: newValue, limit, remaining }, "Rate limit counter incremented");

  return { allowed: true, remaining, current: newValue };
}

/**
 * Returns a promise that resolves after a random delay between `minMs` and
 * `maxMs` milliseconds (inclusive). Use this between LinkedIn API calls to
 * mimic human pacing.
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
