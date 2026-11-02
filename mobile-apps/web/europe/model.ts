import { z } from "zod";
import { CATALOG, findDrink } from "@site/shared/catalog";
import { CELL_PATTERN, OSM_KEY_PATTERN, distanceMeters } from "@site/shared/venue";
import { encodeGeohash } from "@site/shared/geohash";
import { medianOf, tierOf, type Tier } from "@site/app/lib/tiers";
import { currentLang } from "@site/app/i18n/lang";
import { mobileURL } from "../routes";

const Currency = z.enum(["EUR", "GBP"]);
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const time = Date.parse(day + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
  });
const CheckedDay = Day.refine((day) => day <= new Date().toISOString().slice(0, 10));
const HTTPS = z
  .string()
  .max(2048)
  .refine((value) => {
    for (const char of value)
      if (char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) return false;
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password && !u.hash && !u.port;
    } catch {
      return false;
    }
  });
function safeText(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || (code >= 127 && code <= 159)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return value.trim().length >= 2;
}
const Text = z.string().min(2).max(120).refine(safeText);
const BOXES = {
  IT: [35, 48, 6, 19],
  GB: [49.8, 61, -8.8, 2.1],
  FR: [41, 51.6, -5.5, 10],
  ES: [27.5, 44, -18.5, 4.5],
  DE: [47.2, 55.2, 5.5, 15.6],
} as const;
export const ServingSchema = z
  .strictObject({
    unit: z.enum(["drink", "glass", "ml"]),
    ml: z.number().int().min(1).max(2000).optional(),
  })
  .refine((value) => value.unit !== "ml" || value.ml !== undefined);
export type Serving = z.infer<typeof ServingSchema>;
export const servingKey = (value: Serving) =>
  `${value.unit}:${value.ml === undefined ? "" : String(value.ml)}`;
export function servingLabel(value: Serving): string {
  if (value.unit === "ml") return `${String(value.ml)} ml`;
  if (value.unit === "glass")
    return (
      (currentLang() === "en" ? "Glass" : "Calice") + (value.ml ? ` · ${String(value.ml)} ml` : "")
    );
  return currentLang() === "en" ? "Single drink" : "Drink singolo";
}
export function validServing(drink: string, value: Serving): boolean {
  return drink === "beer_draft" || drink === "water"
    ? value.unit === "ml"
    : drink === "wine_glass"
      ? value.unit === "glass"
      : value.unit === "drink" && value.ml === undefined;
}
const VenueSchema = z
  .strictObject({
    key: z.string().regex(OSM_KEY_PATTERN),
    name: Text,
    kind: z.number().int().min(1).max(4),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    cell: z.string().regex(CELL_PATTERN),
    city: Text,
    country: z.enum(["IT", "GB", "FR", "ES", "DE"]),
    currency: Currency,
    google: z.strictObject({
      url: HTTPS.refine((value) => {
        try {
          return /^(?:www\.|maps\.)?google\.(?:com|it|fr|de|es|co\.uk)$/.test(
            new URL(value).hostname,
          );
        } catch {
          return false;
        }
      }),
      review_count: z.number().int().min(101).max(100000000),
      checked_on: CheckedDay,
    }),
  })
  .refine((v) => {
    const [south, north, west, east] = BOXES[v.country];
    return (
      encodeGeohash(v.lat, v.lon, 5) === v.cell &&
      v.lat >= south &&
      v.lat <= north &&
      v.lon >= west &&
      v.lon <= east &&
      v.currency === (v.country === "GB" ? "GBP" : "EUR")
    );
  });
export const CatalogSchema = z
  .strictObject({
    schema_version: z.literal(1),
    version: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    venues: z.array(VenueSchema).max(5000),
  })
  .refine((v) => new Set(v.venues.map((venue) => venue.key)).size === v.venues.length);
export type Catalog = z.infer<typeof CatalogSchema>;
export type Venue = Catalog["venues"][number];
export const PriceSchema = z
  .strictObject({
    venue: z.string().regex(OSM_KEY_PATTERN),
    cell: z.string().regex(CELL_PATTERN),
    drink: z.string().refine((code) => CATALOG.some((d) => d.code === code)),
    hh: z.union([z.literal(0), z.literal(1)]),
    currency: Currency,
    amount_minor: z.number().int().min(1).max(100000),
    serving: ServingSchema,
    observed_on: Day.nullable(),
    confirmed_on: Day.nullable(),
    confirmations: z.number().int().min(0),
    status: z.enum(["active", "quarantined"]),
    revision: z.uuid(),
    provenance: z.strictObject({
      kind: z.enum(["customer", "online_menu"]),
      source_url: HTTPS.nullable(),
      source_checked_on: CheckedDay.nullable(),
      source_sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
      menu_item: z.string().min(1).max(240).nullable(),
    }),
  })
  .refine(
    (p) =>
      validServing(p.drink, p.serving) &&
      (p.provenance.kind === "online_menu"
        ? p.observed_on === null &&
          p.provenance.source_url !== null &&
          p.provenance.source_checked_on !== null &&
          p.provenance.source_sha256 !== null &&
          p.provenance.menu_item !== null
        : p.observed_on !== null &&
          p.provenance.source_url === null &&
          p.provenance.source_checked_on === null &&
          p.provenance.source_sha256 === null &&
          p.provenance.menu_item === null),
  );
