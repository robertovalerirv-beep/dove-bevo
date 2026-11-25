// Pages for search engines and AI assistants (ADR 0025). The SPA is an empty shell for a crawler
// that does not run JavaScript: for the home, /copertura, the main cities and a bar page the Worker
// adds title, description, JSON-LD and a plain-text version of the content to the same HTML.
// Everything here is built from PUBLIC bars only (not hidden, approved if proposed by a user), and
// every dynamic value is escaped where it enters HTML or JSON-LD.
import { it } from "../../app/i18n/it";
import { formatDate, formatPrice } from "../../app/lib/format";
import type { CellPrices, Place } from "../../shared/api-types";
import { APP_NAME, TIER_MIN_PRICES } from "../../shared/config";
import { medianOf } from "../../shared/prices";
import { searchKey, VENUE_KEY_PATTERN } from "../../shared/venue";
import { SEO_CITIES, SEO_LIMITS, type SeoCitySlug } from "../config";
import {
  getCellSnapshot,
  getSeoBars,
  getSeoCity,
  getSeoVenue,
  getUserVenueNames,
  type SeoBarRow,
  type SeoPriceRow,
} from "./db";
import { cellFile, placesFile } from "./venues";
import { seoText } from "../seo-texts";

// ---- Escaping (SEO rule S1) ----

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
/** Text or attribute value for HTML. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

const BACKSLASH = String.fromCharCode(92);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * JSON-LD for a <script> block: serialised once, then "<" (which would allow "</script>" or "<!--")
 * and the two line separators become JSON unicode escapes. Escaping the strings before
 * JSON.stringify would escape the backslash again and show the escape as text, so it is done on the
 * serialised JSON, where those characters can only be inside strings.
 */
export const jsonLdScript = (data: unknown): string => {
  const json = JSON.stringify(data)
    .replaceAll("<", `${BACKSLASH}u003c`)
    .replaceAll(LINE_SEPARATOR, `${BACKSLASH}u2028`)
    .replaceAll(PARAGRAPH_SEPARATOR, `${BACKSLASH}u2029`);
  return `<script type="application/ld+json">${json}</script>`;
};

// ---- Page model ----

export interface SeoPage {
  title: string;
  description: string;
  /** Absolute canonical URL. */
  canonical: string;
  /** Structured data blocks (schema.org). */
  jsonLd: unknown[];
  /** The content as plain HTML for a crawler without JavaScript; already escaped. */
  html: string;
}

export type PageType =
  | { type: "home" }
  | { type: "coverage" }
  | { type: "city"; slug: SeoCitySlug }
  | { type: "venue"; key: string };

/** Which pages get the SEO treatment; /admin and /api/* never do (SEO rule S6). */
export function detectPageType(path: string): PageType | null {
  if (path === "/") return { type: "home" };
  if (path === "/copertura") return { type: "coverage" };
  const venue = /^\/bar\/([^/]+)$/.exec(path)?.[1];
  if (venue) return VENUE_KEY_PATTERN.test(venue) ? { type: "venue", key: venue } : null;
  const slug = /^\/([a-z]+)$/.exec(path)?.[1];
  return slug && slug in SEO_CITIES ? { type: "city", slug: slug as SeoCitySlug } : null;
}

// ---- Small caches (per isolate) ----

const ttl = SEO_LIMITS.memSeconds * 1000;
const memory = new Map<string, { value: unknown; expires: number }>();
/** `undefined` = nothing stored; `null` is a stored "no page here" (a bar without prices is not looked up again for a while). */
export function memGet(key: string): unknown {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expires > Date.now()) return entry.value;
  memory.delete(key);
  return undefined;
}
export function memSet(key: string, value: unknown): void {
  memory.delete(key);
  memory.set(key, { value, expires: Date.now() + ttl });
  if (memory.size > 100) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}
/** Test hook: forgets every stored page. */
export const resetSeoMemory = (): void => {
  memory.clear();
};

