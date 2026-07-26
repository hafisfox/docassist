# LinkedIn Outreach Engine

A LinkedIn outreach automation dashboard: scrape and enrich leads, build
multi-step sequences, send connection requests and DMs within safe rate limits,
handle replies from a unified inbox, and track funnel analytics.

The engine is domain-neutral — point it at whatever ICP you're prospecting by
editing the starter defaults in [`src/constants/icp.ts`](src/constants/icp.ts)
and describing your offering via `OUTREACH_PRODUCT_CONTEXT`.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui |
| Backend | Next.js API routes |
| Database | Supabase (Postgres + Auth + Realtime + RLS) |
| LinkedIn API | [Unipile](https://developer.unipile.com/) |
| Scraping | Apify LinkedIn profile actors |
| AI copy | OpenAI (`gpt-4o-mini`) |
| Workflow automation | n8n (four v2 workflows, see [`n8n/v2/`](n8n/v2/)) |
| Logging | Pino (structured JSON, correlation IDs) |
| Deploy | Vercel + Supabase |

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in real values
npx supabase start             # local Postgres + Auth
npx supabase db reset          # apply migrations
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Sign up, then
seed the default templates and sequence:

```bash
npx supabase db seed           # requires at least one user to exist
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite |
| `npm run test:watch` | Vitest in watch mode |

## Configuration

All configuration is environment-driven; see [`.env.example`](.env.example) for
the annotated list. The ones worth calling out:

- **Branding** — `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_SHORT_NAME`,
  `NEXT_PUBLIC_SUPPORT_URL`, `NEXT_PUBLIC_BOOKING_URL`. Defaults live in
  [`src/constants/branding.ts`](src/constants/branding.ts); nothing else in the
  UI hardcodes a product name.
- **`OUTREACH_PRODUCT_CONTEXT`** — free-text description of what you're
  pitching, injected into the AI copywriter's system prompt. Left unset, the
  model is explicitly instructed to invent no product claims.
- **`AUTOMATION_ENGINE`** — `n8n` (recommended) or `dashboard`. Decides which
  engine owns outreach execution so the two can't double-send.

## Database

Migrations live in [`supabase/migrations/`](supabase/migrations/) and are applied
in filename order. Notable schema points:

- Every table is under Row-Level Security tied to `auth.uid()`.
- `leads.icp_segment` is an enum size tier: `enterprise | mid_market | smb`.
- `leads.account_type` is free text for org category (`corporate`, `agency`,
  `nonprofit`, `public_sector`, `startup`).
- Migration `20240101000014` renamed the original vertical-specific columns
  (`specialty → industry`, `hospital_type → account_type`,
  `hospital_name → account_name`). The n8n ingest webhook still accepts the
  legacy key names on the wire — see below.

## Template variables

[`src/constants/templateVariables.ts`](src/constants/templateVariables.ts) is the
single source of truth for the `{{variable}}` vocabulary. The variable picker,
the editor and sequence previews, and the send path all resolve through it, so a
placeholder offered in the UI is guaranteed to be substituted before a message
goes out. `{{specialty}}` and `{{title}}` are kept as aliases for templates
written before the rename.

## n8n workflows

The four v2 workflows in [`n8n/v2/`](n8n/v2/) are exported copies of what runs on
the n8n server; see [`n8n/v2/README-cutover.md`](n8n/v2/README-cutover.md) for
the cutover procedure and per-workflow notes. Two compatibility details matter:

- Their Google Sheets columns are **unchanged** (`hospital_name`, `segment`,
  `calendly_link_sent`). The Sheets node validates against the live sheet
  schema, so renaming the JSON side alone breaks every run.
- Accordingly `/api/webhooks/n8n` accepts both `account_name` and the legacy
  `hospital_name` on inbound payloads, and the workflows normalise legacy
  segment values (`CMO`/`CIO`/`ADMIN`/`DOCTOR`) onto the generic vocabulary
  (`EXEC`/`TECH`/`OPS`/`PRACTITIONER`).

## Safety limits

Outreach volume is deliberately conservative — LinkedIn restricts aggressively.
See [`src/constants/linkedinLimits.ts`](src/constants/linkedinLimits.ts) and
[`src/lib/queue/rateLimiter.ts`](src/lib/queue/rateLimiter.ts): capped daily
invites, randomised 30–120s delays between actions, and a circuit breaker around
the Unipile client.
