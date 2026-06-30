# LinkedIn Outreach Workflows — v2 Rebuild & Cutover Runbook

Rebuilt per **DoctorAssist_LeadGen_Strategy_v2.pdf** (June 2026). The four v2 workflows are **copies** of the live v1 workflows with the strategy's in-workflow changes applied. The originals were **not modified**.

## What exists now (in n8n: `n8n.srv1183265.hstgr.cloud`)

| Workflow | v1 (live) | v2 (new, **inactive**) |
|---|---|---|
| 1. LinkedIn Scrapper | `8kAX7RM6EJI8bpt4` 🟢 | `JeIYSMWSlWquMEET` ⚪️ |
| 2. LinkedIn Invitations | `a5pgrpiaZUUX5LqN` 🟢 | `c6UgX57tI7cymMKA` ⚪️ |
| 3. LinkedIn New Connection | `AaJqhqS1MES7DuNB` 🟢 | `Mu9azPqONf6AJuLF` ⚪️ |
| 4. LinkedIn DMs | `tGhSgg0a4xcPBmKi` 🟢 | `0T4qsQoAhlW7Q1VQ` ⚪️ |

The JSON of each v2 workflow is in this folder. Decisions baked in (per your answers): **reuse the existing Google Sheet tabs** (so v2 must stay inactive until cutover), **no approval gate on WF4** (auto-send), **full build**.

> ⚠️ **Do not activate any v2 workflow until the cutover steps below are done.** They share the same sheets + the same Unipile account as v1; running both at once = double-sends.

---

## STEP 1 — Add columns to the existing Google Sheet (`DocAssist_LinkedIn_DB`)
> ✅ **DONE 2026-06-22** — all columns below were added to the live sheet (`1_LEADS` L–T, `2_INVITATIONS` J, `3_CONNECTIONS` N–T). See the "Reply timing & human-handoff" section for details.

v1 ignores unknown columns, so adding these is safe while v1 runs. Add them as new header cells:

- **`1_LEADS`** → `hospital_name`, `segment`, `region`, `country`, `search_name`, `last_post_date`, `topic`, `tier`, `template_safe`
- **`2_INVITATIONS`** → `segment` (v2 also writes the note into the existing `ice_breaker_text`)
- **`3_CONNECTIONS`** → `segment`, `region`, `hospital_name`, `sequence_step`, `next_touch_at`, `last_inbound_at`, **`bot_paused`** (new — human-handoff flag; `calendly_link_sent` already exists from v1 and is now actively written)
- **`4_CONVERSATIONS`** → (no new columns required)

## STEP 2 — Fill in the placeholders
- **WF1 → `segmentConfig` node:** split your 19-country geo IDs into `WAVE[1]/[2]/[3]` and set `ACTIVE_WAVE`. (Wave 1 currently = your existing 20 IDs; Waves 2 & 3 are empty.)
- **WF3 → `pickDue` node** and anywhere `{{OVERVIEW_LINK}}` / `{{DOCTOR_TRYLINK}}` appears: set the real 2-page overview URL and the doctor "try a case" URL (with UTM). `OVERVIEW_LINK` is still the homepage and `DOCTOR_TRYLINK` still points at Calendly — set real values before activation. The Calendly slug was **standardized on `/15min`** across WF3 and WF4 on 2026-06-22 (see Audit section below); if you move to a 20-min event, update **both** WF3 `pickDue` (`CALENDLY_20MIN`/`DOCTOR_TRYLINK`) and the WF4 `message agent` system prompt.
- **OpenRouter:** confirm the account can call `anthropic/claude-sonnet-4-6` (WF4 agent) and `anthropic/claude-haiku-4.5` (WF1 qualifier).

