// Types generated from Supabase migration files
// See: supabase/migrations/20240101000000_create_enums.sql

// ─── Enums ───────────────────────────────────────────────────────────────────

export type LeadStatus =
  | "new"
  | "enriched"
  | "invite_sent"
  | "invite_accepted"
  | "invite_expired"
  | "message_sent"
  | "replied"
  | "interested"
  | "not_interested"
  | "meeting_booked"
  | "converted"
  | "do_not_contact";

export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type SequenceStepType =
  | "connection_request"
  | "wait_for_acceptance"
  | "message"
  | "delay"
  | "condition";

export type ActivityType =
  | "lead_created"
  | "lead_enriched"
  | "invite_sent"
  | "invite_accepted"
  | "invite_expired"
  | "message_sent"
  | "message_received"
  | "reply_detected"
  | "status_changed"
  | "campaign_started"
  | "campaign_paused"
  | "error";

/** Company size tier. */
export type IcpSegment = "enterprise" | "mid_market" | "smb";

export type MessageDirection = "outbound" | "inbound";

// ─── Row types ───────────────────────────────────────────────────────────────

/*
 * These MUST be `type` aliases, not `interface`s.
 *
 * supabase-js constrains a schema's tables to `{ Row: Record<string, unknown>;
 * … }`. TypeScript gives type aliases an implicit index signature but does not
 * give one to interfaces, so `Row: SomeInterface` fails that constraint — and
 * when it fails, the whole Schema generic silently collapses to `never`.
 * `.insert()` then only accepts `never`, which is why every write in this
 * codebase used to be cast through `any` with an eslint-disable and a comment
 * blaming "supabase-js v2.100 generic resolution".
 *
 * Converting any of these back to `interface` reintroduces that, quietly.
 */

export type Lead = {
  id: string;
  user_id: string;
  linkedin_public_id: string | null;
  linkedin_provider_id: string | null;
  linkedin_member_urn: string | null;
  linkedin_profile_url: string | null;
  linkedin_profile_picture_url: string | null;
  first_name: string;
  last_name: string;
  full_name: string; // generated column
  headline: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company: string | null;
  company_linkedin_id: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  experience_years: number | null;
  icp_segment: IcpSegment | null;
  icp_score: number;
  /** Org category: corporate | agency | nonprofit | public_sector | startup */
  account_type: string | null;
  target_region: string | null;
  status: LeadStatus;
  campaign_id: string | null;
  unipile_chat_id: string | null;
  enrichment_data: Record<string, unknown>;
  /** Nullable in SQL: `skills TEXT[]` has no DEFAULT. */
  skills: string[] | null;
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  source: string;
  // n8n v2 sync columns (migration 20240101000013)
  account_name: string | null;
  segment: string | null;
  region: string | null;
  tier: string | null;
  sequence_step: number | null;
  next_touch_at: string | null;
  /** Nullable in SQL: `tags TEXT[] DEFAULT '{}'` — the default only applies when omitted. */
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  last_replied_at: string | null;
}

export type Campaign = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  sequence_id: string | null;
  search_query: Record<string, unknown> | null;
  icp_segments: IcpSegment[] | null;
  target_titles: string[] | null;
  target_locations: string[] | null;
  target_companies: string[] | null;
  daily_invite_limit: number;
  daily_message_limit: number;
  total_leads: number;
  invites_sent: number;
  invites_accepted: number;
  messages_sent: number;
  replies_received: number;
  positive_replies: number;
  meetings_booked: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
}

export type Sequence = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type SequenceStep = {
  id: string;
  sequence_id: string;
  step_order: number;
  step_type: SequenceStepType;
  template_id: string | null;
  message_body: string | null;
  delay_hours: number | null;
  delay_days: number | null;
  condition_field: string | null;
  condition_value: string | null;
  on_true_step: number | null;
  on_false_step: number | null;
  created_at: string;
}

export type SequenceEnrollment = {
  id: string;
  lead_id: string;
  campaign_id: string;
  sequence_id: string;
  current_step: number;
  status: string;
  next_execution_at: string | null;
  last_executed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type Message = {
  id: string;
  user_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  unipile_chat_id: string | null;
  unipile_message_id: string | null;
  direction: MessageDirection;
  message_text: string;
  message_type: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  is_automated: boolean;
  sequence_step_id: string | null;
  personalization_variables: Record<string, unknown>;
  created_at: string;
}

export type Activity = {
  id: string;
  user_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  activity_type: ActivityType;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type Template = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  subject: string | null;
  body: string;
  /** Nullable in SQL: `variables TEXT[] DEFAULT '{}'`. */
  variables: string[] | null;
  is_ai_generated: boolean;
  performance_score: number | null;
  created_at: string;
  updated_at: string;
}

export type Settings = {
  id: string;
  user_id: string;
  unipile_account_id: string | null;
  unipile_account_status: string | null;
  max_daily_invites: number;
  max_daily_messages: number;
  max_daily_profile_views: number;
  outreach_start_hour: number;
  outreach_end_hour: number;
  timezone: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
  invites_sent_today: number;
  messages_sent_today: number;
  profile_views_today: number;
  counters_reset_at: string;
  created_at: string;
  updated_at: string;
}

export type WebhookLog = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processing_error: string | null;
  created_at: string;
}

