// Compact formats shared by the import script, the Worker and the client (SPEC 5.1, 9.2, D-11).

/** Bar kind: 0 cafe, 1 bar, 2 pub, 3 biergarten, 4 nightclub. */
export type VenueKind = 0 | 1 | 2 | 3 | 4;

/** [key, name, kind, lat, lon, addr, ci]: `ci` indexes the file's city table, -1 if none. */
export type CellVenue = [string, string, VenueKind, number, number, string, number];

/** Static file `data/<DATA_VERSION>/v/<geohash5>.json`. */
export interface CellFile {
  /** [cityId (OSM node id of the place), name] */
  c: [number, string][];
  v: CellVenue[];
}

/** `places.json` row: [cityId, name, lat, lon, nBars], sorted by nBars descending. */
export type Place = [number, string, number, number, number];

/** [key, drink, size_ml, hh, price_cents, observed_on, confirmations, q (quarantined)] */
export type PriceRow = [string, string, number, 0 | 1, number, string, number, 0 | 1];
/** Approved user venue: [key "u<id>", name, kind, lat, lon] */
export type UserVenue = [string, string, VenueKind, number, number];
/** Pending user venue: [key "u<id>", name, kind, lat, lon, independent proposals] */
export type PendingVenue = [string, string, VenueKind, number, number, number];

/** `GET /api/prices/:cell` (SPEC 9.2): review and removed prices are never included. */
export interface CellPrices {
  p: PriceRow[];
  u: UserVenue[];
  pend: PendingVenue[];
  /** OSM keys of the cell hidden by the admin (not a bar, closed): never drawn (ADR 0017). */
  h: string[];
}

/** History row: [drink, size_ml, hh, price_cents, observed_on (date only)] */
export type HistoryRow = [string, number, 0 | 1, number, string];

/** `GET /api/venues/:key/prices` (D-26): current prices and ≤ 10 observations per drink and size. */
export interface VenuePrices {
  p: PriceRow[];
  h: HistoryRow[];
}

/**
 * `GET /api/admin/coverage` (ADR 0022): public bars with at least one active price, per city.
 * City names and totals are not here: the client joins them with places.json by OSM id.
 */
export interface Coverage {
  /** When the figures were computed (ISO time). */
  at: string;
  /** Active prices of every bar, public or not: the rows the calculation read (cost warning). */
  active: number;
  /** Public bars with an active price, and their active prices, in all of Italy. */
  bars: number;
  prices: number;
  /** [OSM id of the city, bars with a price, public prices, day of the latest price] */
  cities: [number, number, number, string][];
  /** Bars the Worker could not place at all (their position is unknown): [bars, prices, day]. */
  none: [number, number, string];
  /** Approved user bars per city, with or without prices: they join the city's total. [city, n] */
  users: [number, number][];
  /** The public bars behind the counts, for the admin's city list: [city or 0 for none, key, cell]. */
  members: [number, string, string][];
}
