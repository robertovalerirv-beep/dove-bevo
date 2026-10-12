// Worker configuration (SPEC 11, 13.3). Values, not logic.
export const QUOTAS = { price: 30, photo: 10, confirm: 50, venue: 5, report: 20 } as const;
export type QuotaKind = keyof typeof QUOTAS;

/** Quarantine: more than ±50 % from the cell median, with at least 5 active prices (SPEC 11). */
export const QUARANTINE_MIN_PRICES = 5;
export const QUARANTINE_RATIO = 0.5;

export const MAX_ITEMS = 80;
