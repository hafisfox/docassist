"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { format } from "date-fns";
import { RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAnalytics } from "@/hooks/useAnalytics";
import type {
  FunnelStage,
  DailyActivityPoint,
  CampaignStat,
  TemplateStat,
  ResponseTimeBucket,
} from "@/app/api/analytics/route";

// ─── Colour palette ────────────────────────────────────────────────────────────

const FUNNEL_COLORS = [
  "#94a3b8",
  "#60a5fa",
  "#38bdf8",
  "#2dd4bf",
  "#4ade80",
  "#34d399",
  "#fbbf24",
];

// ─── Utility ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  try {
    return format(new Date(d), "MMM d");
  } catch {
    return d;
  }
}

function RateBadge({ value }: { value: number }) {
  const color =
    value >= 30
      ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950"
      : value >= 15
        ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950"
        : "text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-800";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}
    >
      {value}%
    </span>
  );
}

// ─── Outreach Funnel ───────────────────────────────────────────────────────────

interface FunnelTooltipPayload {
  value: number;
  payload: FunnelStage;
}

function FunnelTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: FunnelTooltipPayload[];
}) {
  if (!active || !payload?.[0]) return null;
  const { value, payload: stage } = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-semibold">{stage.label}</p>
      <p className="text-muted-foreground">
        {value.toLocaleString()} leads&nbsp;
        <span className="font-medium text-foreground">({stage.pct}%)</span>
      </p>
    </div>
  );
}

