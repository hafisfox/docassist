"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { UnipileChat } from "@/lib/unipile/types";

export type InboxFilter = "all" | "unread" | "replied" | "interested";

interface InboxState {
  chats: UnipileChat[];
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  syncing: boolean;
  error: string | null;
  selectedChatId: string | null;
  viewedChatIds: Set<string>;
  interestedChatIds: Set<string>;
  notInterestedChatIds: Set<string>;
  search: string;
  filter: InboxFilter;
}

export type ChatInterest = "interested" | "not_interested";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

export function useInbox() {
  const [state, setState] = useState<InboxState>({
    chats: [],
    cursor: null,
    loading: false,
    loadingMore: false,
    syncing: false,
    error: null,
    selectedChatId: null,
    viewedChatIds: new Set(),
    interestedChatIds: new Set(),
    notInterestedChatIds: new Set(),
    search: "",
    filter: "all",
  });

  // Ref so async callbacks always read latest cursor without stale closure
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchChats = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await apiFetch<{ items: UnipileChat[]; cursor: string | null }>(
        "/api/linkedin/chats",
      );
      setState((prev) => ({
        ...prev,
        chats: data.items,
        cursor: data.cursor,
        loading: false,
        error: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch conversations";
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  const loadMore = useCallback(async () => {
    const { cursor, loadingMore } = stateRef.current;
    if (!cursor || loadingMore) return;

    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const data = await apiFetch<{ items: UnipileChat[]; cursor: string | null }>(
        `/api/linkedin/chats?cursor=${encodeURIComponent(cursor)}`,
      );
      setState((prev) => ({
        ...prev,
        chats: [...prev.chats, ...data.items],
        cursor: data.cursor,
        loadingMore: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load more conversations";
      setState((prev) => ({ ...prev, loadingMore: false, error: message }));
    }
  }, []);

  const selectChat = useCallback((chatId: string) => {
    setState((prev) => ({
      ...prev,
      selectedChatId: chatId,
      viewedChatIds: new Set([...prev.viewedChatIds, chatId]),
    }));
  }, []);

  // Mark a conversation interested / not interested. Updates the local highlight
  // optimistically (the two states are mutually exclusive) and persists the
  // decision onto the underlying lead, reverting on failure.
  const setChatInterest = useCallback(
    async (chat: UnipileChat, status: ChatInterest) => {
      const chatId = chat.id;
      const providerId = chat.attendees?.[0]?.provider_id;

      // Snapshot prior membership for rollback
      const prevState = stateRef.current;
      const wasInterested = prevState.interestedChatIds.has(chatId);
      const wasNotInterested = prevState.notInterestedChatIds.has(chatId);

      setState((prev) => {
        const interested = new Set(prev.interestedChatIds);
        const notInterested = new Set(prev.notInterestedChatIds);
        if (status === "interested") {
          interested.add(chatId);
          notInterested.delete(chatId);
        } else {
          notInterested.add(chatId);
          interested.delete(chatId);
        }
        return { ...prev, interestedChatIds: interested, notInterestedChatIds: notInterested };
      });

      try {
        const res = await fetch("/api/inbox/lead-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, provider_id: providerId, status }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `Failed to save (${res.status})`,
          );
        }
        toast.success(status === "interested" ? "Marked interested" : "Marked not interested");
      } catch (err) {
        // Revert optimistic highlight
        setState((prev) => {
          const interested = new Set(prev.interestedChatIds);
          const notInterested = new Set(prev.notInterestedChatIds);
          interested.delete(chatId);
          notInterested.delete(chatId);
          if (wasInterested) interested.add(chatId);
          if (wasNotInterested) notInterested.add(chatId);
          return { ...prev, interestedChatIds: interested, notInterestedChatIds: notInterested };
        });
        toast.error(err instanceof Error ? err.message : "Failed to update conversation");
      }
    },
    [],
  );

  const setSearch = useCallback((search: string) => {
    setState((prev) => ({ ...prev, search }));
  }, []);

  const setFilter = useCallback((filter: InboxFilter) => {
    setState((prev) => ({ ...prev, filter }));
  }, []);

  const syncInbox = useCallback(async () => {
    setState((prev) => ({ ...prev, syncing: true }));
    try {
      const res = await fetch("/api/linkedin/sync-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Sync failed (${res.status})`,
        );
      }
      await fetchChats();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to sync inbox",
      );
    } finally {
      setState((prev) => ({ ...prev, syncing: false }));
    }
  }, [fetchChats]);

  const filteredChats = state.chats
    .filter((chat) => {
      // Search by attendee display name
      if (state.search) {
        const q = state.search.toLowerCase();
        const matches = chat.attendees?.some((a) =>
          a.display_name?.toLowerCase().includes(q),
        ) ?? false;
        if (!matches) return false;
      }

      switch (state.filter) {
        case "unread":
          // Last message came from them and we haven't opened the chat yet
          return (
            chat.last_message != null &&
            !chat.last_message.is_sender &&
            !state.viewedChatIds.has(chat.id)
          );
        case "replied":
          // Lead replied to us (last message is from them)
          return chat.last_message != null && !chat.last_message.is_sender;
        case "interested":
          return state.interestedChatIds.has(chat.id);
        default:
          return true;
      }
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const unreadCount = state.chats.filter(
    (chat) =>
      chat.last_message != null &&
      !chat.last_message.is_sender &&
      !state.viewedChatIds.has(chat.id),
  ).length;

  return {
    ...state,
    filteredChats,
    unreadCount,
    fetchChats,
    syncInbox,
    loadMore,
    selectChat,
    setChatInterest,
    setSearch,
    setFilter,
  };
}
