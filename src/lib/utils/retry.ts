import { AppError, CircuitOpenError } from "@/lib/errors";

export interface RetryOptions {
  /** Maximum number of retry attempts after the initial call (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff — delays are 1×, 2×, 4× this value (default: 1000) */
  baseDelayMs?: number;
}

/**
 * Returns true if the error is safe to retry.
 * Retries on 429 (rate-limit) and 5xx server errors.
 * Never retries 4xx client errors or circuit-open errors.
 */
function isRetryable(error: unknown): boolean {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async function with exponential-backoff retry logic.
 *
 * Delays: 1 s → 2 s → 4 s (baseDelayMs × 2^attempt)
 * Only retries on HTTP 429 / 5xx and network-level errors.
 * 4xx client errors (except 429) and CircuitOpenError are not retried.
 *
 * @example
 * const data = await withRetry(() => unipileClient.getProfile(id));
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt || !isRetryable(error)) {
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
