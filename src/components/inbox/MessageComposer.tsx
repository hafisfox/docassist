"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SendIcon, SparklesIcon, LayoutTemplateIcon, LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnipileChatMessage } from "@/lib/unipile/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  body: string;
  category: string;
}

// ── Template picker ───────────────────────────────────────────────────────────

interface TemplatePickerProps {
  onSelect: (body: string) => void;
}

function TemplatePicker({ onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (templates.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/templates?category=message");
      const data = await res.json();
      if (res.ok) setTemplates(data.templates ?? data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [templates.length]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) fetchTemplates();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 shrink-0")}
        title="Insert template"
      >
        <LayoutTemplateIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-0">
        <div className="flex items-center border-b px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Templates
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Loading…
            </div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No templates found
            </div>
          ) : (
            templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  onSelect(tpl.body);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-accent transition-colors"
              >
                <p className="truncate text-sm font-medium">{tpl.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {tpl.body}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MessageComposerProps {
  chatId: string;
  onSent: (message: UnipileChatMessage) => void;
}

export function MessageComposer({ chatId, onSent }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Listen for template insertion from QuickReplyBar (via custom event)
  useEffect(() => {
    const handler = (e: Event) => {
      const { body } = (e as CustomEvent<{ body: string }>).detail;
      setText(body);
      textareaRef.current?.focus();
    };
    window.addEventListener("inbox:insert-template", handler);
    return () => window.removeEventListener("inbox:insert-template", handler);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    // Optimistic message (will be replaced on re-fetch)
    const optimistic: UnipileChatMessage = {
      id: `optimistic-${Date.now()}`,
      chat_id: chatId,
      sender_provider_id: "me",
      text: trimmed,
      timestamp: new Date().toISOString(),
      is_sender: true,
    };
    onSent(optimistic);
    setText("");

    try {
      const res = await fetch("/api/linkedin/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send message");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
      // Revert optimistic message on error
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }, [chatId, text, sending, onSent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAIPersonalize = useCallback(async () => {
    const draft = text.trim();
    if (!draft || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/messages/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: draft, category: "message", chatId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "AI request failed");
      setText((data as { text: string }).text);
      toast.success("Message personalised by AI");
      textareaRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI personalization failed");
    } finally {
      setAiLoading(false);
    }
  }, [text, chatId, aiLoading]);

  const canSend = text.trim().length > 0 && !sending;

  return (
    <div className="px-4 pb-4 pt-2">
      {error && (
        <p className="mb-2 text-xs text-destructive">{error}</p>
      )}

      <div className={cn(
        "flex flex-col gap-2 rounded-xl border bg-background p-3 transition-shadow",
        "focus-within:ring-1 focus-within:ring-ring",
      )}>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message… (⌘↵ to send)"
          className="min-h-[72px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          maxLength={1900}
          disabled={sending}
        />

        <div className="flex items-center justify-between">
          {/* Left actions */}
          <div className="flex items-center gap-1">
            <TemplatePicker onSelect={(body) => { setText(body); textareaRef.current?.focus(); }} />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              title="AI Personalise"
              onClick={handleAIPersonalize}
              disabled={aiLoading || !text.trim()}
            >
              {aiLoading ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
            </Button>
          </div>

          {/* Right: char count + send */}
          <div className="flex items-center gap-2">
            {text.length > 0 && (
              <span className={cn(
                "text-[10px] tabular-nums text-muted-foreground",
                text.length > 1800 && "text-destructive",
              )}>
                {text.length}/1900
              </span>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={!canSend}
              className="h-8 gap-1.5 px-3"
            >
              <SendIcon className="size-3.5" />
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
