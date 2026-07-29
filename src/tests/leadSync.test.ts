/**
 * leadSync tests, focused on the two properties webhook replays depend on:
 * a duplicate delivery must not produce duplicate side effects, and lookups on
 * the service-role client must stay inside the owning tenant.
 */

import { describe, it, expect, vi } from "vitest";

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

import {
  recordInboundMessage,
  recordOutboundMessage,
  upsertLeadByProvider,
} from "@/lib/webhooks/leadSync";
import type { Lead } from "@/types/database";

// ── Supabase test double ──────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "insert" | "update";
  payload?: unknown;
  filters: [string, unknown][];
}

type Result = { data?: unknown; error?: unknown };
type Handler = (table: string, op: Call["op"], payload: unknown) => Result;

/**
 * Chainable stand-in covering the query shapes leadSync uses. Every terminal
 * (`.single()`, `.maybeSingle()`, or awaiting the builder) records the call and
 * resolves whatever `handler` returns.
 */
function makeSupabase(handler: Handler = () => ({})) {
  const calls: Call[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null }));

  function from(table: string) {
    const state: Call = { table, op: "select", filters: [] };

    const settle = async () => {
      calls.push({ ...state, filters: [...state.filters] });
      const { data = null, error = null } = handler(state.table, state.op, state.payload);
      return { data, error };
    };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const builder: any = {
      select: () => builder,
      insert: (payload: unknown) => {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.filters.push([column, value]);
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push([column, value]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => settle(),
      single: () => settle(),
      then: (onOk: unknown, onErr: unknown) =>
        settle().then(onOk as never, onErr as never),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return builder;
  }

  return { client: { from, rpc }, calls, rpc };
}

const UNIQUE_VIOLATION = { code: "23505", message: "duplicate key value" };

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    user_id: "user-1",
    campaign_id: "campaign-1",
    status: "message_sent",
    unipile_chat_id: "chat-1",
    linkedin_provider_id: "provider-1",
    ...overrides,
  } as Lead;
}

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    lead: buildLead(),
    text: "sounds good, let's talk",
    messageId: "msg-1",
    chatId: "chat-1",
    correlationId: "cid-1",
    ...overrides,
  };
}

// ── Inbound de-duplication ────────────────────────────────────────────────────

describe("recordInboundMessage de-duplication", () => {
  it("skips a replay caught by the pre-check without touching anything", async () => {
    const { client, calls, rpc } = makeSupabase((table, op) =>
      table === "messages" && op === "select" ? { data: { id: "existing" } } : {},
    );

    const result = await recordInboundMessage(client, inbound());

    expect(result.skipped).toBe(true);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("skips a replay that loses the insert race, without double-counting the reply", async () => {
    // Two concurrent deliveries can both clear the pre-check; the loser is
    // rejected by the unique index. It must not go on to bump the campaign's
    // reply counter or re-pause enrollments a second time.
    const { client, calls, rpc } = makeSupabase((table, op) => {
      if (table === "messages" && op === "select") return { data: null };
      if (table === "messages" && op === "insert") return { error: UNIQUE_VIOLATION };
      return {};
    });

    const result = await recordInboundMessage(client, inbound());

    expect(result.skipped).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.table === "leads" && c.op === "update")).toHaveLength(0);
    expect(calls.filter((c) => c.table === "activities")).toHaveLength(0);
  });

  it("surfaces a genuine insert failure instead of reporting success", async () => {
    const { client } = makeSupabase((table, op) => {
      if (table === "messages" && op === "select") return { data: null };
      if (table === "messages" && op === "insert")
        return { error: { code: "42501", message: "permission denied" } };
      return {};
    });

    await expect(recordInboundMessage(client, inbound())).rejects.toThrow(
      "permission denied",
    );
  });

  it("records the reply and its side effects on the happy path", async () => {
    const { client, calls, rpc } = makeSupabase((table, op) => {
      if (table === "messages" && op === "select") return { data: null };
      if (table === "sequence_enrollments" && op === "select") return { data: [] };
      return {};
    });

    const result = await recordInboundMessage(client, inbound());

    expect(result).toEqual({ skipped: false, newStatus: "replied" });
    expect(calls.filter((c) => c.table === "messages" && c.op === "insert")).toHaveLength(1);
    expect(calls.filter((c) => c.table === "leads" && c.op === "update")).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith(
      "increment_campaign_stat",
      expect.objectContaining({ p_field: "replies_received" }),
    );
  });

  it("routes an opt-out to do_not_contact", async () => {
    const { client } = makeSupabase((table, op) => {
      if (table === "messages" && op === "select") return { data: null };
      if (table === "sequence_enrollments" && op === "select") return { data: [] };
      return {};
    });

    const result = await recordInboundMessage(
      client,
      inbound({ text: "please stop contacting me" }),
    );

    expect(result.newStatus).toBe("do_not_contact");
  });
});