function FunnelSection({
  funnel,
  loading,
}: {
  funnel: FunnelStage[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Outreach Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[420px] w-full animate-pulse rounded-lg bg-muted" />
        ) : funnel.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
            No lead data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart
              layout="vertical"
              data={funnel}
              margin={{ top: 4, right: 80, left: 8, bottom: 4 }}
              barCategoryGap="18%"
            >
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis
                type="category"
                dataKey="label"
                width={128}
                tick={{ fontSize: 13 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => <FunnelTooltip {...props} />}
                cursor={{ fill: "hsl(var(--muted))", radius: 4 }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {funnel.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) =>
                    typeof v === "number" ? v.toLocaleString() : v
                  }
                  style={{
                    fontSize: "12px",
                    fill: "hsl(var(--muted-foreground))",
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {!loading && funnel.length > 1 && (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-center sm:grid-cols-6">
            {funnel.slice(1).map((stage, i) => {
              const prev = funnel[i];
              const conv =
                prev.count > 0
                  ? Math.round((stage.count / prev.count) * 100)
                  : 0;
              return (
                <div key={stage.stage} className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-semibold">{conv}%</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">
                    {prev.label.split(" ")[0]} → {stage.label.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Daily Activity stacked bar ────────────────────────────────────────────────

interface DailyActivityTooltipPayload {
  value: number;
  name: string;
  color: string;
  payload: DailyActivityPoint;
}

function DailyActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: DailyActivityTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm min-w-[140px]">
      <p className="font-semibold mb-1.5">
        {label ? fmtDate(label) : ""}
      </p>
      <p className="flex justify-between gap-4 text-blue-500">
        <span>Invites Sent</span>
        <span className="font-medium">{pt.invites_sent}</span>
      </p>
      <p className="flex justify-between gap-4 text-indigo-500">
        <span>Messages Sent</span>
        <span className="font-medium">{pt.messages_sent}</span>
      </p>
      <p className="flex justify-between gap-4 text-green-500">
        <span>Replies</span>
        <span className="font-medium">{pt.replies}</span>
      </p>
    </div>
  );
}

function DailyActivitySection({
  data,
  loading,
}: {
  data: DailyActivityPoint[];
  loading: boolean;
}) {
  const interval =
    data.length <= 7 ? 0 : data.length <= 30 ? 5 : 13;

  const totals = data.reduce(
    (acc, d) => ({
      invites: acc.invites + d.invites_sent,
      messages: acc.messages + d.messages_sent,
      replies: acc.replies + d.replies,
    }),
    { invites: 0, messages: 0, replies: 0 }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data}
              margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              barCategoryGap="30%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtDate}
                interval={interval}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => <DailyActivityTooltip {...props} />}
              />
              <Legend
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
              />
              <Bar
                dataKey="invites_sent"
                stackId="a"
                fill="#60a5fa"
                name="Invites Sent"
              />
              <Bar
                dataKey="messages_sent"
                stackId="a"
                fill="#818cf8"
                name="Messages Sent"
              />
              <Bar
                dataKey="replies"
                stackId="a"
                fill="#4ade80"
                name="Replies"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}

        {!loading && (
          <div className="mt-3 flex justify-around border-t pt-3">
            <div className="text-center">
              <p className="text-lg font-bold text-blue-500">
                {totals.invites.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Invites Sent</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-indigo-500">
                {totals.messages.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Messages Sent</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-500">
                {totals.replies.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Replies</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Campaign comparison table ─────────────────────────────────────────────────

function CampaignTable({
  campaigns,
  loading,
}: {
  campaigns: CampaignStat[];
  loading: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Campaign Comparison</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="h-48 m-6 animate-pulse rounded-lg bg-muted" />
        ) : campaigns.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No campaigns yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <th className="px-6 py-3">Campaign</th>
                  <th className="px-4 py-3 text-right">Leads</th>
                  <th className="px-4 py-3 text-right">Invites</th>
                  <th className="px-4 py-3 text-right">Acceptance</th>
                  <th className="px-4 py-3 text-right">Reply Rate</th>
                  <th className="px-4 py-3 text-right">Meetings</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-6 py-3 font-medium max-w-[200px] truncate">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.leads.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.invites.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RateBadge value={c.acceptance_rate} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RateBadge value={c.reply_rate} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                      {c.meetings.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Top performing templates table ───────────────────────────────────────────

function TemplateTable({
  templates,
  loading,
}: {
  templates: TemplateStat[];
  loading: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Top Performing Templates</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="h-48 m-6 animate-pulse rounded-lg bg-muted" />
        ) : templates.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No template data yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <th className="px-6 py-3">Template</th>
                  <th className="px-4 py-3 text-right">Used</th>
                  <th className="px-4 py-3 text-right">Reply Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {templates.map((t, i) => (
                  <tr
                    key={t.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">
                          {i + 1}.
                        </span>
                        <span className="font-medium max-w-[200px] truncate">
                          {t.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {t.times_used.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RateBadge value={t.reply_rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Response time distribution histogram ─────────────────────────────────────

interface BucketTooltipPayload {
  value: number;
  payload: ResponseTimeBucket;
}

function BucketTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: BucketTooltipPayload[];
}) {
  if (!active || !payload?.[0]) return null;
  const { value, payload: b } = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-semibold">{b.label}</p>
      <p className="text-muted-foreground">
        {value.toLocaleString()} response{value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function ResponseTimeSection({
  buckets,
  loading,
}: {
  buckets: ResponseTimeBucket[];
  loading: boolean;
}) {
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Response Time Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[240px] w-full animate-pulse rounded-lg bg-muted" />
        ) : total === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            No reply data in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={buckets}
              margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
              barCategoryGap="25%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => <BucketTooltip {...props} />}
                cursor={{ fill: "hsl(var(--muted))", radius: 4 }}
              />
              <Bar dataKey="count" fill="#2dd4bf" radius={[4, 4, 0, 0]}>
                {buckets.map((b, i) => {
                  const intensity = total > 0 ? b.count / total : 0;
                  const opacity = 0.4 + intensity * 0.6;
                  return (
                    <Cell
                      key={`rt-${i}`}
                      fill="#2dd4bf"
                      fillOpacity={opacity}
                    />
                  );
                })}
                <LabelList
                  dataKey="count"
                  position="top"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => (v > 0 ? v : "")}
                  style={{
                    fontSize: "11px",
                    fill: "hsl(var(--muted-foreground))",
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {!loading && total > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {total.toLocaleString()} total replies measured
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Date range picker ─────────────────────────────────────────────────────────

const PRESET_RANGES = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "Custom", value: "custom" },
] as const;

// ─── Page ──────────────────────────────────────────────────────────────────────

function AnalyticsContent() {
  const {
    data,
    loading,
    error,
    range,
    setRange,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    applyCustomRange,
    refetch,
  } = useAnalytics();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Outreach performance deep-dive
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset range buttons */}
          <div className="flex gap-1 rounded-lg border p-1">
            {PRESET_RANGES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {range === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="To date"
              />
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo || loading}
              >
                Apply
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={loading}
            className="gap-1.5 h-8"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <ErrorState
          title="Failed to load analytics"
          message={error}
          onRetry={refetch}
        />
      )}

      {/* Outreach Funnel — full width, taller */}
      <FunnelSection funnel={data?.funnel ?? []} loading={loading} />

      {/* Daily Activity stacked bar */}
      <DailyActivitySection
        data={data?.daily_activity ?? []}
        loading={loading}
      />

      {/* Campaign + Template tables */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CampaignTable
          campaigns={data?.campaign_stats ?? []}
          loading={loading}
        />
        <TemplateTable
          templates={data?.template_stats ?? []}
          loading={loading}
        />
      </div>

      {/* Response Time Distribution histogram */}
      <ResponseTimeSection
        buckets={data?.response_time_buckets ?? []}
        loading={loading}
      />
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <ErrorBoundary section="Analytics">
      <AnalyticsContent />
    </ErrorBoundary>
  );
}
