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

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { AppError, CircuitOpenError } from "@/lib/errors";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. Default: 3 */
  failureThreshold: number;
  /** How long (ms) to keep the circuit open before allowing a test call. Default: 30 min */
  resetTimeout: number;
  /**
   * Decides whether an error counts toward opening the circuit.
   * When it returns false the error is treated as a successful round-trip for
   * circuit purposes (the API answered — it's not an outage) and is rethrown
   * unchanged. Default: every error counts.
   */
  shouldTrip?: (error: unknown) => boolean;
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  lastFailureAt: string | null;
  openedAt: string | null;
  /** ISO timestamp of when a recovery test call will be allowed (null if not OPEN). */
  nextRetryAt: string | null;
}

/** The subset of breaker state that is durable. */
export interface PersistedCircuitState {
  state: CircuitState;
  failures: number;
  lastFailureAt: string | null;
  openedAt: string | null;
}

/**
 * Durable backing store for the breaker.
 *
 * Without one the breaker is a per-process singleton, which on serverless
 * hosting means the invocation that trips it and the invocation that reports
 * status are usually different isolates — the dashboard shows CLOSED while
 * sends are being rejected, and "reset" resets an unrelated instance.
 *
 * Both methods are best-effort: a store failure degrades the breaker to
 * in-memory behaviour rather than breaking the calls it guards.
 */
export interface CircuitBreakerStore {
  load(): Promise<PersistedCircuitState | null>;
  save(state: PersistedCircuitState): Promise<void>;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeout: 30 * 60 * 1000,
};

/**
 * How long a hydrated snapshot is treated as fresh. Bounds the extra read to
 * roughly one per burst of calls instead of one per call, while keeping a
 * newly-opened circuit visible to other isolates almost immediately.
 */
const HYDRATE_TTL_MS = 5_000;

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailureAt: Date | null = null;
  private openedAt: Date | null = null;
  private readonly config: CircuitBreakerConfig;
  private onOpenCallback?: () => Promise<void>;
  private store?: CircuitBreakerStore;
  private lastHydratedAt = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Attach a durable store. Call before the breaker is first used. */
  setStore(store: CircuitBreakerStore): void {
    this.store = store;
  }

  /**
   * Pull the shared state in, so a circuit opened by another invocation is
   * honoured here. No-ops without a store, and when the last read is still
   * within HYDRATE_TTL_MS.
   */
  async hydrate(force = false): Promise<void> {
    if (!this.store) return;
    if (!force && Date.now() - this.lastHydratedAt < HYDRATE_TTL_MS) return;

    try {
      const persisted = await this.store.load();
      this.lastHydratedAt = Date.now();
      if (!persisted) return;

      this.state = persisted.state;
      this.failures = persisted.failures;
      this.lastFailureAt = persisted.lastFailureAt ? new Date(persisted.lastFailureAt) : null;
      this.openedAt = persisted.openedAt ? new Date(persisted.openedAt) : null;
    } catch (err) {
      logger.error({ error: err }, "circuit breaker hydrate failed — using in-memory state");
    }
  }

  /** Push the current state out. Best-effort; never throws. */
  private async persist(): Promise<void> {
    if (!this.store) return;

    try {
      await this.store.save({
        state: this.state,
        failures: this.failures,
        lastFailureAt: this.lastFailureAt?.toISOString() ?? null,
        openedAt: this.openedAt?.toISOString() ?? null,
      });
      this.lastHydratedAt = Date.now();
    } catch (err) {
      logger.error({ error: err }, "circuit breaker persist failed — state is process-local");
    }
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
    // Adopt any state another invocation has written before deciding.
    await this.hydrate();

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
        await this.persist();
      } else {
        throw new CircuitOpenError(
          "Circuit breaker is OPEN — Unipile API calls are blocked",
          { context: this.getStatus() as unknown as Record<string, unknown> }
        );
      }
    }

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      if (this.config.shouldTrip && !this.config.shouldTrip(error)) {
        // Client-level error (e.g. 404/422) — the API responded, so this is
        // not an availability failure. Reset the consecutive-failure count.
        await this.onSuccess();
      } else {
        await this.onFailure(error);
      }
      throw error;
    }
  }

  /** Manually reset to CLOSED (operator action). */
  async reset(): Promise<void> {
    const previous = this.state;
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
    logger.info({ previousState: previous }, "circuit breaker manually reset → CLOSED");
    await this.persist();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async onSuccess(): Promise<void> {
    const wasDisturbed = this.state !== "CLOSED" || this.failures > 0;

    if (this.state === "HALF_OPEN") {
      logger.info("circuit breaker test call succeeded → CLOSED");
    }
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureAt = null;
    this.openedAt = null;

    // Only write when something actually changed — the happy path is by far
    // the most common and must not cost a round-trip per call.
    if (wasDisturbed) await this.persist();
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
      await this.persist();
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
      await this.persist();
      await this.triggerOnOpen();
      return;
    }

    // Still CLOSED, but the consecutive-failure count matters across
    // invocations — otherwise every isolate starts counting from zero and the
    // threshold is never reached.
    await this.persist();
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

/**
 * Only availability failures should open the circuit: network errors,
 * 5xx responses, and 429 provider throttling. Plain 4xx client errors
 * (404 profile not found, 422 validation) mean the API is reachable —
 * counting them would pause every campaign over a few bad lookups.
 */
function isAvailabilityFailure(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  // Unknown error shapes (e.g. raw fetch TypeError) count as failures
  return true;
}

/** Fixed primary key of the single circuit_breaker_state row. */
const BREAKER_ROW_ID = "unipile";

/**
 * Supabase-backed store using the service-role key.
 *
 * Deliberately not the request-scoped client: writes must succeed from any
 * caller, and circuit_breaker_state is readable by authenticated users but
 * writable only by the service role (migration 20240101000018).
 *
 * Returns null when service-role credentials are absent (e.g. local dev or
 * tests), which leaves the breaker in pure in-memory mode.
 */
export function createSupabaseCircuitBreakerStore(): CircuitBreakerStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const client = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async load(): Promise<PersistedCircuitState | null> {
      const { data, error } = await client
        .from("circuit_breaker_state")
        .select("state, failures, last_failure_at, opened_at")
        .eq("id", BREAKER_ROW_ID)
        .maybeSingle();

      if (error || !data) return null;

      const row = data as {
        state: CircuitState;
        failures: number;
        last_failure_at: string | null;
        opened_at: string | null;
      };

      return {
        state: row.state,
        failures: row.failures,
        lastFailureAt: row.last_failure_at,
        openedAt: row.opened_at,
      };
    },

    async save(state: PersistedCircuitState): Promise<void> {
      const { error } = await client.from("circuit_breaker_state").upsert(
        {
          id: BREAKER_ROW_ID,
          state: state.state,
          failures: state.failures,
          last_failure_at: state.lastFailureAt,
          opened_at: state.openedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) throw new Error(`circuit breaker save failed: ${error.message}`);
    },
  };
}

let _instance: CircuitBreaker | null = null;

export function getCircuitBreaker(): CircuitBreaker {
  if (!_instance) {
    _instance = new CircuitBreaker({ shouldTrip: isAvailabilityFailure });
    const store = createSupabaseCircuitBreakerStore();
    if (store) _instance.setStore(store);
  }
  return _instance;
}
