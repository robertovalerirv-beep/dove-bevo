// The only module that talks to D1 (CLAUDE.md).
import { isValidWeek, type WeekHours } from "../../shared/hours";
import type { MetricRow } from "../../shared/metrics";
import type {
  CellPrices,
  HistoryRow,
  PendingVenue,
  PriceRow,
  UserVenue,
  VenueKind,
  VenuePrices,
} from "../../shared/api-types";

interface PriceDbRow {
  venue_key: string;
  drink: string;
  hh: 0 | 1;
  price_cents: number;
  observed_on: string;
  confirmations: number;
  status: "active" | "quarantined";
}

interface VenueDbRow {
  id: number;
  name: string;
  kind: VenueKind;
  lat: number;
  lon: number;
  status: "approved" | "pending";
  confirmations: number;
}

const toPriceRow = (r: PriceDbRow): PriceRow => [
  r.venue_key,
  r.drink,
  r.hh,
  r.price_cents,
  r.observed_on,
  r.confirmations,
  r.status === "quarantined" ? 1 : 0,
];

/**
 * Prices, user venues, hidden OSM keys and verified bars of a cell (SPEC 5.4, 9.2, D-34): indexed
 * reads, one round trip.
 */
export async function getCellPrices(db: D1Database, cell: string): Promise<CellPrices> {
  const [prices, venues, hidden, verified] = await db.batch([
    db
      .prepare(
        `SELECT venue_key, drink, hh, price_cents, observed_on, confirmations, status
         FROM prices_current WHERE cell = ?1 AND status IN ('active', 'quarantined')
         ORDER BY venue_key, drink, hh`,
      )
      .bind(cell),
    db
      .prepare(
        `SELECT id, name, kind, lat, lon, status, confirmations
         FROM venues_user WHERE cell = ?1 AND status IN ('approved', 'pending') ORDER BY id`,
      )
      .bind(cell),
    db.prepare("SELECT venue_key FROM venues_hidden WHERE cell = ?1").bind(cell),
    db.prepare("SELECT venue_key FROM venues_verified WHERE cell = ?1").bind(cell),
  ]);
  const rows = (venues?.results ?? []) as unknown as VenueDbRow[];
  const u = rows
    .filter((r) => r.status === "approved")
    .map((r): UserVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon]);
  const h = ((hidden?.results ?? []) as unknown as { venue_key: string }[]).map((r) => r.venue_key);
  const approved = new Set(u.map((v) => v[0]));
  const hiddenKeys = new Set(h);
  const p = ((prices?.results ?? []) as unknown as PriceDbRow[])
    .filter((r) => isPublicBar(r.venue_key, approved, hiddenKeys))
    .map(toPriceRow);
  const pend = rows
    .filter((r) => r.status === "pending")
    .map((r): PendingVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon, r.confirmations]);
  // A verified bar shows as such only while it is public (ADR 0033): hidden or not approved, never.
  const g = ((verified?.results ?? []) as unknown as { venue_key: string }[])
    .map((r) => r.venue_key)
    .filter((key) => isPublicBar(key, approved, hiddenKeys));
  return { p, u, pend, h, g };
}

/** How long a snapshot may stand if a change forgot to empty it (ADR 0020). */
export const SNAPSHOT_TTL_MS = 5 * 60_000;
export const SNAPSHOT_SQL = "SELECT v, at, body FROM cell_snapshot WHERE cell = ?1";

/**
 * The answer of a cell as JSON text (M3-20, ADR 0020): one primary-key row when the snapshot is there,
 * otherwise computed from the tables and stored for the next reader. The body is stored only if no
 * writer bumped `v` since it was read, so a slow reader never puts an old answer back. A cell with
 * nothing in it is not stored: reading it already costs next to nothing.
 */
export async function getCellSnapshot(db: D1Database, cell: string): Promise<string> {
  const row = await db
    .prepare(SNAPSHOT_SQL)
    .bind(cell)
    .first<{ v: number; at: number; body: string | null }>();
  if (row?.body && Date.now() - row.at < SNAPSHOT_TTL_MS) return row.body;
  const answer = await getCellPrices(db, cell);
  const body = JSON.stringify(answer);
  if (
    answer.p.length +
      answer.u.length +
      answer.pend.length +
      answer.h.length +
      (answer.g?.length ?? 0) >
    0
  )
    await db
      .prepare(
        `INSERT INTO cell_snapshot (cell, v, at, body) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (cell) DO UPDATE SET at = excluded.at, body = excluded.body
         WHERE cell_snapshot.v = ?2`,
      )
      .bind(cell, row?.v ?? 0, Date.now(), body)
      .run();
  return body;
}

