"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { KPICards } from "@/components/dashboard/KPICards";
import { OutreachFunnel } from "@/components/dashboard/OutreachFunnel";
import { ResponseRateChart } from "@/components/dashboard/ResponseRateChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ActivityType } from "@/types/database";

// Inline types mirror src/app/api/analytics/route.ts exports
interface AnalyticsResponse {
  kpis: {
    total_leads: number;
    total_leads_trend: number;
    invites_sent_today: number;
    max_daily_invites: number;
    reply_rate: number;
    replied_count: number;
    meetings_booked: number;
  };
  funnel: Array<{ stage: string; label: string; count: number; pct: number }>;
  time_series: Array<{
    date: string;
    messages_sent: number;
    replies: number;
    reply_rate: number;
  }>;
  recent_activities: Array<{
    id: string;
    activity_type: ActivityType;
    description: string | null;
    created_at: string;
    lead_id: string | null;
    lead_name: string | null;
    lead_profile_url: string | null;
    campaign_id: string | null;
    metadata: Record<string, unknown>;
  }>;
}

function DashboardContent() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Request failed (${res.status})`
        );
      }
      const json: AnalyticsResponse = await res.json();
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load analytics";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            LinkedIn outreach performance overview
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAnalytics}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <ErrorState
          title="Failed to load analytics"
          message={error}
          onRetry={fetchAnalytics}
        />
      )}

      {/* KPI cards */}
      <KPICards kpis={data?.kpis ?? null} loading={loading} />

      {/* Funnel + Response Rate */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <OutreachFunnel funnel={data?.funnel ?? []} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <ResponseRateChart
            timeSeries={data?.time_series ?? []}
            loading={loading}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <RecentActivity
        activities={data?.recent_activities ?? []}
        loading={loading}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ErrorBoundary section="Dashboard">
      <DashboardContent />
    </ErrorBoundary>
  );
}
