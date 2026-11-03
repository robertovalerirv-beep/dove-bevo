import { z } from "zod";
import type { Venue } from "@site/app/lib/data";

const Key = z.string().regex(/^(?:[nwru][1-9]\d{0,14}|m[0-9a-f]{24})$/);
const Cell = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
const Id = z.string().min(1).max(128);
const Cursor = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Currency = z.string().regex(/^[A-Z]{3}$/);
const Https = z
  .string()
  .max(2048)
  .refine((value) => {
    for (const char of value)
      if (char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash;
    } catch {
      return false;
    }
  });
const Source = z.object({
  id: Id,
  url: Https,
  text_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  checked_on: Day,
});
const VenueSchema = z.object({
  key: Key,
  cell: Cell,
  name: z.string().min(2).max(512),
  kind: z.number().int().min(0).max(4),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: z.string().max(512).nullable(),
  city: z.string().min(2).max(200).nullable(),
  country: z.string().regex(/^[A-Z]{2}$/),
});
const Offer = z.object({
  id: Id,
  name: z.string().min(1).max(512),
  category: z
    .string()
    .regex(/^[a-z_]{2,32}$/)
    .nullable(),
  serving: z.object({
    label: z.string().min(1).max(256).nullable(),
    ml: z.number().int().min(1).max(100000).nullable(),
  }),
  amount_minor: z.number().int().min(1).max(100000000),
  currency: Currency,
  currency_exponent: z.number().int().min(0).max(3),
  context: z.object({
    kind: z.enum(["regular", "happy_hour", "conditional"]),
    condition: z.string().min(1).max(500).nullable(),
  }),
  source: Source,
});
const Fee = z
  .object({
    id: Id,
    label: z.string().min(1).max(512),
    kind: z.enum(["fixed", "percent"]),
    basis: z.enum(["person", "table", "bill", "unspecified"]),
    amount_minor: z.number().int().min(1).max(100000000).nullable(),
    currency: Currency.nullable(),
    currency_exponent: z.number().int().min(0).max(3).nullable(),
    rate_bps: z.number().int().min(1).max(10000).nullable(),
    applicability: z.enum(["all_orders", "conditional", "unknown"]),
    condition: z.string().min(1).max(500).nullable(),
    source: Source,
  })
  .refine((fee) =>
    fee.kind === "fixed"
      ? fee.amount_minor !== null &&
        fee.currency !== null &&
        fee.currency_exponent !== null &&
        fee.rate_bps === null
      : fee.amount_minor === null &&
        fee.currency === null &&
        fee.currency_exponent === null &&
        fee.rate_bps !== null,
  );
const FeeCoverage = z.object({
  status: z.enum(["unknown", "documented_partial", "explicit_no_fee"]),
  source: Source.nullable(),
});
const MenuPageSchema = z.object({
  schema_version: z.literal(2),
  coverage: z.object({
    complete: z.literal(false),
    basis: z.literal("verified_source_items_only"),
  }),
  price_scope: z.literal("menu_item_only"),
  venue: VenueSchema,
  stored_offer_count: z.number().int().min(0),
  offers: z.array(Offer).max(100),
  next_after: Cursor.nullable(),
  fees: z.array(Fee).max(100),
  fee_coverage: FeeCoverage,
});
export type MenuPage = z.infer<typeof MenuPageSchema>;
export type MenuOffer = MenuPage["offers"][number];
export type MenuFee = MenuPage["fees"][number];
export type MenuVenue = MenuPage["venue"];

async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Invalid menu response");
  const body = await response.text();
  if (body.length > 1024 * 1024) throw new Error("Menu response too large");
  return JSON.parse(body) as unknown;
}

export async function loadMenuPage(
  key: string,
  cell: string,
  after: string | null,
  signal: AbortSignal,
): Promise<MenuPage | null> {
  if (
    !Key.safeParse(key).success ||
    !Cell.safeParse(cell).success ||
    (after && !Cursor.safeParse(after).success)
  )
    throw new Error("Invalid menu identity");
  const params = new URLSearchParams({ cell, limit: "100" });
  if (after) params.set("after", after);
  const response = await fetch(`/api/mobile/v2/menu/venues/${encodeURIComponent(key)}?${params}`, {
    cache: "no-store",
    signal,
  });
  // During the additive rollout, the old Worker has no v2 route.
  if (response.status === 404) return null;
  const page = MenuPageSchema.parse(await json(response));
  if (
    page.venue.key !== key ||
    page.venue.cell !== cell ||
    (page.next_after !== null &&
      (page.next_after !== page.offers.at(-1)?.id || page.next_after === after))
  )
    throw new Error("Menu identity mismatch");
  const ids = page.offers.map((offer) => offer.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate menu offers");
  return page;
}

export function mobileMenuVenue(row: MenuVenue): Venue {
  return {
    key: row.key,
    name: row.name,
    kind: row.kind as Venue["kind"],
    lat: row.lat,
    lon: row.lon,
    addr: row.address ?? "",
    city: row.city ?? "",
    cell: row.cell,
    prices: [],
    pending: false,
    verified: false,
  };
}

export function menuMoney(amount: number, currency: string, exponent: number): string {
  const value = amount / 10 ** exponent;
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(value);
  } catch {
    return `${value.toFixed(exponent)} ${currency}`;
  }
}
