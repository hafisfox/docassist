import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger before importing the module under test
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { CircuitBreaker, CircuitOpenError } from "@/lib/queue/circuitBreaker";

// Re-export CircuitOpenError from errors so the test can reference it
vi.mock("@/lib/errors", () => {
  class CircuitOpenError extends Error {
    statusCode = 503;
    correlationId: string | undefined;
    context: Record<string, unknown>;
    constructor(message: string, options: { context?: Record<string, unknown> } = {}) {
      super(message);
      this.name = "CircuitOpenError";
      this.context = options.context ?? {};
    }
  }
  return { CircuitOpenError };
});

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    // Use a very short resetTimeout so we can test HALF_OPEN transitions
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 50 });
  });

  it("starts in CLOSED state", () => {
    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().failures).toBe(0);
  });

  it("executes successfully in CLOSED state", async () => {
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().failures).toBe(0);
  });

  it("counts failures without opening below threshold", async () => {
    const fail = () => cb.execute(() => Promise.reject(new Error("boom")));

    await expect(fail()).rejects.toThrow("boom");
    expect(cb.getStatus().failures).toBe(1);
    expect(cb.getStatus().state).toBe("CLOSED");

    await expect(fail()).rejects.toThrow("boom");
    expect(cb.getStatus().failures).toBe(2);
    expect(cb.getStatus().state).toBe("CLOSED");
  });

  it("transitions to OPEN after reaching failureThreshold", async () => {
    const fail = () => cb.execute(() => Promise.reject(new Error("boom")));

    await expect(fail()).rejects.toThrow();
    await expect(fail()).rejects.toThrow();
    await expect(fail()).rejects.toThrow();

    expect(cb.getStatus().state).toBe("OPEN");
    expect(cb.getStatus().failures).toBe(3);
    expect(cb.getStatus().openedAt).not.toBeNull();
  });

  it("rejects immediately with CircuitOpenError when OPEN", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    }
    expect(cb.getStatus().state).toBe("OPEN");

    await expect(
      cb.execute(() => Promise.resolve("should not run"))
    ).rejects.toThrow("Circuit breaker is OPEN");
  });

  it("resets to CLOSED on manual reset()", async () => {
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    }
    expect(cb.getStatus().state).toBe("OPEN");

    cb.reset();
    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().failures).toBe(0);
    expect(cb.getStatus().openedAt).toBeNull();
  });

  it("transitions to HALF_OPEN after resetTimeout elapses", async () => {
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    }
    expect(cb.getStatus().state).toBe("OPEN");

    // Wait for resetTimeout (50 ms)
    await new Promise((r) => setTimeout(r, 60));

    // The next call should switch to HALF_OPEN and execute the test call
    const result = await cb.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
    expect(cb.getStatus().state).toBe("CLOSED");
  });

  it("transitions back to OPEN if HALF_OPEN test call fails", async () => {
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 60));

    await expect(
      cb.execute(() => Promise.reject(new Error("still broken")))
    ).rejects.toThrow("still broken");

    expect(cb.getStatus().state).toBe("OPEN");
  });

  it("invokes onOpen callback when circuit opens", async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    cb.setOnOpenCallback(onOpen);

    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    }

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("getStatus returns nextRetryAt when OPEN", async () => {
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    }
    const status = cb.getStatus();
    expect(status.state).toBe("OPEN");
    expect(status.nextRetryAt).not.toBeNull();
    // nextRetryAt should be ~50ms in the future
    const nextRetry = new Date(status.nextRetryAt!).getTime();
    expect(nextRetry).toBeGreaterThan(Date.now());
  });
});
