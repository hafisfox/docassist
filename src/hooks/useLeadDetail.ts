"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lead, Activity, Message } from "@/types/database";
import type { UpdateLeadInput } from "@/lib/validators";

interface LeadDetailState {
  lead: Lead | null;
  activities: Activity[];
  messages: Message[];
  loading: boolean;
  error: string | null;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

export function useLeadDetail(leadId: string) {
  const [state, setState] = useState<LeadDetailState>({
    lead: null,
    activities: [],
    messages: [],
    loading: true,
    error: null,
  });

  const supabaseRef = useRef(createClient());

  const fetchLead = useCallback(async () => {
    try {
      const data = await apiFetch<{ lead: Lead }>(`/api/leads/${leadId}`);
      setState((prev) => ({ ...prev, lead: data.lead, error: null }));
      return data.lead;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch lead";
      setState((prev) => ({ ...prev, error: message }));
      throw err;
    }
  }, [leadId]);

  const fetchActivities = useCallback(async () => {
    try {
      const data = await apiFetch<{ activities: Activity[] }>(
        `/api/leads/${leadId}/activities`,
      );
      setState((prev) => ({ ...prev, activities: data.activities }));
      return data.activities;
    } catch {
      // Non-critical — don't block the page
    }
  }, [leadId]);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await apiFetch<{ messages: Message[] }>(
        `/api/leads/${leadId}/messages`,
      );
      setState((prev) => ({ ...prev, messages: data.messages }));
      return data.messages;
    } catch {
      // Non-critical
    }
  }, [leadId]);

  const fetchAll = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await Promise.all([fetchLead(), fetchActivities(), fetchMessages()]);
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [fetchLead, fetchActivities, fetchMessages]);

  const updateLead = useCallback(
    async (input: UpdateLeadInput): Promise<Lead> => {
      const data = await apiFetch<{ lead: Lead }>(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setState((prev) => ({ ...prev, lead: data.lead }));
      return data.lead;
    },
    [leadId],
  );

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Supabase Realtime subscriptions
  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`lead-detail-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `id=eq.${leadId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setState((prev) => ({
              ...prev,
              lead: payload.new as Lead,
            }));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activities",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setState((prev) => ({
            ...prev,
            activities: [payload.new as Activity, ...prev.activities],
          }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setState((prev) => ({
            ...prev,
            messages: [payload.new as Message, ...prev.messages],
          }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  return {
    ...state,
    fetchAll,
    fetchLead,
    fetchActivities,
    fetchMessages,
    updateLead,
  };
}
