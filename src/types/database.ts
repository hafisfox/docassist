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

export type IcpSegment =
  | "high_volume_chemo"
  | "precision_oncology"
  | "insurance_heavy_urban";

export type MessageDirection = "outbound" | "inbound";

// ─── Row types ───────────────────────────────────────────────────────────────

export interface Lead {
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
  specialty: string | null;
  experience_years: number | null;
  icp_segment: IcpSegment | null;
  icp_score: number;
  hospital_type: string | null;
  target_region: string | null;
  status: LeadStatus;
  campaign_id: string | null;
  unipile_chat_id: string | null;
  enrichment_data: Record<string, unknown>;
  skills: string[];
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  source: string;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  last_replied_at: string | null;
}

export interface Campaign {
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

export interface Sequence {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
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

export interface SequenceEnrollment {
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

export interface Message {
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

export interface Activity {
  id: string;
  user_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  activity_type: ActivityType;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  category: string;
  subject: string | null;
  body: string;
  variables: string[];
  is_ai_generated: boolean;
  performance_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
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
  counters_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processing_error: string | null;
  created_at: string;
}

// ─── Supabase Database type (for typed client) ──────────────────────────────

export interface Database {
  public: {
    Tables: {
      leads: {
        Row: Lead;
        Insert: Omit<Lead, "id" | "full_name" | "created_at" | "updated_at"> &
          Partial<Pick<Lead, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Lead, "id" | "full_name">>;
        Relationships: [];
      };
      campaigns: {
        Row: Campaign;
        Insert: Omit<Campaign, "id" | "created_at" | "updated_at"> &
          Partial<Pick<Campaign, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Campaign, "id">>;
        Relationships: [];
      };
      sequences: {
        Row: Sequence;
        Insert: Omit<Sequence, "id" | "created_at" | "updated_at"> &
          Partial<Pick<Sequence, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Sequence, "id">>;
        Relationships: [];
      };
      sequence_steps: {
        Row: SequenceStep;
        Insert: Omit<SequenceStep, "id" | "created_at"> &
          Partial<Pick<SequenceStep, "id" | "created_at">>;
        Update: Partial<Omit<SequenceStep, "id">>;
        Relationships: [];
      };
      sequence_enrollments: {
        Row: SequenceEnrollment;
        Insert: Omit<SequenceEnrollment, "id" | "created_at" | "updated_at"> &
          Partial<Pick<SequenceEnrollment, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<SequenceEnrollment, "id">>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, "id" | "created_at"> &
          Partial<Pick<Message, "id" | "created_at">>;
        Update: Partial<Omit<Message, "id">>;
        Relationships: [];
      };
      activities: {
        Row: Activity;
        Insert: Omit<Activity, "id" | "created_at"> &
          Partial<Pick<Activity, "id" | "created_at">>;
        Update: Partial<Omit<Activity, "id">>;
        Relationships: [];
      };
      templates: {
        Row: Template;
        Insert: Omit<Template, "id" | "created_at" | "updated_at"> &
          Partial<Pick<Template, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Template, "id">>;
        Relationships: [];
      };
      settings: {
        Row: Settings;
        Insert: Pick<Settings, "user_id"> &
          Partial<Omit<Settings, "user_id">>;
        Update: Partial<Omit<Settings, "id" | "user_id">>;
        Relationships: [];
      };
      webhook_logs: {
        Row: WebhookLog;
        Insert: Omit<WebhookLog, "id" | "created_at"> &
          Partial<Pick<WebhookLog, "id" | "created_at">>;
        Update: Partial<Omit<WebhookLog, "id">>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      lead_status: LeadStatus;
      campaign_status: CampaignStatus;
      sequence_step_type: SequenceStepType;
      activity_type: ActivityType;
      icp_segment: IcpSegment;
    };
  };
}
