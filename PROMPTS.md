# DoctorAssist.AI LinkedIn Outreach — Step-by-Step Build Prompts

Copy and paste each prompt below into Claude Code **in order**. Each prompt builds on the previous one. The `CLAUDE.md` file provides persistent context so Claude Code knows the project conventions.

---

## Phase 1 — Foundation

### Prompt 1: Supabase Database Schema

```
Create all Supabase migration files in supabase/migrations/ based on the database schema in the spec (doctorassist-linkedin-automation-prompt.md section 3). Create these files:
- 20240101000000_create_enums.sql (all enum types: lead_status, campaign_status, sequence_step_type, activity_type, icp_segment)
- 20240101000001_create_leads.sql (leads table with all columns and indexes)
- 20240101000002_create_campaigns.sql (campaigns table)
- 20240101000003_create_sequences.sql (sequences, sequence_steps, sequence_enrollments tables with indexes)
- 20240101000004_create_messages.sql (messages table with indexes)
- 20240101000005_create_activities.sql (activities table with indexes)
- 20240101000006_create_templates.sql (templates table)
- 20240101000007_create_settings.sql (settings table)
- 20240101000008_create_webhook_logs.sql (webhook_logs table with index)
- 20240101000009_rls_policies.sql (RLS policies for all tables — users access own data, webhook_logs service_role only)
Also create supabase/seed.sql with the default oncologist outreach sequence template from section 8 of the spec.
```

### Prompt 2: Structured Logging & Error Handling

```
Create the logging and error handling utilities:
1. src/lib/logger.ts — Pino logger with correlation ID support, pino-pretty in dev, structured JSON in prod. Include the service name 'doctorassist-outreach'.
2. src/lib/errors.ts — Custom error classes: AppError (base), UnipileError, ApifyError, ValidationError, RateLimitError. Each should include statusCode, correlationId, and context object.
3. src/lib/validators.ts — Zod schemas for: lead creation, campaign creation, template creation, sequence step creation, settings update, LinkedIn search params.
Refer to CLAUDE.md for code style (strict TS, no any types, async/await).
```

### Prompt 3: Supabase Client Setup

```
Create the Supabase client utilities:
1. src/lib/supabase/client.ts — Browser client using createBrowserClient from @supabase/ssr
2. src/lib/supabase/server.ts — Server client using createServerClient from @supabase/ssr with cookies() from next/headers. Use service role key for admin operations.
3. src/lib/supabase/middleware.ts — Next.js middleware for auth session refresh
4. src/middleware.ts — Wire up the Supabase auth middleware, protect all /dashboard/* routes, redirect unauthenticated to /login
5. src/types/database.ts — TypeScript types matching the Supabase schema (leads, campaigns, sequences, sequence_steps, sequence_enrollments, messages, activities, templates, settings, webhook_logs). Use the enum values from the migration files.
```

### Prompt 4: Auth Flow

```
Build the authentication flow:
1. src/app/(auth)/layout.tsx — Centered layout for auth pages, clean minimal design
2. src/app/(auth)/login/page.tsx — Email/password login form using Supabase Auth. Include sign-up toggle. Use shadcn/ui form components. Show DoctorAssist.AI branding.
3. src/app/page.tsx — Root page that redirects to /dashboard if authenticated, /login if not
4. Add a sign-out button component that can be used in the dashboard layout
Use server actions for the auth form submissions. Handle errors gracefully with toast notifications.
```

### Prompt 5: Dashboard Layout

```
Build the main dashboard layout:
1. src/app/(dashboard)/layout.tsx — Layout with sidebar and topbar
2. src/components/layout/Sidebar.tsx — Collapsible sidebar with navigation links: Dashboard, Leads, Campaigns, Sequences, Inbox, Templates, Analytics, Settings. Use icons from lucide-react. Show DoctorAssist.AI logo at top. Highlight active route.
3. src/components/layout/TopBar.tsx — Top bar with page title (dynamic based on route), user avatar dropdown (profile, sign out), and notification bell placeholder
4. src/components/layout/MobileNav.tsx — Sheet-based mobile navigation that slides in from left
Make it responsive — sidebar collapses to icons on medium screens, hidden on mobile (use MobileNav instead).
```