/** A change in a cell: bump its version and empty the snapshot (one row written). */
export async function invalidateCellSnapshot(db: D1Database, cell: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cell_snapshot (cell, v, at, body) VALUES (?1, 1, 0, NULL)
       ON CONFLICT (cell) DO UPDATE SET v = v + 1, at = 0, body = NULL`,
    )
    .bind(cell)
    .run();
}

/** Every approved user bar (index vu_status), for the name search; the admin keeps the list short. */
export async function listApprovedVenues(db: D1Database): Promise<UserVenue[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, kind, lat, lon FROM venues_user WHERE status = 'approved' ORDER BY id LIMIT 2000",
    )
    .all<Omit<VenueDbRow, "status" | "confirmations">>();
  return results.map((r): UserVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon]);
}

/**
 * The one definition of a public bar (SPEC 7.5, ADR 0017, 0019, 0022): an OSM bar the admin did not
 * hide, or a user bar the admin approved. The map and the coverage dashboard both use it.
 */
export function isPublicBar(
  key: string,
  approvedUserKeys: ReadonlySet<string>,
  hiddenKeys: ReadonlySet<string>,
): boolean {
  return key.startsWith("u") ? approvedUserKeys.has(key) : !hiddenKeys.has(key);
}

/**
 * One row per bar with an active price. Grouping on the primary key's first column keeps the scan in
 * key order, so SQLite builds no temporary B-tree and reads each row once (ADR 0022). The one MAX()
 * makes the bare `city` and `cell` come from the bar's latest price (SQLite rule), so after an
 * import that moved the bar to another place the newest attribution wins, not an arbitrary one.
 */
export const COVERAGE_SQL = `SELECT city, cell, venue_key, COUNT(*) AS n, MAX(observed_on) AS d
  FROM prices_current WHERE status = 'active' GROUP BY venue_key`;

export interface CoverageRows {
  rows: { city: number | null; cell: string; venue_key: string; n: number; d: string }[];
  hidden: Set<string>;
  /** Approved user bars by key ("u12"), with the position the admin or the proposer placed. */
  users: Map<string, { lat: number; lon: number }>;
}

/** The three reads behind the coverage dashboard, in one round trip (ADR 0022). */
export async function getCoverageRows(db: D1Database): Promise<CoverageRows> {
  const [rows, hiddenRows, userRows] = await db.batch([
    db.prepare(COVERAGE_SQL),
    db.prepare("SELECT venue_key FROM venues_hidden"),
    db.prepare("SELECT id, lat, lon FROM venues_user WHERE status = 'approved'"),
  ]);
  return {
    rows: (rows?.results ?? []) as unknown as CoverageRows["rows"],
    hidden: new Set(
      ((hiddenRows?.results ?? []) as unknown as { venue_key: string }[]).map((r) => r.venue_key),
    ),
    users: new Map(
      ((userRows?.results ?? []) as unknown as { id: number; lat: number; lon: number }[]).map(
        (r) => [`u${String(r.id)}`, { lat: r.lat, lon: r.lon }],
      ),
    ),
  };
}

/** The bar of `?1` is public: an OSM bar the admin did not hide, or a user bar the admin approved (ADR 0017, 0019). */
const BAR_IS_PUBLIC = `(NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key = ?1)
  AND (?1 NOT LIKE 'u%' OR EXISTS (SELECT 1 FROM venues_user
    WHERE id = CAST(substr(?1, 2) AS INTEGER) AND status = 'approved')))`;

/** Current prices of a bar, its latest 10 observations per drink (D-26) and its hours if verified (D-34). */
export async function getVenuePrices(db: D1Database, key: string): Promise<VenuePrices> {
  const [current, history, verified] = await db.batch([
    db
      .prepare(
        `SELECT venue_key, drink, hh, price_cents, observed_on, confirmations, status
         FROM prices_current WHERE venue_key = ?1 AND status IN ('active', 'quarantined')
           AND ${BAR_IS_PUBLIC}
         ORDER BY drink, hh`,
      )
      .bind(key),
    db
      .prepare(
        `SELECT drink, hh, price_cents, observed_on FROM (
           SELECT drink, hh, price_cents, observed_on, id,
             ROW_NUMBER() OVER (PARTITION BY drink ORDER BY observed_on DESC, id DESC) AS n
           FROM price_obs WHERE venue_key = ?1 AND status NOT IN ('review', 'removed')
             AND ${BAR_IS_PUBLIC}
             -- a price under review leaves the bar page, its history included (SPEC 11)
             AND NOT EXISTS (SELECT 1 FROM prices_current pc WHERE pc.venue_key = price_obs.venue_key
               AND pc.drink = price_obs.drink AND pc.hh = price_obs.hh
               AND pc.price_cents = price_obs.price_cents AND pc.status IN ('review', 'removed')))
         WHERE n <= 10 ORDER BY drink, observed_on DESC, id DESC`,
      )
      .bind(key),
    db
      .prepare(`SELECT hours FROM venues_verified WHERE venue_key = ?1 AND ${BAR_IS_PUBLIC}`)
      .bind(key),
  ]);
  const h = (
    (history?.results ?? []) as unknown as {
      drink: string;
      hh: 0 | 1;
      price_cents: number;
      observed_on: string;
    }[]
  ).map((r): HistoryRow => [r.drink, r.hh, r.price_cents, r.observed_on]);
  const p = ((current?.results ?? []) as unknown as PriceDbRow[]).map(toPriceRow);
  const stored = (verified?.results[0] as { hours: string } | undefined)?.hours;
  const o = stored === undefined ? undefined : parseHours(stored);
  return o ? { p, h, o } : { p, h };
}

/** Hours as stored by the admin route; anything else (a hand edit gone wrong) is not shown. */
function parseHours(text: string): WeekHours | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isValidWeek(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

// ---- Writes (M2) ----

export interface PriceKey {
  venue: string;
  drink: string;
  hh: 0 | 1;
}

export interface CurrentPrice {
  cell: string;
  price_cents: number;
  observed_on: string;
  status: "active" | "quarantined" | "review" | "removed";
  confirmations: number;
}

const PK = "venue_key = ?1 AND drink = ?2 AND hh = ?3";
const pk = (k: PriceKey) => [k.venue, k.drink, k.hh] as const;

export function getCurrentPrice(db: D1Database, k: PriceKey): Promise<CurrentPrice | null> {
  return db
    .prepare(
      `SELECT cell, price_cents, observed_on, status, confirmations FROM prices_current WHERE ${PK}`,
    )
    .bind(...pk(k))
    .first<CurrentPrice>();
}

/** Active prices of the same drink and band in a cell (median for the quarantine). */
export async function activePrices(db: D1Database, cell: string, drink: string, hh: number) {
  const { results } = await db
    .prepare(
      // Prices of proposed bars the admin has not approved never move the median (ADR 0019).
      `SELECT price_cents FROM prices_current WHERE cell = ?1 AND drink = ?2 AND hh = ?3
         AND status = 'active' AND (venue_key NOT LIKE 'u%'
           OR CAST(substr(venue_key, 2) AS INTEGER) IN (SELECT id FROM venues_user WHERE status = 'approved'))`,
    )
    .bind(cell, drink, hh)
    .all<{ price_cents: number }>();
  return results.map((r) => r.price_cents);
}

export interface NewPrice {
  cell: string;
  city: number | null;
  price: number;
  day: string;
  status: "active" | "quarantined";
}

/** History row + current price (SPEC 8); a different price resets confirmations. Run in one batch. */
export function writePriceStatements(
  db: D1Database,
  k: PriceKey,
  p: NewPrice,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        "INSERT INTO price_obs (venue_key, drink, hh, price_cents, observed_on, source, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      )
      .bind(...pk(k), p.price, p.day, "manual", p.status),
    db
      .prepare(
        `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)
         ON CONFLICT (venue_key, drink, hh) DO UPDATE SET cell = excluded.cell, city = excluded.city,
           price_cents = excluded.price_cents, observed_on = excluded.observed_on, confirmations = 0,
           status = excluded.status, source = excluded.source
         WHERE prices_current.status NOT IN ('review', 'removed')`,
      )
      .bind(...pk(k), p.cell, p.city, p.price, p.day, p.status, "manual"),
  ];
}

/**
 * +1 confirmation (a quarantined price becomes active, D-10), counted only if none of the `blockers`
 * (author, IP and session markers) is in dedup yet; then the `claims` are stored. Two statements for
 * one batch: D1 runs a batch as one transaction, so the check and the claim cannot be split by another
 * request. The UPDATE returns the new count when it counted, no row otherwise.
 */
export function confirmStatements(
  db: D1Database,
  k: PriceKey,
  day: string,
  blockers: string[],
  claims: string[],
): D1PreparedStatement[] {
  const marks = blockers.map((_, i) => `?${String(i + 5)}`).join(", ");
  return [
    db
      .prepare(
        `UPDATE prices_current SET confirmations = confirmations + 1, observed_on = max(observed_on, ?4),
           status = CASE WHEN status = 'quarantined' THEN 'active' ELSE status END
         WHERE ${PK} AND status IN ('active', 'quarantined')
           AND NOT EXISTS (SELECT 1 FROM dedup WHERE k IN (${marks})) RETURNING confirmations`,
      )
      .bind(...pk(k), day, ...blockers),
    ...claims.map((key) => claimStatement(db, key, day)),
  ];
}

/** What a contribution needs to decide, read in one round trip (SPEC 11). */
export interface PriceContext {
  /** The bar's own rows, by `drink|hh`. */
  own: Map<string, { price: number; status: CurrentPrice["status"]; cell: string }>;
  /** Active prices of the same cell from other public bars, by `drink|hh` (the median's peers). */
  peers: Map<string, number[]>;
}

export const bandId = (drink: string, hh: number) => `${drink}|${String(hh)}`;

/**
 * The bar's current rows and the cell's peer prices for the given drinks, in one batch (index
 * pc_cell reads only those drinks). Prices of proposed bars the admin has not approved never move
 * the median (ADR 0019).
 */
export async function loadPriceContext(
  db: D1Database,
  venue: string,
  cell: string,
  drinks: string[],
): Promise<PriceContext> {
  const marks = drinks.map((_, i) => `?${String(i + 3)}`).join(", ");
  const [own, peers] = await db.batch([
    db
      .prepare(
        "SELECT drink, hh, price_cents, status, cell FROM prices_current WHERE venue_key = ?1",
      )
      .bind(venue),
    db
      .prepare(
        `SELECT drink, hh, price_cents FROM prices_current
         WHERE cell = ?2 AND status = 'active' AND venue_key != ?1 AND drink IN (${marks})
           AND (venue_key NOT LIKE 'u%'
             OR CAST(substr(venue_key, 2) AS INTEGER) IN (SELECT id FROM venues_user WHERE status = 'approved'))`,
      )
      .bind(venue, cell, ...drinks),
  ]);
  const ownRows = (own?.results ?? []) as unknown as {
    drink: string;
    hh: number;
    price_cents: number;
    status: CurrentPrice["status"];
    cell: string;
  }[];
  const peerRows = (peers?.results ?? []) as unknown as {
    drink: string;
    hh: number;
    price_cents: number;
  }[];
  const peerMap = new Map<string, number[]>();
  for (const r of peerRows) {
    const id = bandId(r.drink, r.hh);
    peerMap.set(id, [...(peerMap.get(id) ?? []), r.price_cents]);
  }
  return {
    own: new Map(
      ownRows.map((r) => [
        bandId(r.drink, r.hh),
        { price: r.price_cents, status: r.status, cell: r.cell },
      ]),
    ),
    peers: peerMap,
  };
}

/** D1 batches in slices of 100 statements, in order; results come back flattened in the same order. */
export async function runStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result[]> {
  const out: D1Result[] = [];
  for (let i = 0; i < statements.length; i += 100)
    out.push(...(await db.batch(statements.slice(i, i + 100))));
  return out;
}

/** One-time keys (confirmations, reports, tokens). True when the key is new. */
export async function claimOnce(db: D1Database, key: string, day: string): Promise<boolean> {
  const result = await db
    .prepare("INSERT OR IGNORE INTO dedup (k, day) VALUES (?1, ?2)")
    .bind(key, day)
    .run();
  return result.meta.changes === 1;
}

/** The statement behind `claimOnce`, for a batch. */
export const claimStatement = (db: D1Database, key: string, day: string): D1PreparedStatement =>
  db.prepare("INSERT OR IGNORE INTO dedup (k, day) VALUES (?1, ?2)").bind(key, day);

/** Atomically adds `amount` to a daily counter if it stays within `limit`. */
export async function addToCounter(
  db: D1Database,
  key: string,
  day: string,
  amount: number,
  limit: number,
): Promise<boolean> {
  if (amount > limit) return false;
  const row = await db
    .prepare(
      `INSERT INTO counters (k, day, n) VALUES (?1, ?2, ?3)
       ON CONFLICT (k, day) DO UPDATE SET n = n + ?3 WHERE n + ?3 <= ?4 RETURNING n`,
    )
    .bind(key, day, amount, limit)
    .first<{ n: number }>();
  return row !== null;
}

export interface MobileRecommendationRow {
  drink: string;
  count: number;
  recommended: number;
}

/** One indexed venue scan; the supplied pair-scoped claims disclose no installation identity. */
function mobileRecommendationSnapshot(
  db: D1Database,
  venue: string,
  claims: readonly string[],
): D1PreparedStatement {
  const slots = claims.map((_, i) => `?${String(i + 2)}`).join(", ") || "NULL";
  return db
    .prepare(
      `SELECT drink, COUNT(*) AS count, MAX(CASE WHEN claim IN (${slots}) THEN 1 ELSE 0 END) AS recommended
     FROM mobile_recommendations WHERE venue_key = ?1 GROUP BY drink`,
    )
    .bind(venue, ...claims);
}

export async function getMobileRecommendations(
  db: D1Database,
  venue: string,
  claims: readonly string[],
): Promise<MobileRecommendationRow[]> {
  const { results } = await mobileRecommendationSnapshot(
    db,
    venue,
    claims,
  ).all<MobileRecommendationRow>();
  return results;
}

/** D1 batches are transactions: set/undo and the returned full snapshot share one commit. */
export async function setMobileRecommendation(
  db: D1Database,
  venue: string,
  drink: string,
  claim: string,
  recommended: boolean,
  claims: readonly string[],
): Promise<MobileRecommendationRow[]> {
  const mutation = db
    .prepare(
      recommended
        ? "INSERT OR IGNORE INTO mobile_recommendations (venue_key, drink, claim) VALUES (?1, ?2, ?3)"
        : "DELETE FROM mobile_recommendations WHERE venue_key = ?1 AND drink = ?2 AND claim = ?3",
    )
    .bind(venue, drink, claim);
  const [, snapshot] = await db.batch<MobileRecommendationRow>([
    mutation,
    mobileRecommendationSnapshot(db, venue, claims),
  ]);
  if (!snapshot) throw new Error("Missing recommendation snapshot");
  return snapshot.results;
}

/** Every user bar of a cell, for the duplicate check (index vu_cell). */
export async function venuesInCell(db: D1Database, cell: string) {
  const { results } = await db
    .prepare("SELECT id, name, lat, lon, status, day FROM venues_user WHERE cell = ?1")
    .bind(cell)
    .all<{
      id: number;
      name: string;
      lat: number;
      lon: number;
      status: "pending" | "approved" | "removed";
      day: string | null;
    }>();
  return results;
}

/**
 * Stores a proposal as pending, unless 200 are already waiting overall or `maxPerCell` in its cell
 * (one atomic statement, indexes vu_status and vu_cell). Returns the new id, or null when full. `confirmations` counts independent proposers.
 */
export async function proposeVenue(
  db: D1Database,
  v: { name: string; kind: number; lat: number; lon: number; cell: string; day: string },
  maxPending: number,
  maxPerCell: number,
): Promise<number | null> {
  const row = await db
    .prepare(
      `INSERT INTO venues_user (name, kind, lat, lon, cell, status, confirmations, day)
       SELECT ?1, ?2, ?3, ?4, ?5, 'pending', 1, ?6
       WHERE (SELECT COUNT(*) FROM venues_user WHERE status = 'pending') < ?7
         AND (SELECT COUNT(*) FROM venues_user WHERE cell = ?5 AND status = 'pending') < ?8 RETURNING id`,
    )
    .bind(v.name, v.kind, v.lat, v.lon, v.cell, v.day, maxPending, maxPerCell)
    .first<{ id: number }>();
  return row?.id ?? null;
}

/** Another independent person proposed the same pending bar: only orders the admin's queue. */
export async function bumpProposal(db: D1Database, id: number): Promise<void> {
  await db
    .prepare(
      "UPDATE venues_user SET confirmations = confirmations + 1 WHERE id = ?1 AND status = 'pending'",
    )
    .bind(id)
    .run();
}

export function getUserVenue(db: D1Database, id: number) {
  return db
    .prepare(
      "SELECT cell, status, name FROM venues_user WHERE id = ?1 AND status IN ('pending', 'approved')",
    )
    .bind(id)
    .first<{ cell: string; status: "pending" | "approved"; name: string }>();
}

// ---- Reports and cleanup (M2) ----

export interface ReportTarget {
  venue: string;
  /** Cell of the bar, kept so the admin can hide it (migration 0003). */
  cell: string;
  drink: string | null;
  hh: 0 | 1 | null;
}

/** Stores a report and returns how many reports the target has since `since` (the current price's day). */
export async function addReport(
  db: D1Database,
  t: ReportTarget,
  reason: string,
  day: string,
  since: string | null,
): Promise<number> {
  const [, count] = await db.batch<{ n: number }>([
    db
      .prepare(
        "INSERT INTO reports (venue_key, drink, hh, reason, day, cell) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .bind(t.venue, t.drink, t.hh, reason, day, t.cell),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM reports WHERE venue_key = ?1 AND drink IS ?2 AND hh IS ?3 AND (?4 IS NULL OR day >= ?4)",
      )
      .bind(t.venue, t.drink, t.hh, since),
  ]);
  return count?.results[0]?.n ?? 0;
}

/** Moves an active or quarantined price to review: off the map and the bar page (SPEC 11). */
export async function sendToReview(db: D1Database, k: PriceKey): Promise<void> {
  await db
    .prepare(
      `UPDATE prices_current SET status = 'review' WHERE ${PK} AND status IN ('active', 'quarantined')`,
    )
    .bind(...pk(k))
    .run();
}

/** Adds anonymous event counts to today's row of each (event, prop): no identifier is stored (SPEC 12). */
export async function addMetrics(
  db: D1Database,
  day: string,
  rows: { event: string; prop: string; n: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.batch(
    rows.map((r) =>
      db
        .prepare(
          `INSERT INTO metrics_daily (day, event, prop, n) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (day, event, prop) DO UPDATE SET n = n + ?4`,
        )
        .bind(day, r.event, r.prop, r.n),
    ),
  );
}

/** Rows of metrics_daily from `since` (inclusive) on: one range of the primary key. */
export async function listMetrics(db: D1Database, since: string): Promise<MetricRow[]> {
  const { results } = await db
    .prepare("SELECT day, event, prop, n FROM metrics_daily WHERE day >= ?1 ORDER BY day DESC")
    .bind(since)
    .all<MetricRow>();
  return results;
}

/** Nightly cleanup of the day-salted keys (SPEC 8, 14): only the last days survive. */
export async function purgeOldKeys(db: D1Database, before: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM counters WHERE day < ?1").bind(before),
    db.prepare("DELETE FROM dedup WHERE day < ?1").bind(before),
  ]);
}

/** Day of the latest observation of a price key: when its value last changed (same price = confirmation). */
export async function lastPriceChange(db: D1Database, k: PriceKey): Promise<string | null> {
  const row = await db
    .prepare(`SELECT max(observed_on) AS day FROM price_obs WHERE ${PK}`)
    .bind(...pk(k))
    .first<{ day: string | null }>();
  return row?.day ?? null;
}

// ---- Admin (D-19): hidden OSM entries, user bars, price review ----

export function isHidden(db: D1Database, key: string): Promise<boolean> {
  return db
    .prepare("SELECT 1 FROM venues_hidden WHERE venue_key = ?1")
    .bind(key)
    .first()
    .then((row) => row !== null);
}

export async function hideVenue(
  db: D1Database,
  v: { key: string; cell: string; name: string; day: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT OR REPLACE INTO venues_hidden (venue_key, cell, name, day) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(v.key, v.cell, v.name, v.day)
    .run();
}

export async function unhideVenue(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("DELETE FROM venues_hidden WHERE venue_key = ?1 RETURNING cell")
    .bind(key)
    .first<{ cell: string }>();
  return row?.cell ?? null;
}

export async function listHidden(db: D1Database) {
  const { results } = await db
    .prepare("SELECT venue_key, cell, name, day FROM venues_hidden ORDER BY day DESC LIMIT 200")
    .all<{ venue_key: string; cell: string; name: string; day: string }>();
  return results;
}

export async function listUserVenues(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT id, name, kind, lat, lon, cell, status, confirmations, day,
         (SELECT COUNT(*) FROM prices_current p WHERE p.venue_key = 'u' || venues_user.id) AS prices
       FROM venues_user WHERE status IN ('pending', 'approved')
       ORDER BY status DESC, confirmations DESC, id DESC LIMIT 200`,
    )
    .all<{
      day: string | null;
      prices: number;
      id: number;
      name: string;
      kind: number;
      lat: number;
      lon: number;
      cell: string;
      status: "pending" | "approved";
      confirmations: number;
    }>();
  return results;
}

