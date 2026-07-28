/**
 * Account-safety guard: pauses outreach when LinkedIn invitation acceptance
 * drops far enough to suggest the account is being flagged.
 *
 * This used to live inside `GET /api/health`, which the dashboard polls every
 * 60 s from two separate components — so merely leaving a browser tab open
 * drove campaign pausing, and any prefetch, retry or CDN revalidation of that
 * GET could pause campaigns as a side effect. State changes belong on a
 * schedule, not on a read: the cron route now owns it and the health endpoint
 * only reports.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { withCorrelationId } from "@/lib/logger";
import type { Database, ActivityType } from "@/types/database";

/** Minimum invites before flagging low acceptance (avoids false positives on new accounts). */
export const MIN_INVITES_FOR_ACCEPTANCE_CHECK = 20;
/** Percent. Below this, active campaigns are paused. */
export const ACCEPTANCE_RATE_WARNING_THRESHOLD = 20;

interface CampaignRow {
  id: string;
  user_id: string;
  status: string;
  invites_sent: number | null;
  invites_accepted: number | null;
}

export interface AcceptanceStats {
  acceptanceRate: number | null;
  invitesSentTotal: number;
  invitesAcceptedTotal: number;
  warning: boolean;
  activeCampaignIds: string[];
}

/**
 * Aggregate invitation acceptance across a set of campaigns. Pure — safe to
 * call from a read path.
 */
export function computeAcceptanceStats(
  campaigns: Pick<CampaignRow, "id" | "status" | "invites_sent" | "invites_accepted">[],
): AcceptanceStats {
  const invitesSentTotal = campaigns.reduce((sum, c) => sum + (c.invites_sent ?? 0), 0);
  const invitesAcceptedTotal = campaigns.reduce(
    (sum, c) => sum + (c.invites_accepted ?? 0),
    0,
  );

  const acceptanceRate =
    invitesSentTotal >= MIN_INVITES_FOR_ACCEPTANCE_CHECK
      ? Math.round((invitesAcceptedTotal / invitesSentTotal) * 100)
      : null;

  return {
    acceptanceRate,
    invitesSentTotal,
    invitesAcceptedTotal,
    warning:
      acceptanceRate !== null && acceptanceRate < ACCEPTANCE_RATE_WARNING_THRESHOLD,
    activeCampaignIds: campaigns.filter((c) => c.status === "active").map((c) => c.id),
  };
}

/**
 * Pause every active campaign belonging to a user whose acceptance rate has
 * fallen below the threshold, along with their active enrollments.
 *
 * Pass a service-role client: this runs from cron with no user session.
 * Returns the number of campaigns paused across all users.
 */
export async function autoPauseLowAcceptanceCampaigns(
  supabase: SupabaseClient<Database>,
  correlationId: string,
): Promise<number> {
  const log = withCorrelationId(correlationId);

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, user_id, status, invites_sent, invites_accepted");

  if (error) {
    log.error({ error }, "account guard: failed to fetch campaigns");
    return 0;
  }

  const campaigns = (data ?? []) as CampaignRow[];

  // Acceptance rate is an account-level signal, so group by owner.
  const byUser = new Map<string, CampaignRow[]>();
  for (const c of campaigns) {
    const list = byUser.get(c.user_id);
    if (list) list.push(c);
    else byUser.set(c.user_id, [c]);
  }

  let totalPaused = 0;

  for (const [userId, userCampaigns] of byUser) {
    const stats = computeAcceptanceStats(userCampaigns);
    if (!stats.warning || stats.activeCampaignIds.length === 0) continue;

    const now = new Date().toISOString();
    const ids = stats.activeCampaignIds;

    const { error: pauseError } = await supabase
      .from("campaigns")
      .update({ status: "paused", paused_at: now })
      .in("id", ids);

    if (pauseError) {
      log.error({ error: pauseError, userId }, "account guard: failed to pause campaigns");
      continue;
    }

    const { error: enrollError } = await supabase
      .from("sequence_enrollments")
      .update({ status: "paused" })
      .in("campaign_id", ids)
      .eq("status", "active");

    if (enrollError) {
      log.error(
        { error: enrollError, userId },
        "account guard: campaigns paused but enrollments were not",
      );
    }

    const { error: activityError } = await supabase.from("activities").insert(
      ids.map((id) => ({
        user_id: userId,
        campaign_id: id,
        activity_type: "campaign_paused" as ActivityType,
        description: `Campaign auto-paused: invitation acceptance rate dropped below ${ACCEPTANCE_RATE_WARNING_THRESHOLD}%`,
        metadata: {
          reason: "low_acceptance_rate",
          acceptance_rate: stats.acceptanceRate,
          correlation_id: correlationId,
        },
      })),
    );

    if (activityError) {
      log.error({ error: activityError, userId }, "account guard: failed to log activities");
    }

    totalPaused += ids.length;
    log.warn(
      { userId, acceptanceRate: stats.acceptanceRate, paused: ids.length },
      "campaigns auto-paused due to low acceptance rate",
    );
  }

  return totalPaused;
}
