"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCircuitBreaker } from "@/hooks/useCircuitBreaker";
import { toast } from "sonner";

/**
 * Renders a dismissible alert banner when the Unipile circuit breaker is OPEN
 * or in HALF_OPEN state. Shown at the top of the main content area.
 */
export function CircuitBreakerBanner() {
  const { status, resetting, reset } = useCircuitBreaker();

  if (!status || status.state === "CLOSED") return null;

  const isOpen = status.state === "OPEN";
  const isHalfOpen = status.state === "HALF_OPEN";

  async function handleReset() {
    await reset();
    toast.success("Circuit breaker reset — outreach will resume on the next run");
  }

  return (
    <div
      className={`flex items-start gap-3 border-b px-4 py-3 text-sm ${
        isOpen
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          : "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300"
      }`}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />

      <div className="flex-1 space-y-0.5">
        <p className="font-semibold">
          {isOpen
            ? "Unipile API circuit breaker is OPEN — all outreach paused"
            : "Circuit breaker is testing recovery (HALF_OPEN)"}
        </p>
        <p className="text-xs opacity-80">
          {isOpen && status.failures > 0 && (
            <>
              {status.failures} consecutive{" "}
              {status.failures === 1 ? "failure" : "failures"} detected.{" "}
            </>
          )}
          {isOpen && status.nextRetryAt && (
            <>
              Auto-recovery test at{" "}
              {new Date(status.nextRetryAt).toLocaleTimeString()}.{" "}
            </>
          )}
          {isHalfOpen && "A test call is in progress to verify the API is back."}
          {" "}
          <a
            href="/dashboard/settings"
            className="underline underline-offset-2 hover:opacity-70"
          >
            View details in Settings
          </a>
        </p>
      </div>

      {isOpen && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-red-300 bg-transparent hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
          onClick={handleReset}
          disabled={resetting}
        >
          <RefreshCw className={`size-3.5 ${resetting ? "animate-spin" : ""}`} />
          {resetting ? "Resetting…" : "Reset Now"}
        </Button>
      )}
    </div>
  );
}