### Prompt 6: Settings Page

```
Build the settings page:
1. src/app/(dashboard)/settings/page.tsx — Settings page with sections:
   - Unipile Connection: account ID input, connection status indicator, test connection button
   - Daily Limits: sliders/inputs for max daily invites (default 25), max daily messages (default 50), max profile views (default 80)
   - Working Hours: start hour, end hour dropdowns, timezone selector
   - Webhook URL: display the webhook URL for Unipile setup (read-only, with copy button)
   - Account Health: placeholder section for metrics
2. src/app/api/settings/route.ts — GET (fetch user settings) and PATCH (update settings) endpoints
Use Zod validation on the API route. Save to the settings table in Supabase.
```

### Prompt 7: Shared UI Components

```
Create these shared components in src/components/shared/:
1. StatusBadge.tsx — Renders colored badges for lead_status and campaign_status enums. Use appropriate colors (green for positive statuses, red for negative, yellow for pending).
2. ConfirmDialog.tsx — Reusable confirmation dialog using shadcn AlertDialog. Props: title, description, onConfirm, variant (default/destructive).
3. LoadingSpinner.tsx — Simple spinner component with optional size prop
4. EmptyState.tsx — Empty state with icon, title, description, and optional action button
5. Pagination.tsx — Pagination component with page numbers, prev/next, and page size selector
6. SearchInput.tsx — Debounced search input with search icon and clear button
```

---

## Phase 2 — Lead Management

### Prompt 8: Unipile Client

```
Create the Unipile API client wrapper:
1. src/lib/unipile/client.ts — UnipileClient class with methods: searchPeople, getProfile, sendInvitation, sendMessage, sendMessageInChat, getChats, getChatMessages. Every method must log with correlation IDs using the Pino logger. Include the UnipileError class.
2. src/lib/unipile/types.ts — TypeScript types for all Unipile API responses (search results, profile, chat, message)
3. src/lib/unipile/search.ts — Helper functions for building LinkedIn search queries from ICP filters (titles, locations, companies)
4. src/lib/unipile/messaging.ts — Higher-level messaging functions that check rate limits before sending
Refer to CLAUDE.md for Unipile API details. Use env vars UNIPILE_API_KEY, UNIPILE_DSN, UNIPILE_ACCOUNT_ID.
```

### Prompt 9: LinkedIn Search API Route & UI

```
Build the LinkedIn search feature:
1. src/app/api/linkedin/search/route.ts — POST endpoint that accepts search params (keywords, title, location, company) and calls Unipile searchPeople. Validate input with Zod. Log with correlation IDs.
2. src/app/api/linkedin/profile/route.ts — GET endpoint to fetch a single LinkedIn profile by identifier
3. src/components/leads/LinkedInSearchPanel.tsx — Search form with inputs for keywords, title filter, location filter (with presets from ICP_TITLES and TARGET_LOCATIONS), company filter. Show results in a card grid with name, headline, company, location, and "Import as Lead" button.
4. src/constants/icp.ts — ICP constants: ICP_TITLES, TARGET_HOSPITALS, TARGET_LOCATIONS, LINKEDIN_SEARCH_FILTERS as defined in the spec section 5.5.
```

### Prompt 10: Lead CRUD API Routes

```
Build the lead management API:
1. src/app/api/leads/route.ts — GET (list leads with pagination, filtering by status/campaign/segment/location, search by name/company/title, sorting) and POST (create single lead)
2. src/app/api/leads/[id]/route.ts — GET (single lead with full details), PATCH (update lead fields), DELETE (soft delete by setting status to do_not_contact)
3. src/app/api/leads/bulk/route.ts — POST endpoint for bulk importing leads from an array (used by LinkedIn search import and CSV import)
4. src/hooks/useLeads.ts — React hook for lead operations: fetchLeads (with filters), createLead, updateLead, deleteLead, bulkImport. Use SWR or simple fetch with state management.
All endpoints must validate with Zod, log with correlation IDs, and check Supabase errors.
```

