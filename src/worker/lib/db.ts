// The only module that talks to D1 (CLAUDE.md).
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
  size_ml: number;
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
  r.size_ml,
  r.hh,
  r.price_cents,
  r.observed_on,
  r.confirmations,
  r.status === "quarantined" ? 1 : 0,
];

/** Prices, user venues and hidden OSM keys of a cell (SPEC 5.4, 9.2): indexed reads, one round trip. */
export async function getCellPrices(db: D1Database, cell: string): Promise<CellPrices> {
  const [prices, venues, hidden] = await db.batch([
    db
      .prepare(
        `SELECT venue_key, drink, size_ml, hh, price_cents, observed_on, confirmations, status
         FROM prices_current WHERE cell = ?1 AND status IN ('active', 'quarantined')
         ORDER BY venue_key, drink, size_ml, hh`,
      )
      .bind(cell),
    db
      .prepare(
        `SELECT id, name, kind, lat, lon, status, confirmations
         FROM venues_user WHERE cell = ?1 AND status IN ('approved', 'pending') ORDER BY id`,
      )
      .bind(cell),
    db.prepare("SELECT venue_key FROM venues_hidden WHERE cell = ?1").bind(cell),
  ]);
  const rows = (venues?.results ?? []) as unknown as VenueDbRow[];
  const u = rows
    .filter((r) => r.status === "approved")
    .map((r): UserVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon]);
  // Prices of a user bar are public only once the admin approved it (SPEC 7.5, ADR 0019).
  const approved = new Set(u.map((v) => v[0]));
  const p = ((prices?.results ?? []) as unknown as PriceDbRow[])
    .filter((r) => !r.venue_key.startsWith("u") || approved.has(r.venue_key))
    .map(toPriceRow);
  const pend = rows
    .filter((r) => r.status === "pending")
    .map((r): PendingVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon, r.confirmations]);
  const h = ((hidden?.results ?? []) as unknown as { venue_key: string }[]).map((r) => r.venue_key);
  return { p, u, pend, h };
}

/** Current prices of a bar and its latest 10 observations per drink and size (D-26). */
export async function getVenuePrices(db: D1Database, key: string): Promise<VenuePrices> {
  const [current, history] = await db.batch([
    db
      .prepare(
        `SELECT venue_key, drink, size_ml, hh, price_cents, observed_on, confirmations, status
         FROM prices_current WHERE venue_key = ?1 AND status IN ('active', 'quarantined')
         ORDER BY drink, size_ml, hh`,
      )
      .bind(key),
    db
      .prepare(
        `SELECT drink, size_ml, hh, price_cents, observed_on FROM (
           SELECT drink, size_ml, hh, price_cents, observed_on, id,
             ROW_NUMBER() OVER (PARTITION BY drink, size_ml ORDER BY observed_on DESC, id DESC) AS n
           FROM price_obs WHERE venue_key = ?1 AND status NOT IN ('review', 'removed')
             -- a price under review leaves the bar page, its history included (SPEC 11)
             AND NOT EXISTS (SELECT 1 FROM prices_current pc WHERE pc.venue_key = price_obs.venue_key
               AND pc.drink = price_obs.drink AND pc.size_ml = price_obs.size_ml AND pc.hh = price_obs.hh
               AND pc.price_cents = price_obs.price_cents AND pc.status IN ('review', 'removed')))
         WHERE n <= 10 ORDER BY drink, size_ml, observed_on DESC, id DESC`,
      )
      .bind(key),
  ]);
  const h = (
    (history?.results ?? []) as unknown as {
      drink: string;
      size_ml: number;
      hh: 0 | 1;
      price_cents: number;
      observed_on: string;
    }[]
  ).map((r): HistoryRow => [r.drink, r.size_ml, r.hh, r.price_cents, r.observed_on]);
  return { p: ((current?.results ?? []) as unknown as PriceDbRow[]).map(toPriceRow), h };
}

// ---- Writes (M2) ----

export interface PriceKey {
  venue: string;
  drink: string;
  size: number;
  hh: 0 | 1;
}

export interface CurrentPrice {
  price_cents: number;
  observed_on: string;
  status: "active" | "quarantined" | "review" | "removed";
  confirmations: number;
}

const PK = "venue_key = ?1 AND drink = ?2 AND size_ml = ?3 AND hh = ?4";
const pk = (k: PriceKey) => [k.venue, k.drink, k.size, k.hh] as const;

export function getCurrentPrice(db: D1Database, k: PriceKey): Promise<CurrentPrice | null> {
  return db
    .prepare(
      `SELECT price_cents, observed_on, status, confirmations FROM prices_current WHERE ${PK}`,
    )
    .bind(...pk(k))
    .first<CurrentPrice>();
}

