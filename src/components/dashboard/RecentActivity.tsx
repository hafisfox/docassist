"use client";

import type { ElementType } from "react";
import {
  UserPlus,
  Star,
  Send,
  UserCheck,
  UserX,
  MessageSquare,
  MessageCircle,
  RefreshCcw,
  Play,
  Pause,
  AlertCircle,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityType } from "@/types/database";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RecentActivityItem {
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

interface RecentActivityProps {
  activities: RecentActivityItem[];
  loading: boolean;
}

// ─── Activity type config ──────────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<
  ActivityType,
  { icon: ElementType; color: string; fallback: (item: RecentActivityItem) => string }
> = {
  lead_created: {
    icon: UserPlus,
    color: "text-blue-500 bg-blue-50 dark:bg-blue-950",
    fallback: (i) => `New lead added${i.lead_name ? `: ${i.lead_name}` : ""}`,
  },
  lead_enriched: {
    icon: Star,
    color: "text-violet-500 bg-violet-50 dark:bg-violet-950",
    fallback: (i) =>
      `Lead enriched${i.lead_name ? `: ${i.lead_name}` : ""}`,
  },
  invite_sent: {
    icon: Send,
    color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950",
    fallback: (i) =>
      `Connection request sent${i.lead_name ? ` to ${i.lead_name}` : ""}`,
  },
  invite_accepted: {
    icon: UserCheck,
    color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950",
    fallback: (i) =>
      `${i.lead_name ?? "A lead"} accepted your connection request`,
  },
  invite_expired: {
    icon: UserX,
    color: "text-slate-500 bg-slate-50 dark:bg-slate-950",
    fallback: (i) =>
      `Connection request expired${i.lead_name ? ` for ${i.lead_name}` : ""}`,
  },
  message_sent: {
    icon: MessageSquare,
    color: "text-cyan-500 bg-cyan-50 dark:bg-cyan-950",
    fallback: (i) =>
      `Message sent${i.lead_name ? ` to ${i.lead_name}` : ""}`,
  },
  message_received: {
    icon: MessageCircle,
    color: "text-teal-500 bg-teal-50 dark:bg-teal-950",
    fallback: (i) =>
      `Message received${i.lead_name ? ` from ${i.lead_name}` : ""}`,
  },
  reply_detected: {
    icon: MessageCircle,
    color: "text-green-500 bg-green-50 dark:bg-green-950",
    fallback: (i) =>
      `${i.lead_name ?? "A lead"} replied to your message`,
  },
  status_changed: {
    icon: RefreshCcw,
    color: "text-amber-500 bg-amber-50 dark:bg-amber-950",
    fallback: (i) =>
      `Lead status changed${i.lead_name ? ` for ${i.lead_name}` : ""}`,
  },
  campaign_started: {
    icon: Play,
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950",
    fallback: () => "Campaign started",
  },
  campaign_paused: {
    icon: Pause,
    color: "text-orange-500 bg-orange-50 dark:bg-orange-950",
    fallback: () => "Campaign paused",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-500 bg-red-50 dark:bg-red-950",
    fallback: () => "An error occurred",
  },
};

// ─── Single activity row ───────────────────────────────────────────────────────

function ActivityRow({ item }: { item: RecentActivityItem }) {
  const config = ACTIVITY_CONFIG[item.activity_type] ?? {
    icon: Activity,
    color: "text-slate-500 bg-slate-50 dark:bg-slate-950",
    fallback: () => item.activity_type,
  };

  const Icon = config.icon;
  const text = item.description ?? config.fallback(item);

  const timestamp = (() => {
    try {
      return formatDistanceToNow(new Date(item.created_at), {
        addSuffix: true,
      });
    } catch {
      return "";
    }
  })();

  const leadHref = item.lead_id ? `/leads/${item.lead_id}` : null;

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.color}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug line-clamp-2">
          {leadHref ? (
            <>
              {text.replace(item.lead_name ?? "", "").trim()}{" "}
              <a
                href={leadHref}
                className="font-medium hover:underline text-foreground"
              >
                {item.lead_name}
              </a>
            </>
          ) : (
            text
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{timestamp}</p>
      </div>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function RecentActivity({ activities, loading }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No activity yet. Start a campaign to see events here.
            </p>
          </div>
        ) : (
          <div className="divide-y max-h-[480px] overflow-y-auto pr-1">
            {activities.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
