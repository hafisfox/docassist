"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Automation, AutomationExecution } from "@/hooks/useAutomations";
import { executionStatusVariant, formatRelative, formatDuration } from "./status";

interface ExecutionsSheetProps {
  automation: Automation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchExecutions: (id: string, limit?: number) => Promise<AutomationExecution[]>;
}

export function ExecutionsSheet({
  automation,
  open,
  onOpenChange,
  fetchExecutions,
}: ExecutionsSheetProps) {
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !automation) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-open
    setLoading(true);
    setError(null);
    fetchExecutions(automation.id, 25)
      .then((execs) => active && setExecutions(execs))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Failed to load runs"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, automation, fetchExecutions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Recent runs</SheetTitle>
          <SheetDescription>{automation?.name}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-6">
          {loading && (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          )}

          {!loading && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && executions.length === 0 && (
            <p className="text-sm text-muted-foreground">No executions yet.</p>
          )}

          {!loading &&
            !error &&
            executions.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{formatRelative(e.startedAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.mode ?? "—"} · {formatDuration(e.startedAt, e.stoppedAt)}
                  </p>
                </div>
                <Badge variant={executionStatusVariant(e.status)} className="shrink-0 capitalize">
                  {e.status}
                </Badge>
              </div>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