export type Price = z.infer<typeof PriceSchema>;
export const SnapshotSchema = z.strictObject({
  schema_version: z.literal(1),
  catalog_version: z.string(),
  rows: z.array(PriceSchema).max(5000),
  hidden: z.array(z.string().regex(OSM_KEY_PATTERN)),
  legacy_venues: z.array(z.string().regex(OSM_KEY_PATTERN)),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export interface City {
  key: string;
  name: string;
  country: Venue["country"];
  currency: Venue["currency"];
  venues: Venue[];
  lat: number;
  lon: number;
}
export function cities(catalog: Catalog): City[] {
  const groups = new Map<string, Venue[]>();
  for (const v of catalog.venues) {
    const key = `${v.country}|${v.city}|${v.currency}`;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }
  return [...groups].map(([key, venues]) => {
    const first = venues[0];
    if (!first) throw new Error("Empty city");
    return {
      key,
      name: first.city,
      country: first.country,
      currency: first.currency,
      venues,
      // Navigation centre of actual catalogue points, not an asserted municipality coordinate.
      lat: venues.reduce((sum, v) => sum + v.lat, 0) / venues.length,
      lon: venues.reduce((sum, v) => sum + v.lon, 0) / venues.length,
    };
  });
}
export function cityNearAt(groups: City[], search: string): City | undefined {
  const params = new URLSearchParams(search);
  if (params.getAll("at").length !== 1) return;
  const match = /^(-?\d{1,2}(?:\.\d{1,8})?),(-?\d{1,3}(?:\.\d{1,8})?)$/.exec(
    params.get("at") ?? "",
  );
  if (!match) return;
  const lat = Number(match[1]),
    lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  // Every decision is within 40 km of a real venue in that city; no guessed city data.
  return groups
    .map((city) => ({
      city,
      d: Math.min(...city.venues.map((v) => distanceMeters(lat, lon, v.lat, v.lon))),
    }))
    .filter((v) => v.d <= 40000)
    .sort((a, b) => a.d - b.d)[0]?.city;
}
export const venueURL = (venue: Venue) => mobileURL(`/bar/${venue.key}?c=${venue.cell}`);
export const cityURL = (city: City) =>
  mobileURL(`/?at=${city.lat.toFixed(5)},${city.lon.toFixed(5)}`);
export const money = (amount: number, currency: Venue["currency"]) =>
  new Intl.NumberFormat(currentLang() === "en" ? "en-GB" : "it-IT", {
    style: "currency",
    currency,
  }).format(amount / 100);
export function parseAmount(value: string): number | null {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*$/.exec(value);
  if (!match?.[1]) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}
export function amountAllowed(drink: string, currency: Venue["currency"], amount: number): boolean {
  const gbp: Record<string, readonly [number, number]> = {
    beer_draft: [100, 3000],
    spritz: [100, 5000],
    negroni: [100, 5000],
    sbagliato: [100, 5000],
    gin_tonic: [100, 5000],
    gin_lemon: [100, 5000],
    wine_glass: [100, 5000],
    alcohol_free: [100, 3000],
    water: [1, 1500],
  };
  const d = findDrink(drink),
    bounds = currency === "GBP" ? gbp[drink] : d ? [d.min, d.max] : undefined;
  return !!bounds && amount >= bounds[0] && amount <= bounds[1];
}
export function comparable(
  rows: Price[],
  currency: Venue["currency"],
  drink: string,
  hh: 0 | 1,
  serving: Serving,
): Price[] {
  return rows.filter(
    (r) =>
      r.status === "active" &&
      r.currency === currency &&
      r.drink === drink &&
      r.hh === hh &&
      servingKey(r.serving) === servingKey(serving),
  );
}
export function priceTier(row: Price, rows: Price[]): Tier {
  if (row.status !== "active" || row.hh !== 0) return "neutro";
  const peers = comparable(rows, row.currency, row.drink, 0, row.serving).filter(
    (r) => r.cell === row.cell,
  );
  return tierOf(
    row.amount_minor,
    peers.length >= 5 ? medianOf(peers.map((r) => r.amount_minor)) : null,
  );
}
