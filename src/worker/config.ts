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

/** Minimum time between two coverage calculations: protects the D1 read quota (ADR 0022). */
export const COVERAGE_MIN_INTERVAL_MS = 10_000;

/** The coverage figures are kept this long between two admin changes: the page asks often, D1 reads are shared (ADR 0025). */
export const COVERAGE_CACHE_MS = 60_000;

/** Cities that get a page of their own for search engines (/milano, …), by URL slug (ADR 0025). */
export const SEO_CITIES = {
  milano: "Milano",
  roma: "Roma",
  torino: "Torino",
  bologna: "Bologna",
  firenze: "Firenze",
  napoli: "Napoli",
} as const;
export type SeoCitySlug = keyof typeof SEO_CITIES;

/** Limits on what the SEO pages and the open API expose (ADR 0025). */
export const SEO_LIMITS = {
  /** Bars in a sitemap, in the JSON-LD and in the pre-rendered text of one page. */
  sitemapUrls: 5000,
  barsPerPage: 30,
  /** Rows of the open API per page and the highest page. */
  aiPerPage: 100,
  aiMaxPage: 50,
  /** Cell files opened to put names on one page: each is parsed, and a free Worker has ~10 ms of CPU. */
  nameCells: 3,
  /** How long a built page lives in the isolate and at the edge, in seconds. */
  memSeconds: 300,
} as const;

/** Prefix of the development placeholder keys at the top level of wrangler.jsonc: never in a deployed Worker (red-team audit 22/10/2026). */
export const PLACEHOLDER_PREFIX = "local-dev-only";
/** Cloudflare's public always-pass Turnstile secret (local and e2e only): its answers carry no action. */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
