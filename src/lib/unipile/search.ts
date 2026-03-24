import type { UnipileSearchParams, LinkedinSearchApi } from "./types";

// ─── ICP filter types ───────────────────────────────────────────────────────

export interface IcpSearchFilters {
  titles?: string[];
  locations?: string[];
  companies?: string[];
  industry?: string;
  keywords?: string;
  api?: LinkedinSearchApi;
  page?: number;
}

// ─── ICP title presets ──────────────────────────────────────────────────────

/** Primary ICP titles for medical oncologists */
export const PRIMARY_ICP_TITLES = [
  "Medical Oncologist",
  "Consultant Medical Oncology",
  "Clinical Oncologist",
  "Hemato-Oncologist",
  "DM Medical Oncology",
] as const;

/** Senior / decision-maker titles */
export const SENIOR_ICP_TITLES = [
  "Head of Oncology",
  "Director Oncology",
  "Senior Consultant Oncology",
  "CMO",
] as const;

export const ALL_ICP_TITLES = [
  ...PRIMARY_ICP_TITLES,
  ...SENIOR_ICP_TITLES,
] as const;

// ─── Location presets ───────────────────────────────────────────────────────

export const PHASE_1_INDIA_LOCATIONS = [
  "Mumbai",
  "Delhi NCR",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
] as const;

export const PHASE_1_UAE_LOCATIONS = [
  "Abu Dhabi",
  "Dubai",
] as const;

export const PHASE_2_INDIA_LOCATIONS = [
  "Pune",
  "Ahmedabad",
  "Kochi",
  "Lucknow",
] as const;

export const PHASE_1_LOCATIONS = [
  ...PHASE_1_INDIA_LOCATIONS,
  ...PHASE_1_UAE_LOCATIONS,
] as const;

// ─── Company presets ────────────────────────────────────────────────────────

export const TARGET_HOSPITAL_CHAINS = [
  "Apollo Hospitals",
  "Fortis Healthcare",
  "Manipal Hospitals",
  "Aster DM Healthcare",
] as const;

export const TARGET_CANCER_CENTERS = [
  "HCG Cancer Centre",
  "Tata Memorial Centre",
] as const;

export const TARGET_UAE_HOSPITALS = [
  "Cleveland Clinic Abu Dhabi",
  "Mediclinic",
  "Burjeel Holdings",
  "American Hospital Dubai",
] as const;

export const ALL_TARGET_COMPANIES = [
  ...TARGET_HOSPITAL_CHAINS,
  ...TARGET_CANCER_CENTERS,
  ...TARGET_UAE_HOSPITALS,
] as const;

// ─── Query builders ─────────────────────────────────────────────────────────

/**
 * Builds a single Unipile search params object from ICP filters.
 * If multiple titles are provided, they are joined with OR-style keywords.
 */
export function buildSearchParams(
  accountId: string,
  filters: IcpSearchFilters,
): UnipileSearchParams {
  const parts: string[] = [];

  if (filters.keywords) {
    parts.push(filters.keywords);
  }

  const titleQuery = filters.titles?.length
    ? filters.titles.join(" OR ")
    : undefined;

  const locationQuery = filters.locations?.length
    ? filters.locations.join(", ")
    : undefined;

  const companyQuery = filters.companies?.length
    ? filters.companies.join(" OR ")
    : undefined;

  if (parts.length === 0 && !titleQuery) {
    parts.push("oncologist");
  }

  return {
    account_id: accountId,
    api: filters.api ?? "classic",
    category: "people",
    keywords: parts.length > 0 ? parts.join(" ") : undefined,
    title: titleQuery,
    location: locationQuery,
    company: companyQuery,
    industry: filters.industry,
    page: filters.page,
  };
}

/**
 * Generates multiple search param sets, one per location, for broader coverage.
 * Useful for batching searches across all Phase 1 cities.
 */
export function buildSearchParamsPerLocation(
  accountId: string,
  filters: Omit<IcpSearchFilters, "locations"> & { locations: string[] },
): UnipileSearchParams[] {
  return filters.locations.map((location) =>
    buildSearchParams(accountId, { ...filters, locations: [location] }),
  );
}

/**
 * Builds search params targeting a specific ICP segment preset.
 */
export function buildSegmentSearch(
  accountId: string,
  segment: "primary_oncologists" | "senior_decision_makers" | "all_icp",
  options: {
    locations?: string[];
    companies?: string[];
    api?: LinkedinSearchApi;
    page?: number;
  } = {},
): UnipileSearchParams {
  const titleMap = {
    primary_oncologists: [...PRIMARY_ICP_TITLES],
    senior_decision_makers: [...SENIOR_ICP_TITLES],
    all_icp: [...ALL_ICP_TITLES],
  } as const;

  return buildSearchParams(accountId, {
    titles: [...titleMap[segment]],
    locations: options.locations,
    companies: options.companies,
    api: options.api,
    page: options.page,
  });
}
