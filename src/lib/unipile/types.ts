// ─── Unipile API response types ─────────────────────────────────────────────

/** LinkedIn search API variants */
export type LinkedinSearchApi = "classic" | "sales_navigator";

/** Search category */
export type LinkedinSearchCategory = "people" | "company";

// ─── Search ─────────────────────────────────────────────────────────────────

export interface UnipileSearchParams {
  account_id: string;
  api?: LinkedinSearchApi;
  category?: LinkedinSearchCategory;
  keywords?: string;
  location?: string;
  industry?: string;
  title?: string;
  company?: string;
  page?: number;
}

/** Raw item shape returned by the Unipile POST /linkedin/search endpoint */
export interface UnipileRawSearchItem {
  id?: string;
  provider_id?: string;
  public_identifier?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string | null;
  location?: string | null;
  profile_picture_url?: string | null;
  current_company?: string | null;
  current_positions?: Array<{ company_name?: string; title?: string }>;
  network_distance?: string | null;
  connection_degree?: string | null;
  pending_invitation?: boolean;
  type?: string;
}

/** Raw response shape from the Unipile POST /linkedin/search endpoint */
export interface UnipileRawSearchResponse {
  object?: string;
  items?: UnipileRawSearchItem[];
  paging?: {
    start?: number;
    page_count?: number;
    total_count?: number;
  };
  cursor?: string | null;
  /** Flat fields that may exist if Unipile changes format */
  total_count?: number;
  page?: number;
  has_more?: boolean;
}

export interface UnipileSearchResultItem {
  provider_id: string;
  public_identifier: string;
  first_name: string;
  last_name: string;
  headline: string | null;
  location: string | null;
  profile_picture_url: string | null;
  current_company: string | null;
  connection_degree: string | null;
}

export interface UnipileSearchResponse {
  items: UnipileSearchResultItem[];
  total_count: number;
  page: number;
  has_more: boolean;
}

// ─── Profile ────────────────────────────────────────────────────────────────

export interface UnipileProfileExperience {
  title: string;
  company_name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  is_current: boolean;
}

export interface UnipileProfileEducation {
  school_name: string;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface UnipileProfile {
  provider_id: string;
  public_identifier: string;
  first_name: string;
  last_name: string;
  headline: string | null;
  summary: string | null;
  location: string | null;
  profile_picture_url: string | null;
  current_company: string | null;
  current_title: string | null;
  industry: string | null;
  connection_degree: string | null;
  connections_count: number | null;
  experience: UnipileProfileExperience[];
  education: UnipileProfileEducation[];
  skills: string[];
}

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface UnipileSendInvitationParams {
  provider_id: string;
  account_id: string;
  message?: string;
}

export interface UnipileSendInvitationResponse {
  invite_id: string;
  status: string;
}

// ─── Chat / Messaging ───────────────────────────────────────────────────────

export interface UnipileCreateChatParams {
  account_id: string;
  attendees_ids: string[];
  text: string;
}

export interface UnipileSendMessageParams {
  chat_id: string;
  text: string;
}

export interface UnipileChat {
  id: string;
  account_id: string;
  provider: string;
  attendees: UnipileChatAttendee[];
  last_message: UnipileChatMessage | null;
  updated_at: string;
  created_at: string;
}

export interface UnipileChatAttendee {
  provider_id: string;
  display_name: string;
  profile_picture_url: string | null;
}

export interface UnipileChatMessage {
  id: string;
  chat_id: string;
  sender_provider_id: string;
  text: string;
  timestamp: string;
  is_sender: boolean;
  is_event?: boolean;
}

export interface UnipileChatsResponse {
  items: UnipileChat[];
  cursor: string | null;
}

export interface UnipileChatMessagesResponse {
  items: UnipileChatMessage[];
  cursor: string | null;
}

export interface UnipileCreateChatResponse {
  chat_id: string;
  message_id: string;
}

export interface UnipileSendMessageResponse {
  message_id: string;
}

// ─── Rate limit tracking ────────────────────────────────────────────────────

export interface RateLimitCounters {
  invitesSentToday: number;
  messagesSentToday: number;
  countersResetAt: Date;
}
