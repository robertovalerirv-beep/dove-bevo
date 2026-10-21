// Discoverability for search engines and AI assistants (ADR 0025): robots.txt, llms.txt, sitemap.xml,
// the open JSON search for assistants, and the middleware that adds title, description, JSON-LD and a
// plain-text version of the page to the SPA shell. Only public data; never /api/admin/*.
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { SEO_CITIES, SEO_LIMITS } from "../config";
import { getAiRows, getSitemapRows, type SeoPriceRow } from "../lib/db";
import { romeDay } from "../lib/day";
import { apiError } from "../lib/errors";
import { hmacHex } from "../lib/hmac";
import { clientIp } from "../lib/quota";
import { readLimit } from "../lib/rate-limit";
import {
  buildPage,
  detectPageType,
  drinkLabel,
  escapeHtml,
  jsonLdScript,
  memGet,
  memSet,
  placeIndex,
  resolveNames,
  type PageType,
  type SeoPage,
} from "../lib/seo";
import { seoText } from "../seo-texts";
import { searchKey } from "../../shared/venue";
import type { AppEnv } from "../types";

type Ctx = Context<AppEnv>;

export const seo = new Hono<AppEnv>();

const TEXT = (body: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });

seo.get("/robots.txt", (c) => TEXT(seoText.robots(new URL(c.req.url).origin)));
seo.get("/llms.txt", (c) => TEXT(seoText.llms(new URL(c.req.url).origin)));

// Read-only resources: anything else is refused (SEO rule S10).
seo.on(["POST", "PUT", "PATCH", "DELETE"], ["/robots.txt", "/llms.txt", "/sitemap.xml"], () => {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
});

// ---- sitemap.xml ----

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
const entry = (loc: string, changefreq: string, priority: string) =>
  `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
const XML = (body: string, cache: string) =>
  new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": cache },
  });

seo.get("/sitemap.xml", readLimit, async (c) => {
  const url = new URL(c.req.url);
  const key = `sitemap:${url.host}`;
  const hot = memGet(key);
  if (typeof hot === "string") return XML(hot, "public, max-age=3600");
  try {
    const index = await placeIndex(c.env);
    const slugs = Object.keys(SEO_CITIES);
    const ids = slugs.flatMap((slug) => index.byKey.get(slug) ?? []);
    const room = SEO_LIMITS.sitemapUrls - slugs.length - 2;
    const { bars, cities } = await getSitemapRows(c.env.DB, room, ids);
    const withPrices = new Set(cities);
    const urls = [
      entry(`${url.origin}/`, "daily", "1.0"),
      entry(`${url.origin}/copertura`, "daily", "0.8"),
      ...slugs
        .filter((slug) => (index.byKey.get(slug) ?? []).some((id) => withPrices.has(id)))
        .map((slug) => entry(`${url.origin}/${slug}`, "daily", "0.9")),
      ...bars.map((b) => entry(`${url.origin}/bar/${b.venue_key}?c=${b.cell}`, "weekly", "0.6")),
    ].slice(0, SEO_LIMITS.sitemapUrls);
    const xml = `${XML_HEAD}${urls.join("\n")}\n</urlset>`;
    memSet(key, xml);
    return XML(xml, "public, max-age=3600");
  } catch {
    // D1 or the data files are unavailable: a sitemap with the home page, not cached.
    console.error(JSON.stringify({ code: "sitemap_failed" }));
    return XML(`${XML_HEAD}${entry(`${url.origin}/`, "daily", "1.0")}\n</urlset>`, "no-store");
  }
});

// ---- Open search for assistants: GET /api/ai/cerca ----

const AiSearch = z.strictObject({
  citta: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).max(SEO_LIMITS.aiMaxPage).default(1),
});

const CITY_ALIASES: Record<string, string> = {
  milan: "milano",
  rome: "roma",
  turin: "torino",
  naples: "napoli",
  florence: "firenze",
};

seo.on(["POST", "PUT", "PATCH", "DELETE"], "/api/ai/cerca", () => {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
});

seo.get("/api/ai/cerca", readLimit, async (c) => {
  const params = AiSearch.safeParse(c.req.query());
  if (!params.success) return apiError(c, "bad_request");
  const cached = await caches.default.match(c.req.raw);
  if (cached) return new Response(cached.body, cached);

  const { citta, page } = params.data;
  const index = await placeIndex(c.env);
  const wanted = citta ? searchKey(citta) : null;
  const ids = wanted ? (index.byKey.get(CITY_ALIASES[wanted] ?? wanted) ?? []) : null;
  try {
    const rows: SeoPriceRow[] =
      ids && ids.length === 0
        ? []
        : await getAiRows(c.env.DB, ids, SEO_LIMITS.aiPerPage, (page - 1) * SEO_LIMITS.aiPerPage);
    const names = await resolveNames(
      c.env,
      rows.map((r) => ({ key: r.venue_key, cell: r.cell })),
    );
    const bars = new Map<string, { bar: object; prezzi: object[] }>();
    for (const r of rows) {
      const named = names.get(r.venue_key);
      const found = bars.get(r.venue_key) ?? {
        bar: {
          chiave: r.venue_key,
          nome: named?.name ?? null,
          indirizzo: named?.addr || null,
          url: `${new URL(c.req.url).origin}/bar/${r.venue_key}?c=${r.cell}`,
        },
        prezzi: [],
      };
      found.prezzi.push({
        bevanda: drinkLabel(r.drink, 0),
        happy_hour: r.hh === 1,
        prezzo_eur: (r.price_cents / 100).toFixed(2),
        aggiornato: r.observed_on,
      });
      bars.set(r.venue_key, found);
    }
    const body = {
      citta: ids?.[0] === undefined ? (citta ?? null) : (index.byId.get(ids[0]) ?? citta ?? null),
      pagina: page,
      prossima_pagina:
        rows.length === SEO_LIMITS.aiPerPage && page < SEO_LIMITS.aiMaxPage ? page + 1 : null,
      nota: "Prezzi segnalati dagli utenti, dal più basso al più alto. I nomi dei bar vengono da OpenStreetMap (© OpenStreetMap contributors, ODbL); dove manca il nome, apri l'url.",
      bar: [...bars.values()].map((b) => ({ ...b.bar, prezzi: b.prezzi })),
    };
    const response = c.json(body, 200, {
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "index, follow",
    });
    c.executionCtx.waitUntil(caches.default.put(c.req.raw, response.clone()));
    return response;
  } catch {
    console.error(JSON.stringify({ code: "ai_search_failed" }));
    return apiError(c, "busy");
  }
});

// ---- Middleware: SEO tags and pre-rendered text in the SPA shell ----

const SEO_CACHE_URL = (key: string) => new Request(`https://seo.cache/${encodeURIComponent(key)}`);

