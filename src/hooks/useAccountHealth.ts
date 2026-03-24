"use client";

import { useState, useEffect, useCallback } from "react";
import type { HealthResponse } from "@/app/api/health/route";

const POLL_INTERVAL_MS = 60_000;

export interface UseAccountHealthReturn {
  health: HealthResponse | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useAccountHealth(): UseAccountHealthReturn {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      // Accept both 200 (healthy/degraded) and 503 (unhealthy) as valid responses
      if (res.ok || res.status === 503) {
        const data: HealthResponse = await res.json();
        setHealth(data);
      }
    } catch {
      // Best-effort — silently ignore network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  return { health, loading, refetch };
}