## STEP 3 — Test each v2 workflow while INACTIVE
Use n8n's manual **Execute Workflow** / **Listen for test event** with a couple of real rows:
- **WF1:** run once → `1_LEADS` rows carry `segment/region/hospital_name/tier/template_safe`; a Wednesday/Friday run (Doctor segment) also fills `last_post_date/topic`; REJECTs are dropped.
- **WF2:** the `windowFilter`/`guards` Code nodes compute correctly; notes pick the right variant and stay ≤300 chars; force trailing acceptance <25% → run halts (kill-switch).
- **WF3:** POST a sample `relation.new` body to the test webhook → a `3_CONNECTIONS` row opens with `sequence_step=0` and a `next_touch_at` ~24–48h out, **no instant DM**; set `next_touch_at` to the past and run the `seqTrigger` path → T1 sends and `sequence_step` advances; add an inbound row in `4_CONVERSATIONS` → sequence halts.
- **WF4:** POST a sample `message.received` body → reply uses `claude-sonnet-4-6`, pulls `segment` from `3_CONNECTIONS`, never asks for phone, doctor track offers free access (no call); WARM/HOT fires the founder email.

## STEP 4 — Cut over
1. **Pause** v1: deactivate `8kAX7RM6EJI8bpt4`, `a5pgrpiaZUUX5LqN`, `AaJqhqS1MES7DuNB`, `tGhSgg0a4xcPBmKi`.
2. **Activate** the four v2 workflows.
3. **Repoint the Unipile webhooks** (Unipile dashboard → Webhooks) to the new v2 paths:
   - `relation.new` → `https://n8n.srv1183265.hstgr.cloud/webhook/new_relation_v2`
   - `message.received` → `https://n8n.srv1183265.hstgr.cloud/webhook/linkedin-messages-v2`
4. Watch acceptance daily; only ramp volume toward ~95/wk once blended acceptance ≥ 38%.

---

## Dashboard integration (sync + control)

The DoctorAssist dashboard now has an **Automations** page that controls these four
v2 workflows directly via the n8n REST API, and a Supabase mirror so the
leads/inbox/campaigns UI reflects what n8n is doing. This requires:

### Dashboard config (already coded — just set the env)
```
N8N_BASE_URL=https://n8n.srv1183265.hstgr.cloud
N8N_API_KEY=<n8n → Settings → API key>     # X-N8N-API-KEY (NOT the .mcp.json JWT)
N8N_WEBHOOK_SECRET=<shared secret>          # echoed by the HTTP nodes below
AUTOMATION_ENGINE=n8n                        # disables the dashboard's own executor + Unipile webhook
DASHBOARD_OWNER_USER_ID=<supabase user id>   # owner that synced leads attach to
```
- **Control plane** (works today): activate/deactivate, view executions, and edit
  the param constants that already exist — `ACTIVE_WAVE` (WF1 `segmentConfig`) and
  `OVERVIEW_LINK` / `DOCTOR_TRYLINK` / `CALENDLY_20MIN` (WF3 `pickDue`).
- **Cutover guard**: with `AUTOMATION_ENGINE=n8n` the dashboard's
  `/api/cron/run-sequences` and `/api/webhooks/unipile` stand down (return
  `skipped`) so the two engines can't double-send.

### n8n-side edits — APPLIED (live, workflows still inactive)

Done via the n8n API on 2026-06-15. Each emitter is an **HTTP Request** node
(POST `{{$env.APP_URL}}/api/webhooks/n8n`, header `x-n8n-auth:
{{$env.N8N_WEBHOOK_SECRET}}`, **On Error = Continue (regular output)**) wired as a
*leaf branch* off the state-change node — the existing flow is untouched.

| Workflow | Off node | event_type | `data` fields sent |
|---|---|---|---|
| WF1 | `add to sheets` | `lead.scraped` | provider_id, full_name, public_identifier, profile_url, headline, location, country, hospital_name, segment, region, tier |
| WF2 | `log invite` | `invite.sent` | provider_id, full_name, segment |
| WF2 | `markExpired` | `invite.expired` | provider_id |
| WF3 | `initConn` | `connection.new` | provider_id, full_name, segment, region, hospital_name |
| WF3 | `updateConn` | `sequence.touch_sent` | provider_id, chat_id, sequence_step, next_touch_at, text |
| WF4 | `update_in` | `message.received` | provider_id, chat_id, message_id, text(message_text), timestamp |
| WF4 | `update_out` | `message.sent` | provider_id, chat_id, message_id, text(message_text), timestamp |
| WF4 | `warmthIF` (WARM/HOT branch) | `lead.warmth_changed` | provider_id, chat_id, warmth |

