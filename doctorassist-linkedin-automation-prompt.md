# Claude Code Project Prompt: DoctorAssist.AI LinkedIn Outreach Automation System

## Overview

Build a full-stack LinkedIn outreach automation platform for **DoctorAssist.AI** — an agentic, multimodal clinical decision support & efficiency engine for healthcare professionals. The platform automates LinkedIn prospecting, connection requests, personalized DM sequences, and inbox management targeting medical oncologists and cancer centers in India and UAE.

---

## 1. CLAUDE.md (Place at project root)

```markdown
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
```

---

## 2. Project File Structure

```
doctorassist-linkedin-outreach/
├── CLAUDE.md
├── .env.local.example
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                    # shadcn/ui config
│
├── prisma/                            # Optional: if using Prisma with Supabase
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20240101000000_create_enums.sql
│   │   ├── 20240101000001_create_leads.sql
│   │   ├── 20240101000002_create_campaigns.sql
│   │   ├── 20240101000003_create_sequences.sql
│   │   ├── 20240101000004_create_messages.sql
│   │   ├── 20240101000005_create_activities.sql
│   │   ├── 20240101000006_create_templates.sql
│   │   ├── 20240101000007_create_settings.sql
│   │   ├── 20240101000008_create_webhook_logs.sql
│   │   └── 20240101000009_rls_policies.sql
│   ├── functions/
│   │   ├── execute-sequence-step/index.ts
│   │   ├── process-webhook/index.ts
│   │   ├── sync-linkedin-inbox/index.ts
│   │   └── enrich-lead-profile/index.ts
│   └── seed.sql
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Redirect to /dashboard
│   │   ├── globals.css
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx              # Sidebar + topbar layout
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx            # Overview: KPIs, charts, recent activity
│   │   │   ├── leads/
│   │   │   │   ├── page.tsx            # Lead list with filters, search, bulk actions
│   │   │   │   ├── [id]/page.tsx       # Lead detail: profile, timeline, messages
│   │   │   │   └── import/page.tsx     # CSV import / LinkedIn search import
│   │   │   ├── campaigns/
│   │   │   │   ├── page.tsx            # Campaign list
│   │   │   │   ├── new/page.tsx        # Create campaign wizard
│   │   │   │   └── [id]/page.tsx       # Campaign detail: stats, leads, sequence
│   │   │   ├── sequences/
│   │   │   │   ├── page.tsx            # Sequence template list
│   │   │   │   └── [id]/page.tsx       # Sequence builder (steps, delays, conditions)
│   │   │   ├── inbox/
│   │   │   │   └── page.tsx            # Unified inbox: all LinkedIn conversations
│   │   │   ├── templates/
│   │   │   │   └── page.tsx            # Message template manager
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx            # Charts: response rates, conversion funnel
│   │   │   └── settings/
│   │   │       └── page.tsx            # Unipile connection, limits, preferences
│   │   │
│   │   └── api/
│   │       ├── linkedin/
│   │       │   ├── search/route.ts           # POST: Search LinkedIn profiles
│   │       │   ├── profile/route.ts          # GET: Fetch single profile details
│   │       │   ├── send-invite/route.ts      # POST: Send connection request
│   │       │   ├── send-message/route.ts     # POST: Send DM to connection
│   │       │   ├── chats/route.ts            # GET: List all chats
│   │       │   └── chats/[chatId]/route.ts   # GET: Messages in a chat
│   │       ├── leads/
│   │       │   ├── route.ts                  # GET/POST: List/create leads
│   │       │   ├── [id]/route.ts             # GET/PATCH/DELETE: Single lead
│   │       │   ├── bulk/route.ts             # POST: Bulk import leads
│   │       │   └── enrich/route.ts           # POST: Enrich lead via Apify
│   │       ├── campaigns/
│   │       │   ├── route.ts                  # GET/POST: List/create campaigns
│   │       │   ├── [id]/route.ts             # GET/PATCH: Campaign details
│   │       │   ├── [id]/start/route.ts       # POST: Start campaign execution
│   │       │   └── [id]/pause/route.ts       # POST: Pause campaign
│   │       ├── sequences/
│   │       │   ├── route.ts                  # GET/POST: List/create sequences
│   │       │   └── [id]/route.ts             # GET/PATCH/DELETE: Single sequence
│   │       ├── templates/
│   │       │   ├── route.ts                  # GET/POST
│   │       │   └── [id]/route.ts             # GET/PATCH/DELETE
│   │       ├── messages/
│   │       │   └── personalize/route.ts      # POST: AI-generate personalized msg
│   │       ├── webhooks/
│   │       │   └── unipile/route.ts          # POST: Incoming webhooks from Unipile
│   │       └── analytics/
│   │           └── route.ts                  # GET: Aggregated analytics data
│   │
│   ├── components/
│   │   ├── ui/                         # shadcn/ui components (auto-generated)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── dashboard/
│   │   │   ├── KPICards.tsx
│   │   │   ├── OutreachFunnel.tsx
│   │   │   ├── RecentActivity.tsx
│   │   │   └── ResponseRateChart.tsx
│   │   ├── leads/
│   │   │   ├── LeadTable.tsx
│   │   │   ├── LeadFilters.tsx
│   │   │   ├── LeadDetail.tsx
│   │   │   ├── LeadTimeline.tsx
│   │   │   ├── LeadImportModal.tsx
│   │   │   └── LinkedInSearchPanel.tsx
│   │   ├── campaigns/
│   │   │   ├── CampaignCard.tsx
│   │   │   ├── CampaignWizard.tsx
│   │   │   └── CampaignStats.tsx
│   │   ├── sequences/
│   │   │   ├── SequenceBuilder.tsx
│   │   │   ├── StepEditor.tsx
│   │   │   └── SequencePreview.tsx
│   │   ├── inbox/
│   │   │   ├── ConversationList.tsx
│   │   │   ├── MessageThread.tsx
│   │   │   ├── MessageComposer.tsx
│   │   │   └── QuickReplyBar.tsx
│   │   ├── templates/
│   │   │   ├── TemplateEditor.tsx
│   │   │   └── VariableInserter.tsx
│   │   └── shared/
│   │       ├── StatusBadge.tsx
│   │       ├── ConfirmDialog.tsx
│   │       ├── LoadingSpinner.tsx
│   │       ├── EmptyState.tsx
│   │       ├── Pagination.tsx
│   │       └── SearchInput.tsx
│   │
│   ├── hooks/
│   │   ├── useLeads.ts
│   │   ├── useCampaigns.ts
│   │   ├── useInbox.ts
│   │   ├── useSequences.ts
│   │   ├── useTemplates.ts
│   │   ├── useAnalytics.ts
│   │   ├── useRealtimeMessages.ts     # Supabase Realtime subscription
│   │   └── useLinkedInSearch.ts
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser client
│   │   │   ├── server.ts              # Server client (uses service role key)
│   │   │   └── middleware.ts          # Auth middleware
│   │   ├── unipile/
│   │   │   ├── client.ts              # Unipile API wrapper
│   │   │   ├── search.ts             # LinkedIn search helpers
│   │   │   ├── messaging.ts          # Send invite/message helpers
│   │   │   └── types.ts              # Unipile response types
│   │   ├── apify/
│   │   │   ├── client.ts              # Apify API wrapper
│   │   │   └── scraper.ts            # Profile scraper actor runner
│   │   ├── ai/
│   │   │   ├── personalize.ts         # Claude API for message personalization
│   │   │   └── prompts.ts            # System prompts for personalization
│   │   ├── queue/
│   │   │   ├── sequenceExecutor.ts    # Executes sequence steps with delays
│   │   │   └── rateLimiter.ts        # Token bucket rate limiter
│   │   ├── logger.ts                  # Pino structured logger
│   │   ├── errors.ts                  # Custom error classes
│   │   ├── validators.ts             # Zod schemas
│   │   └── utils.ts                   # Date formatting, string helpers
│   │
│   ├── types/
│   │   ├── lead.ts
│   │   ├── campaign.ts
│   │   ├── sequence.ts
│   │   ├── message.ts
│   │   ├── template.ts
│   │   ├── activity.ts
│   │   └── database.ts               # Supabase generated types
│   │
│   └── constants/
│       ├── icp.ts                     # ICP data: titles, hospitals, locations, segments
│       ├── linkedinLimits.ts          # Daily/weekly limits
│       └── sequenceDefaults.ts        # Default sequence templates
│
├── public/
│   ├── logo.svg
│   └── favicon.ico
│
└── tests/
    ├── unit/
    │   ├── lib/unipile.test.ts
    │   ├── lib/rateLimiter.test.ts
    │   └── lib/personalize.test.ts
    ├── integration/
    │   └── api/leads.test.ts
    └── e2e/
        └── dashboard.spec.ts
```

