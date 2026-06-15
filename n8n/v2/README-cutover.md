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
v1 ignores unknown columns, so adding these is safe while v1 runs. Add them as new header cells:

- **`1_LEADS`** → `hospital_name`, `segment`, `region`, `country`, `search_name`, `last_post_date`, `topic`, `tier`, `template_safe`
- **`2_INVITATIONS`** → `segment` (v2 also writes the note into the existing `ice_breaker_text`)
- **`3_CONNECTIONS`** → `segment`, `region`, `hospital_name`, `sequence_step`, `next_touch_at`, `last_inbound_at`
- **`4_CONVERSATIONS`** → (no new columns required)

## STEP 2 — Fill in the placeholders
- **WF1 → `segmentConfig` node:** split your 19-country geo IDs into `WAVE[1]/[2]/[3]` and set `ACTIVE_WAVE`. (Wave 1 currently = your existing 20 IDs; Waves 2 & 3 are empty.)
- **WF3 → `pickDue` node** and anywhere `{{OVERVIEW_LINK}}` / `{{DOCTOR_TRYLINK}}` appears: set the real 2-page overview URL and the doctor "try a case" URL (with UTM). Confirm the **20-min** Calendly link `https://calendly.com/hello-doctorassist/20min` exists (v1 used `/15min`).
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
- **Path B (hourly `seqTrigger`):** sends the next due touch per **segment + step** from the v2 message library, advances the step, schedules the next touch, respects the local send window, and **halts on any inbound** reply (checked against `4_CONVERSATIONS`). Decision-makers: T1 intro → T2 deck → T3 20-min walkthrough → T4 graceful exit. Doctors: T1 no-pitch → T2 asset → T3 free access. First touch creates the chat (`POST /chats`); later touches reuse `chat_id`.

### WF4 — DM Agent → Segment-Briefed Closer
- Model upgraded to **`anthropic/claude-sonnet-4-6`**.
- **`readConnAll`→`pickSeg`** injects the lead's **segment** into the agent (no more occupation-guessing).
- System prompt rewritten: **no phone ask, no proactive email ask**; doctors → **free verified access** (no "limited period", no call unless asked); decision-makers → qualify + 20-min walkthrough. Stage enum unified.
- **`warmthIF`→`alertEmail`** sends a deterministic founder alert on every WARM/HOT (plus the agent's existing `email_received` tool). Auto-send retained (no approval gate, per your choice). Memory, self-check, structured parser, and conversation logging kept.

---

## Open items / assumptions
- **Unipile withdraw endpoint** confirmed as `DELETE /users/{identifier}/invitations` (+ `GET /users/invitations/sent`). Validate against a real pending invite on first weekly run.
- **Blank invites**: WF2 omits the `message` key entirely (docs say `message` is optional). Verify the first blank send lands as a no-note invite.
- **Region derivation** from the location string is heuristic; unknown regions default to the IST morning window. Refine the keyword map as real data arrives.
- **DST** for EU/US offsets is approximate (Mar–Oct bump). Revisit if sends drift outside 09:00–11:30 local.
- **Qualifier** is a single batched LLM call; unscored leads default to Tier B (never silently dropped).

## Re-deploying from these JSON files
These files are exactly what was POSTed to `POST /api/v1/workflows`. To recreate: `curl -X POST "$BASE/workflows" -H "X-N8N-API-KEY: $KEY" -H 'content-type: application/json' --data-binary @<file>.json`. Builder scripts that generated them live in `/tmp/n8n-v2/build_wf*.js`.