The ingest endpoint upserts leads by `provider_id` (or resolves by `chat_id`),
mirrors messages/activities, and bumps campaign counters; it is idempotent on
`message_id`.

**Run-now triggers — APPLIED.** Added a `run now (dashboard)` **Webhook** node to
WF1/WF2/WF3 wired into the first processing node, paths `/webhook/run-wf1-v2`,
`/webhook/run-wf2-v2`, `/webhook/run-wf3-v2`. The dashboard "Run now" button calls
these (registry `runWebhookPath`). WF4 is purely `message.received`-triggered, so
it has no run-now.

> ⚠️ **n8n environment variables required** for the emitters to reach the
> dashboard. Set these on the n8n host (Settings → Environment, or the process
> env): `APP_URL` = the deployed dashboard origin (e.g. `https://<app>.vercel.app`,
> no trailing slash); `N8N_WEBHOOK_SECRET` = the **same** value as the dashboard's
> `N8N_WEBHOOK_SECRET`. Until both are set, the emit nodes will fail soft (On
> Error = Continue) and no sync happens — the core outreach flow is unaffected.

### NOT applied (optional, needs sign-off)

**WF2 guard thresholds as editable params.** Making the daily ceiling / kill-switch
/ pending guard dashboard-editable requires rewriting the `guards` Code node to use
named consts (`DAILY_CEILING`, `ACCEPTANCE_MIN_PCT`, `PENDING_MAX`) in place of the
inline literals — i.e. editing live send-decision logic. Left untouched. To enable:
make that refactor in n8n, then restore the WF2 `editableParams` in
`src/lib/n8n/workflows.ts`.

> The checked-in `n8n/v2/*.json` files are the **original import artifacts** and do
> not yet include the emitter/run-now nodes above. Re-export from n8n (UI Download
> or `GET /api/v1/workflows/{id}`) if you need the JSON to match live.

---

## Reply timing & human-handoff (added 2026-06-22)

