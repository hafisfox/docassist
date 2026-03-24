import { z } from "zod";

// ─── Enum values (mirroring DB enums) ────────────────────────────────

const leadStatusValues = [
  "new",
  "enriched",
  "invite_sent",
  "invite_accepted",
  "invite_expired",
  "message_sent",
  "replied",
  "interested",
  "not_interested",
  "meeting_booked",
  "converted",
  "do_not_contact",
] as const;

const campaignStatusValues = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

const sequenceStepTypeValues = [
  "connection_request",
  "wait_for_acceptance",
  "message",
  "delay",
  "condition",
] as const;

const icpSegmentValues = [
  "high_volume_chemo",
  "precision_oncology",
  "insurance_heavy_urban",
] as const;

// ─── Lead ────────────────────────────────────────────────────────────

export const createLeadSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  linkedin_public_id: z.string().optional(),
  linkedin_profile_url: z.string().url().optional(),
  headline: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  job_title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  specialty: z.string().optional(),
  experience_years: z.number().int().nonnegative().optional(),
  icp_segment: z.enum(icpSegmentValues).optional(),
  hospital_type: z.string().optional(),
  target_region: z.string().optional(),
  campaign_id: z.string().uuid().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum([
    "new",
    "enriched",
    "invite_sent",
    "invite_accepted",
    "invite_expired",
    "message_sent",
    "replied",
    "interested",
    "not_interested",
    "meeting_booked",
    "converted",
    "do_not_contact",
  ] as const).optional(),
  linkedin_provider_id: z.string().optional(),
  linkedin_member_urn: z.string().optional(),
  linkedin_profile_picture_url: z.string().url().optional(),
  company_linkedin_id: z.string().optional(),
  icp_score: z.number().int().min(0).max(100).optional(),
  skills: z.array(z.string()).optional(),
  unipile_chat_id: z.string().optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const bulkImportLeadsSchema = z.object({
  leads: z.array(createLeadSchema).min(1, "At least one lead is required").max(500, "Maximum 500 leads per import"),
});

export type BulkImportLeadsInput = z.infer<typeof bulkImportLeadsSchema>;

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum([
    "new",
    "enriched",
    "invite_sent",
    "invite_accepted",
    "invite_expired",
    "message_sent",
    "replied",
    "interested",
    "not_interested",
    "meeting_booked",
    "converted",
    "do_not_contact",
  ] as const).optional(),
  campaign_id: z.string().uuid().optional(),
  icp_segment: z.enum(icpSegmentValues).optional(),
  location: z.string().optional(),
  search: z.string().max(200).optional(),
  sort_by: z.enum([
    "created_at",
    "updated_at",
    "first_name",
    "last_name",
    "company",
    "status",
    "icp_score",
    "last_contacted_at",
  ] as const).default("created_at"),
  sort_order: z.enum(["asc", "desc"] as const).default("desc"),
});

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

// ─── Campaign ────────────────────────────────────────────────────────

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  description: z.string().optional(),
  status: z.enum(campaignStatusValues).optional(),
  sequence_id: z.string().uuid().optional(),
  icp_segments: z.array(z.enum(icpSegmentValues)).optional(),
  target_titles: z.array(z.string()).optional(),
  target_locations: z.array(z.string()).optional(),
  target_companies: z.array(z.string()).optional(),
  daily_invite_limit: z.number().int().min(1).max(25).optional(),
  daily_message_limit: z.number().int().min(1).max(150).optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

// ─── Template ────────────────────────────────────────────────────────

const templateCategoryValues = [
  "connection_request",
  "message",
  "follow_up",
] as const;

export const templateCategorySchema = z.enum(templateCategoryValues);

