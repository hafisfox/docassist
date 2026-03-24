import { createCorrelationId, withCorrelationId } from "@/lib/logger";
import { RateLimitError, UnipileError } from "@/lib/errors";
import { getUnipileClient } from "./client";
import type {
  UnipileCreateChatResponse,
  UnipileSendInvitationResponse,
  UnipileSendMessageResponse,
  RateLimitCounters,
} from "./types";

// ─── Defaults (safety margins under LinkedIn limits) ────────────────────────

const DEFAULT_MAX_DAILY_INVITES = 25;
const DEFAULT_MAX_DAILY_MESSAGES = 150;
const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 120_000;

// ─── Rate-limit checks ─────────────────────────────────────────────────────

function isCounterStale(resetAt: Date): boolean {
  const now = new Date();
  return (
    now.getUTCFullYear() !== resetAt.getUTCFullYear() ||
    now.getUTCMonth() !== resetAt.getUTCMonth() ||
    now.getUTCDate() !== resetAt.getUTCDate()
  );
}

function checkInviteLimit(
  counters: RateLimitCounters,
  maxDaily: number,
  correlationId: string,
): void {
  const effectiveCount = isCounterStale(counters.countersResetAt)
    ? 0
    : counters.invitesSentToday;

  if (effectiveCount >= maxDaily) {
    throw new RateLimitError(
      `Daily invitation limit reached (${maxDaily}). Try again tomorrow.`,
      {
        correlationId,
        context: { sent: effectiveCount, limit: maxDaily },
      },
    );
  }
}

function checkMessageLimit(
  counters: RateLimitCounters,
  maxDaily: number,
  correlationId: string,
): void {
  const effectiveCount = isCounterStale(counters.countersResetAt)
    ? 0
    : counters.messagesSentToday;

  if (effectiveCount >= maxDaily) {
    throw new RateLimitError(
      `Daily message limit reached (${maxDaily}). Try again tomorrow.`,
      {
        correlationId,
        context: { sent: effectiveCount, limit: maxDaily },
      },
    );
  }
}

// ─── Random delay helper ────────────────────────────────────────────────────

function randomDelay(
  minMs: number = MIN_DELAY_MS,
  maxMs: number = MAX_DELAY_MS,
): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Rate-limited invitation ────────────────────────────────────────────────

export async function sendInvitationWithRateLimit(options: {
  providerId: string;
  message?: string;
  counters: RateLimitCounters;
  maxDailyInvites?: number;
  skipDelay?: boolean;
  correlationId?: string;
}): Promise<UnipileSendInvitationResponse> {
  const cid = options.correlationId ?? createCorrelationId();
  const log = withCorrelationId(cid);
  const maxInvites = options.maxDailyInvites ?? DEFAULT_MAX_DAILY_INVITES;

  checkInviteLimit(options.counters, maxInvites, cid);

  log.info(
    {
      providerId: options.providerId,
      currentCount: options.counters.invitesSentToday,
      limit: maxInvites,
    },
    "sending rate-limited invitation",
  );

  if (!options.skipDelay) {
    await randomDelay();
  }

  const client = getUnipileClient();
  return client.sendInvitation(
    { provider_id: options.providerId, message: options.message },
    cid,
  );
}

// ─── Rate-limited new message (creates chat) ────────────────────────────────

export async function sendMessageWithRateLimit(options: {
  attendeesIds: string[];
  text: string;
  counters: RateLimitCounters;
  maxDailyMessages?: number;
  skipDelay?: boolean;
  correlationId?: string;
}): Promise<UnipileCreateChatResponse> {
  const cid = options.correlationId ?? createCorrelationId();
  const log = withCorrelationId(cid);
  const maxMessages = options.maxDailyMessages ?? DEFAULT_MAX_DAILY_MESSAGES;

  checkMessageLimit(options.counters, maxMessages, cid);

  log.info(
    {
      attendeesCount: options.attendeesIds.length,
      currentCount: options.counters.messagesSentToday,
      limit: maxMessages,
    },
    "sending rate-limited message (new chat)",
  );

  if (!options.skipDelay) {
    await randomDelay();
  }

  const client = getUnipileClient();
  return client.sendMessage(
    { attendees_ids: options.attendeesIds, text: options.text },
    cid,
  );
}

// ─── Rate-limited reply in existing chat ────────────────────────────────────

export async function sendReplyWithRateLimit(options: {
  chatId: string;
  text: string;
  counters: RateLimitCounters;
  maxDailyMessages?: number;
  skipDelay?: boolean;
  correlationId?: string;
}): Promise<UnipileSendMessageResponse> {
  const cid = options.correlationId ?? createCorrelationId();
  const log = withCorrelationId(cid);
  const maxMessages = options.maxDailyMessages ?? DEFAULT_MAX_DAILY_MESSAGES;

  checkMessageLimit(options.counters, maxMessages, cid);

  log.info(
    {
      chatId: options.chatId,
      currentCount: options.counters.messagesSentToday,
      limit: maxMessages,
    },
    "sending rate-limited reply in existing chat",
  );

  if (!options.skipDelay) {
    await randomDelay();
  }

  const client = getUnipileClient();
  return client.sendMessageInChat(
    { chat_id: options.chatId, text: options.text },
    cid,
  );
}