### Prompt 11: Leads Table Page

```
Build the leads list page:
1. src/app/(dashboard)/leads/page.tsx — Main leads page with search bar, filter controls, and data table
2. src/components/leads/LeadTable.tsx — Data table using shadcn Table with columns: checkbox, name (with avatar), title, company, location, status (StatusBadge), campaign, last contacted, actions dropdown. Sortable columns. Row click navigates to lead detail.
3. src/components/leads/LeadFilters.tsx — Filter bar with dropdowns for: status (multi-select), campaign, ICP segment, location, hospital type, tags. Include "Clear all" button.
4. Add bulk action bar that appears when checkboxes are selected: "Add to Campaign", "Change Status", "Export Selected", "Delete"
Use the useLeads hook. Implement URL-based filter state so filters persist on page refresh.
```

### Prompt 12: Lead Detail Page

```
Build the lead detail page:
1. src/app/(dashboard)/leads/[id]/page.tsx — Three-column layout on desktop, stacked on mobile
2. src/components/leads/LeadDetail.tsx — Left column: profile card with LinkedIn photo, full name, headline, job title, company, location, LinkedIn profile link, ICP segment badge, ICP score, tags editor, notes textarea
3. src/components/leads/LeadTimeline.tsx — Middle column: chronological activity timeline showing all activities and messages for this lead. Each entry shows icon, description, timestamp. Messages show full text.
4. Right column: Quick actions card — send message button, change status dropdown, add to campaign button, enrich profile button, add note form
Fetch lead data and activities using the API routes. Use Supabase Realtime to subscribe to changes.
```

### Prompt 13: Lead Import (CSV)

```
Build the CSV import feature:
1. First run: npm install papaparse @types/papaparse
2. src/app/(dashboard)/leads/import/page.tsx — Import page with two tabs: "LinkedIn Search" (renders LinkedInSearchPanel) and "CSV Upload"
3. src/components/leads/LeadImportModal.tsx — CSV upload component: drag-and-drop file zone, CSV parsing with Papa Parse, column mapping UI (map CSV columns to lead fields: first_name, last_name, linkedin_profile_url, job_title, company, location, email, phone), preview table showing first 5 rows, import button
4. Wire the CSV import to POST /api/leads/bulk
```

### Prompt 14: Apify Profile Enrichment

```
Build the profile enrichment feature:
1. src/lib/apify/client.ts — Apify client wrapper using apify-client package
2. src/lib/apify/scraper.ts — Function to run the LinkedIn Profile Scraper actor with a profile URL, parse the results (name, headline, company, location, experience, skills, education, profile picture)
3. src/app/api/leads/enrich/route.ts — POST endpoint that takes a lead ID, fetches their LinkedIn profile URL, runs the Apify scraper, and updates the lead record with enriched data (enrichment_data JSONB, skills, education, experience arrays). Update status to 'enriched'. Log activity.
4. Add an "Enrich" button on the lead detail page that triggers this endpoint with a loading state.
```

---

## Phase 3 — Outreach Engine

### Prompt 15: Message Templates CRUD

```
Build the message template system:
1. src/app/api/templates/route.ts — GET (list templates with category filter) and POST (create template)
2. src/app/api/templates/[id]/route.ts — GET, PATCH, DELETE for single template
3. src/hooks/useTemplates.ts — Hook for template CRUD operations
4. src/app/(dashboard)/templates/page.tsx — Template manager page with category tabs (connection_request, message, follow_up). Each template shows name, preview, variables used, performance score. Create/edit in a side panel.
5. src/components/templates/TemplateEditor.tsx — Rich text editor for template body with variable insertion toolbar ({{first_name}}, {{company}}, {{specialty}}, {{city}}, {{title}}). Show character count (300 limit for connection requests).
6. src/components/templates/VariableInserter.tsx — Dropdown/popover listing all available variables, click to insert at cursor position.
```

