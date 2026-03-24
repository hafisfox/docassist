"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TimeSeriesPoint {
  date: string;
  messages_sent: number;
  replies: number;
  reply_rate: number;
}

interface ResponseRateChartProps {
  timeSeries: TimeSeriesPoint[];
  loading: boolean;
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

interface ChartTooltipPayload {
  value: number;
  payload: TimeSeriesPoint;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-semibold mb-1">
        {label ? format(new Date(label), "MMM d, yyyy") : ""}
      </p>
      <p className="text-indigo-500 font-medium">{pt.reply_rate}% reply rate</p>
      <p className="text-muted-foreground text-xs">
        {pt.replies} replies / {pt.messages_sent} sent
      </p>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ResponseRateChart({
  timeSeries,
  loading,
}: ResponseRateChartProps) {
  const [period, setPeriod] = useState<7 | 30>(30);

  const chartData = period === 7 ? timeSeries.slice(-7) : timeSeries;

  // Max Y value for better scale
  const maxRate = Math.max(...chartData.map((d) => d.reply_rate), 10);
  const yMax = Math.ceil(maxRate / 10) * 10 + 10;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Response Rate</CardTitle>
        <CardAction>
          <div className="flex gap-1">
            <Button
              variant={period === 7 ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPeriod(7)}
            >
              7d
            </Button>
            <Button
              variant={period === 30 ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPeriod(30)}
            >
              30d
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
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
                tickFormatter={(d: string) => {
                  try {
                    return format(new Date(d), "MMM d");
                  } catch {
                    return d;
                  }
                }}
                interval={period === 30 ? 6 : 0}
              />
              <YAxis
                domain={[0, yMax]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => <CustomTooltip {...props} />}
              />
              <Line
                type="monotone"
                dataKey="reply_rate"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#6366f1" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Summary stats row */}
        {!loading && chartData.length > 0 && (
          <div className="mt-3 flex justify-around border-t pt-3">
            {(() => {
              const sent = chartData.reduce((s, d) => s + d.messages_sent, 0);
              const replies = chartData.reduce((s, d) => s + d.replies, 0);
              const avg =
                sent > 0 ? Math.round((replies / sent) * 100) : 0;
              return (
                <>
                  <div className="text-center">
                    <p className="text-lg font-bold">{sent.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{replies.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Replies</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-indigo-500">{avg}%</p>
                    <p className="text-xs text-muted-foreground">Avg Rate</p>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
