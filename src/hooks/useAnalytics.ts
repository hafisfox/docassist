"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalyticsResponse } from "@/app/api/analytics/route";

export type { AnalyticsResponse };
export type DateRange = "7d" | "30d" | "90d" | "custom";

interface UseAnalyticsReturn {
  data: AnalyticsResponse | null;
  loading: boolean;
  error: string | null;
  range: DateRange;
  setRange: (r: DateRange) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  applyCustomRange: () => void;
  refetch: () => void;
}

async function fetchAnalytics(
  range: DateRange,
  customFrom: string,
  customTo: string
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams();
  if (range === "custom") {
    if (customFrom) params.set("from", customFrom);
    if (customTo) params.set("to", customTo);
  } else {
    params.set("days", range.replace("d", ""));
  }

  const res = await fetch(`/api/analytics?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<AnalyticsResponse>;
}

export function useAnalytics(): UseAnalyticsReturn {
  const [range, setRangeState] = useState<DateRange>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (r: DateRange, from: string, to: string) => {
      if (r === "custom" && (!from || !to)) return;
      setLoading(true);
      setError(null);
      try {
        const json = await fetchAnalytics(r, from, to);
        setData(json);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load analytics"
        );
      } finally {
        setLoading(false);
      }
    },
    [] // stable — all inputs passed explicitly
  );

  // Auto-fetch on mount and when a preset range changes
  useEffect(() => {
    if (range !== "custom") void load(range, "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const setRange = useCallback((r: DateRange) => {
    setRangeState(r);
  }, []);

  const applyCustomRange = useCallback(() => {
    void load("custom", customFrom, customTo);
  }, [load, customFrom, customTo]);

  const refetch = useCallback(() => {
    void load(range, customFrom, customTo);
  }, [load, range, customFrom, customTo]);

  return {
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
  };
}
