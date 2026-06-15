"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, History, Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Automation } from "@/hooks/useAutomations";
import { executionStatusVariant, formatRelative } from "./status";

interface AutomationCardProps {
  automation: Automation;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onRun: (id: string) => Promise<void>;
  onOpenRuns: (automation: Automation) => void;
  onOpenParams: (automation: Automation) => void;
}

export function AutomationCard({
  automation,
  onToggle,
  onRun,
  onOpenRuns,
  onOpenParams,
}: AutomationCardProps) {
  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(automation.id, !automation.active);
      toast.success(`${automation.name} ${!automation.active ? "activated" : "deactivated"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle workflow");
    } finally {
      setToggling(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    try {
      await onRun(automation.id);
      toast.success(`${automation.name} run triggered`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trigger run");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{automation.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {automation.description}
          </p>
        </div>
        <Badge variant={automation.active ? "default" : "outline"} className="shrink-0">
          {automation.active ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Last run */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Last run:</span>
        {automation.lastExecution ? (
          <>
            <Badge
              variant={executionStatusVariant(automation.lastExecution.status)}
              className="capitalize"
            >
              {automation.lastExecution.status}
            </Badge>
            <span>{formatRelative(automation.lastExecution.startedAt)}</span>
          </>
        ) : (
          <span>never</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={automation.active ? "outline" : "default"}
          onClick={handleToggle}
          disabled={toggling || !automation.exists}
        >
          {toggling && <Loader2 className="size-3.5 animate-spin" />}
          {automation.active ? "Deactivate" : "Activate"}
        </Button>

        {automation.runnable && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRun}
            disabled={running || !automation.active}
            title={!automation.active ? "Activate the workflow first" : "Run now"}
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run now
          </Button>
        )}

        <Button size="sm" variant="ghost" onClick={() => onOpenRuns(automation)}>
          <History className="size-3.5" />
          Runs
        </Button>

        {automation.editableParams.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onOpenParams(automation)}>
            <Settings2 className="size-3.5" />
            Settings
          </Button>
        )}
      </div>
    </Card>
  );
}
