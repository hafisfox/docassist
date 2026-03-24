"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ThumbsUpIcon,
  ThumbsDownIcon,
  CalendarCheckIcon,
  LayoutTemplateIcon,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  body: string;
}

export type QuickAction = "interested" | "not_interested" | "book_meeting";

// ── Follow-up template picker ─────────────────────────────────────────────────

interface FollowUpPickerProps {
  onSelect: (body: string) => void;
}

function FollowUpPicker({ onSelect }: FollowUpPickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (templates.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/templates?category=follow_up");
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
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
        >
          <LayoutTemplateIcon className="size-3.5" />
          Send Follow-up Template
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-0">
        <div className="flex items-center border-b px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Follow-up Templates
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No follow-up templates found
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
                className="w-full px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <p className="truncate text-sm font-medium">{tpl.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tpl.body}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface QuickReplyBarProps {
  chatId: string;
  isInterested: boolean;
  onToggleInterested: () => void;
  onInsertTemplate: (body: string) => void;
}

export function QuickReplyBar({
  isInterested,
  onToggleInterested,
  onInsertTemplate,
}: QuickReplyBarProps) {
  const handleBookMeeting = () => {
    // Insert a calendar booking message template
    const calLink = "https://calendly.com/doctorassist";
    onInsertTemplate(
      `Thank you for your interest! I'd love to schedule a quick demo of DoctorAssist.AI. You can book a 20-minute slot that works for you here: ${calLink}`,
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <Button
        type="button"
        variant={isInterested ? "default" : "outline"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={onToggleInterested}
      >
        <ThumbsUpIcon className="size-3.5" />
        {isInterested ? "Interested" : "Mark Interested"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={onToggleInterested}
        disabled={isInterested}
      >
        <ThumbsDownIcon className="size-3.5" />
        Mark Not Interested
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={handleBookMeeting}
      >
        <CalendarCheckIcon className="size-3.5" />
        Book Meeting
      </Button>

      <FollowUpPicker onSelect={onInsertTemplate} />
    </div>
  );
}
