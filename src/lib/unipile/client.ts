import {
  createCorrelationId,
  withCorrelationId,
  type Logger,
} from "@/lib/logger";
import { UnipileError } from "@/lib/errors";
import { getCircuitBreaker } from "@/lib/queue/circuitBreaker";
import { withRetry } from "@/lib/utils/retry";
import type {
  UnipileSearchParams,
  UnipileSearchResponse,
  UnipileProfile,
  UnipileSendInvitationParams,
  UnipileSendInvitationResponse,
  UnipileCreateChatParams,
  UnipileCreateChatResponse,
  UnipileSendMessageParams,
  UnipileSendMessageResponse,
  UnipileChatsResponse,
  UnipileChatMessagesResponse,
} from "./types";

function getConfig() {
  const apiKey = process.env.UNIPILE_API_KEY;
  const dsn = process.env.UNIPILE_DSN;

  if (!apiKey) throw new Error("UNIPILE_API_KEY is not set");
  if (!dsn) throw new Error("UNIPILE_DSN is not set");

  // account_id is stored per-user in the DB (settings.unipile_account_id)
  // and must be passed explicitly to each client method
  return { apiKey, dsn, accountId: process.env.UNIPILE_ACCOUNT_ID ?? "" };
}

export class UnipileClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly accountId: string;

  constructor(
    config?: { apiKey: string; dsn: string; accountId: string },
  ) {
    const resolved = config ?? getConfig();
    this.baseUrl = `https://${resolved.dsn}/api/v1`;
    this.apiKey = resolved.apiKey;
    this.accountId = resolved.accountId;
  }

  // ─── Core HTTP ──────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: Record<string, unknown>;
      params?: Record<string, string | number | undefined>;
      correlationId?: string;
    } = {},
  ): Promise<T> {
    const correlationId = options.correlationId ?? createCorrelationId();
    const log = withCorrelationId(correlationId);

    const url = new URL(`${this.baseUrl}${path}`);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    log.debug({ method, path, params: options.params }, "unipile request");

    const init: RequestInit = {
      method,
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    };
    if (options.body) {
      init.body = JSON.stringify(options.body);
    }

    return withRetry(() => getCircuitBreaker().execute(async () => {
      let response: Response;
      try {
        response = await fetch(url.toString(), init);
      } catch (error) {
        log.error({ error, method, path }, "unipile network error");
        throw new UnipileError("Network error calling Unipile API", {
          correlationId,
          context: { method, path },
          cause: error,
        });
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        log.error(
          { status: response.status, errorBody, method, path },
          "unipile api error",
        );
        throw new UnipileError(
          `Unipile API error: ${response.status} ${response.statusText}`,
          {
            statusCode: response.status,
            correlationId,
            context: { method, path, responseBody: errorBody },
          },
        );
      }

      const data = (await response.json()) as T;
      log.debug({ method, path, status: response.status }, "unipile response ok");
      return data;
    }));
  }

  // ─── Search ─────────────────────────────────────────────────────────

  async searchPeople(
    params: Omit<UnipileSearchParams, "account_id"> & { account_id?: string },
    correlationId?: string,
  ): Promise<UnipileSearchResponse> {
    const cid = correlationId ?? createCorrelationId();
    const log = withCorrelationId(cid);
    const accountId = params.account_id ?? this.accountId;

    if (!accountId) {
      throw new UnipileError("UNIPILE_ACCOUNT_ID is not configured", {
        correlationId: cid,
        statusCode: 500,
        context: { hint: "Set UNIPILE_ACCOUNT_ID in your environment variables" },
      });
    }

    log.info(
      { keywords: params.keywords, location: params.location },
      "searching linkedin people",
    );

    // Unipile's `location`, `company`, and `industry` fields require numeric
    // IDs retrieved from their "List search parameters" endpoint.  Since we
    // only have free-text values, we map them into fields that accept text:
    //   • title / company  → advanced_keywords.title / .company
    //   • location         → appended to the keywords string
    //   • industry         → appended to the keywords string
    const keywordParts: string[] = [];
    if (params.keywords) keywordParts.push(params.keywords);
    if (params.location) keywordParts.push(params.location);
    if (params.industry) keywordParts.push(params.industry);
    const keywords = keywordParts.length > 0 ? keywordParts.join(" ") : undefined;

    const advancedKeywords: Record<string, string> = {};
    if (params.title) advancedKeywords.title = params.title;
    if (params.company) advancedKeywords.company = params.company;

    return this.request<UnipileSearchResponse>("POST", "/linkedin/search", {
      params: { account_id: accountId },
      body: {
        api: params.api ?? "classic",
        category: params.category ?? "people",
        ...(keywords && { keywords }),
        ...(Object.keys(advancedKeywords).length > 0 && {
          advanced_keywords: advancedKeywords,
        }),
        ...(params.page && { page: params.page }),
      },
      correlationId: cid,
    });
  }

  // ─── Profile ────────────────────────────────────────────────────────

  async getProfile(
    identifier: string,
    accountId?: string,
    correlationId?: string,
  ): Promise<UnipileProfile> {
    const cid = correlationId ?? createCorrelationId();
    const log = withCorrelationId(cid);
    const acctId = accountId ?? this.accountId;

    log.info({ identifier }, "fetching linkedin profile");

    return this.request<UnipileProfile>(
      "GET",
      `/users/${encodeURIComponent(identifier)}`,
      {
        params: { account_id: acctId },
        correlationId: cid,
      },
    );
  }

  // ─── Invitations ───────────────────────────────────────────────────

  async sendInvitation(
    params: Omit<UnipileSendInvitationParams, "account_id"> & {
      account_id?: string;
    },
    correlationId?: string,
  ): Promise<UnipileSendInvitationResponse> {
    const cid = correlationId ?? createCorrelationId();
    const log = withCorrelationId(cid);
    const accountId = params.account_id ?? this.accountId;

    if (params.message && params.message.length > 300) {
      throw new UnipileError("Invitation message must be 300 characters or fewer", {
        correlationId: cid,
        statusCode: 400,
        context: { messageLength: params.message.length },
      });
    }

    log.info(
      { providerId: params.provider_id, hasMessage: !!params.message },
      "sending linkedin invitation",
    );

    return this.request<UnipileSendInvitationResponse>(
      "POST",
      "/users/invite",
      {
        body: {
          provider_id: params.provider_id,
          account_id: accountId,
          ...(params.message && { message: params.message }),
        },
        correlationId: cid,
      },
    );
  }

  // ─── Messaging ────────────────────────────────────────────────────

  async sendMessage(
    params: Omit<UnipileCreateChatParams, "account_id"> & {
      account_id?: string;
    },
    correlationId?: string,
  ): Promise<UnipileCreateChatResponse> {
    const cid = correlationId ?? createCorrelationId();
    const log = withCorrelationId(cid);
    const accountId = params.account_id ?? this.accountId;

    log.info(
      { attendeesCount: params.attendees_ids.length },
      "sending new linkedin message",
    );

    return this.request<UnipileCreateChatResponse>("POST", "/chats", {
      body: {
        account_id: accountId,
        attendees_ids: params.attendees_ids,
        text: params.text,
      },
      correlationId: cid,
    });
  }

  async sendMessageInChat(
    params: UnipileSendMessageParams,
    correlationId?: string,
  ): Promise<UnipileSendMessageResponse> {
    const cid = correlationId ?? createCorrelationId();
    const log = withCorrelationId(cid);

    log.info({ chatId: params.chat_id }, "sending message in existing chat");

    return this.request<UnipileSendMessageResponse>(
      "POST",
      `/chats/${encodeURIComponent(params.chat_id)}/messages`,
      {
        body: { text: params.text },
        correlationId: cid,
      },
    );
  }

  // ─── Chats ────────────────────────────────────────────────────────

  async getChats(
    accountId?: string,
    cursor?: string,
    correlationId?: string,
  ): Promise<UnipileChatsResponse> {
    const cid = correlationId ?? createCorrelationId();
    const log = withCorrelationId(cid);
    const acctId = accountId ?? this.accountId;

    log.info("listing linkedin chats");

    return this.request<UnipileChatsResponse>("GET", "/chats", {
      params: {
        account_id: acctId,
        account_type: "LINKEDIN",
        ...(cursor && { cursor }),
      },
      correlationId: cid,
    });
  }

  // ─── Test Connection ──────────────────────────────────────────────

  async testConnection(
    accountId: string,
    correlationId?: string,
  ): Promise<{ connected: boolean; accountId: string }> {
    const cid = correlationId ?? createCorrelationId();
    // Use GET /accounts/{id} — lightweight Unipile call to verify account exists and is reachable
    await this.request<unknown>("GET", `/accounts/${encodeURIComponent(accountId)}`, {
      correlationId: cid,
    });
    return { connected: true, accountId };
  }

  async getChatMessages(
    chatId: string,
    cursor?: string,
    correlationId?: string,
  ): Promise<UnipileChatMessagesResponse> {
    const cid = correlationId ?? createCorrelationId();
    const log = withCorrelationId(cid);

    log.info({ chatId }, "fetching chat messages");

    return this.request<UnipileChatMessagesResponse>(
      "GET",
      `/chats/${encodeURIComponent(chatId)}/messages`,
      {
        ...(cursor && { params: { cursor } }),
        correlationId: cid,
      },
    );
  }
}

/** Lazily-initialized singleton */
let _instance: UnipileClient | null = null;

export function getUnipileClient(): UnipileClient {
  if (!_instance) {
    _instance = new UnipileClient();
  }
  return _instance;
}
