// The only module that talks to D1 (CLAUDE.md).
import type {
  CellPrices,
  PendingVenue,
  PriceRow,
  UserVenue,
  VenueKind,
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
  const p = ((prices?.results ?? []) as unknown as PriceDbRow[]).map((r): PriceRow => [
    r.venue_key,
    r.drink,
    r.size_ml,
    r.hh,
    r.price_cents,
    r.observed_on,
    r.confirmations,
    r.status === "quarantined" ? 1 : 0,
    r.source === "menu_photo" ? 1 : 0,
  ]);
  const rows = (venues?.results ?? []) as unknown as VenueDbRow[];
  const u = rows
    .filter((r) => r.status === "approved")
    .map((r): UserVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon]);
  const pend = rows
    .filter((r) => r.status === "pending")
    .map((r): PendingVenue => [`u${String(r.id)}`, r.name, r.kind, r.lat, r.lon, r.confirmations]);
  return { p, u, pend };
}
