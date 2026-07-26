// ─── Template variables ─────────────────────────────────────────────────────
// Single source of truth for the {{variable}} vocabulary.
//
// This list previously lived in four places that disagreed with each other: the
// variable picker offered {{title}} and {{city}}, the editor and sequence
// previews rendered them, but the executor that actually sends the message
// never substituted them — so those placeholders shipped verbatim to real
// prospects. Everything now resolves through `resolveTemplateVariable` /
// `fillTemplate` so the picker, the previews and the send path cannot drift
// apart again.

import type { Lead } from "@/types/database";

export interface TemplateVariable {
  /** Placeholder name, used as {{name}}. */
  name: string;
  label: string;
  /** Value shown in previews, where no real lead is in context. */
  sample: string;
  /** Pulls the live value off a lead. */
  resolve: (lead: Lead) => string;
  /**
   * True for names kept only so templates written before a field rename keep
   * working. Aliases are hidden from the picker but still substituted.
   */
  alias?: boolean;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    name: "first_name",
    label: "First Name",
    sample: "Jordan",
    resolve: (l) => l.first_name || "",
  },
  {
    name: "last_name",
    label: "Last Name",
    sample: "Avery",
    resolve: (l) => l.last_name || "",
  },
  {
    name: "full_name",
    label: "Full Name",
    sample: "Jordan Avery",
    resolve: (l) => l.full_name || "",
  },
  {
    name: "company",
    label: "Company",
    sample: "Acme Corp",
    resolve: (l) => l.company || "",
  },
  {
    name: "job_title",
    label: "Job Title",
    sample: "VP of Engineering",
    resolve: (l) => l.job_title || "",
  },
  {
    name: "industry",
    label: "Industry",
    sample: "B2B SaaS",
    resolve: (l) => l.industry || "",
  },
  {
    name: "city",
    label: "City",
    sample: "San Francisco",
    resolve: (l) => l.city || "",
  },
  {
    name: "location",
    label: "Location",
    sample: "San Francisco, CA",
    resolve: (l) => l.location || "",
  },
  {
    name: "headline",
    label: "Headline",
    sample: "VP of Engineering at Acme Corp",
    resolve: (l) => l.headline || "",
  },

  // ── Aliases ───────────────────────────────────────────────────────────────
  // {{title}} was offered by the picker long before the executor understood it.
  // {{specialty}} is the pre-rename name for {{industry}} and still appears in
  // templates saved before migration 20240101000014.
  {
    name: "title",
    label: "Job Title",
    sample: "VP of Engineering",
    resolve: (l) => l.job_title || "",
    alias: true,
  },
  {
    name: "specialty",
    label: "Industry",
    sample: "B2B SaaS",
    resolve: (l) => l.industry || "",
    alias: true,
  },
];

/** Variables offered in the picker — aliases are substituted but not advertised. */
export const SELECTABLE_TEMPLATE_VARIABLES = TEMPLATE_VARIABLES.filter(
  (v) => !v.alias,
);

const BY_NAME = new Map(TEMPLATE_VARIABLES.map((v) => [v.name, v]));

/** Sample values keyed by variable name, for preview rendering. */
export const TEMPLATE_SAMPLE_DATA: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.name, v.sample]),
);

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

/**
 * Substitute {{variables}} using real lead data. Unknown placeholders are left
 * intact so a typo is visible rather than silently blanked.
 */
export function fillTemplate(body: string, lead: Lead): string {
  return body.replace(PLACEHOLDER_RE, (match, key: string) => {
    const variable = BY_NAME.get(key.toLowerCase());
    return variable ? variable.resolve(lead) : match;
  });
}

/** Substitute {{variables}} with sample values, for previews. */
export function fillTemplateWithSamples(body: string): string {
  return body.replace(PLACEHOLDER_RE, (match, key: string) => {
    const variable = BY_NAME.get(key.toLowerCase());
    return variable ? variable.sample : match;
  });
}
