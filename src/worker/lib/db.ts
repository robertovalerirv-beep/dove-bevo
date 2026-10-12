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
  source: "manual" | "menu_photo";
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
  r.source === "menu_photo" ? 1 : 0,
];

/** Prices and user venues of a cell (SPEC 5.4, 9.2): two indexed reads in one round trip. */
export async function getCellPrices(db: D1Database, cell: string): Promise<CellPrices> {
  const [prices, venues] = await db.batch([
    db
      .prepare(
        `SELECT venue_key, drink, size_ml, hh, price_cents, observed_on, confirmations, status, source
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
  ]);
  const p = ((prices?.results ?? []) as unknown as PriceDbRow[]).map(toPriceRow);
  const rows = (venues?.results ?? []) as unknown as VenueDbRow[];
  const u = rows
    .filter((r) => r.status === "approved")
    .map((r): UserVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon]);
  const pend = rows
    .filter((r) => r.status === "pending")
    .map((r): PendingVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon, r.confirmations]);
  return { p, u, pend };
}

/** Current prices of a bar and its latest 10 observations per drink and size (D-26). */
export async function getVenuePrices(db: D1Database, key: string): Promise<VenuePrices> {
  const [current, history] = await db.batch([
    db
      .prepare(
        `SELECT venue_key, drink, size_ml, hh, price_cents, observed_on, confirmations, status, source
         FROM prices_current WHERE venue_key = ?1 AND status IN ('active', 'quarantined')
         ORDER BY drink, size_ml, hh`,
      )
      .bind(key),
    db
      .prepare(
        `SELECT drink, size_ml, hh, price_cents, observed_on FROM (
           SELECT drink, size_ml, hh, price_cents, observed_on, id,
             ROW_NUMBER() OVER (PARTITION BY drink, size_ml ORDER BY observed_on DESC, id DESC) AS n
           FROM price_obs WHERE venue_key = ?1 AND status NOT IN ('review', 'removed'))
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
  source: "manual" | "menu_photo";
}

/** History row + current price in one batch (SPEC 8); a different price resets confirmations. */
export async function writePrice(db: D1Database, k: PriceKey, p: NewPrice): Promise<void> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO price_obs (venue_key, drink, size_ml, hh, price_cents, observed_on, source, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      )
      .bind(...pk(k), p.price, p.day, p.source, p.status),
    db
      .prepare(
        `INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)
         ON CONFLICT (venue_key, drink, size_ml, hh) DO UPDATE SET cell = excluded.cell, city = excluded.city,
           price_cents = excluded.price_cents, observed_on = excluded.observed_on, confirmations = 0,
           status = excluded.status, source = excluded.source`,
      )
      .bind(...pk(k), p.cell, p.city, p.price, p.day, p.status, p.source),
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

export function getUserVenue(db: D1Database, id: number) {
  return db
    .prepare(
      "SELECT cell, status FROM venues_user WHERE id = ?1 AND status IN ('pending', 'approved')",
    )
    .bind(id)
    .first<{ cell: string; status: "pending" | "approved" }>();
}
