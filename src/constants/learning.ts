// Standard allocation is three new cards plus at most two due reviews.
// Keep legacy settings defaults aligned with domain.DefaultDailyMin/MaxCards.
// Offline study reuses only the validated server deck for the same day.

/** Legacy settings default. */
export const DAILY_MIN_CARDS = 3;

/** Legacy settings default and combined daily ceiling. */
export const DAILY_MAX_CARDS = 5;

/** Standard daily allocation: three new cards, up to two due reviews. */
export const DAILY_NEW_CARDS = 3;
export const DAILY_REVIEW_CARDS = 2;
export const REVIEW_INTERVAL_DAYS = 3;