export async function addApprovedVenue(
  db: D1Database,
  v: { name: string; kind: number; lat: number; lon: number; cell: string },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO venues_user (name, kind, lat, lon, cell, status) VALUES (?1, ?2, ?3, ?4, ?5, 'approved')
       RETURNING id`,
    )
    .bind(v.name, v.kind, v.lat, v.lon, v.cell)
    .first<{ id: number }>();
  if (!row) throw new Error("insert");
  return row.id;
}

/** Admin decision on a user bar; a rejection stamps the day, which starts its 30-day trace. */
export async function setUserVenueStatus(
  db: D1Database,
  id: number,
  status: "approved" | "removed",
  day: string,
  edit: { name?: string; kind?: number } = {},
): Promise<string | null> {
  const row = await db
    .prepare(
      `UPDATE venues_user SET status = ?2, name = COALESCE(?3, name), kind = COALESCE(?4, kind),
         day = ?5 WHERE id = ?1 AND status != 'removed' RETURNING cell`,
    )
    .bind(id, status, edit.name ?? null, edit.kind ?? null, day)
    .first<{ cell: string }>();
  return row?.cell ?? null;
}

export async function listPricesToReview(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT venue_key, drink, hh, cell, price_cents, observed_on, confirmations, status
       FROM prices_current WHERE status IN ('review', 'quarantined') ORDER BY observed_on DESC LIMIT 200`,
    )
    .all<{
      venue_key: string;
      drink: string;
      hh: 0 | 1;
      cell: string;
      price_cents: number;
      observed_on: string;
      confirmations: number;
      status: "review" | "quarantined";
    }>();
  return results;
}

