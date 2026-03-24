import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted to the top of the file, so `mockCreate` must
// also be hoisted via vi.hoisted() to avoid a temporal dead zone error.
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => {
  class OpenAI {
    chat = { completions: { create: mockCreate } };
  }
  return { default: OpenAI };
});

vi.mock("@/lib/ai/prompts", () => ({
  PERSONALIZATION_SYSTEM_PROMPT: "test-system-prompt",
}));

import { personalizeMessage } from "@/lib/ai/personalize";
import type { Lead } from "@/types/database";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockTextResponse(text: string) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: text } }],
  });
}

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    user_id: "user-1",
    full_name: "Dr. Priya Sharma",
    first_name: "Priya",
    last_name: "Sharma",
    job_title: "Medical Oncologist",
    company: "HCG Cancer Centre",
    city: "Bengaluru",
    country: "India",
    specialty: "Medical Oncology",
    headline: "Senior Consultant Medical Oncology at HCG",
    icp_segment: "high_volume_chemo",
    experience_years: 12,
    status: "new",
    source: "linkedin_search",
    linkedin_profile_url: null,
    linkedin_public_id: null,
    linkedin_provider_id: null,
    phone: null,
    email: null,
    location: "Bengaluru, India",
    hospital_type: null,
    icp_score: 85,
    campaign_id: null,
    enrichment_data: {},
    skills: [],
    education: [],
    experience: [],
    tags: [],
    notes: null,
    last_contacted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Lead;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("personalizeMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns trimmed text from the OpenAI API (with lead)", async () => {
    mockTextResponse("  Hi Dr. Sharma, your work at HCG is impressive.  ");

    const result = await personalizeMessage({
      template: "Hi {{name}}, your work at {{company}} is impressive.",
      category: "connection_request",
      lead: buildLead(),
    });

    expect(result).toBe("Hi Dr. Sharma, your work at HCG is impressive.");
  });

  it("calls OpenAI with correct model and max_tokens", async () => {
    mockTextResponse("optimized template");

    await personalizeMessage({
      template: "Hello {{name}}",
      category: "connection_request",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        max_tokens: 300,
      })
    );
  });

  it("sends lead profile data in user prompt when lead is provided", async () => {
    mockTextResponse("personalized message");
    const lead = buildLead({ full_name: "Dr. Ali Hassan", company: "Burjeel Holdings" });

    await personalizeMessage({
      template: "Hi {{name}}",
      category: "message",
      lead,
    });

    const call = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userPrompt = call.messages[1].content;

    expect(userPrompt).toContain("Dr. Ali Hassan");
    expect(userPrompt).toContain("Burjeel Holdings");
  });

  it("instructs OpenAI to keep {{variable}} placeholders when no lead is provided", async () => {
    mockTextResponse("improved template with {{name}}");

    await personalizeMessage({
      template: "Hi {{name}}, check out {{product}}",
      category: "follow_up",
    });

    const call = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userPrompt = call.messages[1].content;

    expect(userPrompt).toContain("Preserve all {{variable}} placeholders");
    expect(userPrompt).toContain("Hi {{name}}, check out {{product}}");
  });

  it("uses correct char limit based on category", async () => {
    mockTextResponse("short note");

    await personalizeMessage({ template: "test", category: "connection_request" });
    const crPrompt = (mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }).messages[1].content;
    expect(crPrompt).toContain("300 characters");

    mockTextResponse("message text");
    await personalizeMessage({ template: "test", category: "message" });
    const msgPrompt = (mockCreate.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> }).messages[1].content;
    expect(msgPrompt).toContain("500 characters");

    mockTextResponse("follow up text");
    await personalizeMessage({ template: "test", category: "follow_up" });
    const fuPrompt = (mockCreate.mock.calls[2][0] as { messages: Array<{ role: string; content: string }> }).messages[1].content;
    expect(fuPrompt).toContain("400 characters");
  });

  it("throws when OpenAI returns empty content", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    await expect(
      personalizeMessage({ template: "test", category: "message" })
    ).rejects.toThrow("Unexpected response from OpenAI API");
  });

  it("propagates API errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API rate limit exceeded"));

    await expect(
      personalizeMessage({ template: "test", category: "message" })
    ).rejects.toThrow("API rate limit exceeded");
  });

  it("passes the system prompt from prompts.ts", async () => {
    mockTextResponse("ok");

    await personalizeMessage({ template: "test", category: "message" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system", content: "test-system-prompt" }),
        ]),
      })
    );
  });
});
