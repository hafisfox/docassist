"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { Automation } from "@/hooks/useAutomations";

interface ParamsDialogProps {
  automation: Automation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchParams: (id: string) => Promise<Record<string, number | string | null>>;
  updateParams: (
    id: string,
    params: Record<string, number | string>,
  ) => Promise<Record<string, number | string | null>>;
}

export function ParamsDialog({
  automation,
  open,
  onOpenChange,
  fetchParams,
  updateParams,
}: ParamsDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !automation) return;
    let active = true;
    setLoading(true);
    fetchParams(automation.id)
      .then((vals) => {
        if (!active) return;
        const asStrings: Record<string, string> = {};
        for (const [k, v] of Object.entries(vals)) asStrings[k] = v == null ? "" : String(v);
        setValues(asStrings);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, automation, fetchParams]);

  async function handleSave() {
    if (!automation) return;
    const payload: Record<string, number | string> = {};
    for (const param of automation.editableParams) {
      const raw = values[param.key];
      if (raw == null || raw === "") continue;
      payload[param.key] = param.kind === "jsNumber" ? Number(raw) : raw;
    }
    if (Object.keys(payload).length === 0) {
      toast.error("Nothing to update");
      return;
    }
    setSaving(true);
    try {
      await updateParams(automation.id, payload);
      toast.success("Settings saved to n8n");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Workflow settings</DialogTitle>
          <DialogDescription>
            {automation?.name} — edits are written directly to n8n.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {loading && (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          )}

          {!loading &&
            automation?.editableParams.map((param) => (
              <div key={param.key} className="flex flex-col gap-1.5">
                <Label htmlFor={param.key}>{param.label}</Label>
                <Input
                  id={param.key}
                  type={param.kind === "jsNumber" ? "number" : "text"}
                  min={param.min ?? undefined}
                  max={param.max ?? undefined}
                  value={values[param.key] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [param.key]: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">{param.description}</p>
              </div>
            ))}

          {!loading && automation?.editableParams.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This workflow has no editable settings.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
