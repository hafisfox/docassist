"use client";

import { useCallback, useState } from "react";
import type { Sequence, SequenceStep } from "@/types/database";
import type { CreateSequenceInput, UpdateSequenceInput } from "@/lib/validators";

export interface SequenceWithMeta extends Sequence {
  step_count: number;
  usage_count: number;
  steps?: SequenceStep[];
}

interface SequencesState {
  sequences: SequenceWithMeta[];
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

export function useSequences() {
  const [state, setState] = useState<SequencesState>({
    sequences: [],
    loading: false,
    error: null,
  });

  const fetchSequences = useCallback(async (search?: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (search) {
        params.set("search", search);
      }

      const queryString = params.toString();
      const url = `/api/sequences${queryString ? `?${queryString}` : ""}`;

      const data = await apiFetch<{ sequences: SequenceWithMeta[] }>(url);

      setState({
        sequences: data.sequences,
        loading: false,
        error: null,
      });

      return data.sequences;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch sequences";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const fetchSequence = useCallback(async (id: string): Promise<SequenceWithMeta> => {
    const data = await apiFetch<{ sequence: SequenceWithMeta }>(`/api/sequences/${id}`);
    return data.sequence;
  }, []);

  const createSequence = useCallback(async (input: CreateSequenceInput): Promise<SequenceWithMeta> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ sequence: SequenceWithMeta }>("/api/sequences", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        sequences: [data.sequence, ...prev.sequences],
        loading: false,
        error: null,
      }));

      return data.sequence;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create sequence";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const updateSequence = useCallback(async (id: string, input: UpdateSequenceInput): Promise<SequenceWithMeta> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ sequence: SequenceWithMeta }>(`/api/sequences/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        sequences: prev.sequences.map((s) => (s.id === id ? data.sequence : s)),
        loading: false,
        error: null,
      }));

      return data.sequence;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update sequence";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const deleteSequence = useCallback(async (id: string): Promise<Sequence> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ sequence: Sequence }>(`/api/sequences/${id}`, {
        method: "DELETE",
      });

      setState((prev) => ({
        ...prev,
        sequences: prev.sequences.filter((s) => s.id !== id),
        loading: false,
        error: null,
      }));

      return data.sequence;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete sequence";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  return {
    ...state,
    fetchSequences,
    fetchSequence,
    createSequence,
    updateSequence,
    deleteSequence,
  };
}
