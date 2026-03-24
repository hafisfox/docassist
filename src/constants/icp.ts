// ─── ICP Constants ──────────────────────────────────────────────────────────
// Ideal Customer Profile definitions for DoctorAssist.AI LinkedIn outreach.
// Used by UI components for search presets and filter dropdowns.

// ─── Titles ─────────────────────────────────────────────────────────────────

/** Primary ICP titles — medical oncologists */
export const ICP_TITLES = [
  "Medical Oncologist",
  "Consultant Medical Oncology",
  "Clinical Oncologist",
  "Hemato-Oncologist",
  "DM Medical Oncology",
  "Head of Oncology",
  "Director Oncology",
  "Senior Consultant Oncology",
  "CMO",
] as const;

export type IcpTitle = (typeof ICP_TITLES)[number];

// ─── Hospitals ──────────────────────────────────────────────────────────────

/** Corporate hospital chains (India) */
export const TARGET_HOSPITAL_CHAINS = [
  "Apollo Hospitals",
  "Fortis Healthcare",
  "Manipal Hospitals",
  "Aster DM Healthcare",
] as const;

/** Dedicated cancer centers */
export const TARGET_CANCER_CENTERS = [
  "HCG Cancer Centre",
  "Tata Memorial Centre",
] as const;

/** UAE hospital targets */
export const TARGET_UAE_HOSPITALS = [
  "Cleveland Clinic Abu Dhabi",
  "Mediclinic",
  "Burjeel Holdings",
  "American Hospital Dubai",
] as const;

/** All target hospitals combined */
export const TARGET_HOSPITALS = [
  ...TARGET_HOSPITAL_CHAINS,
  ...TARGET_CANCER_CENTERS,
  ...TARGET_UAE_HOSPITALS,
] as const;

export type TargetHospital = (typeof TARGET_HOSPITALS)[number];

// ─── Locations ──────────────────────────────────────────────────────────────

/** Phase 1 India cities */
export const PHASE_1_INDIA_LOCATIONS = [
  "Mumbai",
  "Delhi NCR",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
] as const;

/** Phase 1 UAE cities */
export const PHASE_1_UAE_LOCATIONS = [
  "Abu Dhabi",
  "Dubai",
] as const;

/** Phase 2 India cities */
export const PHASE_2_INDIA_LOCATIONS = [
  "Pune",
  "Ahmedabad",
  "Kochi",
  "Lucknow",
] as const;

/** All target locations across phases */
export const TARGET_LOCATIONS = [
  ...PHASE_1_INDIA_LOCATIONS,
  ...PHASE_1_UAE_LOCATIONS,
  ...PHASE_2_INDIA_LOCATIONS,
] as const;

export type TargetLocation = (typeof TARGET_LOCATIONS)[number];

// ─── Search filter presets ──────────────────────────────────────────────────

export interface LinkedInSearchFilterPreset {
  label: string;
  keywords?: string;
  titles: readonly string[];
  locations: readonly string[];
  companies?: readonly string[];
}

/** Pre-built search filter configurations for common outreach scenarios */
export const LINKEDIN_SEARCH_FILTERS: Record<string, LinkedInSearchFilterPreset> = {
  phase1_primary: {
    label: "Phase 1 — Primary Oncologists (India + UAE)",
    titles: ICP_TITLES.slice(0, 5), // Primary titles only
    locations: [...PHASE_1_INDIA_LOCATIONS, ...PHASE_1_UAE_LOCATIONS],
  },
  phase1_senior: {
    label: "Phase 1 — Senior Decision Makers",
    titles: ICP_TITLES.slice(5), // Senior titles only
    locations: [...PHASE_1_INDIA_LOCATIONS, ...PHASE_1_UAE_LOCATIONS],
  },
  phase1_all: {
    label: "Phase 1 — All ICP Titles",
    titles: ICP_TITLES,
    locations: [...PHASE_1_INDIA_LOCATIONS, ...PHASE_1_UAE_LOCATIONS],
  },
  phase2_india: {
    label: "Phase 2 — India Expansion",
    titles: ICP_TITLES,
    locations: [...PHASE_2_INDIA_LOCATIONS],
  },
  corporate_chains: {
    label: "Corporate Hospital Chains",
    titles: ICP_TITLES,
    locations: TARGET_LOCATIONS,
    companies: TARGET_HOSPITAL_CHAINS,
  },
  cancer_centers: {
    label: "Dedicated Cancer Centers",
    titles: ICP_TITLES,
    locations: TARGET_LOCATIONS,
    companies: TARGET_CANCER_CENTERS,
  },
  uae_hospitals: {
    label: "UAE Hospital Targets",
    titles: ICP_TITLES,
    locations: [...PHASE_1_UAE_LOCATIONS],
    companies: TARGET_UAE_HOSPITALS,
  },
} as const;