### Prompt 16: Sequence Builder

```
Build the sequence builder:
1. First run: npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
2. src/app/api/sequences/route.ts — GET/POST for sequences
3. src/app/api/sequences/[id]/route.ts — GET/PATCH/DELETE for single sequence, including nested sequence_steps
4. src/hooks/useSequences.ts — Hook for sequence CRUD with steps
5. src/app/(dashboard)/sequences/page.tsx — Sequence list page with cards showing name, step count, usage count
6. src/app/(dashboard)/sequences/[id]/page.tsx — Sequence builder page
7. src/components/sequences/SequenceBuilder.tsx — Visual vertical timeline showing all steps. Add step button between steps. Each step shows type icon, label, and preview.
8. src/components/sequences/StepEditor.tsx — Editor panel for each step type: connection_request (template picker), wait_for_acceptance, message (template picker), delay (hours/days inputs), condition (field, value, branch selectors)
9. src/components/sequences/SequencePreview.tsx — Preview panel showing the full sequence with sample data filled in
Support drag-to-reorder steps using @dnd-kit.
```

### Prompt 17: Campaign CRUD & Wizard

```
Build the campaign system:
1. src/app/api/campaigns/route.ts — GET (list campaigns with stats) and POST (create campaign)
2. src/app/api/campaigns/[id]/route.ts — GET (campaign with full stats and lead list) and PATCH (update campaign)
3. src/hooks/useCampaigns.ts — Hook for campaign operations
4. src/app/(dashboard)/campaigns/page.tsx — Campaign list with cards showing name, status badge, key metrics (leads, invites sent, acceptance rate, replies)
5. src/app/(dashboard)/campaigns/new/page.tsx — Multi-step campaign creation wizard
6. src/components/campaigns/CampaignWizard.tsx — 5-step wizard: (1) Name & description, (2) Select sequence from existing sequences, (3) Add leads — search/filter from existing leads or import new ones, (4) Set daily limits (invites/messages), (5) Review summary & launch
7. src/components/campaigns/CampaignCard.tsx — Card component for campaign list
8. src/app/(dashboard)/campaigns/[id]/page.tsx — Campaign detail: stats header, lead table filtered to this campaign, sequence visualization
```

### Prompt 18: Rate Limiter

```
Build the rate limiting system:
1. src/lib/queue/rateLimiter.ts — checkAndIncrementLimit function: checks settings table for daily counters, resets if new day, checks limit, increments counter. Returns { allowed: boolean, remaining: number }. Also add randomDelay function that returns a promise resolving after a random delay between min and max milliseconds.
2. src/constants/linkedinLimits.ts — Default limits: MAX_DAILY_INVITES=25, MAX_DAILY_MESSAGES=50, MAX_DAILY_PROFILE_VIEWS=80, MIN_DELAY_SECONDS=30, MAX_DELAY_SECONDS=120, MAX_WEEKLY_INVITES=100
3. Update the settings API to return current daily usage counts alongside limits
```

### Prompt 19: Send Invite API

```
Build the connection request sending feature:
1. src/app/api/linkedin/send-invite/route.ts — POST endpoint that: validates input (leadId, optional message), checks rate limit (invites), fetches lead's provider_id, calls unipile sendInvitation, updates lead status to 'invite_sent', logs activity, increments campaign invites_sent counter, stores message in messages table
2. Add a "Send Connection Request" button on the lead detail page that opens a dialog with the template selector and personalization preview
3. Respect rate limits — show remaining invites count in the UI. Disable button when limit reached.
All with correlation ID logging, error handling, and Zod validation.
```

