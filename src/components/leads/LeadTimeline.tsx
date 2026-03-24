"use client";

import { formatDistanceToNow, format } from "date-fns";
import {
  UserPlusIcon,
  UserCheckIcon,
  SendIcon,
  InboxIcon,
  SparklesIcon,
  CircleAlertIcon,
  PlayIcon,
  PauseIcon,
  ClockIcon,
  ArrowRightLeftIcon,
  MessageSquareIcon,
  PlusCircleIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Activity, Message, ActivityType, MessageDirection } from "@/types/database";

interface LeadTimelineProps {
  activities: Activity[];
  messages: Message[];
  loading: boolean;
}

type TimelineEntry =
  | { kind: "activity"; data: Activity; timestamp: string }
  | { kind: "message"; data: Message; timestamp: string };

const activityIcons: Record<ActivityType, typeof UserPlusIcon> = {
  lead_created: PlusCircleIcon,
  lead_enriched: SparklesIcon,
  invite_sent: UserPlusIcon,
  invite_accepted: UserCheckIcon,
  invite_expired: ClockIcon,
  message_sent: SendIcon,
  message_received: InboxIcon,
  reply_detected: MessageSquareIcon,
  status_changed: ArrowRightLeftIcon,
  campaign_started: PlayIcon,
  campaign_paused: PauseIcon,
  error: CircleAlertIcon,
};

const activityColors: Record<ActivityType, string> = {
  lead_created: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  lead_enriched: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400",
  invite_sent: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400",
  invite_accepted: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
  invite_expired: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  message_sent: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
  message_received: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
  reply_detected: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
  status_changed: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
  campaign_started: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
  campaign_paused: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400",
  error: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

const activityLabels: Record<ActivityType, string> = {
  lead_created: "Lead Created",
  lead_enriched: "Profile Enriched",
  invite_sent: "Invitation Sent",
  invite_accepted: "Invitation Accepted",
  invite_expired: "Invitation Expired",
  message_sent: "Message Sent",
  message_received: "Message Received",
  reply_detected: "Reply Detected",
  status_changed: "Status Changed",
  campaign_started: "Campaign Started",
  campaign_paused: "Campaign Paused",
  error: "Error",
};

const messageDirectionConfig: Record<
  MessageDirection,
  { icon: typeof SendIcon; color: string; label: string }
> = {
  outbound: {
    icon: SendIcon,
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
    label: "Sent",
  },
  inbound: {
    icon: InboxIcon,
    color: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
    label: "Received",
  },
};

function mergeTimeline(activities: Activity[], messages: Message[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...activities.map(
      (a): TimelineEntry => ({ kind: "activity", data: a, timestamp: a.created_at }),
    ),
    ...messages.map(
      (m): TimelineEntry => ({ kind: "message", data: m, timestamp: m.created_at }),
    ),
  ];

  entries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return entries;
}

function TimelineSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LeadTimeline({ activities, messages, loading }: LeadTimelineProps) {
  if (loading) {
    return <TimelineSkeleton />;
  }

  const entries = mergeTimeline(activities, messages);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No activity yet for this lead.
          </p>
        ) : (
          <div className="relative space-y-0">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            {entries.map((entry, index) => {
              if (entry.kind === "activity") {
                const activity = entry.data;
                const Icon = activityIcons[activity.activity_type] ?? CircleAlertIcon;
                const color = activityColors[activity.activity_type] ?? activityColors.error;
                const label = activityLabels[activity.activity_type] ?? activity.activity_type;

                return (
                  <div key={`a-${activity.id}`} className="relative flex gap-3 pb-6 last:pb-0">
                    <div
                      className={cn(
                        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                        color,
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <p className="text-sm font-medium">{label}</p>
                      {activity.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {activity.description}
                        </p>
                      )}
                      <time
                        className="mt-1 block text-xs text-muted-foreground"
                        title={format(new Date(activity.created_at), "PPpp")}
                      >
                        {formatDistanceToNow(new Date(activity.created_at), {
                          addSuffix: true,
                        })}
                      </time>
                    </div>
                  </div>
                );
              }

              // Message entry
              const message = entry.data;
              const dirConfig = messageDirectionConfig[message.direction];
              const DirIcon = dirConfig.icon;

              return (
                <div key={`m-${message.id}`} className="relative flex gap-3 pb-6 last:pb-0">
                  <div
                    className={cn(
                      "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                      dirConfig.color,
                    )}
                  >
                    <DirIcon className="size-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm font-medium">
                      Message {dirConfig.label}
                    </p>
                    <div className="mt-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
                      {message.message_text}
                    </div>
                    <time
                      className="mt-1 block text-xs text-muted-foreground"
                      title={format(new Date(message.created_at), "PPpp")}
                    >
                      {formatDistanceToNow(new Date(message.created_at), {
                        addSuffix: true,
                      })}
                    </time>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { LeadTimeline };
