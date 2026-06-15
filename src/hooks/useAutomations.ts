"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutomationEngine = "n8n" | "dashboard";

export interface AutomationExecution {
  id: string;
  status: string;
  mode?: string;
  startedAt: string | null;
  stoppedAt: string | null;
  finished?: boolean;
}

export interface AutomationParamDescriptor {
  key: string;
  label: string;
  description: string;
  kind: "jsNumber" | "jsString";
  min: number | null;
  max: number | null;
}

export interface Automation {
  id: string;
  role: string;
  name: string;
  description: string;
  active: boolean;
  exists: boolean;
  runnable: boolean;
  updatedAt: string | null;
  editableParams: AutomationParamDescriptor[];
  lastExecution: AutomationExecution | null;
}

interface AutomationsState {
  engine: AutomationEngine;
  automations: Automation[];
  loading: boolean;
  error: string | null;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const POLL_MS = 15_000;

export function useAutomations() {
  const [state, setState] = useState<AutomationsState>({
    engine: "n8n",
    automations: [],
    loading: true,
    error: null,
  });
  const mounted = useRef(true);

  const fetchAutomations = useCallback(async () => {
    try {
      const data = await apiFetch<{ engine: AutomationEngine; automations: Automation[] }>(
        "/api/automations",
      );
      if (!mounted.current) return;
      setState((s) => ({
        ...s,
        engine: data.engine,
        automations: data.automations,
        loading: false,
        error: null,
      }));
    } catch (err) {
      if (!mounted.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load automations",
      }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchAutomations();
    const interval = setInterval(fetchAutomations, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [fetchAutomations]);

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      // optimistic
      setState((s) => ({
        ...s,
        automations: s.automations.map((a) => (a.id === id ? { ...a, active } : a)),
      }));
      try {
        await apiFetch(`/api/automations/${id}/${active ? "activate" : "deactivate"}`, {
          method: "POST",
        });
      } catch (err) {
        await fetchAutomations(); // rollback to server truth
        throw err;
      }
    },
    [fetchAutomations],
  );

  const runNow = useCallback(async (id: string) => {
    await apiFetch(`/api/automations/${id}/run`, { method: "POST" });
  }, []);

  const fetchExecutions = useCallback(async (id: string, limit = 20) => {
    const data = await apiFetch<{ executions: AutomationExecution[] }>(
      `/api/automations/${id}/executions?limit=${limit}`,
    );
    return data.executions;
  }, []);

  const fetchParams = useCallback(async (id: string) => {
    const data = await apiFetch<{ values: Record<string, number | string | null> }>(
      `/api/automations/${id}/params`,
    );
    return data.values;
  }, []);

  const updateParams = useCallback(
    async (id: string, params: Record<string, number | string>) => {
      const data = await apiFetch<{ values: Record<string, number | string | null> }>(
        `/api/automations/${id}/params`,
        { method: "PATCH", body: JSON.stringify({ params }) },
      );
      return data.values;
    },
    [],
  );

  return {
    ...state,
    refresh: fetchAutomations,
    setActive,
    runNow,
    fetchExecutions,
    fetchParams,
    updateParams,
  };
}