async function edgeGet(key: string): Promise<SeoPage | null> {
  try {
    const hit = await caches.default.match(SEO_CACHE_URL(key));
    return hit ? await hit.json<SeoPage>() : null;
  } catch {
    return null;
  }
}
async function edgeSet(key: string, page: SeoPage): Promise<void> {
  try {
    await caches.default.put(
      SEO_CACHE_URL(key),
      new Response(JSON.stringify(page), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${String(SEO_LIMITS.memSeconds)}`,
        },
      }),
    );
  } catch {
    /* the edge cache is an optimisation */
  }
}

/** One READ_LIMITER unit, the same bucket as the cell reads: a miss is the only time D1 is touched. */
async function withinReadLimit(c: Ctx): Promise<boolean> {
  const key = await hmacHex(c.env.HASH_KEY, [romeDay(), "READ_LIMITER", clientIp(c.req.raw)]);
  return (await c.env.READ_LIMITER.limit({ key })).success;
}

/** The page for a path, from memory, the edge or D1; null (never an error) when there is none. */
async function pageFor(c: Ctx, url: URL, page: PageType): Promise<SeoPage | null> {
  // host and full path: two cities, or two hosts, never share an entry (SEO rule S5)
  const key = `seo:${url.host}${url.pathname}`;
  const hot = memGet(key);
  if (hot !== undefined) return hot as SeoPage | null;
  const edge = await edgeGet(key);
  if (edge) {
    memSet(key, edge);
    return edge;
  }
  // Over the limit: the plain shell, which every visitor and crawler can already read.
  if (page.type !== "home" && !(await withinReadLimit(c))) return null;
  try {
    const built = await buildPage(c.env, url.origin, page);
    memSet(key, built);
    if (built) c.executionCtx.waitUntil(edgeSet(key, built));
    return built;
  } catch {
    console.error(JSON.stringify({ code: "seo_failed", page: page.type }));
    return null;
  }
}

function inject(response: Response, seoPage: SeoPage): Response {
  const title = escapeHtml(seoPage.title);
  const description = escapeHtml(seoPage.description);
  const url = escapeHtml(seoPage.canonical);
  return (
    new HTMLRewriter()
      .on("title", { element: (el) => void el.setInnerContent(seoPage.title) })
      // Replaced whole, with the same escaping as every other tag (setAttribute leaves "<" and "&" as they are).
      .on('meta[name="description"]', {
        element: (el) =>
          void el.replace(`<meta name="description" content="${description}" />`, { html: true }),
      })
      .on("head", {
        element(el) {
          el.append(
            `<link rel="canonical" href="${url}" />` +
              `<meta property="og:title" content="${title}" />` +
              `<meta property="og:description" content="${description}" />` +
              `<meta property="og:url" content="${url}" />` +
              `<meta property="og:type" content="website" />` +
              `<meta property="og:locale" content="it_IT" />` +
              `<meta name="twitter:card" content="summary" />` +
              seoPage.jsonLd.map(jsonLdScript).join(""),
            { html: true },
          );
        },
      })
      .on("body", {
        element(el) {
          el.append(`<noscript><main>${seoPage.html}</main></noscript>`, { html: true });
        },
      })
      .transform(response)
  );
}

/** Registered after securityHeaders: the CSP and the other headers are set on whatever it returns. */
export const seoPages: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  try {
    if (c.req.method !== "GET" || c.res.status !== 200) return;
    if (!(c.res.headers.get("Content-Type") ?? "").includes("text/html")) return;
    const url = new URL(c.req.url);
    const page = detectPageType(url.pathname);
    if (!page) return;
    const seoPage = await pageFor(c, url, page);
    if (!seoPage) return;
    // The body changes: the old length and validator no longer describe it.
    c.res.headers.delete("Content-Length");
    c.res.headers.delete("ETag");
    c.res = inject(c.res, seoPage);
  } catch {
    // Never break a page for the sake of its tags (SEO rule S9): the shell is served as it is.
    console.error(JSON.stringify({ code: "seo_inject_failed" }));
  }
};