---

## 3. Supabase Database Schema

```sql
-- 20240101000000_create_enums.sql

CREATE TYPE lead_status AS ENUM (
  'new',              -- Just scraped/imported, not contacted
  'enriched',         -- Profile enriched with Apify data
  'invite_sent',      -- Connection request sent
  'invite_accepted',  -- They accepted the connection
  'invite_expired',   -- Invitation expired/withdrawn
  'message_sent',     -- First DM sent
  'replied',          -- They replied to our message
  'interested',       -- Positive reply / showed interest
  'not_interested',   -- Negative reply / declined
  'meeting_booked',   -- Demo/call scheduled
  'converted',        -- Became a customer/trial user
  'do_not_contact'    -- Opted out or marked DNC
);

CREATE TYPE campaign_status AS ENUM (
  'draft', 'active', 'paused', 'completed', 'archived'
);

CREATE TYPE sequence_step_type AS ENUM (
  'connection_request',   -- Send LinkedIn invite (with optional note)
  'wait_for_acceptance',  -- Wait until invite is accepted
  'message',              -- Send LinkedIn DM
  'delay',                -- Wait N hours/days
  'condition'             -- Branch based on reply status
);

CREATE TYPE activity_type AS ENUM (
  'lead_created',
  'lead_enriched',
  'invite_sent',
  'invite_accepted',
  'invite_expired',
  'message_sent',
  'message_received',
  'reply_detected',
  'status_changed',
  'campaign_started',
  'campaign_paused',
  'error'
);

CREATE TYPE icp_segment AS ENUM (
  'high_volume_chemo',       -- Segment A
  'precision_oncology',      -- Segment B
  'insurance_heavy_urban'    -- Segment C
);

-- 20240101000001_create_leads.sql

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- LinkedIn Identity
  linkedin_public_id TEXT,                     -- e.g., "dr-ramesh-kumar-oncology"
  linkedin_provider_id TEXT,                   -- Unipile provider_id for API calls
  linkedin_member_urn TEXT,
  linkedin_profile_url TEXT,
  linkedin_profile_picture_url TEXT,

  -- Personal Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  headline TEXT,
  email TEXT,
  phone TEXT,

  -- Professional Info
  job_title TEXT,
  company TEXT,
  company_linkedin_id TEXT,
  location TEXT,
  city TEXT,
  country TEXT,
  specialty TEXT,                              -- e.g., "Medical Oncology"
  experience_years INTEGER,

  -- ICP Classification
  icp_segment icp_segment,
  icp_score INTEGER DEFAULT 0,                -- 0-100 fit score
  hospital_type TEXT,                          -- corporate_chain, cancer_center, private_clinic
  target_region TEXT,                          -- tier_1, tier_2, uae

  -- Outreach Status
  status lead_status DEFAULT 'new',
  campaign_id UUID REFERENCES campaigns(id),

  -- Unipile Chat Tracking
  unipile_chat_id TEXT,                        -- Chat ID once conversation starts

  -- Enrichment Data (from Apify)
  enrichment_data JSONB DEFAULT '{}',          -- Full scraped profile data
  skills TEXT[],
  education JSONB DEFAULT '[]',
  experience JSONB DEFAULT '[]',

  -- Metadata
  source TEXT DEFAULT 'linkedin_search',       -- linkedin_search, csv_import, manual, apify
  tags TEXT[] DEFAULT '{}',
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(user_id, linkedin_public_id)
);

CREATE INDEX idx_leads_user_status ON leads(user_id, status);
CREATE INDEX idx_leads_user_campaign ON leads(user_id, campaign_id);
CREATE INDEX idx_leads_linkedin_provider ON leads(linkedin_provider_id);
CREATE INDEX idx_leads_unipile_chat ON leads(unipile_chat_id);


-- 20240101000002_create_campaigns.sql

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status campaign_status DEFAULT 'draft',
  sequence_id UUID REFERENCES sequences(id),

  -- Targeting
  search_query JSONB,                          -- LinkedIn search params used
  icp_segments icp_segment[],
  target_titles TEXT[],
  target_locations TEXT[],
  target_companies TEXT[],

  -- Limits
  daily_invite_limit INTEGER DEFAULT 25,
  daily_message_limit INTEGER DEFAULT 50,

  -- Stats (denormalized for fast reads)
  total_leads INTEGER DEFAULT 0,
  invites_sent INTEGER DEFAULT 0,
  invites_accepted INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  positive_replies INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);


-- 20240101000003_create_sequences.sql

CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE NOT NULL,
  step_order INTEGER NOT NULL,
  step_type sequence_step_type NOT NULL,

  -- For message/connection_request steps
  template_id UUID REFERENCES templates(id),
  message_body TEXT,                           -- If not using template

  -- For delay steps
  delay_hours INTEGER,
  delay_days INTEGER,

  -- For condition steps
  condition_field TEXT,                        -- e.g., 'status'
  condition_value TEXT,                        -- e.g., 'replied'
  on_true_step INTEGER,                       -- step_order to jump to
  on_false_step INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, step_order)
);

-- Tracks each lead's progress through a sequence
CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) NOT NULL,
  sequence_id UUID REFERENCES sequences(id) NOT NULL,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',                -- active, paused, completed, failed, replied
  next_execution_at TIMESTAMPTZ,
  last_executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, campaign_id)
);

CREATE INDEX idx_enrollments_next_exec ON sequence_enrollments(next_execution_at)
  WHERE status = 'active';


-- 20240101000004_create_messages.sql

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES leads(id),
  campaign_id UUID REFERENCES campaigns(id),

  -- Unipile References
  unipile_chat_id TEXT,
  unipile_message_id TEXT,

  -- Content
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',            -- text, connection_request, inmail

  -- Status
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  is_automated BOOLEAN DEFAULT TRUE,

  -- Metadata
  sequence_step_id UUID REFERENCES sequence_steps(id),
  personalization_variables JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_lead ON messages(lead_id, created_at DESC);
CREATE INDEX idx_messages_chat ON messages(unipile_chat_id, created_at DESC);


-- 20240101000005_create_activities.sql

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES leads(id),
  campaign_id UUID REFERENCES campaigns(id),
  activity_type activity_type NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_user_time ON activities(user_id, created_at DESC);
CREATE INDEX idx_activities_lead ON activities(lead_id, created_at DESC);


-- 20240101000006_create_templates.sql

CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'message',             -- connection_request, message, follow_up
  subject TEXT,                                -- For InMail
  body TEXT NOT NULL,                          -- Supports {{variables}}: {{first_name}}, {{company}}, {{title}}, {{specialty}}, {{city}}
  variables TEXT[] DEFAULT '{}',               -- List of used variables
  is_ai_generated BOOLEAN DEFAULT FALSE,
  performance_score NUMERIC(5,2),              -- Reply rate percentage

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 20240101000007_create_settings.sql

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,

  -- Unipile Config
  unipile_account_id TEXT,
  unipile_account_status TEXT,

  -- Daily Limits
  max_daily_invites INTEGER DEFAULT 25,
  max_daily_messages INTEGER DEFAULT 50,
  max_daily_profile_views INTEGER DEFAULT 80,

  -- Timing
  outreach_start_hour INTEGER DEFAULT 9,       -- Start sending at 9 AM
  outreach_end_hour INTEGER DEFAULT 18,        -- Stop at 6 PM
  timezone TEXT DEFAULT 'Asia/Kolkata',
  min_delay_seconds INTEGER DEFAULT 30,
  max_delay_seconds INTEGER DEFAULT 120,

  -- Daily counters (reset at midnight)
  invites_sent_today INTEGER DEFAULT 0,
  messages_sent_today INTEGER DEFAULT 0,
  counters_reset_at DATE DEFAULT CURRENT_DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 20240101000008_create_webhook_logs.sql

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_unprocessed ON webhook_logs(processed, created_at)
  WHERE processed = FALSE;


-- 20240101000009_rls_policies.sql

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Example RLS policy pattern (apply to all tables with user_id)
CREATE POLICY "Users can only access own leads"
  ON leads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Repeat similar policies for all tables
-- webhook_logs: allow service role only (for edge functions)
CREATE POLICY "Service role only for webhook_logs"
  ON webhook_logs FOR ALL
  USING (auth.role() = 'service_role');
```

