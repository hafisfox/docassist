// ─── ICP Constants ──────────────────────────────────────────────────────────
// Ideal Customer Profile defaults for LinkedIn outreach. Used by UI components
// for search presets and filter dropdowns.
//
// These are deliberately broad starter defaults, not a fixed taxonomy — edit
// this file to match the ICP you are actually prospecting. Nothing here is
// persisted; the values only seed dropdowns and search-filter presets.

// ─── Titles ─────────────────────────────────────────────────────────────────

/** Senior decision-maker titles. */
export const DECISION_MAKER_TITLES = [
  "Chief Executive Officer",
  "Chief Technology Officer",
  "Chief Operating Officer",
  "Chief Marketing Officer",
  "Founder",
  "Co-Founder",
] as const;

/** Functional leadership titles — line-of-business buyers and champions. */
export const FUNCTIONAL_LEAD_TITLES = [
  "VP of Sales",
  "VP of Engineering",
  "VP of Marketing",
  "Head of Growth",
  "Head of Operations",
  "Director of Product",
] as const;

/** All ICP titles combined. */
export const ICP_TITLES = [
  ...DECISION_MAKER_TITLES,
  ...FUNCTIONAL_LEAD_TITLES,
] as const;

export type IcpTitle = (typeof ICP_TITLES)[number];

// ─── Locations ──────────────────────────────────────────────────────────────

export const NORTH_AMERICA_LOCATIONS = [
  "San Francisco Bay Area",
  "New York",
  "Austin",
  "Toronto",
] as const;

export const EUROPE_LOCATIONS = [
  "London",
  "Berlin",
  "Amsterdam",
  "Paris",
] as const;

export const APAC_LOCATIONS = [
  "Singapore",
  "Sydney",
  "Bengaluru",
  "Dubai",
] as const;

/** All target locations across regions. */
export const TARGET_LOCATIONS = [
  ...NORTH_AMERICA_LOCATIONS,
  ...EUROPE_LOCATIONS,
  ...APAC_LOCATIONS,
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
  decision_makers: {
    label: "Decision Makers — All Regions",
    titles: DECISION_MAKER_TITLES,
    locations: TARGET_LOCATIONS,
  },
  functional_leads: {
    label: "Functional Leads — All Regions",
    titles: FUNCTIONAL_LEAD_TITLES,
    locations: TARGET_LOCATIONS,
  },
  all_titles: {
    label: "All ICP Titles",
    titles: ICP_TITLES,
    locations: TARGET_LOCATIONS,
  },
  north_america: {
    label: "North America",
    titles: ICP_TITLES,
    locations: NORTH_AMERICA_LOCATIONS,
  },
  europe: {
    label: "Europe",
    titles: ICP_TITLES,
    locations: EUROPE_LOCATIONS,
  },
  apac: {
    label: "APAC & Middle East",
    titles: ICP_TITLES,
    locations: APAC_LOCATIONS,
  },
} as const;