### Prompt 20: Send Message API

```
Build the message sending feature:
1. src/app/api/linkedin/send-message/route.ts — POST endpoint that: validates input (leadId, text), checks rate limit (messages), determines if lead has existing chat (use unipile_chat_id) or needs new chat, calls appropriate Unipile method, updates lead status to 'message_sent' and last_contacted_at, logs activity, stores in messages table
2. src/app/api/linkedin/chats/route.ts — GET endpoint to list all LinkedIn chats via Unipile
3. src/app/api/linkedin/chats/[chatId]/route.ts — GET endpoint to fetch messages in a specific chat
All with rate limit checks, correlation ID logging, and error handling.
```

### Prompt 21: Sequence Executor

```
Build the sequence execution engine:
1. src/lib/queue/sequenceExecutor.ts — Main execution logic:
   - fetchDueEnrollments(): Query sequence_enrollments where status='active' AND next_execution_at <= now()
   - executeStep(): For each enrollment, fetch the current step, execute based on step_type (connection_request → send invite, message → send message, delay → calculate next_execution_at, wait_for_acceptance → check if lead status is invite_accepted, condition → evaluate and branch)
   - After each step: update current_step, calculate next_execution_at based on next step's delay, log activity
   - Handle errors: set enrollment status to 'failed', log error, continue with next enrollment
2. src/app/api/campaigns/[id]/start/route.ts — POST: Create sequence_enrollments for all campaign leads, set campaign status to 'active'
3. src/app/api/campaigns/[id]/pause/route.ts — POST: Set all active enrollments to 'paused', set campaign status to 'paused'
4. src/constants/sequenceDefaults.ts — Default oncologist outreach sequence template (5-step from spec section 8)
Add random delays between executions. Respect working hours from settings.
```

---

## Phase 4 — Inbox & Webhooks

### Prompt 22: Webhook Handler

```
Build the Unipile webhook endpoint:
1. src/app/api/webhooks/unipile/route.ts — POST handler:
   - Log raw payload to webhook_logs table
   - Route by event type: message.received → handleNewMessage, relation.new → handleNewRelation
   - handleNewMessage: find lead by chat_id or sender provider_id, store message in messages table with direction='inbound', update lead status to 'replied', pause sequence enrollment for this lead, log activity
   - handleNewRelation: find lead by provider_id, update status to 'invite_accepted', advance sequence enrollment to next step, log activity
   - Auto-detect "not interested"/"stop"/"unsubscribe" keywords in inbound messages → set lead to 'do_not_contact'
2. Verify webhook signature using WEBHOOK_SECRET env var
3. Return 200 quickly, process asynchronously if possible
```

### Prompt 23: Inbox UI — Conversation List

```
Build the inbox page — left panel:
1. src/app/(dashboard)/inbox/page.tsx — Split panel layout: conversation list (left 1/3) and message thread (right 2/3)
2. src/components/inbox/ConversationList.tsx — List of all LinkedIn conversations. Each item shows: lead avatar, name, last message preview (truncated), timestamp (relative), unread indicator badge. Click to select and show thread. Sort by most recent message.
3. src/hooks/useInbox.ts — Hook to fetch chats from /api/linkedin/chats, manage selected conversation state
4. Add search/filter at top of conversation list: search by name, filter by status (all, unread, replied, interested)
```

### Prompt 24: Inbox UI — Message Thread

```
Build the inbox message thread (right panel):
1. src/components/inbox/MessageThread.tsx — Shows full message history for selected conversation. Outbound messages aligned right (blue), inbound aligned left (gray). Show timestamp on each message. Auto-scroll to bottom on new messages.
2. src/components/inbox/MessageComposer.tsx — Message input at bottom with: text area, send button, template insertion button (opens template picker), AI personalize button placeholder
3. src/components/inbox/QuickReplyBar.tsx — Row of quick action buttons above the composer: "Mark Interested", "Mark Not Interested", "Book Meeting", "Send Follow-up Template"
4. Wire send to POST /api/linkedin/send-message
```

