"use client";

import { useCallback, useState } from "react";
import type { Template } from "@/types/database";
import type { CreateTemplateInput, UpdateTemplateInput } from "@/lib/validators";

interface TemplatesState {
  templates: Template[];
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

export type TemplateCategory = "connection_request" | "message" | "follow_up";

export function useTemplates() {
  const [state, setState] = useState<TemplatesState>({
    templates: [],
    loading: false,
    error: null,
  });

  const fetchTemplates = useCallback(async (category?: TemplateCategory) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (category) {
        params.set("category", category);
      }

      const queryString = params.toString();
      const url = `/api/templates${queryString ? `?${queryString}` : ""}`;

      const data = await apiFetch<{ templates: Template[] }>(url);

      setState({
        templates: data.templates,
        loading: false,
        error: null,
      });

      return data.templates;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch templates";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const createTemplate = useCallback(async (input: CreateTemplateInput): Promise<Template> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ template: Template }>("/api/templates", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        templates: [data.template, ...prev.templates],
        loading: false,
        error: null,
      }));

      return data.template;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create template";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const updateTemplate = useCallback(async (id: string, input: UpdateTemplateInput): Promise<Template> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ template: Template }>(`/api/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });

      setState((prev) => ({
        ...prev,
        templates: prev.templates.map((t) => (t.id === id ? data.template : t)),
        loading: false,
        error: null,
      }));

      return data.template;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update template";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const deleteTemplate = useCallback(async (id: string): Promise<Template> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await apiFetch<{ template: Template }>(`/api/templates/${id}`, {
        method: "DELETE",
      });

      setState((prev) => ({
        ...prev,
        templates: prev.templates.filter((t) => t.id !== id),
        loading: false,
        error: null,
      }));

      return data.template;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete template";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  return {
    ...state,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