> **Status — APPLIED to live n8n 2026-06-22** (surgical `update_workflow` ops; emitter/run-now nodes preserved). Both live WF3 (`Mu9azPqONf6AJuLF`) and WF4 (`0T4qsQoAhlW7Q1VQ`) carry the new logic; both remain **inactive** pre-cutover.
> - **STEP 1 columns added to the live sheet (all tabs done 2026-06-22):** `3_CONNECTIONS` cols N–T (`segment, region, hospital_name, sequence_step, next_touch_at, last_inbound_at, bot_paused`); `1_LEADS` cols L–T (`hospital_name, segment, region, country, search_name, last_post_date, topic, tier, template_safe`); `2_INVITATIONS` col J (`segment`). All three tabs previously had **none** of the v2 columns. (n8n's Sheets node throws `checkForSchemaChanges` — "Missing columns: X" — rather than auto-creating them, so they had to be pre-added.)
> - **⛔ BLOCKING manual step:** WF4 `fetchLatest` needs its credential set in the UI — Authentication → Generic Credential Type → **Header Auth → Unipile**. (The n8n API/MCP can't attach generic header-auth to an httpRequest node.) It's fail-soft (`onError: continueRegularOutput`), so until set, the team-reply guard, duplicate-send guard, AND the new "scheduling link already in thread" handoff are ALL bypassed (only the 1h wait + sheet-flag handoff remain). The duplicate-Calendly spam seen in production traces to this credential being unset — **do not activate WF4 until it is attached.**



Three rules, all driven off two `3_CONNECTIONS` columns — `bot_paused` (TRUE/blank) and
`calendly_link_sent` (timestamp/blank):

1. **Wait 1 hour before any auto-reply.** WF4's `wait` node is now `1 hour` (was a
   10–30 **second** human-jitter delay). This gives the team a full hour to answer first.
2. **If the team already replied manually, the bot stays quiet.** After the hour, WF4
   `fetchLatest` pulls the chat's latest messages from Unipile; `replyGate` skips the
   auto-reply if the **newest message is from our own account** (`is_sender` truthy =
   a teammate already answered during the hour). This is **per-message** (the bot is a
   fallback for when the team is busy), and it also makes WF4 idempotent against
   duplicate webhook deliveries. To silence the bot **permanently** on a thread, set
   `bot_paused = TRUE` in the sheet (the team can do this by hand anytime).
3. **Once a Calendly link is sent, the bot backs off for good — human takes over.**
   - WF4: when the agent's outgoing reply contains `calendly`, `calendlyIF → markHandoff`
     stamps `calendly_link_sent` and sets `bot_paused = TRUE`.
   - WF3: when the decision-maker step-3 (walkthrough) touch sends `CALENDLY_20MIN`,
     `updateConn` stamps `calendly_link_sent`, sets `bot_paused = TRUE`, `stage = INTERESTED`,
     and clears `next_touch_at` (so step-4 graceful-exit never fires).
   - Both WF3 `pickDue` and WF4 `replyGate` skip any connection where `bot_paused` is set
     **or** `calendly_link_sent` is non-empty.

> **Failure mode:** if the `fetchLatest` Unipile call fails it's treated as "no team
> reply" and the bot proceeds (favours responsiveness over a rare double-reply). The
> `bot_paused` / `calendly_link_sent` checks are unaffected since they read the sheet.
>
> **Doctor segment:** handoff is scoped to decision-makers only (`!isDoc`), so a doctor
> receiving their self-serve try-link is **not** treated as a human handoff — even while
> the `DOCTOR_TRYLINK` placeholder still points at the Calendly URL.

## Audit & corrections (2026-06-22)

A full audit of the four **live** workflows against the dashboard ingest handler
(`src/app/api/webhooks/n8n/route.ts`) + registry (`src/lib/n8n/workflows.ts`) found the
dashboard side correct (IDs, run-now paths, editable params, cutover guard, idempotent ingest)
and four defects in the **n8n workflows**, all now fixed on live (workflows still inactive):

| # | Workflow | Fix (applied to live via surgical `update_workflow`) |
|---|---|---|
| 1 | WF3 `Mu9azPqONf6AJuLF` | `emit sequence.touch_sent` was sending `text: $json.text`, but it fires off `updateConn` which has no `text` field — so nurture-DM text never reached the dashboard. Now sends `$('loopS').item.json._send_text` + `timestamp: $now.toISO()`, so WF3 path-B touches appear in the inbox. |
| 2 | WF3 `Mu9azPqONf6AJuLF` | `get profile` had no error handling; a single failed Unipile profile fetch on an accepted-invite webhook aborted the whole branch and dropped the connection's sequence. Now `onError: continueRegularOutput` (downstream `initConn.hospital_name` already falls back to `lookupLead`/`''`). |
| 3 | WF4 `0T4qsQoAhlW7Q1VQ` | Inbound replies were only mirrored when the **bot** answered (`emit message.received` hung off `update_in`, on the gateIF-true path). Human-handled / handed-off threads never reached the dashboard. The emit was **moved to fire off `self check`-true** (parallel to the 1h `wait`), so **every** genuine inbound is mirrored immediately. Idempotent on `message_id`. |
| 4 | WF3 + WF4 | **Calendly slug standardized on `/15min`.** WF3 sent `/15min` while WF4's agent offered `/20min`; WF4's prompt (URL + three "20-minute" mentions) was brought down to `/15min`. |

**Repo JSON status.** The representable fixes — WF3 `get profile` onError, WF3 `pickDue`
`/15min`, WF4 `message agent` `/15min` — were mirrored into the checked-in `n8n/v2/*.json`
(they preserve the files' existing credential references). Fixes #1 and #3 touch emitter nodes,
which the repo JSON has **never contained** (it predates the dashboard-integration emitter/run-now
nodes), so they cannot be represented there. A faithful, credential-bearing live→repo re-export of
all four still requires the n8n **API key** (`GET /api/v1/workflows/{id}`) or the n8n UI
**Download** button — neither the n8n-mcp Bearer JWT nor any local env var is the public API key.
Do that re-export when an API key is available; do **not** hand-fabricate the JSON.

**Control-plane note.** The dashboard `calendly_link` editable param patches **WF3 `pickDue` only**.
WF4's Calendly link lives in the `message agent` system prompt (not a param), so changing the slug
from the dashboard does **not** update WF4 — edit the WF4 prompt by hand to keep them in sync.

## What changed, per workflow

### WF1 — Scraper → Segmented Prospector
- Daily trigger; **`segmentConfig`** rotates segment by weekday (Mon CMO · Tue CIO · Wed Doctors · Thu Admin · Fri Doctors) with per-segment Sales-Nav booleans + active-wave locations. `posted_on_linkedin` is **doctor-only**.
- **`parser`** now captures `hospital_name` from `current_positions[0].company`, derives `region/country` from the location string, and sets `template_safe`.
- **`qualifier`** (one OpenRouter/haiku call over the batch) tags each lead A/B/REJECT and drops REJECTs.
- **Doctor branch** (`enrichIF`→`getPosts`→`setPost`): for Tier-A doctors, fetches `GET /users/{id}/posts` → `last_post_date` + `topic` (doctor search limit capped at 40/run to respect the ~100/day posts limit).

### WF2 — Invitations → Region/Segment-Aware Sender
- Hourly trigger; **`guards`** enforces the 07:00–22:00 IST window, the **acceptance kill-switch (<25%)**, the **pending-pile guard (≥150)**, and the **daily ceiling (20)**.
- **`windowFilter`** sends only to leads whose **local** time is 09:00–11:30 on a weekday (region→offset map, approx DST).
- **`buildNote`** branches the note: decision-makers w/ hospital → contextual note (CIO gets the FHIR variant); decision-makers w/o hospital → **blank**; doctors who recently posted → "your posts" note; else **blank**. Invite body omits `message` entirely for blank invites; all notes clipped to ≤300 chars.
- Second **weekly trigger** runs the withdrawal job: invites pending >21 days → `DELETE /users/{id}/invitations` + `invite_status=expired`.

### WF3 — New Connection → Per-Segment Nurture Sequencer
- **Path A (webhook `new_relation_v2`):** updates `1_LEADS`/`2_INVITATIONS`, enriches the profile, and **opens a sequence** in `3_CONNECTIONS` (`sequence_step=0`, `next_touch_at = +24–48h`). **The truncated instant DM is gone.**
- **Path B (hourly `seqTrigger`):** sends the next due touch per **segment + step** from the v2 message library, advances the step, schedules the next touch, respects the local send window, and **halts on any inbound** reply (checked against `4_CONVERSATIONS`). Decision-makers: T1 intro → T2 deck → T3 15-min walkthrough → T4 graceful exit. Doctors: T1 no-pitch → T2 asset → T3 free access. First touch creates the chat (`POST /chats`); later touches reuse `chat_id`.
- **Handoff (2026-06-22):** `pickDue` now also skips any connection with `bot_paused` set or `calendly_link_sent` filled; the decision-maker **T3 (Calendly) touch** sets both flags (+ `stage=INTERESTED`, clears `next_touch_at`) via `updateConn`, so the sequence stops at the booking link and a human owns it from there.

### WF4 — DM Agent → Segment-Briefed Closer
- Model upgraded to **`anthropic/claude-sonnet-4-6`**.
- **`readConnAll`→`pickSeg`** injects the lead's **segment** into the agent (no more occupation-guessing).
- System prompt rewritten: **no phone ask, no proactive email ask**; doctors → **free verified access** (no "limited period", no call unless asked); decision-makers → qualify + 15-min walkthrough. Stage enum unified.
- **`warmthIF`→`alertEmail`** sends a deterministic founder alert on every WARM/HOT (plus the agent's existing `email_received` tool). Auto-send retained (no approval gate, per your choice). Memory, self-check, structured parser, and conversation logging kept.
- **Reply timing & handoff (2026-06-22):** `wait` is now **1 hour**; new `fetchLatest`→`replyGate`→`gateIF` chain skips the auto-reply if the team replied during the hour or the thread is `bot_paused`/`calendly_link_sent`; new `calendlyIF`→`markHandoff` sets those flags when the agent's reply includes a Calendly link. `global` now also captures `account_id`. See **Reply timing & human-handoff** above.

### WF4 — anti-bot-reveal hardening (2026-06-30)

Applied after a production audit of `4_CONVERSATIONS` (prospects calling out the bot,
leaked operator text, duplicate Calendly sends, no stop on human-sent meeting links).
Live `0T4qsQoAhlW7Q1VQ` + repo `4-linkedin-dms-v2.json`:

1. **Never reply to our own messages.** `global` now captures `is_sender`; `self check`
   proceeds only when `is_sender` is falsy **and** `sender_id` is not one of our account
   ids. (Root cause of the Harjit "…routed into the pipeline in error… Chat ID Nx666…"
   leak: our own outbound note re-entered as inbound and got "replied to".)
2. **Output safety screen.** New `outputGuard` Code node sits between `message agent` and
   the send `If`. It blocks empty drafts and any draft containing operator/CRM/system
   leaks, bot/AI self-reveal, or hallucinated live actions ("letting you in", "team is
   connecting now", "I see you're in the meeting"). The `If` now tests `safe`; the **false**
   branch routes to `suppressedAlert` (founder email "⚠️ Auto-reply suppressed — needs
   human") and sends nothing.
3. **Stop on ANY meeting link, either side.** `replyGate` now also skips when a scheduling
   link (`calendly.com | teams.microsoft.com/meet | zoom.us | meet.google`) appears anywhere
   in the `fetchLatest` history — human-sent Teams links included (the Pankaj/Harjit cases).
   `calendlyIF` broadened from the literal word "calendly" to the same link set, so
   `markHandoff` stamps `calendly_link_sent` + `bot_paused` for any link the bot sends.
4. **Persona rules in the system prompt.** The agent is a human (never a bot/AI/system),
   must never reference internals, must never claim live actions it can't perform, and must
   return an **empty** `message` (stay silent → human takes over) whenever it can't write a
   genuine reply or a meeting is already live/scheduled.

---

## Open items / assumptions
- **Unipile withdraw endpoint** confirmed as `DELETE /users/{identifier}/invitations` (+ `GET /users/invitations/sent`). Validate against a real pending invite on first weekly run.
- **Blank invites**: WF2 omits the `message` key entirely (docs say `message` is optional). Verify the first blank send lands as a no-note invite.
- **Region derivation** from the location string is heuristic; unknown regions default to the IST morning window. Refine the keyword map as real data arrives.
- **DST** for EU/US offsets is approximate (Mar–Oct bump). Revisit if sends drift outside 09:00–11:30 local.
- **Qualifier** is a single batched LLM call; unscored leads default to Tier B (never silently dropped).

## Re-deploying from these JSON files
These files are exactly what was POSTed to `POST /api/v1/workflows`. To recreate: `curl -X POST "$BASE/workflows" -H "X-N8N-API-KEY: $KEY" -H 'content-type: application/json' --data-binary @<file>.json`. Builder scripts that generated them live in `/tmp/n8n-v2/build_wf*.js`.
