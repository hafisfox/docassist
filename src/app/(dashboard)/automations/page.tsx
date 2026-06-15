"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useAutomations, type Automation } from "@/hooks/useAutomations";
import { AutomationCard } from "@/components/automations/AutomationCard";
import { ExecutionsSheet } from "@/components/automations/ExecutionsSheet";
import { ParamsDialog } from "@/components/automations/ParamsDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AutomationsPage() {
  const {
    engine,
    automations,
    loading,
    error,
    refresh,
    setActive,
    runNow,
    fetchExecutions,
    fetchParams,
    updateParams,
  } = useAutomations();

  const [runsFor, setRunsFor] = useState<Automation | null>(null);
  const [paramsFor, setParamsFor] = useState<Automation | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control and monitor the v2 n8n LinkedIn workflows.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      {/* Engine ownership banner */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Execution engine:</span>
        <Badge variant={engine === "n8n" ? "default" : "secondary"}>{engine}</Badge>
        <span className="text-xs text-muted-foreground">
          {engine === "n8n"
            ? "n8n owns sends — the dashboard's local sequence executor and Unipile webhook are standing down."
            : "The dashboard's local sequence executor owns sends. Set AUTOMATION_ENGINE=n8n to hand over to n8n."}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cards */}
      {loading && automations.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              onToggle={setActive}
              onRun={runNow}
              onOpenRuns={setRunsFor}
              onOpenParams={setParamsFor}
            />
          ))}
        </div>
      )}

      {/* Drawers */}
      <ExecutionsSheet
        automation={runsFor}
        open={runsFor != null}
        onOpenChange={(open) => !open && setRunsFor(null)}
        fetchExecutions={fetchExecutions}
      />
      <ParamsDialog
        automation={paramsFor}
        open={paramsFor != null}
        onOpenChange={(open) => !open && setParamsFor(null)}
        fetchParams={fetchParams}
        updateParams={updateParams}
      />
    </div>
  );
}
