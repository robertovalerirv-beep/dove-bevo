import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { detectPageType, escapeHtml, jsonLdScript, resetSeoMemory } from "../../src/worker/lib/seo";
import { forgetCoverage } from "../../src/worker/lib/coverage";

// ADR 0025 (SEO): robots.txt, llms.txt, sitemap.xml, the open search for assistants and the tags and
// text the Worker adds to the SPA shell. Only public bars; every dynamic value escaped.
const ORIGIN = "https://dovebevo.example";
const MILANO = 62505581;
const get = (path: string, init?: RequestInit) => exports.default.fetch(`${ORIGIN}${path}`, init);

async function price(
  key: string,
  drink: string,
  cents: number,
  city: number | null = MILANO,
  cell = "u0nd9",
  status = "active",
  hh = 0,
) {
  await env.DB.prepare(
    `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, '2026-10-10', 0, ?7, 'manual')`,
  )
    .bind(key, drink, hh, cell, city, cents, status)
    .run();
}

beforeEach(async () => {
  resetSeoMemory();
  forgetCoverage();
  await env.DB.batch(
    ["prices_current", "price_obs", "venues_user", "venues_hidden"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

describe("robots.txt and llms.txt", () => {
  it("robots.txt welcomes the AI crawlers, keeps the API and the admin closed, and names the sitemap", async () => {
    const response = await get("/robots.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    for (const agent of [
      "GPTBot",
      "OAI-SearchBot",
      "PerplexityBot",
      "ClaudeBot",
      "Google-Extended",
      "CCBot",
    ])
      expect(text).toContain(`User-agent: ${agent}`);
    expect(text).toContain("Allow: /api/ai/cerca");
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain("Disallow: /admin");
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("llms.txt is Italian, lists the public pages and API, and never the admin", async () => {
    const text = await (await get("/llms.txt")).text();
    expect(text).toContain("# Dove bevo");
    expect(text).toContain(`${ORIGIN}/milano`);
    expect(text).toContain("/api/ai/cerca");
    expect(text).toContain("/api/prices/:cella");
    expect(text).toContain("Quanto costa uno spritz a Milano");
    expect(text).not.toContain("admin");
  });

  it("the read-only resources refuse any other method with 405", async () => {
    for (const path of ["/robots.txt", "/llms.txt", "/sitemap.xml", "/api/ai/cerca"]) {
      const response = await get(path, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(response.status, path).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    }
  });
});

describe("sitemap.xml", () => {
  it("lists the home, the coverage, the cities with prices and the public bars only", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES
         (1, 'Approvato', 1, 45.46, 9.19, 'u0nd9', 'approved'), (2, 'In attesa', 1, 45.46, 9.19, 'u0nd9', 'pending')`,
      ),
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES ('n3', 'u0nd9', 'Non è un bar', '2026-10-01')",
      ),
    ]);
    await price("n1", "spritz", 700);
    await price("n3", "spritz", 700); // hidden by the admin
    await price("u1", "spritz", 700, null); // approved user bar
    await price("u2", "spritz", 700, null); // proposed, not approved
    await price("n4", "spritz", 700, MILANO, "u0nd9", "quarantined");
    const response = await get("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    const xml = await response.text();
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/copertura</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/milano</loc>`);
    expect(xml).not.toContain(`<loc>${ORIGIN}/roma</loc>`); // no prices there
    expect(xml).toContain(`<loc>${ORIGIN}/bar/n1?c=u0nd9</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/bar/u1?c=u0nd9</loc>`);
    for (const hidden of ["n3", "u2", "n4"]) expect(xml).not.toContain(`/bar/${hidden}?`);
    expect(xml).not.toContain("/admin");
    expect((xml.match(/<url>/g) ?? []).length).toBeLessThanOrEqual(5000);
  });
});

describe("pages for crawlers: tags, JSON-LD and plain text in the shell", () => {
  it("the home has title, description, canonical, Open Graph, WebSite and FAQPage, and the text", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.match(/<title>/g)).toHaveLength(1); // the shell's title is replaced, not doubled
    expect(html).toContain("<title>Dove bevo — dove bere in Italia? Prezzi nei bar</title>");
    expect((html.match(/name="description"/g) ?? []).length).toBe(1);
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain("<noscript><main><h1>Dove bere in Italia");
    expect(html).toContain('<a href="/milano">Dove bere a Milano</a>');
    // the home is static: no D1 access at all
  });

  it("every security header survives the HTML transform, CSP included", async () => {
    const response = await get("/");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    // A page has its own nonce (ADR 0045): in the header and on every script of the page.
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce =
      /script-src 'nonce-([^']+)' 'strict-dynamic' 'self' https:\/\/challenges\.cloudflare\.com/.exec(
        csp,
      )?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce ?? ""}'`);
    expect(csp).toContain("require-trusted-types-for 'script'");
    const html = await response.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, tag).toContain(`nonce="${nonce ?? ""}"`);
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    // the body is rewritten: the old length and validator must be gone
    expect(response.headers.get("etag")).toBeNull();
  });

  it("a city page has the medians, the cheapest named bars and an ItemList of BarOrPub", async () => {
    // fixture bars of cell u0nd9: Vesta n10013246997, Bistrot Italia n10081337586, Sally bar n10128978471
    await price("n10013246997", "spritz", 600);
    await price("n10081337586", "spritz", 800);
    await price("n10128978471", "spritz", 700);
    await price("n10013246997", "beer_draft", 500);
    const html = await (await get("/milano")).text();
    expect(html).toContain(
      "<title>Dove bere a Milano? Prezzi di birra, spritz e cocktail nei bar</title>",
    );
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/milano" />`);
    expect(html).toContain("<h1>Dove bere a Milano: prezzi nei bar</h1>");
    expect(html).toContain("A Milano ci sono 3 bar con almeno un prezzo, per 4 prezzi");
    expect(html).toContain("Spritz: mediana 7,00 €, da 6,00 € a 8,00 € (3 prezzi).");
    expect(html).toContain("(1 prezzo)"); // the beer: a single price
    expect(html).toContain(">Vesta</a>");
    expect(html).toContain("Corso Italia 35"); // address of Bistrot Italia, from the OSM file
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"@type":"BarOrPub"');
    expect(html).toContain("© OpenStreetMap contributors");
    // cheapest first inside the list
    expect(html.indexOf(">Vesta</a>")).toBeLessThan(html.indexOf(">Bistrot Italia</a>"));
  });

  it("two cities never share a cached page: /roma does not show Milano's data", async () => {
    await price("n10013246997", "spritz", 600);
    const milano = await (await get("/milano")).text();
    const roma = await (await get("/roma")).text();
    expect(milano).toContain("Vesta");
    expect(roma).not.toContain("Vesta");
    expect(roma).not.toContain("A Milano");
  });

  it("a bar page has its name, address, prices and a BarOrPub with an OfferCatalog", async () => {
    await price("n10081337586", "spritz", 800);
    await price("n10081337586", "beer_draft", 550, MILANO, "u0nd9", "active", 1);
    const html = await (await get("/bar/n10081337586")).text();
    expect(html).toContain("<title>Bistrot Italia: prezzi di birra, spritz e cocktail</title>");
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/bar/n10081337586?c=u0nd9" />`);
    expect(html).toContain("<h1>Prezzi da Bistrot Italia</h1>");
    expect(html).toContain("Corso Italia 35");
    expect(html).toContain("Spritz: 8,00 €");
    expect(html).toContain("Birra media (happy hour): 5,50 €");
    expect(html).toContain('"@type":"BarOrPub"');
    expect(html).toContain('"price":"8.00","priceCurrency":"EUR"');
    expect(html).not.toMatch(/45\.4\d{4}/); // no coordinates at all in the SEO output
  });

  it("a name with markup cannot break out of a tag, an attribute or the JSON-LD (rule S1)", async () => {
    const evil = `Bar "><script>alert(1)</script> & 'x'`;
    await env.DB.prepare(
      "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (1, ?1, 1, 45.46, 9.19, 'u0nd9', 'approved')",
    )
      .bind(evil)
      .run();
    await price("u1", "spritz", 700, null);
    const response = await get("/bar/u1");
    const html = await response.text();
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain('"><script');
    expect(html).toContain("Bar &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#39;x&#39;");
    // meta content is a quoted attribute with the name escaped
    expect(html).toMatch(/<meta property="og:title" content="Bar &quot;&gt;&lt;script&gt;/);
    expect(html).toMatch(/<meta name="description" content="[^"]*&lt;script&gt;/);
    // the JSON-LD stays valid JSON and has no raw "<"
    const ld = [
      ...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs),
    ].map((m) => m[1] ?? "");
    expect(ld).toHaveLength(1);
    expect(ld[0]).not.toContain("<");
    expect((JSON.parse(ld[0] ?? "") as { name: string }).name).toBe(evil);
    expect(response.headers.get("content-security-policy")).toContain("script-src 'nonce-");
  });

  it("only public bars: hidden, proposed and priceless bars get the plain shell", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (2, 'In attesa', 1, 45.46, 9.19, 'u0nd9', 'pending')",
      ),
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES ('n10013246997', 'u0nd9', 'Vesta', '2026-10-01')",
      ),
    ]);
    await price("u2", "spritz", 700, null);
    await price("n10013246997", "spritz", 700);
    for (const path of ["/bar/u2", "/bar/n10013246997", "/bar/n10128978471", "/bar/zzz"]) {
      const html = await (await get(path)).text();
      expect(html, path).toContain("<title>Dove bevo</title>"); // the shell as it was
      expect(html, path).not.toContain("application/ld+json");
      expect(html, path).not.toContain("In attesa");
    }
  });

  it("/copertura lists the places with bars and prices", async () => {
    await price("n10013246997", "spritz", 700);
    await price("n10081337586", "spritz", 700);
    const html = await (await get("/copertura")).text();
    expect(html).toContain("Milano: 2 bar con prezzo, 2 prezzi");
    expect(html).toContain('"@type":"Dataset"');
    // Search Console flags a Dataset without these two fields.
    expect(html).toContain('"license":"https://opendatacommons.org/licenses/odbl/1-0/"');
    expect(html).toContain('"creator":{"@type":"Organization"');
  });

  it("without D1 the page is the plain shell, with no error", async () => {
    await price("n10128978471", "spritz", 700);
    const original = env.DB.batch.bind(env.DB);
    env.DB.batch = () => Promise.reject(new Error("D1 down"));
    try {
      const response = await get("/bar/n10128978471");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<title>Dove bevo</title>");
    } finally {
      env.DB.batch = original;
    }
  });

  it("never touches the API, the admin or other paths", async () => {
    for (const path of ["/api/health", "/admin", "/privacy", "/qualunque-cosa", "/bar/n1/x"]) {
      const html = await (await get(path)).text();
      expect(html, path).not.toContain("application/ld+json");
    }
  });
});

