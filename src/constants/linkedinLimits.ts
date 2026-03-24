// LinkedIn outreach rate limits (safety margins below LinkedIn's actual caps)
// LinkedIn caps: ~100 invites/week, ~150 messages/day, ~80 profile views/day
// We apply conservative daily limits to preserve account health.

export const MAX_DAILY_INVITES = 25;
export const MAX_DAILY_MESSAGES = 50;
export const MAX_DAILY_PROFILE_VIEWS = 80;

export const MIN_DELAY_SECONDS = 30;
export const MAX_DELAY_SECONDS = 120;

// LinkedIn's actual weekly cap — enforced as a hard ceiling in the Unipile layer
export const MAX_WEEKLY_INVITES = 100;