### Prompt 25: Realtime Updates

```
Add real-time message updates:
1. src/hooks/useRealtimeMessages.ts — Supabase Realtime hook that subscribes to INSERT events on the messages table filtered by user_id. On new message: update conversation list, show toast notification, update message thread if viewing that conversation.
2. Wire this hook into the inbox page and the lead detail page
3. Add a realtime subscription for leads table changes (status updates) to refresh lead list and campaign stats automatically
4. Add an unread message count badge in the sidebar next to "Inbox"
```

### Prompt 26: Sync LinkedIn Inbox

```
Build a manual inbox sync feature:
1. src/app/api/linkedin/sync-inbox/route.ts — POST endpoint that: calls Unipile getChats to fetch recent conversations, for each chat checks if we have a matching lead (by chat_id or attendee provider_id), fetches messages for new/updated chats, stores new messages in the messages table, updates lead's unipile_chat_id if not set
2. Add a "Sync Inbox" button on the inbox page that triggers this endpoint
3. This serves as a fallback when webhooks miss events
```

---

## Phase 5 — AI Personalization & Analytics

### Prompt 27: AI Message Personalization

```
Build the Claude AI personalization feature:
1. src/lib/ai/prompts.ts — PERSONALIZATION_SYSTEM_PROMPT including DoctorAssist value props, rules for message writing (under 300 chars for connection requests, under 500 for DMs, professional tone, one value prop, soft CTA), and segment-specific angles (High-Volume Chemo → dosing validation, Precision Oncology → genomic interpretation, Insurance-Heavy → documentation automation).
2. src/lib/ai/personalize.ts — personalizeMessage function using @anthropic-ai/sdk. Takes template string, lead profile, and optional segment. Calls claude-sonnet-4-20250514 with max_tokens 300. Returns personalized message text.
3. src/app/api/messages/personalize/route.ts — POST endpoint that accepts templateId (or raw template text) and leadId, fetches lead profile, calls personalizeMessage, returns the personalized text. Validate with Zod.
4. Add an "AI Personalize" button in the template editor and message composer that calls this endpoint and fills in the result. Show loading state and allow editing before sending.
```

### Prompt 28: Dashboard Home Page

```
Build the dashboard overview page:
1. src/app/(dashboard)/dashboard/page.tsx — Main dashboard with KPIs and charts
2. src/components/dashboard/KPICards.tsx — 4 cards showing: Total Leads (with trend), Invites Sent Today (with limit), Reply Rate (percentage), Meetings Booked (total). Fetch from analytics API.
3. src/components/dashboard/OutreachFunnel.tsx — Funnel chart using Recharts showing: Total Leads → Invited → Accepted → Messaged → Replied → Interested → Meeting Booked
4. src/components/dashboard/ResponseRateChart.tsx — Line chart showing daily response rate over 7/30 days (toggle). Use Recharts.
5. src/components/dashboard/RecentActivity.tsx — Feed showing last 20 activities with icons, descriptions, timestamps, and links to relevant leads
6. src/app/api/analytics/route.ts — GET endpoint that aggregates data from leads, campaigns, messages, activities tables for the dashboard
```

### Prompt 29: Analytics Page

```
Build the analytics page:
1. src/app/(dashboard)/analytics/page.tsx — Full analytics page with multiple chart sections
2. src/hooks/useAnalytics.ts — Hook to fetch analytics data with date range filter
3. Charts to include:
   - Outreach funnel (larger version of dashboard funnel)
   - Daily activity stacked bar chart (invites sent, messages sent, replies received)
   - Campaign comparison table (campaign name, leads, invites, acceptance rate, reply rate, meetings)
   - Top performing templates table (template name, times used, reply rate)
   - Response time distribution histogram (time between our message and their reply)
4. Add date range picker at the top of the page (7d, 30d, 90d, custom)
Use Recharts for all charts. Fetch data from /api/analytics with query params.
```

