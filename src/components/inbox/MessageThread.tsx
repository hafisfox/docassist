"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { UnipileChat, UnipileChatMessage } from "@/lib/unipile/types";
import type { Message } from "@/types/database";
import { MessageComposer } from "./MessageComposer";
import { QuickReplyBar } from "./QuickReplyBar";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: UnipileChatMessage;
  otherName: string;
  otherAvatarUrl: string | null;
}

function MessageBubble({ message, otherName, otherAvatarUrl }: MessageBubbleProps) {
  const isOutbound = message.is_sender;

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isOutbound ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar — only for inbound */}
      {!isOutbound && (
        <Avatar className="size-7 shrink-0 self-end">
          {otherAvatarUrl && <AvatarImage src={otherAvatarUrl} alt={otherName} />}
          <AvatarFallback className="text-[10px]">{getInitials(otherName)}</AvatarFallback>
        </Avatar>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[72%] space-y-1",
          isOutbound ? "items-end" : "items-start",
          "flex flex-col",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isOutbound
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-muted text-foreground",
          )}
        >
          {message.text}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ── Loading skeletons ─────────────────────────────────────────────────────────

function MessageSkeleton({ isOutbound }: { isOutbound: boolean }) {
  return (
    <div className={cn("flex items-end gap-2", isOutbound ? "flex-row-reverse" : "flex-row")}>
      {!isOutbound && <Skeleton className="size-7 shrink-0 rounded-full" />}
      <div className={cn("flex flex-col gap-1", isOutbound ? "items-end" : "items-start")}>
        <Skeleton className={cn("h-10 rounded-2xl", isOutbound ? "w-52" : "w-64")} />
        <Skeleton className="h-2.5 w-14" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MessageThreadProps {
  chat: UnipileChat;
  isInterested: boolean;
  onToggleInterested: () => void;
}

export function MessageThread({ chat, isInterested, onToggleInterested }: MessageThreadProps) {
  const [messages, setMessages] = useState<UnipileChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const prevChatIdRef = useRef<string | null>(null);

  const other = chat.attendees[0];
  const otherName = other?.display_name ?? "Unknown";
  const otherAvatarUrl = other?.profile_picture_url ?? null;

  const fetchMessages = useCallback(async (chatId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/linkedin/chats/${encodeURIComponent(chatId)}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load messages");
      // API returns newest-first; reverse to show oldest at top
      const sorted = [...(data.items as UnipileChatMessage[])].reverse();
      setMessages(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on chat change
  useEffect(() => {
    if (prevChatIdRef.current !== chat.id) {
      prevChatIdRef.current = chat.id;
      setMessages([]);
      fetchMessages(chat.id);
    }
  }, [chat.id, fetchMessages]);

  // Refresh this thread when a realtime message arrives for this specific chat
  useEffect(() => {
    function handleNewMessage(e: Event) {
      const msg = (e as CustomEvent<Message>).detail;
      if (msg.unipile_chat_id === chat.id) {
        fetchMessages(chat.id);
      }
    }
    window.addEventListener("inbox:new-message", handleNewMessage);
    return () => window.removeEventListener("inbox:new-message", handleNewMessage);
  }, [chat.id, fetchMessages]);

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSent = useCallback((optimistic: UnipileChatMessage) => {
    setMessages((prev) => [...prev, optimistic]);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Avatar className="size-8 shrink-0">
          {otherAvatarUrl && <AvatarImage src={otherAvatarUrl} alt={otherName} />}
          <AvatarFallback className="text-xs">{getInitials(otherName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{otherName}</p>
          {chat.attendees[0] && (
            <p className="truncate text-xs text-muted-foreground">LinkedIn</p>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <MessageSkeleton isOutbound={false} />
            <MessageSkeleton isOutbound />
            <MessageSkeleton isOutbound={false} />
            <MessageSkeleton isOutbound />
          </div>
        ) : messages.length === 0 && !error ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                otherName={otherName}
                otherAvatarUrl={otherAvatarUrl}
              />
            ))}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Quick reply bar + composer */}
      <div className="border-t">
        <QuickReplyBar
          chatId={chat.id}
          isInterested={isInterested}
          onToggleInterested={onToggleInterested}
          onInsertTemplate={(body) => {
            // Expose a ref-based API via a custom event so MessageComposer can pick it up
            window.dispatchEvent(
              new CustomEvent("inbox:insert-template", { detail: { body } }),
            );
          }}
        />
        <MessageComposer chatId={chat.id} onSent={handleSent} />
      </div>
    </div>
  );
}
