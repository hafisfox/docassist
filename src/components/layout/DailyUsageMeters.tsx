"use client";

import { useState, useEffect, useCallback } from "react";
import type { Settings } from "@/types/database";

interface DailyUsage {
  invites_sent: number;
  invites_max: number;
  messages_sent: number;
  messages_max: number;
}

function UsageBar({
  used,
  max,
  label,
}: {
  used: number;
  max: number;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const barColor =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-yellow-500"
        : "bg-primary";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-sidebar-foreground/60">
        <span>{label}</span>
        <span className="tabular-nums font-medium">
          {used}
          <span className="opacity-60">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-accent">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Compact daily usage meters for the sidebar (invites + messages).
 * Polls /api/settings every 60 seconds for live counters.
 */
export function DailyUsageMeters() {
  const [usage, setUsage] = useState<DailyUsage | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data: Settings & {
        remaining_daily_invites: number;
        remaining_daily_messages: number;
      } = await res.json();
      setUsage({
        invites_sent: data.invites_sent_today,
        invites_max: data.max_daily_invites,
        messages_sent: data.messages_sent_today,
        messages_max: data.max_daily_messages,
      });
    } catch {
      // Best-effort — sidebar meter is non-critical
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  if (!usage) return null;

  return (
    <div className="space-y-2.5 px-3 pb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
        Today&apos;s Usage
      </p>
      <UsageBar
        used={usage.invites_sent}
        max={usage.invites_max}
        label="Invites"
      />
      <UsageBar
        used={usage.messages_sent}
        max={usage.messages_max}
        label="Messages"
      />
    </div>
  );
}