---

## Phase 6 — Polish & Safety

### Prompt 30: Circuit Breaker

```
Implement the circuit breaker pattern for external APIs:
1. src/lib/queue/circuitBreaker.ts — CircuitBreaker class with states: CLOSED (normal), OPEN (blocking requests), HALF_OPEN (testing recovery). Config: failureThreshold (3), resetTimeout (30 minutes). Track consecutive failures. When threshold reached: open circuit, reject all calls for resetTimeout period, then allow one test call.
2. Integrate circuit breaker into the UnipileClient — wrap all API calls
3. When circuit opens: pause all active campaigns, log critical error, show alert on dashboard
4. Add circuit breaker status indicator on the settings page
```

### Prompt 31: Retry Logic & Error States

```
Add resilience features:
1. src/lib/utils/retry.ts — withRetry utility function: exponential backoff (1s, 2s, 4s), max 3 retries, only retry on 429/5xx errors, not on 4xx client errors
2. Wrap all Unipile API calls with withRetry
3. Add error boundary components for each major page section (dashboard, leads, inbox, etc.)
4. src/components/shared/ErrorState.tsx — Error display component with retry button, error message, and support link
5. Add comprehensive error toasts throughout the app for failed operations
```

### Prompt 32: Activity Log & Bulk Actions

```
Build the activity system and bulk operations:
1. Ensure all operations throughout the app log to the activities table (lead_created, lead_enriched, invite_sent, invite_accepted, message_sent, message_received, reply_detected, status_changed, campaign_started, campaign_paused, error)
2. src/app/api/leads/bulk-action/route.ts — POST endpoint for bulk operations: change status, add to campaign, add tags, delete (set do_not_contact). Accept array of lead IDs and action.
3. Wire bulk actions into the LeadTable checkboxes and action bar
4. Add export to CSV feature: src/app/api/leads/export/route.ts — GET endpoint that returns filtered leads as CSV file download
```

### Prompt 33: Health Check & Account Monitoring

```
Build operational health features:
1. src/app/api/health/route.ts — Health check endpoint that verifies: Supabase connection, Unipile API reachability, circuit breaker status. Return JSON status.
2. Account health monitoring: track invitation acceptance rate. If below 20%, show warning banner on dashboard and auto-pause campaigns.
3. Add daily usage meters on the dashboard sidebar: invites used/limit, messages used/limit (progress bars)
4. Add "Account Health" section to settings page showing: acceptance rate, LinkedIn account age, recent error count
```

### Prompt 34: Final Polish

```
Final polish and cleanup:
1. Review all pages for responsive design — test mobile, tablet, desktop breakpoints
2. Add loading skeletons to all data-fetching pages (using shadcn Skeleton)
3. Add proper page titles and meta tags to all pages
4. Ensure all forms have proper validation messages and disabled states during submission
5. Add keyboard shortcuts: Cmd+K for search, Escape to close modals
6. Review all API routes for consistent error response format: { error: string, details?: object }
7. Run TypeScript strict mode check — fix any type errors
8. Write initial test suite: unit tests for rateLimiter, circuitBreaker, and personalize functions using Vitest
```

---

## Verification Checklist

After all prompts are complete, run these checks:

```bash
# Build should succeed
npm run build

# Dev server should start
npm run dev

# Run tests
npx vitest run

# Check TypeScript
npx tsc --noEmit
```

Then manually verify:
- [ ] `/login` shows auth page with DoctorAssist branding
- [ ] After login, `/dashboard` shows layout with sidebar
- [ ] `/leads` shows empty state with import options
- [ ] `/campaigns` shows empty state with create button
- [ ] `/sequences` shows empty state
- [ ] `/inbox` shows empty state
- [ ] `/templates` shows empty state with create button
- [ ] `/analytics` shows charts (empty data)
- [ ] `/settings` allows saving Unipile credentials and limits
