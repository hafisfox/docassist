import { AppError, CircuitOpenError } from "@/lib/errors";

export interface RetryOptions {
  /** Maximum number of retry attempts after the initial call (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff — delays are 1×, 2×, 4× this value (default: 1000) */
  baseDelayMs?: number;
  /**
   * Decides whether a given error is worth another attempt.
   * Defaults to {@link isRetryable}, which assumes the operation is idempotent.
   * Pass {@link isRetryableForNonIdempotent} for calls that write.
   */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Returns true if the error is safe to retry **for an idempotent operation**.
 * Retries on 429 (rate-limit) and 5xx server errors.
 * Never retries 4xx client errors or circuit-open errors.
 */
export function isRetryable(error: unknown): boolean {
  // Never retry an open circuit — it will just fail instantly again
  if (error instanceof CircuitOpenError) return false;

  if (error instanceof AppError) {
    const { statusCode } = error;
    return statusCode === 429 || statusCode >= 500;
  }

  // TypeError is thrown by fetch() on network-level failures (no connection, DNS)
  if (error instanceof TypeError) return true;

  return false;
}

/**
 * Retry predicate for operations that are **not** safe to repeat — sending a
 * LinkedIn invitation or a DM, for instance.
 *
 * The distinction that matters is whether the failure proves the request never
 * took effect:
 *
 *  - **429** is proof of a non-send. The provider rejected the call outright
 *    before doing anything, so backing off and retrying is both safe and the
 *    whole point of a throttle response.
 *  - **5xx and network errors are ambiguous.** A gateway timeout or a dropped
 *    connection is equally consistent with "LinkedIn never saw it" and with
 *    "LinkedIn accepted it and the acknowledgement was lost". Retrying then
 *    sends a second invitation or a second copy of the same DM to a real
 *    person, which is exactly the duplicate outreach that gets accounts
 *    restricted — a far worse outcome than surfacing one failed send that the
 *    executor will schedule again after a fresh state check.
 *
 * So: retry throttling, surface ambiguity.
 */
export function isRetryableForNonIdempotent(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false;
  if (error instanceof AppError) return error.statusCode === 429;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async function with exponential-backoff retry logic.
 *
 * Delays: 1 s → 2 s → 4 s (baseDelayMs × 2^attempt)
 * By default only retries on HTTP 429 / 5xx and network-level errors; 4xx
 * client errors (except 429) and CircuitOpenError are not retried. Override
 * `shouldRetry` with {@link isRetryableForNonIdempotent} when repeating the
 * call could duplicate a side effect.
 *
 * @example
 * const data = await withRetry(() => unipileClient.getProfile(id));
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, shouldRetry = isRetryable } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }

      // 1000 ms, 2000 ms, 4000 ms
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await sleep(delayMs);
    }
  }

  // Unreachable — loop always throws or returns, but satisfies TypeScript
  throw lastError;
}
