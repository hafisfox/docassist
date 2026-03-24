/**
 * Circuit breaker for external API calls (Unipile).
 *
 * States:
 *  CLOSED    — normal operation, failures counted
 *  OPEN      — all calls rejected immediately for resetTimeout duration
 *  HALF_OPEN — one test call allowed after resetTimeout; success → CLOSED, failure → OPEN
 *
 * Default config: failureThreshold=3, resetTimeout=30 minutes.
 */

import { logger } from "@/lib/logger";
import { CircuitOpenError } from "@/lib/errors";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. Default: 3 */
  failureThreshold: number;
  /** How long (ms) to keep the circuit open before allowing a test call. Default: 30 min */
  resetTimeout: number;
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  lastFailureAt: string | null;
  openedAt: string | null;
  /** ISO timestamp of when a recovery test call will be allowed (null if not OPEN). */
  nextRetryAt: string | null;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeout: 30 * 60 * 1000,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailureAt: Date | null = null;
  private openedAt: Date | null = null;
  private readonly config: CircuitBreakerConfig;
  private onOpenCallback?: () => Promise<void>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a callback invoked every time the circuit transitions to OPEN.
   * Used to pause all active campaigns and alert operators.
   */
  setOnOpenCallback(fn: () => Promise<void>): void {
    this.onOpenCallback = fn;
  }

  getStatus(): CircuitBreakerStatus {
    const nextRetryAt = this.openedAt
      ? new Date(this.openedAt.getTime() + this.config.resetTimeout)
      : null;

    return {
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt?.toISOString() ?? null,
      openedAt: this.openedAt?.toISOString() ?? null,
      nextRetryAt: nextRetryAt?.toISOString() ?? null,
    };
  }

  /**
   * Execute `fn` through the circuit breaker.
   *
   * - CLOSED: run normally, count failures
   * - OPEN (timeout elapsed): transition to HALF_OPEN, allow one test call
   * - OPEN (timeout not elapsed): throw CircuitOpenError immediately
   * - HALF_OPEN: run test call; success → CLOSED, failure → OPEN again
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = this.openedAt
        ? Date.now() - this.openedAt.getTime()
        : Infinity;

      if (elapsed >= this.config.resetTimeout) {
        this.state = "HALF_OPEN";
        logger.info(
          { ...this.getStatus() },
          "circuit breaker → HALF_OPEN: allowing one test call"
        );
      } else {
        throw new CircuitOpenError(
          "Circuit breaker is OPEN — Unipile API calls are blocked",
          { context: this.getStatus() as unknown as Record<string, unknown> }
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error);
      throw error;
    }
  }

  /** Manually reset to CLOSED (operator action). */
  reset(): void {
    const previous = this.state;
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
    logger.info({ previousState: previous }, "circuit breaker manually reset → CLOSED");
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      logger.info("circuit breaker test call succeeded → CLOSED");
    }
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
  }

  private async onFailure(error: unknown): Promise<void> {
    this.failures++;
    this.lastFailureAt = new Date();

    if (this.state === "HALF_OPEN") {
      // Test call failed — stay open and restart the timeout
      this.state = "OPEN";
      this.openedAt = new Date();
      logger.error(
        { failures: this.failures, error },
        "circuit breaker test call failed → re-OPEN"
      );
      await this.triggerOnOpen();
      return;
    }

    if (this.failures >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = new Date();
      logger.error(
        {
          failures: this.failures,
          threshold: this.config.failureThreshold,
          resetTimeoutMs: this.config.resetTimeout,
          error,
        },
        "CRITICAL: circuit breaker OPENED — Unipile API unavailable, pausing campaigns"
      );
      await this.triggerOnOpen();
    }
  }

  private async triggerOnOpen(): Promise<void> {
    if (this.onOpenCallback) {
      try {
        await this.onOpenCallback();
      } catch (err) {
        logger.error({ error: err }, "circuit breaker onOpen callback threw");
      }
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _instance: CircuitBreaker | null = null;

export function getCircuitBreaker(): CircuitBreaker {
  if (!_instance) {
    _instance = new CircuitBreaker();
  }
  return _instance;
}