/** Admin decision on a price under review or in quarantine. */
export async function setPriceStatus(
  db: D1Database,
  k: PriceKey,
  status: "active" | "removed",
): Promise<string | null> {
  const row = await db
    .prepare(
      `UPDATE prices_current SET status = ?4 WHERE ${PK} AND status IN ('review', 'quarantined')
       RETURNING cell`,
    )
    .bind(...pk(k), status)
    .first<{ cell: string }>();
  return row?.cell ?? null;
}

/** Open reports on bars (closed, not existing, wrong info), one row per bar: the admin decides. */
export async function listBarReports(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT venue_key, max(cell) AS cell, group_concat(DISTINCT reason) AS reasons, COUNT(*) AS n,
         max(day) AS day
       FROM reports WHERE drink IS NULL GROUP BY venue_key ORDER BY n DESC, day DESC LIMIT 200`,
    )
    .all<{ venue_key: string; cell: string | null; reasons: string; n: number; day: string }>();
  return results;
}

/** Closes the reports on a bar: after a delete, or when the admin judges them unfounded. */
export async function clearBarReports(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM reports WHERE venue_key = ?1 AND drink IS NULL").bind(key).run();
}

// ---- Pages for search engines and the open API (ADR 0025): public bars only ----

/** The bar of column `venue_key` is public: the SQL twin of `isPublicBar` (ADR 0017, 0019). */
const PUBLIC_BAR = `((venue_key NOT LIKE 'u%' AND venue_key NOT IN (SELECT venue_key FROM venues_hidden))
  OR (venue_key LIKE 'u%' AND CAST(substr(venue_key, 2) AS INTEGER) IN (SELECT id FROM venues_user WHERE status = 'approved')))`;

export interface SeoPriceRow {
  venue_key: string;
  cell: string;
  drink: string;
  hh: 0 | 1;
  price_cents: number;
  observed_on: string;
}

const SEO_COLUMNS = "venue_key, cell, drink, hh, price_cents, observed_on";

/** The active prices of one public bar, and the name of an approved user bar (an OSM name is in its cell file). */
export async function getSeoVenue(
  db: D1Database,
  key: string,
  limit: number,
): Promise<{ rows: SeoPriceRow[]; userName: string | null }> {
  const [rows, user] = await db.batch([
    db
      .prepare(
        `SELECT ${SEO_COLUMNS} FROM prices_current WHERE venue_key = ?1 AND status = 'active' AND ${PUBLIC_BAR}
         ORDER BY drink, hh LIMIT ?2`,
      )
      .bind(key, limit),
    db
      .prepare(
        "SELECT name FROM venues_user WHERE ?1 LIKE 'u%' AND id = CAST(substr(?1, 2) AS INTEGER) AND status = 'approved'",
      )
      .bind(key),
  ]);
  return {
    rows: (rows?.results ?? []) as unknown as SeoPriceRow[],
    userName: ((user?.results ?? []) as unknown as { name: string }[])[0]?.name ?? null,
  };
}

/** Counts and the full-price rows (hh = 0) of the public bars of some places, cheapest first. */
export async function getSeoCity(db: D1Database, cityIds: number[], limit: number) {
  const marks = cityIds.map((_, i) => `?${String(i + 1)}`).join(", ");
  const [count, rows] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(DISTINCT venue_key) AS bars, COUNT(*) AS prices FROM prices_current
         WHERE city IN (${marks}) AND status = 'active' AND ${PUBLIC_BAR}`,
      )
      .bind(...cityIds),
    db
      .prepare(
        `SELECT ${SEO_COLUMNS} FROM prices_current
         WHERE city IN (${marks}) AND status = 'active' AND hh = 0 AND ${PUBLIC_BAR}
         ORDER BY price_cents LIMIT ${String(limit)}`,
      )
      .bind(...cityIds),
  ]);
  const total = ((count?.results ?? []) as unknown as { bars: number; prices: number }[])[0];
  return {
    bars: total?.bars ?? 0,
    prices: total?.prices ?? 0,
    rows: (rows?.results ?? []) as unknown as SeoPriceRow[],
  };
}

