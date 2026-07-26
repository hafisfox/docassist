/**
 * Regression tests for the {{variable}} vocabulary.
 *
 * The picker, the previews and the send path each used to carry their own
 * substitution list. They disagreed: {{title}} and {{city}} were offered by the
 * picker and rendered in previews, but the executor never substituted them — so
 * those placeholders were sent verbatim to real prospects. These tests pin the
 * shared vocabulary so the lists cannot drift apart again.
 */
import { describe, expect, it } from "vitest";
import {
  SELECTABLE_TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLES,
  fillTemplate,
  fillTemplateWithSamples,
} from "@/constants/templateVariables";
import type { Lead } from "@/types/database";

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    user_id: "user-1",
    full_name: "Jordan Avery",
    first_name: "Jordan",
    last_name: "Avery",
    job_title: "VP of Engineering",
    company: "Acme Corp",
    city: "San Francisco",
    country: "United States",
    industry: "B2B SaaS",
    headline: "VP of Engineering at Acme Corp",
    location: "San Francisco, CA",
    icp_segment: "enterprise",
    account_type: null,
    ...overrides,
  } as Lead;
}

describe("fillTemplate", () => {
  it("substitutes every variable the picker offers", () => {
    const lead = buildLead();
    for (const variable of SELECTABLE_TEMPLATE_VARIABLES) {
      const result = fillTemplate(`>${`{{${variable.name}}}`}<`, lead);
      expect(result, `{{${variable.name}}} was not substituted`).not.toContain("{{");
      expect(result).toBe(`>${variable.resolve(lead)}<`);
    }
  });

  it("substitutes {{title}} and {{city}} — the two that used to ship verbatim", () => {
    const lead = buildLead();
    expect(fillTemplate("Hi {{first_name}}, {{title}} in {{city}}", lead)).toBe(
      "Hi Jordan, VP of Engineering in San Francisco",
    );
  });

  it("keeps {{specialty}} working as an alias of {{industry}}", () => {
    const lead = buildLead({ industry: "Fintech" });
    expect(fillTemplate("{{specialty}} / {{industry}}", lead)).toBe("Fintech / Fintech");
  });

  it("is case-insensitive", () => {
    expect(fillTemplate("{{First_Name}}", buildLead())).toBe("Jordan");
  });

  it("leaves unknown placeholders intact so typos stay visible", () => {
    expect(fillTemplate("Hi {{nope}}", buildLead())).toBe("Hi {{nope}}");
  });

  it("renders an empty string for a variable with no data", () => {
    expect(fillTemplate("[{{industry}}]", buildLead({ industry: null }))).toBe("[]");
  });
});

describe("fillTemplateWithSamples", () => {
  it("resolves every known variable to its sample value", () => {
    for (const variable of TEMPLATE_VARIABLES) {
      expect(fillTemplateWithSamples(`{{${variable.name}}}`)).toBe(variable.sample);
    }
  });

  it("agrees with fillTemplate on which names are substitutable", () => {
    // A preview that renders a placeholder the send path would not substitute is
    // exactly the drift this module exists to prevent.
    const lead = buildLead();
    for (const variable of TEMPLATE_VARIABLES) {
      const token = `{{${variable.name}}}`;
      expect(fillTemplateWithSamples(token)).not.toContain("{{");
      expect(fillTemplate(token, lead)).not.toContain("{{");
    }
  });
});

describe("SELECTABLE_TEMPLATE_VARIABLES", () => {
  it("hides aliases from the picker but still substitutes them", () => {
    const names = SELECTABLE_TEMPLATE_VARIABLES.map((v) => v.name);
    expect(names).not.toContain("specialty");
    expect(names).not.toContain("title");
    expect(fillTemplate("{{title}}", buildLead())).toBe("VP of Engineering");
  });
});