---

## 4. Core Implementation Priorities

Build in this order:

### Phase 1 — Foundation (Day 1-2)
1. Next.js project setup with TypeScript, Tailwind, shadcn/ui
2. Supabase project + run all migrations
3. Auth flow (Supabase Auth with email/password)
4. Dashboard layout (sidebar, topbar, responsive)
5. Settings page (save Unipile credentials)
6. Structured logging setup (Pino)
7. Error handling utilities

### Phase 2 — Lead Management (Day 3-4)
1. LinkedIn search integration (Unipile `POST /linkedin/search`)
2. Lead import from search results → save to `leads` table
3. Lead table with filtering, sorting, pagination
4. Lead detail page with profile info
5. Manual lead creation
6. CSV import
7. Profile enrichment via Apify

### Phase 3 — Outreach Engine (Day 5-7)
1. Message template CRUD with variable support
2. Sequence builder (drag-and-drop step ordering)
3. Campaign creation wizard (select leads → assign sequence → set limits)
4. Send connection request integration (`POST /users/invite`)
5. Send message integration (`POST /chats`)
6. Sequence executor (processes enrollments, respects delays and limits)
7. Rate limiter with daily counter tracking

### Phase 4 — Inbox & Webhooks (Day 8-9)
1. Unipile webhook endpoint (`/api/webhooks/unipile`)
2. Handle `message.received` → store in `messages` table, update lead status
3. Handle `relation.new` → mark invite_accepted, advance sequence
4. Inbox UI: conversation list + message thread
5. Manual reply composer
6. Quick reply templates
7. Real-time updates via Supabase Realtime

