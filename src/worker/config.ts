// Worker configuration (SPEC 11, 13.3). Values, not logic.
export const QUOTAS = { price: 30, confirm: 50, venue: 5, report: 20 } as const;
export type QuotaKind = keyof typeof QUOTAS;

/** Proposed bars waiting for the admin: beyond this, proposals are refused politely (SPEC 7.5). */
export const MAX_PENDING_VENUES = 200;
/** Pending proposals waiting in one geohash cell: one actor cannot fill the whole queue there (ADR 0021). */
export const MAX_PENDING_PER_CELL = 15;
/** A rejected proposal blocks the same name at the same spot for this many days. */
export const REJECTION_TRACE_DAYS = 30;

/** Quarantine: more than ±50 % from the cell median, with at least 5 active prices (SPEC 11). */
export const QUARANTINE_MIN_PRICES = 5;
export const QUARANTINE_RATIO = 0.5;

export const MAX_ITEMS = 80;

/** More than 3 distinct reports move a price to review (SPEC 11). */
export const REVIEW_AFTER_REPORTS = 3;
/** counters and dedup keep only today and yesterday: deleted within 48 h (SPEC 14, ADR 0016). */
export const KEEP_DAYS = 1;
