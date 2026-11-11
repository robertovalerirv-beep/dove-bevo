import { z } from "zod";
import { bestPrice, loadCell, type Venue } from "@site/app/lib/data";
import { currentLang } from "@site/app/i18n/lang";

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

const Category = z.string().regex(/^[a-z_]{2,32}$/);
const CellVenue = VenueSchema.extend({
  identity_url: Https,
  identity_kind: z.enum(["osm", "owner_verified"]),
  matching_offer_count: z.number().int().min(0),
  sample_offers: z.array(Offer).max(100),
  fee_coverage: FeeCoverage,
});
const CellPageSchema = z.object({
  schema_version: z.literal(2),
  coverage: z.object({
    complete: z.literal(false),
    basis: z.literal("verified_source_items_only"),
  }),
  price_scope: z.literal("menu_item_only"),
  cell: Cell,
  category: Category.nullable(),
  categories: z.array(Category).max(9).nullable(),
  venues: z.array(CellVenue).max(50),
  next_after: Key.nullable(),
  unresolved_venues: z.number().int().min(0),
});
type CellVenue = z.infer<typeof CellVenue>;
type WithMenu = Venue & { mobileMenuSamples?: MenuOffer[]; mobileMenuCount?: number };

async function cellPage(
  cell: string,
  categories: readonly string[],
  after: string | null,
  signal: AbortSignal,
): Promise<z.infer<typeof CellPageSchema> | null> {
  const params = new URLSearchParams();
  if (categories.length) params.set("categories", categories.join(","));
  if (after) params.set("after", after);
  const response = await fetch(`/api/mobile/v2/menu/cells/${cell}?${params}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 404) return null;
  const page = CellPageSchema.parse(await json(response));
  if (
    page.cell !== cell ||
    (page.categories ?? []).join(",") !== categories.join(",") ||
    (page.next_after !== null &&
      (page.next_after === after || (after !== null && page.next_after <= after)))
  )
    throw new Error("Menu cell identity mismatch");
  if (
    page.venues.some(
      (venue) =>
        venue.cell !== cell ||
        venue.sample_offers.some((offer) => !categories.includes(offer.category ?? "")),
    )
  )
    throw new Error("Menu cell offers mismatch");
  return page;
}

async function menuCellVenues(
  cell: string,
  categories: readonly string[],
): Promise<CellVenue[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 6000);
  try {
    const venues = new Map<string, CellVenue>();
    let after: string | null = null;
    for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
      const page = await cellPage(cell, categories, after, controller.signal);
      if (!page) return null;
      for (const venue of page.venues) {
        if (venues.has(venue.key)) throw new Error("Duplicate menu venue");
        venues.set(venue.key, venue);
      }
      if (!page.next_after) return [...venues.values()];
      after = page.next_after;
    }
    throw new Error("Menu cell pagination limit");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const mobileIdentityCache = new Map<string, Promise<CellVenue[] | null>>();
// Several selected-drink views can still be waiting on the same failed
// identity read. They must share its one recovery attempt, including a 503.
const mobileIdentityRetries = new WeakMap<
  Promise<CellVenue[] | null>,
  Promise<CellVenue[] | null>
>();
const mobileIdentityRecoveries = new WeakSet<Promise<CellVenue[] | null>>();
function menuIdentityVenues(cell: string): Promise<CellVenue[] | null> {
  let request = mobileIdentityCache.get(cell);
  if (!request) {
    request = menuCellVenues(cell, []);
    const current = request;
    mobileIdentityCache.set(cell, current);
    void current.then(
      (venues) => {
        if (venues === null && mobileIdentityCache.get(cell) === current)
          mobileIdentityCache.delete(cell);
      },
      () => {
        if (mobileIdentityCache.get(cell) === current) mobileIdentityCache.delete(cell);
      },
    );
  }
  return request;
}

function retryMenuIdentityVenues(
  cell: string,
  failedRequest: Promise<CellVenue[] | null>,
): Promise<CellVenue[] | null> {
  // A later selection may inherit a pending recovery. Its failure is already
  // the one allowed retry for this identity read, so it must not start another.
  if (mobileIdentityRecoveries.has(failedRequest)) return failedRequest;
  const shared = mobileIdentityRetries.get(failedRequest);
  if (shared) return shared;
  if (mobileIdentityCache.get(cell) === failedRequest) mobileIdentityCache.delete(cell);
  const retry = menuIdentityVenues(cell);
  mobileIdentityRecoveries.add(retry);
  mobileIdentityRetries.set(failedRequest, retry);
  return retry;
}

const mobileCellCache = new Map<string, Promise<Venue[]>>();

/** The legacy EUR price form has no m-key route; those venues use the app-only v2 form. */
export function legacyPriceVenues(venues: readonly Venue[]): Venue[] {
  return venues.filter((venue) => !venue.key.startsWith("m"));
}

/** Return the existing map as soon as its cell loads; add v2 pins when the menu arrives. */
export function loadMobileCell(cell: string, selectedDrinks: readonly string[]): Promise<Venue[]> {
  if (!Cell.safeParse(cell).success) return Promise.reject(new Error("Invalid cell"));
  const categories = [...new Set(selectedDrinks)].sort();
  if (categories.length > 9 || categories.some((code) => !Category.safeParse(code).success))
    return Promise.reject(new Error("Invalid selected drinks"));
  const cacheKey = `${cell}|${categories.join(",")}`;
  let request = mobileCellCache.get(cacheKey);
  if (!request) {
    const identityWasCached = mobileIdentityCache.has(cell);
    const identityRequest = menuIdentityVenues(cell);
    const sampleRequest = categories.length ? menuCellVenues(cell, categories) : identityRequest;
    // Attach rejection handlers before the legacy cell read can resolve. A fast
    // v2 503 must never surface as an unhandled browser error.
    let identityReady = false;
    let identityVenues: CellVenue[] | null = null;
    const identityResult = identityRequest.then(
      (venues) => {
        identityReady = true;
        identityVenues = venues;
        return venues;
      },
      () => {
        identityReady = true;
        return null;
      },
    );
    const sampleResult = sampleRequest.then(
      (venues) => venues,
      () => null,
    );
    request = loadCell(cell).then(
      (legacy) => {
        void sampleResult
          .then((filtered) => {
            let current = request;
            if (mobileCellCache.get(cacheKey) !== current) return;
            // A temporary v2 failure does not hold or erase legacy venues. Evict the
            // selection so a later map view retries the bounded menu request.
            if (filtered === null) {
              mobileCellCache.delete(cacheKey);
              return;
            }
            const publish = (identityVenues: CellVenue[] | null) => {
              if (mobileCellCache.get(cacheKey) !== current) return;
              // The selected-category response has a validated venue identity and
              // sourced prices. An unavailable full-menu read affects counts only.
              const venues = identityVenues ?? filtered;
              const counts = new Map(
                (identityVenues ?? []).map((venue) => [venue.key, venue.matching_offer_count]),
              );
              const samples = new Map(filtered.map((venue) => [venue.key, venue.sample_offers]));
              const merged = new Map<string, Venue>(
                legacy.map((venue) => [venue.key, { ...venue }]),
              );
              for (const row of [
                ...new Map([...venues, ...filtered].map((venue) => [venue.key, venue])).values(),
              ]) {
                if (row.country !== "IT") continue;
                const known = merged.get(row.key);
                if (!known && (row.identity_kind !== "owner_verified" || !row.key.startsWith("m")))
                  continue;
                const venue = known ?? mobileMenuVenue(row);
                merged.set(row.key, {
                  ...venue,
                  mobileMenuSamples: samples.get(row.key) ?? [],
                  mobileMenuCount: counts.get(row.key) ?? 0,
                } as WithMenu);
              }
              current = Promise.resolve([...merged.values()]);
              mobileCellCache.set(cacheKey, current);
              if (typeof window !== "undefined")
                window.dispatchEvent(
                  new CustomEvent("dovebevo:menu-cell-ready", { detail: { cell } }),
                );
            };
            // A selected response is already sourced and validated. Show it even
            // while an older all-drinks identity request is pending; only its
            // count and additional venue identities depend on that request.
            const initialIdentity = identityReady ? identityVenues : null;
            publish(initialIdentity);
            if (categories.length > 0)
              void identityResult
                .then(async (settled) => {
                  let all = settled;
                  if (all === null && identityWasCached)
                    try {
                      all = await retryMenuIdentityVenues(cell, identityRequest);
                    } catch {
                      all = null;
                    }
                  if (all !== null && all !== initialIdentity) publish(all);
                })
                .catch(() => {});
          })
          .catch(() => {
            if (mobileCellCache.get(cacheKey) === request) mobileCellCache.delete(cacheKey);
          });
        return legacy;
      },
      (error: unknown) => {
        if (mobileCellCache.get(cacheKey) === request) mobileCellCache.delete(cacheKey);
        throw error;
      },
    );
    mobileCellCache.set(cacheKey, request);
  }
  return request;
}
/** The unfiltered view counts real entries; a menu count is never a drink price. */
export function mobileAllCount(venue: Venue): { count: number; kind: "menu" | "reported" } | null {
  const menuCount = (venue as WithMenu).mobileMenuCount ?? 0;
  if (menuCount > 0) return { count: menuCount, kind: "menu" };
  const reportedCount = venue.prices.filter((row) => row[6] === 0).length;
  return reportedCount > 0 ? { count: reportedCount, kind: "reported" } : null;
}

/** A menu's smallest draft beer is not evidence of the selected "Birra media" price. */
export function isMediumDraftBeerServing(serving: MenuOffer["serving"]): boolean {
  // An explicit small or large label makes even a structured volume ambiguous.
  // Explicit quantities in the label and structured field must also agree.
  const label = serving.label?.normalize("NFKC").toLowerCase();
  if (label && /\b(?:piccola|piccolo|small|mini|grande|large|pinta|pint)\b/u.test(label))
    return false;
  const quantities = label ? [...label.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(ml|cl|lt|l)\b/gu)] : [];
  if (quantities.length > 1) return false;
  const quantity = quantities[0];
  let labelledMl: number | null = null;
  if (quantity) {
    const amount = quantity[1];
    const unit = quantity[2];
    if (!amount || !unit) return false;
    const value = Number(amount.replace(",", "."));
    labelledMl = unit === "l" || unit === "lt" ? value * 1000 : unit === "cl" ? value * 10 : value;
  }
  if (serving.ml !== null) {
    if (labelledMl !== null && Math.abs(labelledMl - serving.ml) > 1) return false;
    return serving.ml >= 400 && serving.ml <= 600;
  }
  if (!label) return false;
  if (labelledMl !== null) return labelledMl >= 400 && labelledMl <= 600;
  return /\b(?:media|medium)\b/u.test(label);
}

export function mobileMenuPin(venue: Venue, drinks: readonly string[]): string | null {
  if (drinks.length === 0) {
    const found = mobileAllCount(venue);
    if (!found) return null;
    const word =
      found.kind === "menu"
        ? found.count === 1
          ? "VOCE"
          : "VOCI"
        : found.count === 1
          ? "PREZZO"
          : "PREZZI";
    return `${String(found.count)} ${word}`;
  }
  const samples = (venue as WithMenu).mobileMenuSamples ?? [];
  for (const category of drinks) {
    const regular = samples.find(
      (offer) =>
        offer.category === category &&
        offer.context.kind === "regular" &&
        (category !== "beer_draft" || isMediumDraftBeerServing(offer.serving)),
    );
    if (regular)
      return `${menuMoney(regular.amount_minor, regular.currency, regular.currency_exponent)} MENU`;
  }
  return null;
}

export function mobileCoverage(venues: Venue[], drinks: readonly string[]) {
  return {
    withPrice: venues.filter((venue) => bestPrice(venue, drinks) || mobileMenuPin(venue, drinks))
      .length,
    total: venues.length,
  };
}

/** The selected drink is already named by the dropdown; keep the map count short. */
export function mobileCoverageText(withPrice: number, total: number): string {
  return currentLang() === "en"
    ? `${String(withPrice)}/${String(total)} with prices`
    : `${String(withPrice)}/${String(total)} con prezzo`;
}

/** Keep the map-start hint between the language and venue-list controls. */
export function mobileZoomHint(): string {
  return currentLang() === "en" ? "Zoom or search city" : "Avvicinati o cerca città";
}

export function invalidateMobileCell(cell: string): void {
  mobileIdentityCache.delete(cell);
  for (const key of mobileCellCache.keys())
    if (key.startsWith(`${cell}|`)) mobileCellCache.delete(key);
}