/** places.json by place id and by name key: parsed once per isolate and data version. */
let places: { version: string; byId: Map<number, string>; byKey: Map<string, number[]> } | null =
  null;
export async function placeIndex(env: Env) {
  const cached = places;
  if (cached?.version === env.DATA_VERSION) return cached;
  const rows: Place[] = await placesFile(env);
  const byId = new Map<number, string>();
  const byKey = new Map<string, number[]>();
  for (const [id, name] of rows) {
    byId.set(id, name);
    const key = searchKey(name);
    byKey.set(key, [...(byKey.get(key) ?? []), id].slice(0, 5));
  }
  const built = { version: env.DATA_VERSION, byId, byKey };
  if (rows.length > 0) places = built;
  return built;
}

interface Named {
  name: string;
  addr: string;
  city: string;
}
/** Files read at the same time, and values one D1 statement can bind. */
const CELL_FETCHES = 8;
const D1_MAX_BINDS = 100;
const cellNames = new Map<string, Map<string, Named>>();
async function namesOfCell(env: Env, cell: string): Promise<Map<string, Named>> {
  const id = `${env.DATA_VERSION}/${cell}`;
  const hit = cellNames.get(id);
  if (hit) return hit;
  const file = await cellFile(env, cell);
  const names = new Map<string, Named>();
  for (const v of file?.v ?? [])
    names.set(v[0], { name: v[1], addr: v[5], city: file?.c[v[6]]?.[1] ?? "" });
  if (names.size === 0) return names; // no file, or a failed read: asked again next time
  if (cellNames.size >= SEO_LIMITS.hubNameCells) {
    const oldest = cellNames.keys().next().value;
    if (oldest !== undefined) cellNames.delete(oldest);
  }
  cellNames.set(id, names);
  return names;
}

/**
 * Names (and addresses) of bars: OSM ones from their cell file, user ones from D1. At most
 * `maxCells` files are opened, the ones with the most bars asked for: parsing a file costs
 * CPU time, and a bar whose name is not found is simply left out of the page.
 */
export async function resolveNames(
  env: Env,
  items: readonly { key: string; cell: string }[],
  maxCells: number = SEO_LIMITS.nameCells,
): Promise<Map<string, Named>> {
  const perCell = new Map<string, number>();
  for (const { key, cell } of items)
    if (!key.startsWith("u")) perCell.set(cell, (perCell.get(cell) ?? 0) + 1);
  const cells = [...perCell]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCells)
    .map(([cell]) => cell);
  const out = new Map<string, Named>();
  const wanted = new Set(items.map((i) => i.key));
  for (let i = 0; i < cells.length; i += CELL_FETCHES)
    for (const names of await Promise.all(
      cells.slice(i, i + CELL_FETCHES).map((cell) => namesOfCell(env, cell)),
    ))
      for (const [key, named] of names) if (wanted.has(key)) out.set(key, named);
  const userIds = [...wanted].filter((k) => k.startsWith("u")).map((k) => Number(k.slice(1)));
  for (let i = 0; i < userIds.length; i += D1_MAX_BINDS)
    for (const [key, name] of await getUserVenueNames(env.DB, userIds.slice(i, i + D1_MAX_BINDS)))
      out.set(key, { name, addr: "", city: "" });
  return out;
}

// ---- Labels ----

export const drinkLabel = (drink: string, hh: number): string =>
  [it.drinks[drink] ?? drink, hh ? `(${seoText.hh})` : ""].filter(Boolean).join(" ");

/** "7.50": the decimal point of schema.org prices. */
const schemaPrice = (cents: number): string => (cents / 100).toFixed(2);

const offer = (r: SeoPriceRow) => ({
  "@type": "Offer",
  name: drinkLabel(r.drink, r.hh),
  price: schemaPrice(r.price_cents),
  priceCurrency: "EUR",
});

