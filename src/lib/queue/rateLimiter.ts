import { SupabaseClient } from "@supabase/supabase-js";
import { withCorrelationId } from "@/lib/logger";
import { MAX_DAILY_INVITES, MAX_DAILY_MESSAGES, MAX_DAILY_PROFILE_VIEWS } from "@/constants/linkedinLimits";
import type { Database, Settings } from "@/types/database";

export type LimitType = "invite" | "message" | "profile_view";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Counter value after this call (undefined if profile_view, which has no DB counter) */
  current?: number;
}

const LIMIT_DEFAULTS: Record<LimitType, number> = {
  invite: MAX_DAILY_INVITES,
  message: MAX_DAILY_MESSAGES,
  profile_view: MAX_DAILY_PROFILE_VIEWS,
};

// Maps LimitType to settings column names. profile_view has no DB counter yet.
const COUNTER_COLUMN: Partial<Record<LimitType, keyof Settings>> = {
  invite: "invites_sent_today",
  message: "messages_sent_today",
};

const LIMIT_COLUMN: Record<LimitType, keyof Settings> = {
  invite: "max_daily_invites",
  message: "max_daily_messages",
  profile_view: "max_daily_profile_views",
};

/**
 * Checks whether a LinkedIn action is within the daily rate limit and, if so,
 * increments the counter atomically in the settings table.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js v2 generic resolution
  const { data: settings, error: fetchError } = await (supabase as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: resetError } = await (supabase as any)
      .from("settings")
      .update({
        invites_sent_today: 0,
        messages_sent_today: 0,
        counters_reset_at: now.toISOString(),
      })
      .eq("user_id", userId);

    if (resetError) {
      log?.error({ error: resetError }, "Failed to reset daily counters");
    } else {
      log?.info("Daily counters reset for new UTC day");
      typedSettings.invites_sent_today = 0;
      typedSettings.messages_sent_today = 0;
      typedSettings.counters_reset_at = now.toISOString();
    }
  }

  // ── 3. Determine limit and current count ─────────────────────────────────
  const limit = typedSettings[LIMIT_COLUMN[type]] as number;
  const counterCol = COUNTER_COLUMN[type];

  // profile_view has no DB counter — just check against the limit with no increment
  if (!counterCol) {
    // We cannot track profile views in the DB yet; always allow up to the configured max.
    // TODO: add profile_views_today column to settings table and track here.
    return { allowed: true, remaining: limit };
  }

  const current = typedSettings[counterCol] as number;

  if (current >= limit) {
    log?.warn({ current, limit }, "Daily rate limit reached");
    return { allowed: false, remaining: 0 };
  }

  // ── 4. Increment counter ──────────────────────────────────────────────────
  const next = current + 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from("settings")
    .update({ [counterCol]: next })
    .eq("user_id", userId);

  if (updateError) {
    log?.error({ error: updateError }, "Failed to increment rate limit counter");
    // Fail open — don't block the action because of a DB write failure
    return { allowed: true, remaining: limit - current };
  }

  const remaining = limit - next;
  log?.debug({ current: next, limit, remaining }, "Rate limit counter incremented");

  return { allowed: true, remaining, current: next };
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