export const createTemplateSchema = z
  .object({
    name: z.string().min(1, "Template name is required").max(100),
    category: z.enum(templateCategoryValues).default("message"),
    subject: z.string().max(200).optional(),
    body: z.string().min(1, "Template body is required"),
    variables: z.array(z.string()).optional(),
    is_ai_generated: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.category === "connection_request" && data.body.length > 300) {
      ctx.addIssue({
        code: "custom",
        message: "Connection request messages must be 300 characters or fewer",
        path: ["body"],
      });
    }
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    name: z.string().min(1, "Template name is required").max(100).optional(),
    category: z.enum(templateCategoryValues).optional(),
    subject: z.string().max(200).optional(),
    body: z.string().min(1, "Template body is required").optional(),
    variables: z.array(z.string()).optional(),
    is_ai_generated: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.category === "connection_request" && data.body && data.body.length > 300) {
      ctx.addIssue({
        code: "custom",
        message: "Connection request messages must be 300 characters or fewer",
        path: ["body"],
      });
    }
  });

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const listTemplatesQuerySchema = z.object({
  category: z.enum(templateCategoryValues).optional(),
  search: z.string().max(200).optional(),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

// ─── Sequence ────────────────────────────────────────────────────────

export const createSequenceSchema = z.object({
  name: z.string().min(1, "Sequence name is required").max(100),
  description: z.string().max(500).optional(),
  is_default: z.boolean().optional(),
});

export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;

export const updateSequenceSchema = z.object({
  name: z.string().min(1, "Sequence name is required").max(100).optional(),
  description: z.string().max(500).optional(),
  is_default: z.boolean().optional(),
  steps: z
    .array(
      z
        .object({
          id: z.string().uuid().optional(),
          step_order: z.number().int().nonnegative(),
          step_type: z.enum(sequenceStepTypeValues),
          template_id: z.string().uuid().nullable().optional(),
          message_body: z.string().nullable().optional(),
          delay_hours: z.number().int().nonnegative().nullable().optional(),
          delay_days: z.number().int().nonnegative().nullable().optional(),
          condition_field: z.string().nullable().optional(),
          condition_value: z.string().nullable().optional(),
          on_true_step: z.number().int().nonnegative().nullable().optional(),
          on_false_step: z.number().int().nonnegative().nullable().optional(),
        })
        .superRefine((data, ctx) => {
          if (
            data.step_type === "delay" &&
            data.delay_hours == null &&
            data.delay_days == null
          ) {
            ctx.addIssue({
              code: "custom",
              message: "Delay steps require delay_hours or delay_days",
              path: ["delay_hours"],
            });
          }
          if (
            data.step_type === "condition" &&
            (data.condition_field == null || data.condition_value == null)
          ) {
            ctx.addIssue({
              code: "custom",
              message: "Condition steps require condition_field and condition_value",
              path: ["condition_field"],
            });
          }
        }),
    )
    .optional(),
});

export type UpdateSequenceInput = z.infer<typeof updateSequenceSchema>;

// ─── Sequence Step ───────────────────────────────────────────────────

export const createSequenceStepSchema = z
  .object({
    sequence_id: z.string().uuid(),
    step_order: z.number().int().nonnegative(),
    step_type: z.enum(sequenceStepTypeValues),
    template_id: z.string().uuid().optional(),
    message_body: z.string().optional(),
    delay_hours: z.number().int().nonnegative().optional(),
    delay_days: z.number().int().nonnegative().optional(),
    condition_field: z.string().optional(),
    condition_value: z.string().optional(),
    on_true_step: z.number().int().nonnegative().optional(),
    on_false_step: z.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.step_type === "delay" &&
      data.delay_hours == null &&
      data.delay_days == null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Delay steps require delay_hours or delay_days",
        path: ["delay_hours"],
      });
    }

    if (
      data.step_type === "condition" &&
      (data.condition_field == null || data.condition_value == null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Condition steps require condition_field and condition_value",
        path: ["condition_field"],
      });
    }
  });

export type CreateSequenceStepInput = z.infer<typeof createSequenceStepSchema>;

// ─── Settings ────────────────────────────────────────────────────────

export const updateSettingsSchema = z.object({
  unipile_account_id: z.string().optional(),
  unipile_account_status: z.string().optional(),
  max_daily_invites: z.number().int().min(1).max(25).optional(),
  max_daily_messages: z.number().int().min(1).max(150).optional(),
  max_daily_profile_views: z.number().int().min(1).max(80).optional(),
  outreach_start_hour: z.number().int().min(0).max(23).optional(),
  outreach_end_hour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().optional(),
  min_delay_seconds: z.number().int().min(10).max(300).optional(),
  max_delay_seconds: z.number().int().min(30).max(600).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// ─── LinkedIn Search Params ──────────────────────────────────────────

export const linkedinSearchSchema = z.object({
  account_id: z.string().min(1, "Account ID is required"),
  api: z.enum(["classic", "sales_navigator"]).optional(),
  keywords: z.string().min(1, "Keywords are required"),
  location: z.string().optional(),
  industry: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  page: z.number().int().min(1).optional(),
});

export type LinkedinSearchInput = z.infer<typeof linkedinSearchSchema>;

/** Schema for the public API route — account_id comes from the server env */
export const linkedinSearchApiInputSchema = z
  .object({
    keywords: z.string().max(200).optional(),
    title: z.string().max(200).optional(),
    location: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    industry: z.string().max(200).optional(),
    api: z.enum(["classic", "sales_navigator"]).optional(),
    page: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (data) => data.keywords || data.title || data.location || data.company,
    { message: "At least one search parameter (keywords, title, location, or company) is required" },
  );

export type LinkedinSearchApiInput = z.infer<typeof linkedinSearchApiInputSchema>;

// ─── Shared enum schemas (for reuse in other validators) ─────────────

export const leadStatusSchema = z.enum(leadStatusValues);
export const campaignStatusSchema = z.enum(campaignStatusValues);
export const sequenceStepTypeSchema = z.enum(sequenceStepTypeValues);
export const icpSegmentSchema = z.enum(icpSegmentValues);