// ─── Supabase Database type (for typed client) ──────────────────────────────

/**
 * Columns `increment_campaign_stat` will accept. Must stay in sync with the
 * whitelist inside the SQL function — anything else raises at runtime.
 */
export type CampaignStatField =
  | "total_leads"
  | "invites_sent"
  | "messages_sent"
  | "invites_accepted"
  | "replies_received"
  | "positive_replies"
  | "meetings_booked";

/** Columns `increment_settings_counter` will accept. */
export type SettingsCounterField =
  | "invites_sent_today"
  | "messages_sent_today"
  | "profile_views_today";

/**
 * Insert shape for a table.
 *
 * `Req` names the columns Postgres genuinely requires — NOT NULL with no
 * DEFAULT. Everything else is optional, because the database supplies a
 * default or accepts NULL.
 *
 * The previous definition derived Insert as `Omit<Row, generated-columns>`,
 * which marked every defaulted column (`status`, `icp_score`, the campaign
 * counters, `tags`, `source`, …) as mandatory. Callers could not satisfy that
 * without inventing values, so every insert in the codebase was written as
 * `(supabase as any).from(...).insert(...)` with an eslint-disable — and the
 * typed client provided no insert-time safety at all.
 */
type InsertOf<Row, Req extends keyof Row> = Pick<Row, Req> &
  Partial<Omit<Row, Req>>;

export interface Database {
  public: {
    Tables: {
      leads: {
        Row: Lead;
        // full_name is a generated column — never write it.
        Insert: InsertOf<Omit<Lead, "full_name">, "user_id" | "first_name" | "last_name">;
        Update: Partial<Omit<Lead, "id" | "full_name">>;
        Relationships: [];
      };
      campaigns: {
        Row: Campaign;
        Insert: InsertOf<Campaign, "user_id" | "name">;
        Update: Partial<Omit<Campaign, "id">>;
        Relationships: [];
      };
      sequences: {
        Row: Sequence;
        Insert: InsertOf<Sequence, "user_id" | "name">;
        Update: Partial<Omit<Sequence, "id">>;
        Relationships: [];
      };
      sequence_steps: {
        Row: SequenceStep;
        Insert: InsertOf<SequenceStep, "sequence_id" | "step_order" | "step_type">;
        Update: Partial<Omit<SequenceStep, "id">>;
        Relationships: [];
      };
      sequence_enrollments: {
        Row: SequenceEnrollment;
        Insert: InsertOf<
          SequenceEnrollment,
          "lead_id" | "campaign_id" | "sequence_id"
        >;
        Update: Partial<Omit<SequenceEnrollment, "id">>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: InsertOf<Message, "user_id" | "direction" | "message_text">;
        Update: Partial<Omit<Message, "id">>;
        Relationships: [];
      };
      activities: {
        Row: Activity;
        Insert: InsertOf<Activity, "user_id" | "activity_type">;
        Update: Partial<Omit<Activity, "id">>;
        Relationships: [];
      };
      templates: {
        Row: Template;
        Insert: InsertOf<Template, "user_id" | "name" | "body">;
        Update: Partial<Omit<Template, "id">>;
        Relationships: [];
      };
      settings: {
        Row: Settings;
        Insert: InsertOf<Settings, "user_id">;
        Update: Partial<Omit<Settings, "id" | "user_id">>;
        Relationships: [];
      };
      webhook_logs: {
        Row: WebhookLog;
        Insert: InsertOf<WebhookLog, "event_type" | "payload">;
        Update: Partial<Omit<WebhookLog, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_campaign_stat: {
        Args: {
          p_campaign_id: string;
          p_field: CampaignStatField;
          p_delta: number;
        };
        Returns: undefined;
      };
      increment_settings_counter: {
        Args: {
          p_user_id: string;
          p_field: SettingsCounterField;
          p_delta: number;
        };
        Returns: number;
      };
      claim_due_enrollments: {
        Args: {
          p_limit: number;
          /** ISO timestamp the claimed rows' next_execution_at is pushed to. */
          p_claim_until: string;
        };
        Returns: SequenceEnrollment[];
      };
    };
    Enums: {
      lead_status: LeadStatus;
      campaign_status: CampaignStatus;
      sequence_step_type: SequenceStepType;
      activity_type: ActivityType;
      icp_segment: IcpSegment;
    };
  };
}