const barUrl = (origin: string, key: string, cell: string) => `${origin}/bar/${key}?c=${cell}`;
const barHref = (key: string, cell: string) => `/bar/${key}?c=${cell}`;
const attribution = `<p>${escapeHtml(seoText.osm)}</p><p><a href="/">${escapeHtml(seoText.more)}</a></p>`;

// ---- Links to the bars (ADR 0053) ----

const barLink = (key: string, cell: string, name: string, addr: string) =>
  `<li><a href="${escapeHtml(barHref(key, cell))}">${escapeHtml(name)}</a>${
    addr ? ` (${escapeHtml(addr)})` : ""
  }</li>`;

/** The bar is missing from the file of its cell, which was read: gone from OSM (SPEC 5.1). */
function isGone(env: Env, bar: { venue_key: string; cell: string }): boolean {
  const names = cellNames.get(`${env.DATA_VERSION}/${bar.cell}`);
  return !bar.venue_key.startsWith("u") && names !== undefined && !names.has(bar.venue_key);
}

/** Leaves out the bars that are gone, as far as a page may open files: no sitemap entry for them. */
export async function withoutGone<T extends { venue_key: string; cell: string }>(
  env: Env,
  bars: readonly T[],
): Promise<T[]> {
  const osm = bars.filter((b) => !b.venue_key.startsWith("u"));
  await resolveNames(
    env,
    osm.map((b) => ({ key: b.venue_key, cell: b.cell })),
    SEO_LIMITS.hubNameCells,
  );
  return bars.filter((b) => !isGone(env, b));
}

/**
 * One link per bar, by key. A bar whose cell file was not opened (too many of them) is linked without
 * its name, so it is never left out; one that is missing from its own file is gone from OSM and is.
 */
async function barLinks(
  env: Env,
  bars: readonly SeoBarRow[],
  cityOf: (bar: SeoBarRow) => string | null,
): Promise<Map<string, string>> {
  const names = await resolveNames(
    env,
    bars.map((b) => ({ key: b.venue_key, cell: b.cell })),
    SEO_LIMITS.hubNameCells,
  );
  const out = new Map<string, string>();
  for (const b of bars) {
    const named = names.get(b.venue_key);
    if (!isGone(env, b))
      out.set(
        b.venue_key,
        barLink(
          b.venue_key,
          b.cell,
          named?.name ?? seoText.unnamedBar(cityOf(b)),
          named?.addr ?? "",
        ),
      );
  }
  return out;
}

/**
 * The bars a city page lists: those of its place and the user bars (which have no city) of the cells
 * where the place has bars. /copertura lists the others, so together they reach every bar.
 */
function barsOfCity(bars: readonly SeoBarRow[], ids: readonly number[]): SeoBarRow[] {
  const here = (b: SeoBarRow) => b.city !== null && ids.includes(b.city);
  const cells = new Set(bars.filter(here).map((b) => b.cell));
  return bars.filter((b) => here(b) || (b.city === null && cells.has(b.cell)));
}

// ---- Pages ----

