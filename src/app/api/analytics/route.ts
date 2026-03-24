import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import type { Activity, LeadStatus, ActivityType } from "@/types/database";

// ─── Response types ────────────────────────────────────────────────────────────

export interface AnalyticsKPIs {
  total_leads: number;
  /** % change vs prior 30-day window (can be negative) */
  total_leads_trend: number;
  invites_sent_today: number;
  max_daily_invites: number;
  /** 0–100 */
  reply_rate: number;
  replied_count: number;
  meetings_booked: number;
}

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  /** % of total leads */
  pct: number;
}

export interface TimeSeriesPoint {
  /** YYYY-MM-DD */
  date: string;
  messages_sent: number;
  replies: number;
  /** 0–100 */
  reply_rate: number;
}

export interface DailyActivityPoint {
  date: string;
  invites_sent: number;
  messages_sent: number;
  replies: number;
}

export interface CampaignStat {
  id: string;
  name: string;
  leads: number;
  invites: number;
  /** 0–100 */
  acceptance_rate: number;
  /** 0–100 */
  reply_rate: number;
  meetings: number;
}

export interface TemplateStat {
  id: string;
  name: string;
  times_used: number;
  /** 0–100 */
  reply_rate: number;
}

export interface ResponseTimeBucket {
  label: string;
  count: number;
}

export interface RecentActivityItem {
  id: string;
  activity_type: ActivityType;
  description: string | null;
  created_at: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_profile_url: string | null;
  campaign_id: string | null;
  metadata: Record<string, unknown>;
}

export interface AnalyticsResponse {
  kpis: AnalyticsKPIs;
  funnel: FunnelStage[];
  /** Contains days in date range; client can slice for shorter views */
  time_series: TimeSeriesPoint[];
  daily_activity: DailyActivityPoint[];
  campaign_stats: CampaignStat[];
  template_stats: TemplateStat[];
  response_time_buckets: ResponseTimeBucket[];
  recent_activities: RecentActivityItem[];
}

// ─── Funnel stage definitions ──────────────────────────────────────────────────

const FUNNEL_STAGES: Array<{
  stage: string;
  label: string;
  statuses: LeadStatus[] | null;
}> = [
  { stage: "total", label: "Total Leads", statuses: null },
  {
    stage: "invited",
    label: "Invited",
    statuses: [
      "invite_sent",
      "invite_accepted",
      "invite_expired",
      "message_sent",
      "replied",
      "interested",
      "not_interested",
      "meeting_booked",
      "converted",
      "do_not_contact",
    ],
  },
  {
    stage: "accepted",
    label: "Accepted",
    statuses: [
      "invite_accepted",
      "message_sent",
      "replied",
      "interested",
      "not_interested",
      "meeting_booked",
      "converted",
    ],
  },
  {
    stage: "messaged",
    label: "Messaged",
    statuses: [
      "message_sent",
      "replied",
      "interested",
      "not_interested",
      "meeting_booked",
      "converted",
    ],
  },
  {
    stage: "replied",
    label: "Replied",
    statuses: [
      "replied",
      "interested",
      "not_interested",
      "meeting_booked",
      "converted",
    ],
  },
  {
    stage: "interested",
    label: "Interested",
    statuses: ["interested", "meeting_booked", "converted"],
  },
  {
    stage: "meeting_booked",
    label: "Meeting Booked",
    statuses: ["meeting_booked", "converted"],
  },
];

// ─── Response time histogram buckets ──────────────────────────────────────────

