"use client";

import { Suspense, useEffect } from "react";
import { MessageSquareIcon } from "lucide-react";
import { useInbox } from "@/hooks/useInbox";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Empty state (no chat selected) ───────────────────────────────────────────

function NoConversationSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <MessageSquareIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Select a conversation</p>
        <p className="text-xs text-muted-foreground">
          Choose a conversation from the list to view messages
        </p>
      </div>
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

function InboxContent() {
  const {
    chats,
    filteredChats,
    loading,
    syncing,
    error,
    selectedChatId,
    viewedChatIds,
    interestedChatIds,
    search,
    filter,
    unreadCount,
    fetchChats,
    syncInbox,
    selectChat,
    toggleInterested,
    setSearch,
    setFilter,
  } = useInbox();

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Re-fetch conversation list whenever a new inbound message arrives.
  // The global useRealtimeMessages in the layout fires this event.
  useEffect(() => {
    function handleNewMessage(_e: Event) {
      fetchChats();
    }
    window.addEventListener("inbox:new-message", handleNewMessage);
    return () => window.removeEventListener("inbox:new-message", handleNewMessage);
  }, [fetchChats]);

  const selectedChat = chats.find((c) => c.id === selectedChatId) ?? null;

  return (
    <div className={cn("flex h-[calc(100vh-3.5rem)] overflow-hidden")}>
      {/* Left panel — conversation list (1/3) */}
      <div className="w-full shrink-0 sm:w-80 lg:w-1/3">
        <ConversationList
          chats={filteredChats}
          loading={loading}
          syncing={syncing}
          error={error}
          selectedChatId={selectedChatId}
          viewedChatIds={viewedChatIds}
          interestedChatIds={interestedChatIds}
          search={search}
          filter={filter}
          unreadCount={unreadCount}
          onSelectChat={selectChat}
          onSearchChange={setSearch}
          onFilterChange={setFilter}
          onSync={syncInbox}
        />
      </div>

      {/* Right panel — message thread (2/3) */}
      <div className="hidden flex-1 overflow-hidden sm:flex">
        {selectedChat ? (
          <MessageThread
            chat={selectedChat}
            isInterested={interestedChatIds.has(selectedChat.id)}
            onToggleInterested={() => toggleInterested(selectedChat.id)}
          />
        ) : (
          <NoConversationSelected />
        )}
      </div>
    </div>
  );
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function InboxFallback() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="w-full shrink-0 border-r sm:w-80 lg:w-1/3">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex flex-col gap-2 border-b px-4 py-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="py-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <Skeleton className="mt-0.5 size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-1 sm:block" />
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function InboxPage() {
  return (
    <ErrorBoundary section="Inbox">
      <Suspense fallback={<InboxFallback />}>
        <InboxContent />
      </Suspense>
    </ErrorBoundary>
  );
}