/** Bars and prices per place, for the coverage page. */
export async function getSeoCoverage(db: D1Database, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT city, COUNT(DISTINCT venue_key) AS bars, COUNT(*) AS prices FROM prices_current
       WHERE status = 'active' AND city IS NOT NULL AND ${PUBLIC_BAR}
       GROUP BY city ORDER BY bars DESC, city LIMIT ?1`,
    )
    .bind(limit)
    .all<{ city: number; bars: number; prices: number }>();
  return results;
}

/** One entry per public bar with an active price, for the sitemap; and which places have prices. */
export async function getSitemapRows(db: D1Database, limit: number, cityIds: number[]) {
  const marks = cityIds.map((_, i) => `?${String(i + 1)}`).join(", ");
  const [bars, cities] = await db.batch([
    db
      .prepare(
        `SELECT venue_key, MAX(cell) AS cell FROM prices_current WHERE status = 'active' AND ${PUBLIC_BAR}
         GROUP BY venue_key ORDER BY venue_key LIMIT ?1`,
      )
      .bind(limit),
    db
      .prepare(
        `SELECT DISTINCT city FROM prices_current WHERE status = 'active' AND city IN (${marks || "NULL"})`,
      )
      .bind(...cityIds),
  ]);
  return {
    bars: (bars?.results ?? []) as unknown as { venue_key: string; cell: string }[],
    cities: ((cities?.results ?? []) as unknown as { city: number }[]).map((r) => r.city),
  };
}

/** A page of the open API: public active prices, cheapest first, optionally of some places only. */
export async function getAiRows(
  db: D1Database,
  cityIds: number[] | null,
  limit: number,
  offset: number,
): Promise<SeoPriceRow[]> {
  const where = cityIds
    ? `city IN (${cityIds.map((_, i) => `?${String(i + 3)}`).join(", ")}) AND `
    : "";
  const { results } = await db
    .prepare(
      `SELECT ${SEO_COLUMNS} FROM prices_current WHERE ${where}status = 'active' AND ${PUBLIC_BAR}
       ORDER BY price_cents, venue_key, drink, hh LIMIT ?1 OFFSET ?2`,
    )
    .bind(limit, offset, ...(cityIds ?? []))
    .all<SeoPriceRow>();
  return results;
}

/** Names of approved user bars by id. */
export async function getUserVenueNames(db: D1Database, ids: number[]) {
  if (ids.length === 0) return new Map<string, string>();
  const marks = ids.map((_, i) => `?${String(i + 1)}`).join(", ");
  const { results } = await db
    .prepare(`SELECT id, name FROM venues_user WHERE id IN (${marks}) AND status = 'approved'`)
    .bind(...ids)
    .all<{ id: number; name: string }>();
  return new Map(results.map((r) => [`u${String(r.id)}`, r.name]));
}

// ---- Gestore verificato (SPEC 1.9, D-34, ADR 0033) ----

/** One row per verified bar: the upsert writes the row and its cell index entry. */
const VERIFIED_UPSERT_SQL = `INSERT INTO venues_verified (venue_key, cell, name, hours)
  VALUES (?1, ?2, ?3, ?4)
  ON CONFLICT (venue_key) DO UPDATE SET cell = excluded.cell, name = excluded.name, hours = excluded.hours`;

export async function saveVerified(
  db: D1Database,
  v: { key: string; cell: string; name: string; hours: WeekHours },
): Promise<void> {
  await db.prepare(VERIFIED_UPSERT_SQL).bind(v.key, v.cell, v.name, JSON.stringify(v.hours)).run();
}

/** Turns «Gestore verificato» off; the cell of the bar, or null if it was not verified. */
export async function removeVerified(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("DELETE FROM venues_verified WHERE venue_key = ?1 RETURNING cell")
    .bind(key)
    .first<{ cell: string }>();
  return row?.cell ?? null;
}

export async function listVerified(
  db: D1Database,
): Promise<{ key: string; cell: string; name: string; hours: WeekHours }[]> {
  const { results } = await db
    .prepare("SELECT venue_key, cell, name, hours FROM venues_verified ORDER BY name LIMIT 500")
    .all<{ venue_key: string; cell: string; name: string; hours: string }>();
  return results.map((r) => ({
    key: r.venue_key,
    cell: r.cell,
    name: r.name,
    hours: parseHours(r.hours) ?? [[], [], [], [], [], [], []],
  }));
}

/** Bar page openings of the verified bars since a day (SPEC 12): [key, day, n], newest first. */
export async function listVerifiedViews(
  db: D1Database,
  since: string,
): Promise<[string, string, number][]> {
  const { results } = await db
    .prepare(
      `SELECT day, prop, n FROM metrics_daily
       WHERE day >= ?1 AND event = 'venue_viewed' AND prop LIKE 'venue:%' ORDER BY day DESC, prop`,
    )
    .bind(since)
    .all<{ day: string; prop: string; n: number }>();
  return results.map((r) => [r.prop.slice("venue:".length), r.day, r.n]);
}

/**
 * Which of these keys are verified public bars: the only keys a bar page opening may carry (MD-11).
 * Public as everywhere else (isPublicBar): not hidden, and a user bar only while approved.
 */
export async function verifiedAmong(db: D1Database, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const { results } = await db
    .prepare(
      `SELECT v.venue_key FROM venues_verified v
       WHERE v.venue_key IN (SELECT value FROM json_each(?1))
         AND NOT EXISTS (SELECT 1 FROM venues_hidden h WHERE h.venue_key = v.venue_key)
         AND (v.venue_key NOT LIKE 'u%' OR EXISTS (SELECT 1 FROM venues_user u
           WHERE u.id = CAST(substr(v.venue_key, 2) AS INTEGER) AND u.status = 'approved'))`,
    )
    .bind(JSON.stringify(keys))
    .all<{ venue_key: string }>();
  return new Set(results.map((r) => r.venue_key));
}
