import { z } from "zod";
import { findDrink } from "../../shared/catalog";
import { claimStatement } from "../lib/db";
import { ApiError } from "../lib/errors";
import {
  EvidenceDay,
  HTTPS,
  MobileCell,
  MobileCurrency,
  MobileDrink,
  MobileVenueKey,
  Serving,
  resolveMobileVenue,
  servingFromKey,
  servingKey,
  validServing,
  type Currency,
  type MobileServing,
} from "./mobile-price-catalog";

export interface MobilePriceKey {
  venue: string;
  drink: string;
  hh: 0 | 1;
  currency: Currency;
  serving: MobileServing;
}
export const PRICE_PK = "venue_key=?1 AND drink=?2 AND hh=?3 AND currency=?4 AND serving_key=?5";
export const keyValues = (key: MobilePriceKey) => [
  key.venue,
  key.drink,
  key.hh,
  key.currency,
  servingKey(key.serving),
];
export const priceTarget = (key: MobilePriceKey) => JSON.stringify(keyValues(key));
export interface MobilePriceDb {
  venue_key: string;
  drink: string;
  hh: 0 | 1;
  currency: Currency;
  serving_key: string;
  cell: string;
  amount_minor: number;
  observed_on: string | null;
  confirmed_on: string | null;
  confirmations: number;
  status: "active" | "quarantined" | "review" | "removed";
  source_kind: "customer" | "online_menu";
  source_id: string | null;
  revision: string;
  changed_at: string;
  source_url?: string | null;
  source_checked_on?: string | null;
  source_sha256?: string | null;
  menu_item?: string | null;
}
export interface MobilePriceRow {
  venue: string;
  cell: string;
  drink: string;
  hh: 0 | 1;
  currency: Currency;
  amount_minor: number;
  serving: MobileServing;
  observed_on: string | null;
  confirmed_on: string | null;
  confirmations: number;
  status: "active" | "quarantined";
  revision: string;
  provenance: {
    kind: "customer" | "online_menu";
    source_url: string | null;
    source_checked_on: string | null;
    source_sha256: string | null;
    menu_item: string | null;
  };
}
export function publicMobilePrice(row: MobilePriceDb): MobilePriceRow {
  if (row.status !== "active" && row.status !== "quarantined") throw new ApiError("internal");
  if (
    row.source_kind === "online_menu" &&
    (!row.source_url || !row.source_checked_on || !row.source_sha256 || !row.menu_item)
  )
    throw new ApiError("busy");
  return {
    venue: row.venue_key,
    cell: row.cell,
    drink: row.drink,
    hh: row.hh,
    currency: row.currency,
    amount_minor: row.amount_minor,
    serving: servingFromKey(row.serving_key),
    observed_on: row.observed_on,
    confirmed_on: row.confirmed_on,
    confirmations: row.confirmations,
    status: row.status,
    revision: row.revision,
    provenance: {
      kind: row.source_kind,
      source_url: row.source_kind === "online_menu" ? (row.source_url ?? null) : null,
      source_checked_on: row.source_kind === "online_menu" ? (row.source_checked_on ?? null) : null,
      source_sha256: row.source_kind === "online_menu" ? (row.source_sha256 ?? null) : null,
      menu_item: row.source_kind === "online_menu" ? (row.menu_item ?? null) : null,
    },
  };
}

export const SELECT_PUBLIC = `SELECT p.*, s.source_url, s.source_checked_on, s.source_sha256, s.menu_item
  FROM mobile_prices_current p LEFT JOIN mobile_menu_sources s ON p.source_id=s.id`;
export const currentPrice = (env: Env, key: MobilePriceKey) =>
  env.DB.prepare(`SELECT * FROM mobile_prices_current WHERE ${PRICE_PK}`)
    .bind(...keyValues(key))
    .first<MobilePriceDb>();

