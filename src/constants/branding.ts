// ─── Branding ───────────────────────────────────────────────────────────────
// Single source of truth for product identity. Everything user-visible reads
// from here so a rebrand is an env change, not a code change.
//
// These must be NEXT_PUBLIC_* — the sidebar, mobile nav and login card are
// client components and can only read inlined public env vars.

/** Full product name — page titles, login card, sidebar when expanded. */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME ?? "LinkedIn Outreach Engine";

/** Compact name for tight chrome (collapsed sidebar, mobile header). */
export const APP_SHORT_NAME =
  process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? "Outreach Engine";

/** Meta description / tagline. */
export const APP_DESCRIPTION =
  "LinkedIn outreach automation — leads, sequences, inbox, and analytics";

/** Where the "Contact support" affordance on error states points. */
export const APP_SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_URL ?? "https://example.com/support";

/**
 * Meeting-booking link inserted by the inbox "Book Meeting" quick reply.
 * Empty by default — the button stays disabled until a real link is set, so we
 * never paste a dead URL into a prospect's DM.
 */
export const APP_BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? "";
