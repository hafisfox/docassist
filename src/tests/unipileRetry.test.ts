/**
 * Retry-policy tests, with the emphasis on the property that actually protects
 * the LinkedIn account: a send that may already have reached a real person is
 * never repeated automatically.
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

// Pass calls straight through so these tests observe the retry layer alone.
vi.mock("@/lib/queue/circuitBreaker", () => ({
  getCircuitBreaker: () => ({
    execute: <T>(fn: () => Promise<T>) => fn(),
  }),
}));

import {
  withRetry,
  isRetryable,
  isRetryableForNonIdempotent,
} from "@/lib/utils/retry";
import { AppError, UnipileError, CircuitOpenError } from "@/lib/errors";
import { UnipileClient } from "@/lib/unipile/client";

// Retry backoff is 1 s → 2 s → 4 s; fake timers keep the suite instant.
function withFakeTimers() {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
}

/** Runs `promise` to settlement while auto-advancing the backoff sleeps. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const result = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const outcome = await result;
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

// ── Predicates ────────────────────────────────────────────────────────────────

describe("retry predicates", () => {
  it("retries 429 and 5xx for idempotent calls", () => {
    expect(isRetryable(new AppError("throttled", { statusCode: 429 }))).toBe(true);
    expect(isRetryable(new AppError("boom", { statusCode: 500 }))).toBe(true);
    expect(isRetryable(new AppError("bad gateway", { statusCode: 502 }))).toBe(true);
    expect(isRetryable(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not retry 4xx or an open circuit for idempotent calls", () => {
    expect(isRetryable(new AppError("not found", { statusCode: 404 }))).toBe(false);
    expect(isRetryable(new CircuitOpenError("open"))).toBe(false);
  });

  it("retries only 429 for non-idempotent calls", () => {
    // Proof of a non-send: the provider rejected it outright.
    expect(isRetryableForNonIdempotent(new AppError("throttled", { statusCode: 429 }))).toBe(
      true,
    );
  });

  it("treats 5xx and network failures as ambiguous for non-idempotent calls", () => {
    // These are equally consistent with "LinkedIn accepted it and the ack was
    // lost", so repeating would risk a duplicate invite/DM to a real person.
    expect(isRetryableForNonIdempotent(new AppError("boom", { statusCode: 500 }))).toBe(false);
    expect(isRetryableForNonIdempotent(new AppError("timeout", { statusCode: 504 }))).toBe(
      false,
    );
    expect(isRetryableForNonIdempotent(new TypeError("fetch failed"))).toBe(false);
    expect(isRetryableForNonIdempotent(new CircuitOpenError("open"))).toBe(false);
  });
});

// ── withRetry ─────────────────────────────────────────────────────────────────

describe("withRetry", () => {
  withFakeTimers();

  it("honours a custom shouldRetry predicate", async () => {
    const fn = vi.fn().mockRejectedValue(new AppError("boom", { statusCode: 500 }));

    await expect(
      settle(withRetry(fn, { shouldRetry: isRetryableForNonIdempotent })),
    ).rejects.toThrow("boom");

    expect(fn).toHaveBeenCalledTimes(1); // no retries
  });

  it("still retries by default", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new AppError("boom", { statusCode: 500 }))
      .mockResolvedValue("ok");

    await expect(settle(withRetry(fn))).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── Client wiring ─────────────────────────────────────────────────────────────

describe("UnipileClient idempotency wiring", () => {
  withFakeTimers();

  let fetchMock: ReturnType<typeof vi.fn>;
  let client: UnipileClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new UnipileClient({
      apiKey: "test-key",
      dsn: "api.test:443",
      accountId: "acct-1",
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function respondOnce(status: number, body: unknown = {}) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  function alwaysRespond(status: number, body: unknown = {}) {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  it("does not re-send an invitation after an ambiguous 502", async () => {
    alwaysRespond(502);

    await expect(
      settle(client.sendInvitation({ provider_id: "p1", message: "hi" })),
    ).rejects.toBeInstanceOf(UnipileError);

    // The whole point: one attempt, one invitation, no duplicate.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-send a new-chat message after a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      settle(client.sendMessage({ attendees_ids: ["p1"], text: "hi" })),
    ).rejects.toBeInstanceOf(UnipileError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-send an in-chat message after an ambiguous 500", async () => {
    alwaysRespond(500);

    await expect(
      settle(client.sendMessageInChat({ chat_id: "c1", text: "hi" })),
    ).rejects.toBeInstanceOf(UnipileError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still backs off and retries a throttled (429) send", async () => {
    respondOnce(429);
    respondOnce(200, { invitation_id: "inv-1" });

    await expect(
      settle(client.sendInvitation({ provider_id: "p1" })),
    ).resolves.toEqual({ invitation_id: "inv-1" });

    // 429 proves nothing was sent, so retrying is both safe and the point.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries reads on 5xx, since repeating them is harmless", async () => {
    respondOnce(500);
    respondOnce(200, { provider_id: "p1" });

    await expect(settle(client.getProfile("someone"))).resolves.toEqual({
      provider_id: "p1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