/** GBP guardrails are native pound amounts, not converted euro prices. */
const GBP_BOUNDS: Record<string, readonly [number, number]> = {
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
export function amountInRange(drink: string, currency: Currency, amount: number): boolean {
  const bounds = currency === "GBP" ? GBP_BOUNDS[drink] : undefined;
  const original = findDrink(drink);
  const lo = bounds?.[0] ?? original?.min,
    hi = bounds?.[1] ?? original?.max;
  return lo !== undefined && hi !== undefined && amount >= lo && amount <= hi;
}

// All mutations recheck blocks in SQL, so a moderation decision racing a request wins.
export const UNBLOCKED = `NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?1)
  AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?1)
  AND NOT EXISTS (SELECT 1 FROM prices_current WHERE venue_key=?1)
  AND NOT EXISTS (SELECT 1 FROM price_obs WHERE venue_key=?1)`;
export function customerStatements(
  env: Env,
  key: MobilePriceKey,
  value: {
    cell: string;
    amount: number;
    day: string;
    status: "active" | "quarantined";
    revision: string;
    previousRevision: string | null;
    changedAt: string;
  },
): D1PreparedStatement[] {
  const values = [
    ...keyValues(key),
    value.cell,
    value.amount,
    value.day,
    value.status,
    value.revision,
    value.previousRevision,
    value.changedAt,
  ];
  return [
    env.DB.prepare(
      `INSERT INTO mobile_prices_current
    (venue_key,drink,hh,currency,serving_key,cell,amount_minor,observed_on,confirmed_on,confirmations,status,source_kind,source_id,revision,changed_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,NULL,0,?9,'customer',NULL,?10,?12
    WHERE ${UNBLOCKED}
      AND ((SELECT COUNT(*) FROM mobile_prices_current WHERE venue_key=?1)<100
        OR EXISTS (SELECT 1 FROM mobile_prices_current WHERE ${PRICE_PK}))
    ON CONFLICT (venue_key,drink,hh,currency,serving_key) DO UPDATE SET
      cell=excluded.cell, amount_minor=excluded.amount_minor, observed_on=excluded.observed_on,
      confirmed_on=NULL, confirmations=0, status=excluded.status, source_kind='customer', source_id=NULL,
      revision=excluded.revision, changed_at=excluded.changed_at
    WHERE mobile_prices_current.status NOT IN ('review','removed') AND mobile_prices_current.revision=?11
      AND ${UNBLOCKED} RETURNING status`,
    ).bind(...values),
    env.DB.prepare(
      `INSERT INTO mobile_price_obs
      (venue_key,drink,hh,currency,serving_key,amount_minor,observed_on,source_kind,source_id,status,revision,changed_at)
      SELECT venue_key,drink,hh,currency,serving_key,amount_minor,observed_on,source_kind,source_id,status,revision,changed_at
      FROM mobile_prices_current WHERE ${PRICE_PK} AND revision=?6`,
    ).bind(...keyValues(key), value.revision),
  ];
}

export function confirmationStatements(
  env: Env,
  key: MobilePriceKey,
  revision: string,
  day: string,
  blockers: string[],
  claims: string[],
): D1PreparedStatement[] {
  const slots = blockers.map((_, index) => `?${String(index + 8)}`).join(",");
  return [
    env.DB.prepare(
      `UPDATE mobile_prices_current SET confirmations=confirmations+1,
      confirmed_on=max(coalesce(confirmed_on,?7),?7), status=CASE WHEN status='quarantined' THEN 'active' ELSE status END
      WHERE ${PRICE_PK} AND revision=?6 AND status IN ('active','quarantined') AND ${UNBLOCKED}
      AND NOT EXISTS (SELECT 1 FROM dedup WHERE k IN (${slots})) RETURNING confirmations`,
    ).bind(...keyValues(key), revision, day, ...blockers),
    ...claims.map((claim) => claimStatement(env.DB, claim, day)),
  ];
}

const Seed = z.strictObject({
  batch_id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  catalog_version: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  venue: MobileVenueKey,
  cell: MobileCell,
  drink: MobileDrink,
  hh: z.union([z.literal(0), z.literal(1)]),
  currency: MobileCurrency,
  serving: Serving,
  amount_minor: z.number().int().min(1).max(100_000),
  source_url: HTTPS,
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source_checked_on: EvidenceDay,
  menu_item: z.string().min(1).max(240),
});
export type TrustedMobileSeed = z.infer<typeof Seed>;

/** Trusted deploy/import adapter only. No HTTP route invokes this function. No arbitrary source claims are accepted from customers. */
export async function seedMobileMenuPrice(
  env: Env,
  input: TrustedMobileSeed,
): Promise<"inserted" | "skipped"> {
  const value = Seed.safeParse(input);
  if (!value.success) throw new ApiError("bad_request");
  const seed = value.data;
  const { catalog, venue } = await resolveMobileVenue(env, seed.venue, seed.cell);
  if (
    catalog.version !== seed.catalog_version ||
    venue.currency !== seed.currency ||
    !validServing(seed.drink, seed.serving) ||
    !amountInRange(seed.drink, seed.currency, seed.amount_minor)
  )
    throw new ApiError("bad_request");
  const key: MobilePriceKey = seed;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(seed)),
  );
  const id = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const revision = crypto.randomUUID();
  const at = new Date().toISOString();
  const safe = `${UNBLOCKED}
    AND (SELECT COUNT(*) FROM mobile_prices_current WHERE venue_key=?1)<100
    AND NOT EXISTS (SELECT 1 FROM mobile_prices_current WHERE ${PRICE_PK})
    AND NOT EXISTS (SELECT 1 FROM mobile_price_obs WHERE ${PRICE_PK})
    AND NOT EXISTS (SELECT 1 FROM mobile_price_reports WHERE venue_key=?1)
    AND NOT EXISTS (SELECT 1 FROM prices_current WHERE venue_key=?1)
    AND NOT EXISTS (SELECT 1 FROM price_obs WHERE venue_key=?1)
    AND NOT EXISTS (SELECT 1 FROM reports WHERE venue_key=?1)`;
  const [, inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO mobile_menu_sources
      (venue_key,drink,hh,currency,serving_key,id,batch_id,manifest_sha256,catalog_version,amount_minor,source_url,source_sha256,source_checked_on,menu_item)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14 WHERE ${safe}`,
    ).bind(
      ...keyValues(key),
      id,
      seed.batch_id,
      seed.manifest_sha256,
      seed.catalog_version,
      seed.amount_minor,
      seed.source_url,
      seed.source_sha256,
      seed.source_checked_on,
      seed.menu_item,
    ),
    env.DB.prepare(
      `INSERT INTO mobile_prices_current
      (venue_key,drink,hh,currency,serving_key,cell,amount_minor,observed_on,confirmed_on,confirmations,status,source_kind,source_id,revision,changed_at)
      SELECT ?1,?2,?3,?4,?5,?6,amount_minor,NULL,NULL,0,'active','online_menu',id,?8,?9 FROM mobile_menu_sources
      WHERE id=?7 AND ${safe} RETURNING venue_key`,
    ).bind(...keyValues(key), seed.cell, id, revision, at),
    env.DB.prepare(
      `INSERT INTO mobile_price_obs
      (venue_key,drink,hh,currency,serving_key,amount_minor,observed_on,source_kind,source_id,status,revision,changed_at)
      SELECT venue_key,drink,hh,currency,serving_key,amount_minor,observed_on,source_kind,source_id,status,revision,changed_at
      FROM mobile_prices_current WHERE ${PRICE_PK} AND revision=?6`,
    ).bind(...keyValues(key), revision),
  ]);
  return inserted?.meta.changes === 1 ? "inserted" : "skipped";
}
