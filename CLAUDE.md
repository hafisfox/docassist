# CLAUDE.md — DoctorAssist LinkedIn Outreach Platform

## Project Overview
Full-stack LinkedIn outreach automation dashboard for DoctorAssist.AI (https://doctorassist.ai/).
Target audience: Medical oncologists, hemato-oncologists, and cancer center decision-makers in India & UAE.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes + Supabase Edge Functions
- **Database**: Supabase (PostgreSQL + Auth + Realtime + RLS)
- **LinkedIn API**: Unipile (https://developer.unipile.com/)
- **Scraping**: Apify (LinkedIn profile scraper actors)
- **AI Personalization**: Anthropic Claude API (for generating personalized messages)
- **Job Queue**: pg_cron + Supabase Edge Functions (for scheduled outreach)
- **Logging**: Pino (structured JSON logging)
- **Deployment**: Vercel (frontend) + Supabase (backend)

## Architecture Principles
- All API keys stored in `.env.local` (never committed)
- Supabase Row-Level Security (RLS) on ALL tables
- Rate limiting on all LinkedIn operations (respect Unipile/LinkedIn limits)
- Structured logging with correlation IDs on every operation
- Idempotent operations — safe to retry
- Optimistic UI updates with rollback on failure
- Webhook-first for real-time data (Unipile webhooks for new messages, accepted invitations)

## Key API References

### Unipile API (LinkedIn Automation)
- Base URL: `https://{YOUR_DSN}/api/v1`
- Auth: `X-API-KEY: {ACCESS_TOKEN}` header
- **Search people**: `POST /linkedin/search` with `api: "classic"|"sales_navigator"`, `category: "people"`, keywords, location, industry filters
- **Get profile**: `GET /users/{identifier}?account_id={id}` — converts public_identifier to provider_id
- **Send invitation**: `POST /users/invite` with `{ provider_id, account_id, message }` — message is optional, max 300 chars
- **Send message (new chat)**: `POST /chats` with `{ account_id, attendees_ids, text }` — only works with existing connections
- **Send message (existing chat)**: `POST /chats/{chat_id}/messages` with `{ text }`
- **List chats**: `GET /chats?account_id={id}&account_type=LINKEDIN`
- **Get messages in chat**: `GET /chats/{chat_id}/messages`
- **Webhooks**: Register at Unipile dashboard — events: `message.received`, `relation.new` (accepted invitation)
- **LinkedIn limits**: ~100 invitations/week, ~150 messages/day, ~80 profile views/day (varies by account age/health)

### Apify (Profile Scraping)
- Use "LinkedIn Profile Scraper" actor for enriching profiles from Sales Navigator URLs or search result URLs
- Extracts: full name, headline, current company, location, experience, skills, education, profile picture

### Supabase
- Use `@supabase/supabase-js` v2
- Enable Realtime on `leads`, `messages`, `campaigns` tables
- Use RLS policies tied to `auth.uid()`
- Use Supabase Edge Functions for background jobs (outreach sequence execution)

## File Naming Conventions
- Components: PascalCase (`LeadTable.tsx`)
- Hooks: camelCase with `use` prefix (`useLeads.ts`)
- API routes: kebab-case (`/api/linkedin/send-invite/route.ts`)
- Utils/libs: camelCase (`unipileClient.ts`)
- Types: PascalCase in `types/` directory (`Lead.ts`)
- Database migrations: timestamp prefix (`20240101000000_create_leads.sql`)

## Code Style
- Strict TypeScript — no `any` types
- Prefer `async/await` over `.then()` chains
- Use Zod for all API input validation
- Use server actions for form submissions where possible
- Every API route must have try/catch with structured error logging
- Every database operation must check for errors
- Use transactions for multi-table operations

## DoctorAssist.AI Context (for message personalization)
DoctorAssist.AI is an agentic, multimodal clinical decision support & efficiency engine (CDSSE).
Key value props for oncologists:
- Reduces documentation time by up to 50%
- Evidence-based guidance during consultations
- ~95% accurate clinical conversation transcription
- SOAP/H&P note generation
- Diagnostic accuracy improvement up to 35%
- Integrates with HMS, PACS, LIS, RIS, EHR systems
- Point-of-care intelligence with guideline-linked suggestions
- Currently under clinical validation, founded 2024 in Bangalore

## ICP Summary (for search filters and personalization)

### Primary ICP — Medical Oncologists
- Titles: Medical Oncologist, Consultant Medical Oncology, Clinical Oncologist, Hemato-Oncologist, DM Medical Oncology
- Senior roles: Head of Oncology, Director Oncology, Senior Consultant Oncology, CMO (Cancer Centers)
- Location Phase 1: Mumbai, Delhi NCR, Bengaluru, Hyderabad, Chennai + UAE (Cleveland Clinic Abu Dhabi, Mediclinic, Burjeel, American Hospital Dubai)
- Location Phase 2: Pune, Ahmedabad, Kochi, Lucknow
- Pain points: Complex protocols, high patient load (40-80/day), chemo calculations, documentation pressure, tumor board prep
- Buying motivation: Reduce decision fatigue, save 30-45 min/complex case, medico-legal defensibility

### Target Hospital Types
- Corporate chains: Apollo, Fortis, Manipal, Aster DM
- Cancer centers: HCG Cancer Centre, Tata Memorial
- UAE: Cleveland Clinic Abu Dhabi, Mediclinic, Burjeel Holdings, American Hospital Dubai

### ICP Segments
- Segment A (High-Volume Chemo Clinics): Need dosing validation, toxicity prediction, rapid docs
- Segment B (Precision Oncology Centers): Genomic interpretation, rare mutation modeling, trial matching
- Segment C (Insurance-Heavy Urban Practices): Documentation automation, evidence-based justification

## Environment Variables Required
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Unipile
UNIPILE_API_KEY=
UNIPILE_DSN=
UNIPILE_ACCOUNT_ID=

# Apify
APIFY_API_TOKEN=

# Anthropic (for message personalization)
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBHOOK_SECRET=
```

## Testing Strategy
- Unit tests: Vitest for utils, hooks, API route handlers
- Integration tests: Test Supabase queries with test database
- E2E: Playwright for critical dashboard flows
- Mock all external APIs (Unipile, Apify) in tests

## Important Constraints
- Never send more than 25 connection requests per day (safety margin under LinkedIn's ~100/week)
- Always add 30-120 second random delays between LinkedIn actions
- Never send identical messages — always personalize
- Store all message templates with variable placeholders
- Log every LinkedIn API call with request/response for debugging
- Implement circuit breaker pattern for Unipile API calls
- All dates in UTC, display in user's timezone
