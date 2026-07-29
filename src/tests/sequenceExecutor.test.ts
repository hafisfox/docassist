/**
 * Executor scheduling tests: how work is claimed, and when the outreach window
 * is considered open.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createCorrelationId: () => "test-correlation-id",
  withCorrelationId: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  }),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchDueEnrollments,
  isWithinWorkingHours,
  getNextWorkingWindowStart,
} from "@/lib/queue/sequenceExecutor";
import type { Database, Settings } from "@/types/database";

// ── Claiming ──────────────────────────────────────────────────────────────────

describe("fetchDueEnrollments", () => {
  function buildSupabase(result: { data?: unknown; error?: { message: string } | null }) {
    const rpc = vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    });
    return { supabase: { rpc } as unknown as SupabaseClient<Database>, rpc };
  }

  it("selects and claims in one atomic statement", async () => {
    const rows = [{ id: "e1" }, { id: "e2" }];
    const { supabase, rpc } = buildSupabase({ data: rows });

    const result = await fetchDueEnrollments(supabase);

    expect(result).toEqual(rows);
    // A separate SELECT-then-UPDATE left a window in which an overlapping run
    // claimed the same rows and double-sent. One RPC round-trip, no window.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("claim_due_enrollments", {
      p_limit: expect.any(Number),
      p_claim_until: expect.any(String),
    });
  });

  it("claims rows into the future so an overlapping run skips them", async () => {
    const { supabase, rpc } = buildSupabase({ data: [] });

    const before = Date.now();
    await fetchDueEnrollments(supabase);

    const claimUntil = Date.parse(rpc.mock.calls[0][1].p_claim_until);
    expect(claimUntil).toBeGreaterThan(before);
  });

  it("returns an empty list rather than null when nothing is due", async () => {
    const { supabase } = buildSupabase({ data: null });
    await expect(fetchDueEnrollments(supabase)).resolves.toEqual([]);
  });

  it("throws when the claim fails, so the run aborts instead of silently idling", async () => {
    const { supabase } = buildSupabase({ error: { message: "deadlock detected" } });
    await expect(fetchDueEnrollments(supabase)).rejects.toThrow("deadlock detected");
  });
});

// ── Working hours ─────────────────────────────────────────────────────────────

function settings(start: number, end: number, timezone = "UTC"): Settings {
  return {
    outreach_start_hour: start,
    outreach_end_hour: end,
    timezone,
  } as Settings;
}

/** Pins wall-clock to a given UTC hour. */
function atUtcHour(hour: number) {
  vi.setSystemTime(new Date(Date.UTC(2026, 6, 29, hour, 0, 0)));
}

describe("isWithinWorkingHours", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens and closes an ordinary daytime window", () => {
    atUtcHour(8);
    expect(isWithinWorkingHours(settings(9, 18))).toBe(false);
    atUtcHour(9);
    expect(isWithinWorkingHours(settings(9, 18))).toBe(true);
    atUtcHour(17);
    expect(isWithinWorkingHours(settings(9, 18))).toBe(true);
    atUtcHour(18); // end hour is exclusive
    expect(isWithinWorkingHours(settings(9, 18))).toBe(false);
  });

  it("handles a window that wraps past midnight", () => {
    // The old `hour >= start && hour < end` test was unsatisfiable for 22→6, so
    // this configuration never sent anything and rescheduled forever.
    atUtcHour(23);
    expect(isWithinWorkingHours(settings(22, 6))).toBe(true);
    atUtcHour(3);
    expect(isWithinWorkingHours(settings(22, 6))).toBe(true);
    atUtcHour(12);
    expect(isWithinWorkingHours(settings(22, 6))).toBe(false);
    atUtcHour(6); // end hour is exclusive here too
    expect(isWithinWorkingHours(settings(22, 6))).toBe(false);
  });

  it("reads start === end as 24-hour operation rather than never", () => {
    atUtcHour(3);
    expect(isWithinWorkingHours(settings(9, 9))).toBe(true);
  });

  it("evaluates the window in the configured timezone, not the server's", () => {
    // 03:00 UTC is 08:30 in Kolkata — outside a 9→18 window either way — while
    // 05:00 UTC is 10:30 there, inside it.
    atUtcHour(3);
    expect(isWithinWorkingHours(settings(9, 18, "Asia/Kolkata"))).toBe(false);
    atUtcHour(5);
    expect(isWithinWorkingHours(settings(9, 18, "Asia/Kolkata"))).toBe(true);
  });
});

describe("getNextWorkingWindowStart", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function hoursUntil(target: Date): number {
    return Math.round((target.getTime() - Date.now()) / 3_600_000);
  }

  it("waits until the window opens later the same day", () => {
    atUtcHour(2);
    expect(hoursUntil(getNextWorkingWindowStart(settings(9, 18)))).toBe(7);
  });

  it("rolls over midnight when the window has already closed", () => {
    atUtcHour(20);
    expect(hoursUntil(getNextWorkingWindowStart(settings(9, 18)))).toBe(13);
  });

  it("always lands inside the window it targets", () => {
    for (const hour of [0, 5, 8, 19, 23]) {
      atUtcHour(hour);
      const next = getNextWorkingWindowStart(settings(9, 18));
      vi.setSystemTime(next);
      expect(isWithinWorkingHours(settings(9, 18))).toBe(true);
    }
  });

  it("also lands inside a midnight-wrapping window", () => {
    for (const hour of [7, 12, 18, 21]) {
      atUtcHour(hour);
      const next = getNextWorkingWindowStart(settings(22, 6));
      vi.setSystemTime(next);
      expect(isWithinWorkingHours(settings(22, 6))).toBe(true);
    }
  });
});
