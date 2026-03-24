"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, Lead, Sequence } from "@/types/database";
import type { CreateCampaignInput, UpdateCampaignInput } from "@/lib/validators";

export interface CampaignWithMeta extends Campaign {
  lead_count: number;
  sequence?: Sequence | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface CampaignsState {
  campaigns: CampaignWithMeta[];
  pagination: Pagination | null;
  loading: boolean;
  error: string | null;
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

export function useCampaigns() {
  const [state, setState] = useState<CampaignsState>({
    campaigns: [],
    pagination: null,
    loading: false,
    error: null,
  });

  const supabaseRef = useRef(createClient());

  const fetchCampaigns = useCallback(async (filters?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sort_by?: string;
    sort_order?: string;
  }) => {
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
      const url = `/api/campaigns${queryString ? `?${queryString}` : ""}`;

      const data = await apiFetch<{
        campaigns: CampaignWithMeta[];
        pagination: Pagination;
      }>(url);

      setState({
        campaigns: data.campaigns,
        pagination: data.pagination,
        loading: false,
        error: null,
      });

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch campaigns";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const fetchCampaign = useCallback(async (id: string): Promise<{
    campaign: CampaignWithMeta;
    leads: Lead[];
  }> => {
    const data = await apiFetch<{
      campaign: CampaignWithMeta;
      leads: Lead[];
    }>(`/api/campaigns/${id}`);
    return data;
  }, []);

  const createCampaign = useCallback(async (input: CreateCampaignInput): Promise<CampaignWithMeta> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ campaign: CampaignWithMeta }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        campaigns: [data.campaign, ...prev.campaigns],
        pagination: prev.pagination
          ? { ...prev.pagination, total: prev.pagination.total + 1 }
          : null,
        loading: false,
        error: null,
      }));

      return data.campaign;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create campaign";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const updateCampaign = useCallback(async (
    id: string,
    input: UpdateCampaignInput & { lead_ids?: string[] },
  ): Promise<Campaign> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ campaign: Campaign }>(`/api/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        campaigns: prev.campaigns.map((c) =>
          c.id === id ? { ...c, ...data.campaign } : c,
        ),
        loading: false,
        error: null,
      }));

      return data.campaign;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update campaign";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  // Supabase Realtime: update campaign stats (replies, meetings, etc.) in-place
  useEffect(() => {
    const supabase = supabaseRef.current;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function subscribe() {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      channel = supabase
        .channel("campaigns-list-realtime")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "campaigns",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const updated = payload.new as Campaign;
            setState((prev) => ({
              ...prev,
              campaigns: prev.campaigns.map((c) =>
                c.id === updated.id ? { ...c, ...updated } : c,
              ),
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
    fetchCampaigns,
    fetchCampaign,
    createCampaign,
    updateCampaign,
  };
}
