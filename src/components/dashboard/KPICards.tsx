"use client";

import {
  Users,
  Send,
  MessageSquare,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIs {
  total_leads: number;
  total_leads_trend: number;
  invites_sent_today: number;
  max_daily_invites: number;
  reply_rate: number;
  replied_count: number;
  meetings_booked: number;
}

interface KPICardsProps {
  kpis: KPIs | null;
  loading: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function TrendBadge({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" />
        +{value}% vs last 30d
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-500">
        <TrendingDown className="h-3 w-3" />
        {value}% vs last 30d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" />
      No change vs last 30d
    </span>
  );
}

function ReplyRateColor({ rate }: { rate: number }) {
  if (rate >= 15) return "text-emerald-600";
  if (rate >= 5) return "text-amber-500";
  return "text-red-500";
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function KPISkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <CardAction>
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="h-8 w-20 animate-pulse rounded bg-muted mb-1" />
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function KPICards({ kpis, loading }: KPICardsProps) {
  if (loading || !kpis) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KPISkeleton />
        <KPISkeleton />
        <KPISkeleton />
        <KPISkeleton />
      </div>
    );
  }

  const inviteProgress = Math.min(
    100,
    kpis.max_daily_invites > 0
      ? Math.round((kpis.invites_sent_today / kpis.max_daily_invites) * 100)
      : 0
  );

  const rateColorClass = ReplyRateColor({ rate: kpis.reply_rate });

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {/* Total Leads */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          <CardAction>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {kpis.total_leads.toLocaleString()}
          </div>
          <div className="mt-1">
            <TrendBadge value={kpis.total_leads_trend} />
          </div>
        </CardContent>
      </Card>

      {/* Invites Sent Today */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Invites Today</CardTitle>
          <CardAction>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {kpis.invites_sent_today}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              / {kpis.max_daily_invites}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${inviteProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {kpis.max_daily_invites - kpis.invites_sent_today} remaining today
          </p>
        </CardContent>
      </Card>

      {/* Reply Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
          <CardAction>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${rateColorClass}`}>
            {kpis.reply_rate}%
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {kpis.replied_count.toLocaleString()} replies received
          </p>
        </CardContent>
      </Card>

      {/* Meetings Booked */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Meetings Booked</CardTitle>
          <CardAction>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {kpis.meetings_booked.toLocaleString()}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Total meetings scheduled
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
