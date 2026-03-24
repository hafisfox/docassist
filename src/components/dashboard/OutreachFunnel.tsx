"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  pct: number;
}

interface OutreachFunnelProps {
  funnel: FunnelStage[];
  loading: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FUNNEL_COLORS = [
  "#94a3b8", // Total Leads — slate
  "#60a5fa", // Invited — blue
  "#38bdf8", // Accepted — sky
  "#2dd4bf", // Messaged — teal
  "#4ade80", // Replied — green
  "#34d399", // Interested — emerald
  "#fbbf24", // Meeting Booked — amber
];

// ─── Custom tooltip ────────────────────────────────────────────────────────────

interface TooltipPayload {
  value: number;
  payload: FunnelStage;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.[0]) return null;
  const { value, payload: stage } = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-semibold">{stage.label}</p>
      <p className="text-muted-foreground">
        {value.toLocaleString()} leads&nbsp;
        <span className="text-foreground font-medium">({stage.pct}%)</span>
      </p>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function OutreachFunnel({ funnel, loading }: OutreachFunnelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Outreach Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[320px] w-full animate-pulse rounded-lg bg-muted" />
        ) : funnel.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No lead data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              layout="vertical"
              data={funnel}
              margin={{ top: 4, right: 72, left: 8, bottom: 4 }}
              barCategoryGap="20%"
            >
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => <CustomTooltip {...props} />}
                cursor={{ fill: "hsl(var(--muted))", radius: 4 }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {funnel.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) =>
                    typeof v === "number" ? v.toLocaleString() : v
                  }
                  style={{ fontSize: "12px", fill: "hsl(var(--muted-foreground))" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Conversion rate row */}
        {!loading && funnel.length > 1 && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {funnel.slice(1).map((stage, i) => {
              const prev = funnel[i];
              const conv =
                prev.count > 0
                  ? Math.round((stage.count / prev.count) * 100)
                  : 0;
              return (
                <div key={stage.stage} className="flex flex-col items-center">
                  <span className="text-xs font-medium">{conv}%</span>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">
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
