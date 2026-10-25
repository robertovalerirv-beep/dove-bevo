// Client data: static OSM cells + live prices, cached for the visit (SPEC 5.4).
// Requests carry only cell ids and bar keys, never the user's position (SPEC 14).
import type {
  CellFile,
  CellPrices,
  Place,
  PriceRow,
  VenueKind,
  VenuePrices,
} from "../../shared/api-types";

const BUILT_VERSION = import.meta.env.VITE_DATA_VERSION ?? "";
export const DATA_VERSION = /^\d{8}$/.test(BUILT_VERSION) ? BUILT_VERSION : "fixture";

export interface Venue {
  key: string;
  name: string;
  kind: VenueKind;
  lat: number;
  lon: number;
  addr: string;
  city: string;
  cell: string;
  prices: PriceRow[];
  /** Proposed by a user, not yet approved: only offered when choosing the bar of a price. */
  pending: boolean;
  /** «Gestore verificato» (SPEC 1.9, D-34): first in the list, with «Sponsorizzato». */
  verified: boolean;
}

const cells = new Map<string, Promise<Venue[]>>();
/** Cells whose next read of the prices must skip the browser's HTTP cache. */
const reread = new Set<string>();

/** The API answered with the SPA page instead of JSON: the free daily limit is over (SPEC 5.3). */
export class ServiceBusy extends Error {}

async function getJson<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  // A missing static file (no bars in that cell) comes back as the SPA fallback HTML, not a 404.
  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  if (response.ok && !isJson && url.startsWith("/api/")) throw new ServiceBusy();
  if (response.status === 404 || (response.ok && !isJson)) return fallback;
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

async function fetchCell(cell: string): Promise<Venue[]> {
  // After a contribution the browser's own copy (max-age 60 s) would hand back the old prices.
  const fresh = reread.delete(cell);
  const [file, prices] = await Promise.all([
    getJson<CellFile>(`/data/${DATA_VERSION}/v/${cell}.json`, { c: [], v: [] }),
    getJson<CellPrices>(
      `/api/prices/${cell}`,
      { p: [], u: [], pend: [], h: [], g: [] },
      fresh ? { cache: "reload" } : undefined,
    ),
  ]);
  const byKey = new Map<string, PriceRow[]>();
  for (const row of prices.p) byKey.set(row[0], [...(byKey.get(row[0]) ?? []), row]);
  const hidden = new Set(prices.h);
  const verified = new Set(prices.g ?? []);
  const osm = file.v
    .filter(([key]) => !hidden.has(key)) // not a bar, or closed (admin, ADR 0017)
    .map(([key, name, kind, lat, lon, addr, ci]) => ({
      key,
      name,
      kind,
      lat,
      lon,
      addr,
      city: file.c[ci]?.[1] ?? "",
      cell,
      prices: byKey.get(key) ?? [],
      pending: false,
      verified: verified.has(key),
    }));
  const user = [...prices.u, ...prices.pend].map(([key, name, kind, lat, lon], i) => ({
    key,
    name,
    kind,
    lat,
    lon,
    addr: "",
    city: "",
    cell,
    prices: byKey.get(key) ?? [],
    pending: i >= prices.u.length,
    verified: i < prices.u.length && verified.has(key),
  }));
  return [...osm, ...user];
}

/** Venues of a cell; the promise is kept so each cell is downloaded once per visit. */
export function loadCell(cell: string): Promise<Venue[]> {
  let pending = cells.get(cell);
  if (!pending) {
    pending = fetchCell(cell);
    pending.catch(() => cells.delete(cell)); // allow a retry after a network error
    cells.set(cell, pending);
  }
  return pending;
}

let places: Promise<Place[]> | null = null;

/** places.json, loaded at the first search (SPEC 5.1). */
export function loadPlaces(): Promise<Place[]> {
  if (!places) {
    places = getJson<Place[]>(`/data/${DATA_VERSION}/places.json`, []);
    places.catch(() => (places = null)); // retry at the next search after a network error
  }
  return places;
}

export const loadVenuePrices = (key: string) =>
  getJson<VenuePrices>(`/api/venues/${encodeURIComponent(key)}/prices`, { p: [], h: [] });

export { bestPrice, shownPrice } from "../../shared/prices";

/** Drops a cell from the visit cache so its prices are read again after a contribution. */
export function invalidateCell(cell: string): void {
  cells.delete(cell);
  reread.add(cell);
}
