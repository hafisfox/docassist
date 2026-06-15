import type { ComponentProps } from "react";
import type { Badge } from "@/components/ui/badge";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

/** Map an n8n execution status to a Badge variant. */
export function executionStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "success":
      return "default";
    case "error":
    case "crashed":
      return "destructive";
    case "running":
    case "waiting":
    case "new":
      return "secondary";
    default:
      return "outline";
  }
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

export function formatDuration(start: string | null, stop: string | null): string {
  if (!start) return "—";
  if (!stop) return "running";
  const ms = new Date(stop).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return `${Math.round(sec / 60)}m ${Math.round(sec % 60)}s`;
}