### Phase 5 — AI Personalization & Analytics (Day 10-11)
1. Claude API integration for message personalization
2. Given a template + lead profile → generate personalized message
3. System prompt including DoctorAssist value props and ICP context
4. Analytics dashboard: funnel chart, response rates, daily activity
5. Campaign performance comparison
6. A/B testing support for templates

### Phase 6 — Polish & Safety (Day 12-14)
1. Circuit breaker for external APIs
2. Retry logic with exponential backoff
3. Comprehensive error states in UI
4. Activity log/timeline per lead
5. Bulk actions (pause, archive, change status)
6. Export leads/analytics to CSV
7. Health check endpoint

---

## 5. Key Implementation Details

### 5.1 Unipile Client Wrapper

```typescript
// src/lib/unipile/client.ts
import { logger } from '@/lib/logger';

interface UnipileConfig {
  apiKey: string;
  dsn: string;
  accountId: string;
}

export class UnipileClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private accountId: string;

  constructor(config: UnipileConfig) {
    this.baseUrl = `https://${config.dsn}/api/v1`;
    this.headers = {
      'X-API-KEY': config.apiKey,
      'accept': 'application/json',
      'content-type': 'application/json',
    };
    this.accountId = config.accountId;
  }

  async searchPeople(params: LinkedInSearchParams) {
    return this.post('/linkedin/search', {
      ...params,
      api: params.api || 'classic',
      category: 'people',
    }, { account_id: this.accountId });
  }

  async getProfile(identifier: string) {
    return this.get(`/users/${identifier}`, {
      account_id: this.accountId,
    });
  }

  async sendInvitation(providerId: string, message?: string) {
    return this.post('/users/invite', {
      provider_id: providerId,
      account_id: this.accountId,
      ...(message && { message: message.substring(0, 300) }),
    });
  }

  async sendMessage(attendeeId: string, text: string) {
    return this.post('/chats', {
      account_id: this.accountId,
      attendees_ids: [attendeeId],
      text,
    });
  }

  async sendMessageInChat(chatId: string, text: string) {
    return this.post(`/chats/${chatId}/messages`, { text });
  }

  async getChats(limit = 50) {
    return this.get('/chats', {
      account_id: this.accountId,
      account_type: 'LINKEDIN',
      limit: limit.toString(),
    });
  }

  async getChatMessages(chatId: string) {
    return this.get(`/chats/${chatId}/messages`);
  }

  private async get(path: string, params?: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const correlationId = crypto.randomUUID();
    logger.info({ correlationId, method: 'GET', path, params }, 'Unipile API request');

    const res = await fetch(url.toString(), { headers: this.headers });
    const data = await res.json();

    if (!res.ok) {
      logger.error({ correlationId, status: res.status, data }, 'Unipile API error');
      throw new UnipileError(res.status, data);
    }

    logger.info({ correlationId, status: res.status }, 'Unipile API success');
    return data;
  }

  private async post(path: string, body: unknown, params?: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const correlationId = crypto.randomUUID();
    logger.info({ correlationId, method: 'POST', path }, 'Unipile API request');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      logger.error({ correlationId, status: res.status, data }, 'Unipile API error');
      throw new UnipileError(res.status, data);
    }

    logger.info({ correlationId, status: res.status }, 'Unipile API success');
    return data;
  }
}