describe("GET /api/ai/cerca", () => {
  it("returns paginated JSON, cheapest first, with names where they can be found", async () => {
    await price("n10013246997", "spritz", 600);
    await price("n10081337586", "spritz", 800);
    await price("n10081337586", "beer_draft", 450);
    await price("n9", "spritz", 100, null); // another place, hidden by nothing: still public
    const response = await get("/api/ai/cerca?citta=Milano");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("x-robots-tag")).toBe("index, follow");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const body = await response.json<{
      citta: string;
      pagina: number;
      prossima_pagina: number | null;
      bar: { chiave: string; nome: string | null; url: string; prezzi: { prezzo_eur: string }[] }[];
    }>();
    expect(body.citta).toBe("Milano");
    expect(body.pagina).toBe(1);
    expect(body.prossima_pagina).toBeNull();
    expect(body.bar.map((b) => b.chiave)).toEqual(["n10081337586", "n10013246997"]);
    expect(body.bar[0]?.nome).toBe("Bistrot Italia");
    expect(body.bar[0]?.url).toBe(`${ORIGIN}/bar/n10081337586?c=u0nd9`);
    expect(body.bar[0]?.prezzi.map((p) => p.prezzo_eur)).toEqual(["4.50", "8.00"]);
  });

  it("accepts the English name of a city and answers an unknown one with an empty list", async () => {
    await price("n10013246997", "spritz", 600);
    const milan = await (await get("/api/ai/cerca?citta=Milan")).json<{ bar: unknown[] }>();
    // Milan is not Milano in places.json: an alias maps the known English names
    expect(milan.bar).toHaveLength(1);
    const none = await (await get("/api/ai/cerca?citta=Atlantide")).json<{ bar: unknown[] }>();
    expect(none.bar).toEqual([]);
  });

  it("hidden and proposed bars never appear", async () => {
    await env.DB.prepare(
      "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (5, 'In attesa', 1, 45.46, 9.19, 'u0nd9', 'pending')",
    ).run();
    await price("u5", "spritz", 100, null);
    const body = await (await get("/api/ai/cerca")).json<{ bar: unknown[] }>();
    expect(body.bar).toEqual([]);
  });

  it("validates its input: page 1–50, no other parameters, a short city name", async () => {
    for (const query of ["page=0", "page=51", "page=x", "foo=1", `citta=${"a".repeat(51)}`]) {
      const response = await get(`/api/ai/cerca?${query}`);
      expect(response.status, query).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "bad_request" } });
    }
    expect((await get("/api/ai/cerca?page=50")).status).toBe(200);
  });

  it("points at the next page when a page is full", async () => {
    const statements = Array.from({ length: 100 }, (_, i) =>
      env.DB.prepare(
        `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
         VALUES (?1, 'spritz', 0, 'u0nd9', ?2, ?3, '2026-10-10', 0, 'active', 'manual')`,
      ).bind(`n${String(1000 + i)}`, MILANO, 300 + i),
    );
    await env.DB.batch(statements);
    const body = await (
      await get("/api/ai/cerca?citta=milano")
    ).json<{
      prossima_pagina: number | null;
      bar: unknown[];
    }>();
    expect(body.bar).toHaveLength(100);
    expect(body.prossima_pagina).toBe(2);
  });
});

