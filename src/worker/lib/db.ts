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