// ── Outbound de-duplication ───────────────────────────────────────────────────

describe("recordOutboundMessage de-duplication", () => {
  it("skips a mirrored send that loses the insert race", async () => {
    const { client, calls } = makeSupabase((table, op) => {
      if (table === "messages" && op === "select") return { data: null };
      if (table === "messages" && op === "insert") return { error: UNIQUE_VIOLATION };
      return {};
    });

    const result = await recordOutboundMessage(client, {
      lead: buildLead(),
      text: "hi",
      messageId: "msg-9",
      correlationId: "cid-1",
    });

    expect(result.skipped).toBe(true);
    // last_contacted_at must not advance for a message we did not store.
    expect(calls.filter((c) => c.table === "leads" && c.op === "update")).toHaveLength(0);
  });

  it("surfaces a genuine insert failure", async () => {
    const { client } = makeSupabase((table, op) => {
      if (table === "messages" && op === "select") return { data: null };
      if (table === "messages" && op === "insert")
        return { error: { code: "23503", message: "foreign key violation" } };
      return {};
    });

    await expect(
      recordOutboundMessage(client, {
        lead: buildLead(),
        text: "hi",
        messageId: "msg-9",
        correlationId: "cid-1",
      }),
    ).rejects.toThrow("foreign key violation");
  });
});

// ── Tenant scoping ────────────────────────────────────────────────────────────

describe("upsertLeadByProvider tenant scoping", () => {
  it("scopes the existing-lead lookup to the owner", async () => {
    // On the service-role client an unscoped provider_id match can return
    // another tenant's lead — which this function would then overwrite.
    const { client, calls } = makeSupabase((table, op) =>
      table === "leads" && op === "select" ? { data: null } : { data: buildLead() },
    );

    await upsertLeadByProvider(client, "user-1", {
      linkedin_provider_id: "provider-1",
      full_name: "Ada Lovelace",
    });

    const lookup = calls.find((c) => c.table === "leads" && c.op === "select");
    expect(lookup?.filters).toEqual(
      expect.arrayContaining([
        ["linkedin_provider_id", "provider-1"],
        ["user_id", "user-1"],
      ]),
    );
  });

  it("scopes the post-insert race re-check to the owner too", async () => {
    let selects = 0;
    const { client, calls } = makeSupabase((table, op) => {
      if (table === "leads" && op === "select") {
        selects += 1;
        return { data: selects === 1 ? null : buildLead() };
      }
      if (table === "leads" && op === "insert") return { error: UNIQUE_VIOLATION };
      return {};
    });

    await upsertLeadByProvider(client, "user-1", {
      linkedin_provider_id: "provider-1",
      full_name: "Ada Lovelace",
    });

    const lookups = calls.filter((c) => c.table === "leads" && c.op === "select");
    expect(lookups).toHaveLength(2);
    for (const lookup of lookups) {
      expect(lookup.filters).toContainEqual(["user_id", "user-1"]);
    }
  });
});