/** Active prices of the same drink, size and band in a cell (median for the quarantine). */
export async function activePrices(
  db: D1Database,
  cell: string,
  drink: string,
  size: number,
  hh: number,
) {
  const { results } = await db
    .prepare(
      "SELECT price_cents FROM prices_current WHERE cell = ?1 AND drink = ?2 AND size_ml = ?3 AND hh = ?4 AND status = 'active'",
    )
    .bind(cell, drink, size, hh)
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

/** History row + current price in one batch (SPEC 8); a different price resets confirmations. */
export async function writePrice(db: D1Database, k: PriceKey, p: NewPrice): Promise<void> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO price_obs (venue_key, drink, size_ml, hh, price_cents, observed_on, source, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      )
      .bind(...pk(k), p.price, p.day, "manual", p.status),
    db
      .prepare(
        `INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)
         ON CONFLICT (venue_key, drink, size_ml, hh) DO UPDATE SET cell = excluded.cell, city = excluded.city,
           price_cents = excluded.price_cents, observed_on = excluded.observed_on, confirmations = 0,
           status = excluded.status, source = excluded.source
         WHERE prices_current.status NOT IN ('review', 'removed')`,
      )
      .bind(...pk(k), p.cell, p.city, p.price, p.day, p.status, "manual"),
  ]);
}

/** +1 confirmation; a quarantined price becomes active (D-10). Returns the new count. */
export async function confirmPrice(
  db: D1Database,
  k: PriceKey,
  day: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      `UPDATE prices_current SET confirmations = confirmations + 1, observed_on = max(observed_on, ?5),
         status = CASE WHEN status = 'quarantined' THEN 'active' ELSE status END
       WHERE ${PK} AND status IN ('active', 'quarantined') RETURNING confirmations`,
    )
    .bind(...pk(k), day)
    .first<{ confirmations: number }>();
  return row?.confirmations ?? null;
}

/** One-time keys (confirmations, reports, tokens). True when the key is new. */
export async function claimOnce(db: D1Database, key: string, day: string): Promise<boolean> {
  const result = await db
    .prepare("INSERT OR IGNORE INTO dedup (k, day) VALUES (?1, ?2)")
    .bind(key, day)
    .run();
  return result.meta.changes === 1;
}

export async function hasKey(db: D1Database, key: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 FROM dedup WHERE k = ?1").bind(key).first()) !== null;
}

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
 * Stores a proposal as pending, unless 200 are already waiting (one atomic statement, index
 * vu_status). Returns the new id, or null when full. `confirmations` counts independent proposers.
 */
export async function proposeVenue(
  db: D1Database,
  v: { name: string; kind: number; lat: number; lon: number; cell: string; day: string },
  maxPending: number,
): Promise<number | null> {
  const row = await db
    .prepare(
      `INSERT INTO venues_user (name, kind, lat, lon, cell, status, confirmations, day)
       SELECT ?1, ?2, ?3, ?4, ?5, 'pending', 1, ?6
       WHERE (SELECT COUNT(*) FROM venues_user WHERE status = 'pending') < ?7 RETURNING id`,
    )
    .bind(v.name, v.kind, v.lat, v.lon, v.cell, v.day, maxPending)
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
      "SELECT cell, status FROM venues_user WHERE id = ?1 AND status IN ('pending', 'approved')",
    )
    .bind(id)
    .first<{ cell: string; status: "pending" | "approved" }>();
}

// ---- Reports and cleanup (M2) ----

export interface ReportTarget {
  venue: string;
  /** Cell of the bar, kept so the admin can hide it (migration 0003). */
  cell: string;
  drink: string | null;
  size: number | null;
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
        "INSERT INTO reports (venue_key, drink, size_ml, hh, reason, day, cell) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      )
      .bind(t.venue, t.drink, t.size, t.hh, reason, day, t.cell),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM reports WHERE venue_key = ?1 AND drink IS ?2 AND size_ml IS ?3 AND hh IS ?4 AND (?5 IS NULL OR day >= ?5)",
      )
      .bind(t.venue, t.drink, t.size, t.hh, since),
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
      `SELECT venue_key, drink, size_ml, hh, cell, price_cents, observed_on, confirmations, status
       FROM prices_current WHERE status IN ('review', 'quarantined') ORDER BY observed_on DESC LIMIT 200`,
    )
    .all<{
      venue_key: string;
      drink: string;
      size_ml: number;
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
      `UPDATE prices_current SET status = ?5 WHERE ${PK} AND status IN ('review', 'quarantined')
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