const BUCKET_LABELS = ["< 1h", "1–4h", "4–24h", "1–3d", "3–7d", "7d+"] as const;
const BUCKET_HOURS = [1, 4, 24, 72, 168, Infinity] as const;

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
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

    // ── Date range ────────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const daysParam = searchParams.get("days");

    const now = new Date();
    let startDate: Date;
    let endDate = now;

    if (fromParam && toParam) {
      startDate = new Date(fromParam + "T00:00:00.000Z");
      endDate = new Date(toParam + "T23:59:59.999Z");
    } else {
      const days = daysParam
        ? Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 365)
        : 30;
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const startDateISO = startDate.toISOString();

    // Fixed 30/60-day windows for KPI trend (always relative to today)
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const sixtyDaysAgo = new Date(
      now.getTime() - 60 * 24 * 60 * 60 * 1000
    ).toISOString();

    // ── Parallel data fetching ────────────────────────────────────────────────
    const [
      leadStatusResult,
      settingsResult,
      currentPeriodResult,
      prevPeriodResult,
      rangeActivitiesResult,
      activityFeedResult,
      campaignsResult,
      templatesResult,
      outboundMsgsResult,
      inboundMsgsResult,
    ] = await Promise.all([
      // All-time lead statuses for funnel + KPIs
      supabase.from("leads").select("status").eq("user_id", user.id),
      // Daily limits
      supabase
        .from("settings")
        .select("invites_sent_today, max_daily_invites")
        .eq("user_id", user.id)
        .single(),
      // Current 30d lead count for trend
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", thirtyDaysAgo),
      // Prior 30d lead count for trend
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", sixtyDaysAgo)
        .lt("created_at", thirtyDaysAgo),
      // Date-range activities: time series + daily activity + template stats
      supabase
        .from("activities")
        .select("activity_type, created_at, lead_id, metadata")
        .eq("user_id", user.id)
        .in("activity_type", [
          "invite_sent",
          "message_sent",
          "reply_detected",
          "message_received",
        ])
        .gte("created_at", startDateISO)
        .order("created_at", { ascending: true }),
      // Recent activity feed (always latest 20, no date filter)
      supabase
        .from("activities")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      // Campaigns with aggregated metrics
      supabase
        .from("campaigns")
        .select(
          "id, name, total_leads, invites_sent, invites_accepted, messages_sent, replies_received, meetings_booked"
        )
        .eq("user_id", user.id)
        .not("status", "eq", "draft")
        .order("created_at", { ascending: false })
        .limit(10),
      // Templates
      supabase
        .from("templates")
        .select("id, name, performance_score")
        .eq("user_id", user.id)
        .limit(20),
      // Outbound messages for response time distribution
      supabase
        .from("messages")
        .select("lead_id, sent_at")
        .eq("user_id", user.id)
        .eq("direction", "outbound")
        .gte("sent_at", startDateISO)
        .not("lead_id", "is", null)
        .order("sent_at", { ascending: true }),
      // Inbound messages for response time distribution
      supabase
        .from("messages")
        .select("lead_id, sent_at")
        .eq("user_id", user.id)
        .eq("direction", "inbound")
        .gte("sent_at", startDateISO)
        .not("lead_id", "is", null)
        .order("sent_at", { ascending: true }),
    ]);

    // ── Lead status counts (all-time) ──────────────────────────────────────────

    const statusCounts: Record<string, number> = {};
    (
      (leadStatusResult.data ?? []) as Array<{ status: LeadStatus }>
    ).forEach(({ status }) => {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    });

    const totalLeads = Object.values(statusCounts).reduce(
      (s, c) => s + c,
      0
    );

    // ── Funnel (all-time) ──────────────────────────────────────────────────────

    const funnel: FunnelStage[] = FUNNEL_STAGES.map(
      ({ stage, label, statuses }) => {
        const count =
          statuses === null
            ? totalLeads
            : statuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0);
        return {
          stage,
          label,
          count,
          pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
        };
      }
    );

    // ── KPIs (all-time) ────────────────────────────────────────────────────────

    const messagedStatuses: LeadStatus[] = [
      "message_sent",
      "replied",
      "interested",
      "not_interested",
      "meeting_booked",
      "converted",
    ];
    const repliedStatuses: LeadStatus[] = [
      "replied",
      "interested",
      "not_interested",
      "meeting_booked",
      "converted",
    ];

    const messagedCount = messagedStatuses.reduce(
      (sum, s) => sum + (statusCounts[s] ?? 0),
      0
    );
    const repliedCount = repliedStatuses.reduce(
      (sum, s) => sum + (statusCounts[s] ?? 0),
      0
    );
    const replyRate =
      messagedCount > 0
        ? Math.round((repliedCount / messagedCount) * 100)
        : 0;

    const meetingsBooked = (
      ["meeting_booked", "converted"] as LeadStatus[]
    ).reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0);

    const currentCount = currentPeriodResult.count ?? 0;
    const prevCount = prevPeriodResult.count ?? 0;
    const leadTrend =
      prevCount > 0
        ? Math.round(((currentCount - prevCount) / prevCount) * 100)
        : 0;

    const settings = settingsResult.data as {
      invites_sent_today: number;
      max_daily_invites: number;
    } | null;

    // ── Build daily map from range activities ──────────────────────────────────

    type RangeActivity = {
      activity_type: string;
      created_at: string;
      lead_id: string | null;
      metadata: Record<string, unknown>;
    };

    const rangeActivities = (rangeActivitiesResult.data ?? []) as RangeActivity[];

    const dailyMap: Record<
      string,
      { invites_sent: number; messages_sent: number; replies: number }
    > = {};
    const templateSendCount: Record<string, number> = {};
    const templateMessaged: Record<string, Set<string>> = {};
    const repliedLeadIds = new Set<string>();

    for (const act of rangeActivities) {
      const date = act.created_at.split("T")[0];
      if (!dailyMap[date])
        dailyMap[date] = { invites_sent: 0, messages_sent: 0, replies: 0 };

      if (act.activity_type === "invite_sent") {
        dailyMap[date].invites_sent++;
      } else if (act.activity_type === "message_sent") {
        dailyMap[date].messages_sent++;
        const tid = act.metadata?.template_id;
        if (typeof tid === "string" && act.lead_id) {
          templateSendCount[tid] = (templateSendCount[tid] ?? 0) + 1;
          if (!templateMessaged[tid]) templateMessaged[tid] = new Set();
          templateMessaged[tid].add(act.lead_id);
        }
      } else if (
        act.activity_type === "reply_detected" ||
        act.activity_type === "message_received"
      ) {
        dailyMap[date].replies++;
        if (act.lead_id) repliedLeadIds.add(act.lead_id);
      }
    }

    // ── Time series + daily activity ───────────────────────────────────────────

    const numDays = Math.round(
      (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    const clampedDays = Math.max(1, Math.min(numDays, 365));

    const timeSeries: TimeSeriesPoint[] = [];
    const dailyActivity: DailyActivityPoint[] = [];

    for (let i = clampedDays - 1; i >= 0; i--) {
      const d = new Date(endDate);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().split("T")[0];
      const entry = dailyMap[date] ?? {
        invites_sent: 0,
        messages_sent: 0,
        replies: 0,
      };

      timeSeries.push({
        date,
        messages_sent: entry.messages_sent,
        replies: entry.replies,
        reply_rate:
          entry.messages_sent > 0
            ? Math.round((entry.replies / entry.messages_sent) * 100)
            : 0,
      });

      dailyActivity.push({
        date,
        invites_sent: entry.invites_sent,
        messages_sent: entry.messages_sent,
        replies: entry.replies,
      });
    }

    // ── Campaign stats ─────────────────────────────────────────────────────────

    type CampaignRow = {
      id: string;
      name: string;
      total_leads: number;
      invites_sent: number;
      invites_accepted: number;
      messages_sent: number;
      replies_received: number;
      meetings_booked: number;
    };

    const campaign_stats: CampaignStat[] = (
      (campaignsResult.data ?? []) as CampaignRow[]
    ).map((c) => ({
      id: c.id,
      name: c.name,
      leads: c.total_leads,
      invites: c.invites_sent,
      acceptance_rate:
        c.invites_sent > 0
          ? Math.round((c.invites_accepted / c.invites_sent) * 100)
          : 0,
      reply_rate:
        c.messages_sent > 0
          ? Math.round((c.replies_received / c.messages_sent) * 100)
          : 0,
      meetings: c.meetings_booked,
    }));

    // ── Template stats ─────────────────────────────────────────────────────────

    type TemplateRow = {
      id: string;
      name: string;
      performance_score: number | null;
    };

    const template_stats: TemplateStat[] = (
      (templatesResult.data ?? []) as TemplateRow[]
    )
      .map((t) => {
        const msgLeads = templateMessaged[t.id];
        const messaged = msgLeads?.size ?? 0;
        const replied =
          messaged > 0
            ? [...msgLeads].filter((lid) => repliedLeadIds.has(lid)).length
            : 0;
        return {
          id: t.id,
          name: t.name,
          times_used: templateSendCount[t.id] ?? 0,
          reply_rate:
            messaged > 0
              ? Math.round((replied / messaged) * 100)
              : (t.performance_score ?? 0),
        };
      })
      .sort((a, b) => b.times_used - a.times_used)
      .slice(0, 10);

    // ── Response time distribution ─────────────────────────────────────────────

    type MsgRow = { lead_id: string; sent_at: string };

    const firstOutbound: Record<string, Date> = {};
    for (const msg of (outboundMsgsResult.data ?? []) as MsgRow[]) {
      if (!firstOutbound[msg.lead_id]) {
        firstOutbound[msg.lead_id] = new Date(msg.sent_at);
      }
    }

    const bucketCounts = new Array<number>(BUCKET_LABELS.length).fill(0);
    const seenReplied = new Set<string>();

    for (const msg of (inboundMsgsResult.data ?? []) as MsgRow[]) {
      if (seenReplied.has(msg.lead_id)) continue;
      const outDate = firstOutbound[msg.lead_id];
      if (!outDate) continue;
      const inDate = new Date(msg.sent_at);
      if (inDate <= outDate) continue;
      seenReplied.add(msg.lead_id);

      const diffHours =
        (inDate.getTime() - outDate.getTime()) / (1000 * 60 * 60);
      const idx = BUCKET_HOURS.findIndex((h) => diffHours < h);
      bucketCounts[idx === -1 ? BUCKET_LABELS.length - 1 : idx]++;
    }

    const response_time_buckets: ResponseTimeBucket[] = BUCKET_LABELS.map(
      (label, i) => ({ label, count: bucketCounts[i] })
    );

    // ── Recent activities with lead names ──────────────────────────────────────

    const feedActivities = (activityFeedResult.data ?? []) as Activity[];
    const leadIds = [
      ...new Set(
        feedActivities
          .filter((a) => a.lead_id != null)
          .map((a) => a.lead_id as string)
      ),
    ];

    const leadsMap: Record<
      string,
      { full_name: string; linkedin_profile_url: string | null }
    > = {};

    if (leadIds.length > 0) {
      const { data: actLeads } = await supabase
        .from("leads")
        .select("id, full_name, linkedin_profile_url")
        .in("id", leadIds);

      (
        (actLeads ?? []) as Array<{
          id: string;
          full_name: string;
          linkedin_profile_url: string | null;
        }>
      ).forEach((l) => {
        leadsMap[l.id] = {
          full_name: l.full_name,
          linkedin_profile_url: l.linkedin_profile_url,
        };
      });
    }

    const recent_activities: RecentActivityItem[] = feedActivities.map(
      (a) => ({
        id: a.id,
        activity_type: a.activity_type,
        description: a.description,
        created_at: a.created_at,
        lead_id: a.lead_id,
        lead_name: a.lead_id
          ? (leadsMap[a.lead_id]?.full_name ?? null)
          : null,
        lead_profile_url: a.lead_id
          ? (leadsMap[a.lead_id]?.linkedin_profile_url ?? null)
          : null,
        campaign_id: a.campaign_id,
        metadata: a.metadata,
      })
    );

    // ── Compose response ───────────────────────────────────────────────────────

    const response: AnalyticsResponse = {
      kpis: {
        total_leads: totalLeads,
        total_leads_trend: leadTrend,
        invites_sent_today: settings?.invites_sent_today ?? 0,
        max_daily_invites: settings?.max_daily_invites ?? 25,
        reply_rate: replyRate,
        replied_count: repliedCount,
        meetings_booked: meetingsBooked,
      },
      funnel,
      time_series: timeSeries,
      daily_activity: dailyActivity,
      campaign_stats,
      template_stats,
      response_time_buckets,
      recent_activities,
    };

    log.info({ userId: user.id, correlationId }, "Analytics fetched");
    return NextResponse.json(response);
  } catch (err) {
    log.error({ error: err }, "Unexpected error in GET /api/analytics");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
