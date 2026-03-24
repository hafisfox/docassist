import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  withCorrelationId: vi.fn().mockReturnValue({
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock("@/constants/linkedinLimits", () => ({
  MAX_DAILY_INVITES: 25,
  MAX_DAILY_MESSAGES: 50,
  MAX_DAILY_PROFILE_VIEWS: 80,
}));

import { checkAndIncrementLimit, randomDelay } from "@/lib/queue/rateLimiter";

// ── Helpers ──────────────────────────────────────────────────────────────────

type MockSettings = {
  user_id: string;
  invites_sent_today: number;
  messages_sent_today: number;
  max_daily_invites: number;
  max_daily_messages: number;
  max_daily_profile_views: number;
  counters_reset_at: string;
};

function buildSettings(overrides: Partial<MockSettings> = {}): MockSettings {
  return {
    user_id: "user-1",
    invites_sent_today: 0,
    messages_sent_today: 0,
    max_daily_invites: 25,
    max_daily_messages: 50,
    max_daily_profile_views: 80,
    counters_reset_at: new Date().toISOString(), // today → no reset needed
    ...overrides,
  };
}

/** Builds a chainable Supabase mock. `updateError` and `fetchError` are optional. */
function buildMockSupabase(
  settings: MockSettings | null,
  opts: { fetchError?: object; updateError?: object } = {}
) {
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ data: null, error: opts.updateError ?? null }),
  };

  const selectChain = {
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: settings,
        error: opts.fetchError ?? null,
      }),
    }),
  };

  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue(updateChain),
  });

  return { from: fromMock } as unknown as Parameters<typeof checkAndIncrementLimit>[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkAndIncrementLimit", () => {
  it("allows an invite when count is below limit", async () => {
    const supabase = buildMockSupabase(buildSettings({ invites_sent_today: 10 }));
    const result = await checkAndIncrementLimit(supabase, "user-1", "invite");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(14); // 25 - 11
    expect(result.current).toBe(11);
  });

  it("allows a message when count is below limit", async () => {
    const supabase = buildMockSupabase(buildSettings({ messages_sent_today: 49 }));
    const result = await checkAndIncrementLimit(supabase, "user-1", "message");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // 50 - 50
    expect(result.current).toBe(50);
  });

  it("denies when invite count is at limit", async () => {
    const supabase = buildMockSupabase(buildSettings({ invites_sent_today: 25 }));
    const result = await checkAndIncrementLimit(supabase, "user-1", "invite");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("denies when message count is at limit", async () => {
    const supabase = buildMockSupabase(buildSettings({ messages_sent_today: 50 }));
    const result = await checkAndIncrementLimit(supabase, "user-1", "message");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("allows profile_view unconditionally (no DB counter)", async () => {
    const supabase = buildMockSupabase(buildSettings());
    const result = await checkAndIncrementLimit(supabase, "user-1", "profile_view");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(80);
  });

  it("fails open when settings fetch returns an error", async () => {
    const supabase = buildMockSupabase(null, { fetchError: { code: "PGRST116" } });
    const result = await checkAndIncrementLimit(supabase, "user-1", "invite");

    // Should fail open — allow the action with default limit
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(25);
  });

  it("fails open when DB update fails (counter increment)", async () => {
    const supabase = buildMockSupabase(
      buildSettings({ invites_sent_today: 5 }),
      { updateError: { code: "23505" } }
    );
    const result = await checkAndIncrementLimit(supabase, "user-1", "invite");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(20); // 25 - 5
  });

  it("resets counters when counter_reset_at is from a previous UTC day", async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const supabase = buildMockSupabase(
      buildSettings({
        invites_sent_today: 20, // would be at limit after reset isn't done
        counters_reset_at: yesterday.toISOString(),
      })
    );

    const result = await checkAndIncrementLimit(supabase, "user-1", "invite");

    // After reset, counter becomes 0, then increments to 1
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.remaining).toBe(24);
  });
});

describe("randomDelay", () => {
  it("resolves after at least minMs milliseconds", async () => {
    const start = Date.now();
    await randomDelay(10, 30);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });

  it("resolves within maxMs + small buffer", async () => {
    const start = Date.now();
    await randomDelay(0, 50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200); // generous buffer for CI
  });
});