export class UnipileError extends Error {
  constructor(public status: number, public data: unknown) {
    super(`Unipile API error: ${status}`);
    this.name = 'UnipileError';
  }
}
```

### 5.2 AI Message Personalization

```typescript
// src/lib/ai/prompts.ts
export const PERSONALIZATION_SYSTEM_PROMPT = `You are a copywriter for DoctorAssist.AI, writing personalized LinkedIn messages to medical oncologists.

About DoctorAssist.AI:
- Agentic, multimodal clinical decision support & efficiency engine
- Reduces documentation time by up to 50%
- ~95% accurate clinical transcription (SOAP, H&P notes)
- Evidence-based guidance with guideline-linked suggestions
- Integrates with HMS, PACS, LIS, RIS, EHR
- Founded 2024 in Bangalore, currently under clinical validation

RULES:
1. Keep messages under 300 characters for connection requests, under 500 for DMs
2. Be professional but warm — doctor-to-peer tone, not salesy
3. Reference their specific specialty, hospital, or a pain point relevant to their role
4. Never use exclamation marks excessively
5. Include ONE specific value prop relevant to their segment
6. End with a soft CTA (question, not hard sell)
7. Never claim FDA approval or make unverified clinical claims
8. Use {{first_name}}, {{company}}, {{specialty}} variables where appropriate

SEGMENT-SPECIFIC ANGLES:
- High-Volume Chemo Clinics: Lead with dosing validation and documentation speed
- Precision Oncology: Lead with genomic interpretation support and trial matching
- Insurance-Heavy: Lead with documentation automation and evidence justification
- General Oncologists: Lead with reducing decision fatigue and saving time per case`;

