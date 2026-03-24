"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lead } from "@/types/database";
import type { CreateLeadInput, UpdateLeadInput, ListLeadsQuery } from "@/lib/validators";

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface LeadsState {
  leads: Lead[];
  pagination: Pagination | null;
  loading: boolean;
  error: string | null;
}

interface BulkImportResult {
  imported: number;
  failed?: Array<{ batch: number; error: string }>;
  total_requested: number;
}

interface BulkActionResult {
  updated: number;
}

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
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

export function useLeads() {
  const [state, setState] = useState<LeadsState>({
    leads: [],
    pagination: null,
    loading: false,
    error: null,
  });

  const supabaseRef = useRef(createClient());

  const fetchLeads = useCallback(async (filters?: Partial<ListLeadsQuery>) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value));
          }
        }
      }

      const queryString = params.toString();
      const url = `/api/leads${queryString ? `?${queryString}` : ""}`;

      const data = await apiFetch<{
        leads: Lead[];
        pagination: Pagination;
      }>(url);

      setState({
        leads: data.leads,
        pagination: data.pagination,
        loading: false,
        error: null,
      });

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch leads";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const createLead = useCallback(async (input: CreateLeadInput): Promise<Lead> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ lead: Lead }>("/api/leads", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        leads: [data.lead, ...prev.leads],
        pagination: prev.pagination
          ? { ...prev.pagination, total: prev.pagination.total + 1 }
          : null,
        loading: false,
        error: null,
      }));

      return data.lead;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create lead";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const updateLead = useCallback(async (id: string, input: UpdateLeadInput): Promise<Lead> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ lead: Lead }>(`/api/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        leads: prev.leads.map((l) => (l.id === id ? data.lead : l)),
        loading: false,
        error: null,
      }));

      return data.lead;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update lead";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const deleteLead = useCallback(async (id: string): Promise<Lead> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ lead: Lead }>(`/api/leads/${id}`, {
        method: "DELETE",
      });

      setState((prev) => ({
        ...prev,
        leads: prev.leads.map((l) => (l.id === id ? data.lead : l)),
        loading: false,
        error: null,
      }));

      return data.lead;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete lead";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const bulkImport = useCallback(async (leads: CreateLeadInput[]): Promise<BulkImportResult> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<BulkImportResult>("/api/leads/bulk", {
        method: "POST",
        body: JSON.stringify({ leads }),
      });

      setState((prev) => ({ ...prev, loading: false, error: null }));

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to bulk import leads";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const bulkAction = useCallback(
    async (
      leadIds: string[],
      action: "change_status" | "add_to_campaign" | "add_tags" | "delete",
      options?: { status?: string; campaign_id?: string; tags?: string[] },
    ): Promise<BulkActionResult> => {
      const data = await apiFetch<BulkActionResult>(
        "/api/leads/bulk-action",
        {
          method: "POST",
          body: JSON.stringify({ lead_ids: leadIds, action, ...options }),
        },
      );
      return data;
    },
    [],
  );

  const exportLeads = useCallback(
    async (filters?: {
      status?: string;
      campaign_id?: string;
      ids?: string[];
      search?: string;
    }): Promise<void> => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.campaign_id)
        params.set("campaign_id", filters.campaign_id);
      if (filters?.ids?.length)
        params.set("ids", filters.ids.join(","));
      if (filters?.search) params.set("search", filters.search);

      const queryString = params.toString();
      const url = `/api/leads/export${queryString ? `?${queryString}` : ""}`;

      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error ?? "Export failed");
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    },
    [],
  );

  // Supabase Realtime: update a lead in-place when its status (or any field) changes
  useEffect(() => {
    const supabase = supabaseRef.current;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function subscribe() {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      channel = supabase
        .channel("leads-list-realtime")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "leads",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const updated = payload.new as Lead;
            setState((prev) => ({
              ...prev,
              leads: prev.leads.map((l) => (l.id === updated.id ? updated : l)),
            }));
          },
        )
        .subscribe();
    }

    subscribe();

    return () => {
      if (channel) {
        supabaseRef.current.removeChannel(channel);
      }
    };
  }, []);

  return {
    ...state,
    fetchLeads,
    createLead,
    updateLead,
    deleteLead,
    bulkImport,
    bulkAction,
    exportLeads,
  };
}
