import { z } from "zod";
import { encodeGeohash } from "../../shared/geohash";
import { CATALOG } from "../../shared/catalog";
import { CELL_PATTERN, OSM_KEY_PATTERN } from "../../shared/venue";
import { ApiError } from "../lib/errors";

export const MobileCurrency = z.enum(["EUR", "GBP"]);
export const MobileDrink = z
  .string()
  .max(32)
  .refine((code) => CATALOG.some((d) => d.code === code));
export const MobileCell = z.string().regex(CELL_PATTERN);
export const MobileVenueKey = z.string().regex(OSM_KEY_PATTERN);
export const Serving = z
  .strictObject({
    unit: z.enum(["drink", "glass", "ml"]),
    ml: z.number().int().min(1).max(2000).optional(),
  })
  .refine((value) => value.unit !== "ml" || value.ml !== undefined);
export type MobileServing = z.infer<typeof Serving>;
export type Currency = z.infer<typeof MobileCurrency>;
export function servingKey(value: MobileServing): string {
  return `${value.unit}:${value.ml === undefined ? "" : String(value.ml)}`;
}
export function servingFromKey(value: string): MobileServing {
  const [unit, ml] = value.split(":");
  return Serving.parse({ unit, ...(ml ? { ml: Number(ml) } : {}) });
}
export function validServing(drink: string, value: MobileServing): boolean {
  if (drink === "beer_draft" || drink === "water") return value.unit === "ml";
  if (drink === "wine_glass") return value.unit === "glass";
  return value.unit === "drink" && value.ml === undefined;
}

/** Sources are immutable deploy-time facts; URLs are never fetched from client input. */
export const HTTPS = z
  .string()
  .max(2048)
  .refine((value) => {
    for (const character of value)
      if (character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) return false;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.port === "" &&
        !!url.hostname
      );
    } catch {
      return false;
    }
  });
export const EvidenceDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(value + "T00:00:00Z");
    return (
      Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === value &&
      value <= new Date().toISOString().slice(0, 10)
    );
  });
const Google = z.strictObject({
  url: HTTPS.refine((value) => {
    try {
      return /^(?:www\.|maps\.)?google\.(?:com|it|fr|de|es|co\.uk)$/.test(new URL(value).hostname);
    } catch {
      return false;
    }
  }),
  review_count: z.number().int().min(101).max(100_000_000),
  checked_on: EvidenceDay,
});
function safeName(value: string): boolean {
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
const Country = z.enum(["IT", "GB", "FR", "ES", "DE"]);
const BOXES = {
  IT: [35, 48, 6, 19],
  GB: [49.8, 61, -8.8, 2.1],
  FR: [41, 51.6, -5.5, 10],
  ES: [27.5, 44, -18.5, 4.5],
  DE: [47.2, 55.2, 5.5, 15.6],
} as const;
const CatalogVenue = z
  .strictObject({
    key: MobileVenueKey,
    name: z.string().min(2).max(120).refine(safeName),
    kind: z.number().int().min(1).max(4),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    cell: MobileCell,
    city: z.string().min(2).max(120).refine(safeName),
    country: Country,
    currency: MobileCurrency,
    google: Google,
  })
  .refine((value) => {
    const [south, north, west, east] = BOXES[value.country];
    return (
      encodeGeohash(value.lat, value.lon, 5) === value.cell &&
      value.lat >= south &&
      value.lat <= north &&
      value.lon >= west &&
      value.lon <= east &&
      value.currency === (value.country === "GB" ? "GBP" : "EUR")
    );
  });
const Catalog = z
  .strictObject({
    schema_version: z.literal(1),
    version: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    venues: z.array(CatalogVenue).max(5000),
  })
  .refine((value) => new Set(value.venues.map((v) => v.key)).size === value.venues.length);
export type MobileCatalog = z.infer<typeof Catalog>;
export type MobileCatalogVenue = MobileCatalog["venues"][number];

async function assetJSON(env: Env, path: string): Promise<unknown> {
  try {
    const response = await env.ASSETS.fetch("https://assets.local" + path);
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError("busy");
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    if (!reader) throw new ApiError("busy");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new ApiError("busy");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
      ) as unknown;
    } catch {
      throw new ApiError("busy");
    }
  } catch {
    throw new ApiError("busy");
  }
}
export async function loadMobileCatalog(env: Env): Promise<MobileCatalog> {
  const parsed = Catalog.safeParse(await assetJSON(env, "/mobile-data/catalog.json"));
  if (!parsed.success) throw new ApiError("busy");
  return parsed.data;
}

const LegacyCell = z
  .strictObject({
    c: z.array(z.tuple([z.number().int().positive(), z.string().max(120)])).max(5000),
    v: z
      .array(
        z.tuple([
          MobileVenueKey,
          z.string().max(120),
          z.number().int().min(0).max(4),
          z.number().min(-90).max(90),
          z.number().min(-180).max(180),
          z.string().max(2000),
          z.number().int().min(-1),
        ]),
      )
      .max(5000),
  })
  .refine((value) => value.v.every((row) => row[6] < value.c.length));
async function legacyCell(env: Env, cell: string) {
  const parsed = LegacyCell.safeParse(
    await assetJSON(env, `/data/${env.DATA_VERSION}/v/${cell}.json`),
  );
  if (!parsed.success) throw new ApiError("busy");
  return parsed.data;
}

export async function catalogScope(env: Env, catalog: MobileCatalog, cell: string) {
  const venues = catalog.venues.filter((v) => v.cell === cell);
  const [legacyFile, blocks] = await Promise.all([
    venues.some((v) => v.country === "IT") ? legacyCell(env, cell) : Promise.resolve(null),
    env.DB.prepare(
      `SELECT venue_key FROM venues_hidden WHERE cell=?1
      UNION SELECT venue_key FROM mobile_venues_moderation`,
    )
      .bind(cell)
      .all<{ venue_key: string }>(),
  ]);
  const known = new Set(venues.map((v) => v.key));
  const hidden = [...new Set(blocks.results.map((v) => v.venue_key))].filter((key) =>
    known.has(key),
  );
  const legacy = venues
    .filter((v) => v.country === "IT" && legacyFile?.v.some((row) => row[0] === v.key))
    .map((v) => v.key);
  return { venues, hidden, legacy };
}
export async function resolveMobileVenue(env: Env, key: string, cell: string) {
  const catalog = await loadMobileCatalog(env);
  const scope = await catalogScope(env, catalog, cell);
  const venue = scope.venues.find((v) => v.key === key);
  if (!venue || scope.hidden.includes(key)) throw new ApiError("not_found");
  if (scope.legacy.includes(key)) throw new ApiError("conflict");
  return { catalog, venue };
}