// src/lib/ai/personalize.ts
import Anthropic from '@anthropic-ai/sdk';

export async function personalizeMessage(
  template: string,
  leadProfile: LeadProfile,
  segment?: string
): Promise<string> {
  const anthropic = new Anthropic();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: PERSONALIZATION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Personalize this message template for the following doctor:

Template: "${template}"

Doctor Profile:
- Name: ${leadProfile.firstName} ${leadProfile.lastName}
- Title: ${leadProfile.jobTitle}
- Hospital: ${leadProfile.company}
- Location: ${leadProfile.location}
- Specialty: ${leadProfile.specialty || 'Oncology'}
- Headline: ${leadProfile.headline}
- Segment: ${segment || 'general'}

Return ONLY the personalized message text, nothing else.`
    }],
  });

  return (message.content[0] as { text: string }).text.trim();
}
```

### 5.3 Rate Limiter

```typescript
// src/lib/queue/rateLimiter.ts
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function checkAndIncrementLimit(
  userId: string,
  limitType: 'invites' | 'messages'
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createClient();
  const column = limitType === 'invites' ? 'invites_sent_today' : 'messages_sent_today';
  const maxColumn = limitType === 'invites' ? 'max_daily_invites' : 'max_daily_messages';

  // Reset counters if new day
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!settings) throw new Error('Settings not found');

  const today = new Date().toISOString().split('T')[0];
  if (settings.counters_reset_at !== today) {
    await supabase
      .from('settings')
      .update({
        invites_sent_today: 0,
        messages_sent_today: 0,
        counters_reset_at: today,
      })
      .eq('user_id', userId);
    settings.invites_sent_today = 0;
    settings.messages_sent_today = 0;
  }

  const current = settings[column] as number;
  const max = settings[maxColumn] as number;

  if (current >= max) {
    logger.warn({ userId, limitType, current, max }, 'Daily limit reached');
    return { allowed: false, remaining: 0 };
  }

  await supabase
    .from('settings')
    .update({ [column]: current + 1 })
    .eq('user_id', userId);

  return { allowed: true, remaining: max - current - 1 };
}

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}
```

### 5.4 Webhook Handler

```typescript
// src/app/api/webhooks/unipile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  try {
    const payload = await req.json();
    const supabase = createClient();

    // Log webhook
    await supabase.from('webhook_logs').insert({
      event_type: payload.event || 'unknown',
      payload,
    });

    logger.info({ correlationId, event: payload.event }, 'Webhook received');

    switch (payload.event) {
      case 'message.received':
        await handleNewMessage(supabase, payload, correlationId);
        break;
      case 'relation.new':
        await handleNewRelation(supabase, payload, correlationId);
        break;
      default:
        logger.warn({ correlationId, event: payload.event }, 'Unknown webhook event');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ correlationId, error }, 'Webhook processing failed');
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

async function handleNewMessage(supabase: any, payload: any, correlationId: string) {
  // 1. Find lead by chat_id or sender provider_id
  // 2. Store message in messages table
  // 3. Update lead status to 'replied' if direction is inbound
  // 4. Pause sequence enrollment if they replied
  // 5. Log activity
  // 6. Trigger Supabase Realtime notification
}

async function handleNewRelation(supabase: any, payload: any, correlationId: string) {
  // 1. Find lead by provider_id
  // 2. Update lead status to 'invite_accepted'
  // 3. Advance sequence enrollment to next step
  // 4. Log activity
}
```

### 5.5 ICP Constants

```typescript
// src/constants/icp.ts
export const ICP_TITLES = {
  core: [
    'Medical Oncologist',
    'Consultant Medical Oncology',
    'Clinical Oncologist',
    'Hemato-Oncologist',
    'DM Medical Oncology',
    'Radiation Oncologist',
  ],
  senior: [
    'Head of Oncology',
    'Director Oncology',
    'Director – Oncology',
    'Senior Consultant Oncology',
    'Chief Medical Officer',
    'Medical Director',
    'Hospital CIO',
    'Tumor Board Coordinator',
  ],
} as const;

export const TARGET_HOSPITALS = {
  india_corporate: ['Apollo Hospitals', 'Fortis Healthcare', 'Manipal Hospitals', 'Aster DM Healthcare'],
  india_cancer: ['HCG Cancer Centre', 'Tata Memorial Hospital'],
  uae: ['Cleveland Clinic Abu Dhabi', 'Mediclinic Middle East', 'Burjeel Holdings', 'American Hospital Dubai'],
} as const;

export const TARGET_LOCATIONS = {
  phase1: ['Mumbai', 'Delhi NCR', 'Bengaluru', 'Hyderabad', 'Chennai'],
  phase2: ['Pune', 'Ahmedabad', 'Kochi', 'Lucknow'],
  uae: ['Abu Dhabi', 'Dubai'],
} as const;

export const LINKEDIN_SEARCH_FILTERS = {
  keywords: 'oncologist OR oncology OR "cancer treatment" OR chemotherapy',
  skills: ['Chemotherapy', 'Immunotherapy', 'Cancer Treatment'],
  seniority: ['Senior', 'Director', 'CXO'],
} as const;
```

---

## 6. Dashboard Pages — Key Requirements

### 6.1 Dashboard Home (`/dashboard`)
- KPI cards: Total leads, Invites sent today, Reply rate, Meetings booked
- Outreach funnel chart (leads → invited → accepted → messaged → replied → interested)
- Response rate trend (7-day / 30-day line chart)
- Recent activity feed (last 20 activities)
- Active campaigns summary cards

### 6.2 Leads (`/leads`)
- Sortable, filterable data table (shadcn DataTable)
- Filters: status, campaign, segment, location, hospital type, tags
- Search by name, company, title
- Bulk actions: add to campaign, change status, export, delete
- Click row → lead detail page
- Import button → LinkedIn search panel or CSV upload

### 6.3 Lead Detail (`/leads/[id]`)
- Left column: Profile card (photo, name, title, company, location, LinkedIn link)
- ICP classification and score
- Tags editor
- Middle column: Activity timeline (all activities + messages chronologically)
- Right column: Quick actions (send message, change status, add note)
- Message history with this lead

### 6.4 Campaigns (`/campaigns`)
- Campaign cards with status badge, lead count, key stats
- Create new campaign wizard:
  1. Name & description
  2. Select sequence template
  3. Add leads (from existing, search, or import)
  4. Set daily limits
  5. Review & launch

### 6.5 Sequence Builder (`/sequences/[id]`)
- Visual step builder (vertical timeline)
- Step types: Connection Request → Wait → Delay → Message → Condition
- Each step shows template preview with variables highlighted
- Drag to reorder
- Test sequence with sample lead data

### 6.6 Inbox (`/inbox`)
- Left panel: Conversation list (lead name, last message preview, timestamp, unread badge)
- Right panel: Full message thread
- Message composer at bottom with template insertion
- Quick reply suggestions
- Mark as interested / not interested buttons
- Real-time updates (Supabase Realtime)

### 6.7 Templates (`/templates`)
- Template list with category tabs (connection_request, message, follow_up)
- Template editor with variable picker ({{first_name}}, {{company}}, etc.)
- Preview with sample data
- Performance metrics (reply rate per template)
- AI generate button → calls Claude API with lead context

### 6.8 Analytics (`/analytics`)
- Outreach funnel (Sankey or funnel chart)
- Daily activity chart (invites, messages, replies)
- Campaign comparison table
- Top performing templates
- Response time distribution
- Geographic heat map of leads

### 6.9 Settings (`/settings`)
- Unipile connection status and account info
- Daily limits configuration
- Working hours (when to send outreach)
- Timezone setting
- Webhook URL display (for Unipile dashboard setup)
- Account health indicators

---

## 7. Logging Requirements

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: {
    service: 'doctorassist-outreach',
    env: process.env.NODE_ENV,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Usage patterns:
// logger.info({ correlationId, leadId, action: 'invite_sent' }, 'Connection request sent');
// logger.error({ correlationId, error, leadId }, 'Failed to send invitation');
// logger.warn({ userId, limitType, remaining: 0 }, 'Daily limit reached');
```

Every API route, every external API call, every database operation, and every webhook must log with:
- `correlationId` — UUID generated per request
- `action` — what operation is being performed
- `leadId` / `campaignId` — relevant entity IDs
- `duration` — for API calls, log response time
- `error` — full error object on failures

---

## 8. Default Sequence Templates (Seed Data)

### Oncologist Outreach Sequence (5-step)
1. **Connection Request** (with note): "Hi {{first_name}}, I noticed your work at {{company}} in oncology. We're building an AI decision support tool designed for clinical teams like yours — would love to connect and share insights."
2. **Delay**: 2 days (wait for acceptance)
3. **Message 1** (after acceptance): "Thanks for connecting, {{first_name}}! I'm with DoctorAssist.AI — we help oncologists cut documentation time by 50% and get real-time, evidence-based treatment suggestions at the point of care. Given your role at {{company}}, I thought this might resonate. Would you be open to a quick 15-min walkthrough?"
4. **Delay**: 3 days
5. **Follow-up** (if no reply): "Hi {{first_name}}, just following up — I know oncologists deal with heavy patient loads. We're currently validating with teams at major cancer centers in India. If the timing's right, I'd be happy to show you what we're building. No pressure either way!"

---

## 9. .env.local.example

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Unipile
UNIPILE_API_KEY=your_unipile_api_key
UNIPILE_DSN=api1.unipile.com:13443
UNIPILE_ACCOUNT_ID=your_linkedin_account_id

# Apify
APIFY_API_TOKEN=apify_api_...

# Anthropic (for AI personalization)
ANTHROPIC_API_KEY=sk-ant-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBHOOK_SECRET=whsec_...
LOG_LEVEL=info
```

---

## 10. Critical Safety and Compliance Rules

1. **LinkedIn Rate Limits**: Never exceed 25 invites/day, 50 messages/day. Add random delays (30-120s) between all actions.
2. **Personalization**: Every message MUST be personalized — never send identical messages to multiple leads.
3. **Opt-out**: Immediately respect any "not interested" / "stop" / "unsubscribe" replies — auto-set status to `do_not_contact`.
4. **Data Privacy**: No medical/health data stored — only professional LinkedIn profile data.
5. **Honest Positioning**: Never claim DoctorAssist is FDA-approved or make unverified clinical efficacy claims in messages.
6. **Circuit Breakers**: If Unipile returns 3 consecutive 429/5xx errors, pause all campaigns for 30 minutes.
7. **Audit Trail**: Log every outbound action (invite, message) with timestamp and content for compliance review.
8. **Account Health**: Monitor LinkedIn account health — if invitation acceptance rate drops below 20%, alert and pause.

---

## 11. Commands to Bootstrap

```bash
# Create Next.js project
npx create-next-app@latest doctorassist-linkedin-outreach --typescript --tailwind --eslint --app --src-dir --use-pnpm

# Install dependencies
pnpm add @supabase/supabase-js @supabase/ssr zod pino pino-pretty
pnpm add @anthropic-ai/sdk apify-client
pnpm add date-fns recharts
pnpm add -D @types/node vitest @playwright/test

# shadcn/ui setup
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label table tabs badge dialog dropdown-menu select sheet separator skeleton toast avatar command popover calendar

# Supabase CLI
pnpm add -D supabase
npx supabase init
npx supabase db push
```
