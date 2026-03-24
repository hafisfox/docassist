import { runActor } from "./client";
import { ApifyError } from "@/lib/errors";
import { withCorrelationId } from "@/lib/logger";

const LINKEDIN_PROFILE_SCRAPER_ACTOR = "anchor/linkedin-profile-scraper";

interface ApifyProfileResult {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  company?: string;
  companyName?: string;
  location?: string;
  profilePicture?: string;
  profilePictureUrl?: string;
  skills?: (string | { name?: string })[];
  education?: {
    schoolName?: string;
    degreeName?: string;
    fieldOfStudy?: string;
    startYear?: number;
    endYear?: number;
  }[];
  experience?: {
    title?: string;
    companyName?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }[];
  [key: string]: unknown;
}

export interface EnrichedProfileData {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  profile_picture_url: string | null;
  skills: string[];
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  raw: Record<string, unknown>;
}

export async function scrapeLinkedInProfile(
  profileUrl: string,
  correlationId?: string,
): Promise<EnrichedProfileData> {
  const log = correlationId
    ? withCorrelationId(correlationId)
    : (await import("@/lib/logger")).logger;

  log.info({ profileUrl }, "starting linkedin profile scrape");

  const results = await runActor<ApifyProfileResult>(
    LINKEDIN_PROFILE_SCRAPER_ACTOR,
    {
      profileUrls: [profileUrl],
      proxyConfiguration: { useApifyProxy: true },
    },
    { correlationId, timeoutSecs: 120 },
  );

  if (!results.length) {
    throw new ApifyError("No profile data returned from scraper", {
      correlationId,
      context: { profileUrl },
    });
  }

  const raw = results[0];
  log.info(
    { profileUrl, hasData: !!raw.fullName || !!raw.firstName },
    "profile scrape complete",
  );

  return parseProfileResult(raw);
}

function parseProfileResult(raw: ApifyProfileResult): EnrichedProfileData {
  const skills: string[] = (raw.skills ?? [])
    .map((s) => (typeof s === "string" ? s : s?.name ?? ""))
    .filter(Boolean);

  const education: Record<string, unknown>[] = (raw.education ?? []).map(
    (edu) => ({
      school_name: edu.schoolName ?? null,
      degree: edu.degreeName ?? null,
      field_of_study: edu.fieldOfStudy ?? null,
      start_year: edu.startYear ?? null,
      end_year: edu.endYear ?? null,
    }),
  );

  const experience: Record<string, unknown>[] = (raw.experience ?? []).map(
    (exp) => ({
      title: exp.title ?? null,
      company: exp.companyName ?? null,
      location: exp.location ?? null,
      start_date: exp.startDate ?? null,
      end_date: exp.endDate ?? null,
      description: exp.description ?? null,
    }),
  );

  return {
    full_name: raw.fullName ?? null,
    first_name: raw.firstName ?? null,
    last_name: raw.lastName ?? null,
    headline: raw.headline ?? null,
    company: raw.company ?? raw.companyName ?? null,
    location: raw.location ?? null,
    profile_picture_url: raw.profilePicture ?? raw.profilePictureUrl ?? null,
    skills,
    education,
    experience,
    raw: raw as Record<string, unknown>,
  };
}