export function buildHome(origin: string): SeoPage {
  const cities = Object.entries(SEO_CITIES);
  const html =
    `<h1>${escapeHtml(seoText.homeH1)}</h1><p>${escapeHtml(seoText.homeIntro)}</p>` +
    `<h2>${escapeHtml(seoText.homeCities)}</h2><ul>${cities
      .map(
        ([slug, name]) => `<li><a href="/${slug}">${escapeHtml(seoText.cityLink(name))}</a></li>`,
      )
      .join("")}</ul><a href="/copertura">${escapeHtml(seoText.coverageH1)}</a>` +
    `<h2>FAQ</h2>${seoText.faq
      .map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`)
      .join("")}` +
    attribution;
  return {
    title: seoText.homeTitle,
    description: seoText.homeDescription,
    canonical: `${origin}/`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: APP_NAME,
        url: `${origin}/`,
        description: seoText.homeDescription,
        inLanguage: "it-IT",
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: seoText.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    html,
  };
}

/** The drinks a city page summarises: the ones people ask the price of. */
const CITY_DRINKS: readonly string[] = ["beer_draft", "spritz", "gin_tonic"];
const CHEAPEST_PER_DRINK = 5;

export async function buildCity(
  env: Env,
  origin: string,
  slug: SeoCitySlug,
): Promise<SeoPage | null> {
  const city = SEO_CITIES[slug];
  const ids = (await placeIndex(env)).byKey.get(slug) ?? [];
  if (ids.length === 0) return null;
  const { bars, prices, rows } = await getSeoCity(env.DB, ids, 3000);

  // The cells with the most prices: their bars are named and listed (names cost CPU, see resolveNames).
  const perCell = new Map<string, number>();
  for (const r of rows) perCell.set(r.cell, (perCell.get(r.cell) ?? 0) + 1);
  const topCells = new Set(
    [...perCell]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SEO_LIMITS.nameCells)
      .map(([cell]) => cell),
  );
  const local = rows.filter((r) => topCells.has(r.cell));
  const names = await resolveNames(
    env,
    local.map((r) => ({ key: r.venue_key, cell: r.cell })),
  );

  const sections: string[] = [];
  const listed = new Map<string, { row: SeoPriceRow; offers: SeoPriceRow[] }>();
  for (const drink of CITY_DRINKS) {
    const all = rows.filter((r) => r.drink === drink);
    if (all.length === 0) continue;
    const label = drinkLabel(drink, 0);
    const cents = all.map((r) => r.price_cents);
    const cheapest = local
      .filter((r) => r.drink === drink && names.has(r.venue_key))
      .slice(0, CHEAPEST_PER_DRINK);
    for (const r of cheapest) {
      const entry = listed.get(r.venue_key) ?? { row: r, offers: [] };
      entry.offers.push(r);
      listed.set(r.venue_key, entry);
    }
    sections.push(
      `<h2>${escapeHtml(label)}</h2><p>${escapeHtml(
        seoText.cityDrink(
          label,
          formatPrice(medianOf(cents)),
          formatPrice(Math.min(...cents)),
          formatPrice(Math.max(...cents)),
          all.length,
        ),
      )}</p>` +
        `<h3>${escapeHtml(seoText.cityCheapest(label))}</h3><ol>${cheapest
          .map((r) => {
            const named = names.get(r.venue_key);
            return `<li><a href="${escapeHtml(barHref(r.venue_key, r.cell))}">${escapeHtml(
              named?.name ?? "",
            )}</a>${named?.addr ? ` (${escapeHtml(named.addr)})` : ""}: ${escapeHtml(
              formatPrice(r.price_cents),
            )} — ${escapeHtml(formatDate(r.observed_on))}</li>`;
          })
          .join("")}</ol>`,
    );
  }

  const items = [...listed.values()].slice(0, SEO_LIMITS.barsPerPage).map(({ row, offers }, i) => {
    const named = names.get(row.venue_key);
    return {
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "BarOrPub",
        name: named?.name ?? "",
        url: barUrl(origin, row.venue_key, row.cell),
        address: {
          "@type": "PostalAddress",
          ...(named?.addr ? { streetAddress: named.addr } : {}),
          addressLocality: city,
          addressCountry: "IT",
        },
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Prezzi",
          itemListElement: offers.map(offer),
        },
      },
    };
  });

  // Every bar with a price, once, so a crawler reaches the bar pages from the city and not only from the
  // sitemap (ADR 0046): all of them, with no limit that a growing city crosses (ADR 0053).
  const everyBar = barsOfCity(await getSeoBars(env.DB, SEO_LIMITS.sitemapUrls), ids).slice(
    0,
    SEO_LIMITS.hubLinks,
  );
  const allBars = [...(await barLinks(env, everyBar, () => city)).values()].join("");

  const html =
    `<h1>${escapeHtml(seoText.cityH1(city))}</h1>` +
    `<p>${escapeHtml(bars > 0 ? seoText.cityIntro(city, bars, prices) : seoText.cityEmpty(city))}</p>` +
    sections.join("") +
    (allBars ? `<h2>${escapeHtml(seoText.cityAllBars)}</h2><ul>${allBars}</ul>` : "") +
    attribution;
  return {
    title: seoText.cityTitle(city),
    description: seoText.cityDescription(city, bars),
    canonical: `${origin}/${slug}`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: seoText.cityH1(city),
        itemListElement: items,
      },
    ],
    html,
  };
}

export async function buildVenue(env: Env, origin: string, key: string): Promise<SeoPage | null> {
  const { rows, userName } = await getSeoVenue(env.DB, key, SEO_LIMITS.barsPerPage);
  const first = rows[0];
  if (!first) return null; // no active price, hidden or not approved: nothing to say about it
  const inCell = await namesOfCell(env, first.cell);
  const named = userName ? { name: userName, addr: "", city: "" } : inCell.get(key);
  if (!named) {
    // No names at all: the file could not be read, which is not a bar that is gone.
    if (inCell.size === 0) throw new Error("cell file missing");
    return null;
  }
  // The zone, from the snapshot of the cell (one row, ADR 0020): its public prices and user bars.
  const zone = JSON.parse(await getCellSnapshot(env.DB, first.cell)) as CellPrices;
  const active = zone.p.filter((p) => p[6] === 0);
  const zoneMedian = (drink: string): number | null => {
    const cents = active.filter((p) => p[1] === drink && p[2] === 0).map((p) => p[3]);
    return cents.length >= TIER_MIN_PRICES ? medianOf(cents) : null; // D-12
  };
  const userNames = new Map(zone.u.map((u) => [u[0], u[1]]));
  // The bars after this one by key, then those from the start: the pages of a crowded cell form a ring,
  // so each bar is linked by the ones before it, however many they are.
  const keys = [...new Set([...active.map((p) => p[0]), key])].sort();
  const at = keys.indexOf(key);
  const nearby = [...keys.slice(at + 1), ...keys.slice(0, at)]
    .flatMap((k) => {
      const name = userNames.get(k) ?? inCell.get(k)?.name;
      return name ? [barLink(k, first.cell, name, inCell.get(k)?.addr ?? "")] : [];
    })
    .slice(0, SEO_LIMITS.barsPerPage)
    .join("");
  const citySlug = searchKey(named.city);
  const lastDay = rows.reduce((day, r) => (r.observed_on > day ? r.observed_on : day), "");
  const summary = rows
    .slice(0, 3)
    .map((r) => `${drinkLabel(r.drink, r.hh)} ${formatPrice(r.price_cents)}`)
    .join(", ");
  const html =
    `<h1>${escapeHtml(seoText.venueH1(named.name))}</h1>` +
    (named.addr || named.city
      ? `<p>${escapeHtml([named.addr, named.city].filter(Boolean).join(", "))}</p>`
      : "") +
    `<p>${escapeHtml(seoText.venueIntro)}</p><ul>${rows
      .map((r) => {
        const median = r.hh ? null : zoneMedian(r.drink);
        const zoneText = median === null ? "" : `, ${seoText.venueZone(formatPrice(median))}`;
        return `<li>${escapeHtml(
          `${drinkLabel(r.drink, r.hh)}: ${formatPrice(r.price_cents)} (${formatDate(r.observed_on)})${zoneText}`,
        )}</li>`;
      })
      .join("")}</ul><p>${escapeHtml(seoText.venueLast(formatDate(lastDay)))}</p>` +
    (nearby ? `<h2>${escapeHtml(seoText.venueNearby)}</h2><ul>${nearby}</ul>` : "") +
    (citySlug in SEO_CITIES
      ? `<p><a href="/${citySlug}">${escapeHtml(seoText.cityLink(named.city))}</a></p>`
      : "") +
    `<p><a href="/copertura">${escapeHtml(seoText.coverageH1)}</a></p>` +
    attribution;
  return {
    title: seoText.venueTitle(named.name, named.city),
    description: seoText.venueDescription(named.name, named.city, summary),
    canonical: barUrl(origin, key, first.cell),
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BarOrPub",
        name: named.name,
        url: barUrl(origin, key, first.cell),
        ...(named.addr || named.city
          ? {
              address: {
                "@type": "PostalAddress",
                ...(named.addr ? { streetAddress: named.addr } : {}),
                ...(named.city ? { addressLocality: named.city } : {}),
                addressCountry: "IT",
              },
            }
          : {}),
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Prezzi",
          itemListElement: rows.map(offer),
        },
      },
    ],
    html,
  };
}

export async function buildCoveragePage(env: Env, origin: string): Promise<SeoPage> {
  const [bars, index] = await Promise.all([
    getSeoBars(env.DB, SEO_LIMITS.sitemapUrls),
    placeIndex(env),
  ]);
  // What the city pages list already is not repeated here: their page is linked instead.
  const slugOf = new Map<number, string>();
  const listed = new Set<string>();
  for (const slug of Object.keys(SEO_CITIES)) {
    const ids = index.byKey.get(slug) ?? [];
    for (const id of ids) slugOf.set(id, slug);
    for (const b of barsOfCity(bars, ids)) listed.add(b.venue_key);
  }
  const others = bars.filter((b) => !listed.has(b.venue_key)).slice(0, SEO_LIMITS.hubLinks);
  const cityName = (b: SeoBarRow) => (b.city === null ? null : (index.byId.get(b.city) ?? null));
  const links = await barLinks(env, others, cityName);
  // One group per place; the empty name holds the bars of no known place.
  const groups = new Map<number, { name: string; bars: number; prices: number; links: string }>();
  for (const b of bars) {
    const name = cityName(b) ?? "";
    const id = name && b.city !== null ? b.city : 0;
    const group = groups.get(id) ?? { name, bars: 0, prices: 0, links: "" };
    group.bars += 1;
    group.prices += b.prices;
    group.links += links.get(b.venue_key) ?? "";
    groups.set(id, group);
  }
  const elsewhere = groups.get(0)?.links ?? "";
  groups.delete(0);
  const lines = [...groups]
    .sort((a, b) => b[1].bars - a[1].bars || a[0] - b[0])
    .map(([id, g]) => {
      const text = escapeHtml(seoText.coverageLine(g.name, g.bars, g.prices));
      const slug = slugOf.get(id);
      return `<li>${slug ? `<a href="/${slug}">${text}</a>` : text}${
        g.links ? `<ul>${g.links}</ul>` : ""
      }</li>`;
    })
    .join("");
  return {
    title: seoText.coverageTitle,
    description: seoText.coverageDescription,
    canonical: `${origin}/copertura`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: seoText.coverageTitle,
        description: seoText.coverageDescription,
        inLanguage: "it-IT",
        url: `${origin}/copertura`,
        // Counts mix our price reports with OSM bars, so the OSM licence (ODbL) is the one to declare.
        license: "https://opendatacommons.org/licenses/odbl/1-0/",
        creator: { "@type": "Organization", name: APP_NAME, url: origin },
      },
    ],
    html:
      `<h1>${escapeHtml(seoText.coverageH1)}</h1><ul>${lines}</ul>` +
      (elsewhere ? `<h2>${escapeHtml(seoText.coverageElsewhere)}</h2><ul>${elsewhere}</ul>` : "") +
      attribution,
  };
}

export async function buildPage(env: Env, origin: string, page: PageType): Promise<SeoPage | null> {
  switch (page.type) {
    case "home":
      return buildHome(origin);
    case "coverage":
      return buildCoveragePage(env, origin);
    case "city":
      return buildCity(env, origin, page.slug);
    case "venue":
      return buildVenue(env, origin, page.key);
  }
}
