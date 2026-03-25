"use client";

import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnipileChat } from "@/lib/unipile/types";
import type { InboxFilter } from "@/hooks/useInbox";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ConversationItemProps {
  chat: UnipileChat;
  isSelected: boolean;
  isUnread: boolean;
  isInterested: boolean;
  onClick: () => void;
}

function ConversationItem({
  chat,
  isSelected,
  isUnread,
  isInterested,
  onClick,
}: ConversationItemProps) {
  // Use first non-self attendee as the "other" person (or just first attendee)
  const other = chat.attendees[0];
  const displayName = other?.display_name ?? "Unknown";
  const avatarUrl = other?.profile_picture_url ?? null;
  const lastMsg = chat.last_message;
  const preview = lastMsg
    ? (lastMsg.is_sender ? `You: ${lastMsg.text}` : lastMsg.text)
    : "No messages yet";
  const timestamp = chat.last_message?.timestamp ?? chat.updated_at;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
        isSelected && "bg-accent",
      )}
    >
      {/* Avatar */}
      <div className="relative mt-0.5 shrink-0">
        <Avatar>
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        </Avatar>
        {isUnread && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              isUnread ? "font-semibold" : "font-medium",
            )}
          >
            {displayName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-xs",
              isUnread ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {preview}
          </p>
          {isInterested && (
            <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
              Interested
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function ConversationSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Skeleton className="mt-0.5 size-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
];

interface ConversationListProps {
  chats: UnipileChat[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  selectedChatId: string | null;
  viewedChatIds: Set<string>;
  interestedChatIds: Set<string>;
  search: string;
  filter: InboxFilter;
  unreadCount: number;
  onSelectChat: (chatId: string) => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: InboxFilter) => void;
  onSync: () => void;
}

export function ConversationList({
  chats,
  loading,
  syncing,
  error,
  selectedChatId,
  viewedChatIds,
  interestedChatIds,
  search,
  filter,
  unreadCount,
  onSelectChat,
  onSearchChange,
  onFilterChange,
  onSync,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col border-r">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Inbox</h2>
          {unreadCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {unreadCount} unread
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSync}
          disabled={syncing || loading}
          title="Sync inbox"
          className="size-7"
        >
          <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin")} />
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <Select value={filter} onValueChange={(v) => onFilterChange(v as InboxFilter)}>
          <SelectTrigger className="w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 py-3 text-xs text-destructive">{error}</div>
        )}

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <ConversationSkeleton key={i} />)
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {search || filter !== "all" ? "No conversations match" : "No conversations yet"}
            </p>
            {(search || filter !== "all") && (
              <p className="mt-1 text-xs text-muted-foreground">
                Try adjusting your search or filter
              </p>
            )}
          </div>
        ) : (
          chats.map((chat) => {
            const isUnread =
              chat.last_message != null &&
              !chat.last_message.is_sender &&
              !viewedChatIds.has(chat.id);
            return (
              <ConversationItem
                key={chat.id}
                chat={chat}
                isSelected={selectedChatId === chat.id}
                isUnread={isUnread}
                isInterested={interestedChatIds.has(chat.id)}
                onClick={() => onSelectChat(chat.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
