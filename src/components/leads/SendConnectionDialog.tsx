"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { UserPlusIcon, LoaderCircleIcon, AlertCircleIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Lead, Template } from "@/types/database";

interface SendConnectionDialogProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful send so the parent can react (e.g. update remaining count) */
  onSuccess?: (remainingInvites: number) => void;
}

interface SettingsSummary {
  remaining_daily_invites: number;
  max_daily_invites: number;
}

/** Replace {{variable}} placeholders in a template body with lead field values. */
function interpolate(body: string, lead: Lead): string {
  const vars: Record<string, string> = {
    first_name: lead.first_name,
    last_name: lead.last_name,
    full_name: lead.full_name,
    job_title: lead.job_title ?? "",
    company: lead.company ?? "",
    location: lead.location ?? "",
    city: lead.city ?? "",
    country: lead.country ?? "",
    specialty: lead.specialty ?? "",
    headline: lead.headline ?? "",
  };
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  );
}

const STATUS_ALREADY_SENT: Lead["status"][] = ["invite_sent", "invite_accepted"];

export function SendConnectionDialog({
  lead,
  open,
  onOpenChange,
  onSuccess,
}: SendConnectionDialogProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("none");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<SettingsSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [settingsRes, templatesRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/templates?category=connection_request"),
      ]);

      if (settingsRes.ok) {
        const data: SettingsSummary = await settingsRes.json();
        setSettings(data);
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates((data.templates as Template[]) ?? []);
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Refresh data and reset form each time the dialog opens
  useEffect(() => {
    if (open) {
      fetchData();
      setMessage("");
      setSelectedTemplateId("none");
    }
  }, [open, fetchData]);

  function handleTemplateSelect(id: string | null) {
    const value = id ?? "none";
    setSelectedTemplateId(value);
    if (value === "none") {
      setMessage("");
      return;
    }
    const tpl = templates.find((t) => t.id === value);
    if (tpl) setMessage(interpolate(tpl.body, lead));
  }

  const charCount = message.length;
  const isOverLimit = charCount > 300;
  const limitReached = settings !== null && settings.remaining_daily_invites <= 0;
  const alreadySent = STATUS_ALREADY_SENT.includes(lead.status);
  const doNotContact = lead.status === "do_not_contact";

  const canSend =
    !sending &&
    !isOverLimit &&
    !limitReached &&
    !alreadySent &&
    !doNotContact;

  async function handleAIPersonalize() {
    if (!message.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/messages/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: message,
          category: "connection_request",
          leadId: lead.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "AI request failed");
      setMessage((data as { text: string }).text);
      toast.success("Message personalised by AI");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI personalization failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch("/api/linkedin/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to send connection request",
        );
      }

      const remaining: number = (data as { remaining_daily_invites: number }).remaining_daily_invites;
      setSettings((prev) =>
        prev ? { ...prev, remaining_daily_invites: remaining } : prev,
      );
      onSuccess?.(remaining);
      toast.success("Connection request sent!");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send connection request",
      );
    } finally {
      setSending(false);
    }
  }

  // Personalization preview (only when a template is selected)
  const showPreview = selectedTemplateId !== "none" && message.length > 0;
  const preview = showPreview ? interpolate(message, lead) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Connection Request</DialogTitle>
          <DialogDescription>
            Send a LinkedIn connection request to{" "}
            <span className="font-medium text-foreground">{lead.full_name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Rate limit banner ─────────────────────────────────────── */}
          {settings !== null && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                limitReached
                  ? "bg-destructive/10 text-destructive"
                  : settings.remaining_daily_invites <= 5
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {limitReached && (
                <AlertCircleIcon className="size-4 shrink-0" />
              )}
              <span>
                {limitReached
                  ? "Daily limit reached — try again tomorrow"
                  : `${settings.remaining_daily_invites} of ${settings.max_daily_invites} connection requests remaining today`}
              </span>
            </div>
          )}

          {/* ── Status warnings ───────────────────────────────────────── */}
          {alreadySent && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertCircleIcon className="size-4 shrink-0" />
              <span>
                {lead.status === "invite_accepted"
                  ? "This lead already accepted your connection request."
                  : "A connection request was already sent to this lead."}
              </span>
            </div>
          )}

          {doNotContact && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircleIcon className="size-4 shrink-0" />
              <span>This lead is marked as &ldquo;Do Not Contact&rdquo;.</span>
            </div>
          )}

          {/* ── Template selector ─────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-template">Template (optional)</Label>
            {loadingData ? (
              <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                Loading…
              </div>
            ) : (
              <Select
                value={selectedTemplateId}
                onValueChange={handleTemplateSelect}
              >
                <SelectTrigger id="cr-template">
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Message textarea ──────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cr-message">Note (optional)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleAIPersonalize}
                  disabled={aiLoading || !message.trim()}
                  title="Personalise with AI"
                >
                  {aiLoading ? (
                    <LoaderCircleIcon className="size-3 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-3" />
                  )}
                  {aiLoading ? "Writing…" : "AI Personalise"}
                </Button>
                <span
                  className={`text-xs tabular-nums ${
                    isOverLimit
                      ? "font-semibold text-destructive"
                      : charCount > 270
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {charCount}/300
                </span>
              </div>
            </div>
            <Textarea
              id="cr-message"
              placeholder="Add a personal note to your connection request…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[96px] text-sm"
            />
            {isOverLimit && (
              <p className="text-xs text-destructive">
                Exceeds LinkedIn&apos;s 300-character limit.
              </p>
            )}
          </div>

          {/* ── Personalization preview ───────────────────────────────── */}
          {showPreview && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview — {lead.first_name}&apos;s data applied
              </Label>
              <div className="rounded-md bg-muted px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button disabled={!canSend} onClick={handleSend}>
            {sending ? (
              <LoaderCircleIcon className="mr-1.5 size-4 animate-spin" />
            ) : (
              <UserPlusIcon className="mr-1.5 size-4" />
            )}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
