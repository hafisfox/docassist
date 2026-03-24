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
  search: string;
  filter: InboxFilter;
}

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

  const toggleInterested = useCallback((chatId: string) => {
    setState((prev) => {
      const updated = new Set(prev.interestedChatIds);
      if (updated.has(chatId)) {
        updated.delete(chatId);
      } else {
        updated.add(chatId);
      }
      return { ...prev, interestedChatIds: updated };
    });
  }, []);

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
        const matches = chat.attendees.some((a) =>
          a.display_name.toLowerCase().includes(q),
        );
        if (!matches) return false;
      }

      switch (state.filter) {
        case "unread":
          // Last message came from them and we haven't opened the chat yet
          return (
            chat.last_message !== null &&
            !chat.last_message.is_sender &&
            !state.viewedChatIds.has(chat.id)
          );
        case "replied":
          // Lead replied to us (last message is from them)
          return chat.last_message !== null && !chat.last_message.is_sender;
        case "interested":
          return state.interestedChatIds.has(chat.id);
        default:
          return true;
      }
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const unreadCount = state.chats.filter(
    (chat) =>
      chat.last_message !== null &&
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
    toggleInterested,
    setSearch,
    setFilter,
  };
}
