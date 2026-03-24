"use client";

import { useState, useEffect, useCallback } from "react";
import type { CircuitBreakerStatus } from "@/lib/queue/circuitBreaker";

/** Poll the circuit breaker status every 30 seconds. */
const POLL_INTERVAL_MS = 30_000;

export interface UseCircuitBreakerReturn {
  status: CircuitBreakerStatus | null;
  loading: boolean;
  resetting: boolean;
  refetch: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useCircuitBreaker(): UseCircuitBreakerReturn {
  const [status, setStatus] = useState<CircuitBreakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/circuit-breaker/status");
      if (res.ok) {
        const data: CircuitBreakerStatus = await res.json();
        setStatus(data);
      }
    } catch {
      // Silently ignore — circuit breaker status is best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  const reset = useCallback(async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/circuit-breaker/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      if (res.ok) {
        const data: CircuitBreakerStatus = await res.json();
        setStatus(data);
      }
    } finally {
      setResetting(false);
    }
  }, []);

  return { status, loading, resetting, refetch, reset };
}