describe("detectPageType", () => {
  it.each([
    ["/", { type: "home" }],
    ["/copertura", { type: "coverage" }],
    ["/milano", { type: "city", slug: "milano" }],
    ["/bar/n123", { type: "venue", key: "n123" }],
    ["/bar/u7", { type: "venue", key: "u7" }],
  ])("%s", (path, page) => {
    expect(detectPageType(path)).toEqual(page);
  });
  it.each([
    "/admin",
    "/admin/x",
    "/api/health",
    "/api/admin/coverage",
    "/privacy",
    "/regole",
    "/Milano",
    "/milano/",
    "/bar/",
    "/bar/n0",
    "/bar/<script>",
    "/bar/n1/x",
    "/napoli.html",
  ])("%s gets no SEO treatment", (path) => {
    expect(detectPageType(path)).toBeNull();
  });
});

describe("escaping (rule S1)", () => {
  it("escapeHtml covers the five characters", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("jsonLdScript keeps the JSON valid and has no raw '<' or line separators", () => {
    const evil = `</script><!-- ${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)} "q"`;
    const html = jsonLdScript({ name: evil, nested: { list: [evil] } });
    const body = /^<script type="application\/ld\+json">(.*)<\/script>$/s.exec(html)?.[1] ?? "";
    expect(body).not.toContain("<");
    expect(body).not.toContain(String.fromCharCode(0x2028));
    expect(body).not.toContain(String.fromCharCode(0x2029));
    expect(JSON.parse(body)).toEqual({ name: evil, nested: { list: [evil] } });
  });
});
