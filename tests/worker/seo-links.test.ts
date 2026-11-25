import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetSeoMemory } from "../../src/worker/lib/seo";

// ADR 0053: every bar with a price is reachable by links, however many bars there are, and what a
// crawler draws is the bar, never an error.
// One host per test: pages are cached at the edge by host and path, which no test hook empties.
let host = 0;
const MILANO = 62505581;
const get = (path: string) => exports.default.fetch(`https://t${String(host)}.example${path}`);
const pageText = async (path: string) => (await get(path)).text();
/** The text of a page for crawlers. */
const main = async (path: string) => {
  const html = await pageText(path);
  return html.slice(html.indexOf("<noscript><main>"));
};

interface TestPrice {
  drink?: string;
  cents?: number;
  city?: number | null;
  cell?: string;
  status?: string;
  hh?: number;
}
const priceStatement = (key: string, p: TestPrice = {}) =>
  env.DB.prepare(
    `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, '2026-10-10', 0, ?7, 'manual')`,
  ).bind(
    key,
    p.drink ?? "spritz",
    p.hh ?? 0,
    p.cell ?? "u0nd9",
    p.city === undefined ? MILANO : p.city,
    p.cents ?? 700,
    p.status ?? "active",
  );
const price = (key: string, p?: TestPrice) => priceStatement(key, p).run();

const userBar = (id: number, name: string, cell: string, status = "approved") =>
  env.DB.prepare(
    "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (?1, ?2, 1, 45.46, 9.19, ?3, ?4)",
  )
    .bind(id, name, cell, status)
    .run();

/** Keys of the first bars of a fixture cell. */
async function fixtureKeys(cell: string, n: number): Promise<string[]> {
  const response = await env.ASSETS.fetch(
    `https://assets.local/data/${env.DATA_VERSION}/v/${cell}.json`,
  );
  const file = await response.json<{ v: [string][] }>();
  return file.v.slice(0, n).map((v) => v[0]);
}

beforeEach(async () => {
  host += 1;
  resetSeoMemory();
  await env.DB.batch(
    ["prices_current", "price_obs", "venues_user", "venues_hidden", "cell_snapshot"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

describe("what a crawler may read", () => {
  it("robots.txt opens the two reads a bar page needs to draw itself, and nothing else of the API", async () => {
    const groups = (await pageText("/robots.txt"))
      .split("\n\n")
      .filter((g) => g.startsWith("User-agent"));
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      const rules = group.split("\n");
      expect(rules).toContain("Allow: /api/prices/");
      expect(rules).toContain("Allow: /api/venues/");
      expect(rules).toContain("Disallow: /api/");
      expect(rules).toContain("Disallow: /admin");
    }
  });

  it("the API answers are never search results themselves", async () => {
    for (const path of ["/api/prices/u0nd9", "/api/venues/n10013246997/prices", "/api/health"])
      expect((await get(path)).headers.get("x-robots-tag"), path).toBe("noindex");
    expect((await get("/api/ai/cerca")).headers.get("x-robots-tag")).toBe("index, follow");
    for (const path of ["/", "/milano", "/sitemap.xml"])
      expect((await get(path)).headers.get("x-robots-tag"), path).toBeNull();
  });
});

describe("hub pages", () => {
  it("a city page links all its bars, past the old limit of 30, also a happy-hour-only one", async () => {
    const keys = await fixtureKeys("u0nd9", 60);
    expect(keys).toHaveLength(60);
    await env.DB.batch(
      keys.map((key, i) => priceStatement(key, { cents: 600 + i, hh: i === 59 ? 1 : 0 })),
    );
    const html = await main("/milano");
    for (const key of keys) expect(html).toContain(`href="/bar/${key}?c=u0nd9"`);
  });

  it("a city page names the bars of more than three cells", async () => {
    for (const cell of ["u0nd2", "u0nd6", "u0nd8", "u0nd9", "u0ndc"])
      await price((await fixtureKeys(cell, 1))[0] ?? "", { cell });
    const html = await main("/milano");
    const all = html.slice(html.indexOf("<h2>Tutti i bar con un prezzo</h2>"));
    expect(all.match(/<li><a href="\/bar\//g)).toHaveLength(5);
    expect(all).not.toContain("Prezzi di un bar");
  });

  it("a user bar of the zone is in the city list, though it has no city of its own", async () => {
    await userBar(1, "Tajolino", "u0nd9");
    await userBar(2, "In attesa", "u0nd9", "pending");
    await price("n10013246997");
    await price("u1", { city: null });
    await price("u2", { city: null });
    const html = await main("/milano");
    expect(html).toContain('<a href="/bar/u1?c=u0nd9">Tajolino</a>');
    expect(html).not.toContain("/bar/u2?");
    expect(html).toContain("A Milano ci sono 1 bar"); // the figures stay those of the city
  });

  it("/copertura links the city pages and every bar outside them", async () => {
    await userBar(1, "Senza zona", "srhvt");
    await price("n10013246997");
    await price("n999999999", { city: 998 }); // gone from OSM
    await price("n10128978471", { city: 998 }); // another city, no page of its own
    await price("n777", { city: null, cell: "zzzzz" }); // a cell with no file: still reachable
    await price("u1", { city: null, cell: "srhvt" });
    const html = await main("/copertura");
    expect(html).toContain('<a href="/milano">Milano: 1 bar con prezzo, 1 prezzo</a>');
    expect(html).not.toContain("/bar/n10013246997?"); // /milano lists it
    expect(html).not.toContain("/bar/n999999999?");
    expect(html).toContain('<a href="/bar/n10128978471?c=u0nd9">Sally bar</a>');
    expect(html).toContain('<a href="/bar/u1?c=srhvt">Senza zona</a>');
    expect(html).toContain('href="/bar/n777?c=zzzzz"');
  });

  it("every bar of the sitemap has a link from a city page or from /copertura", async () => {
    const keys = await fixtureKeys("u0nd9", 40);
    await env.DB.batch(keys.map((key, i) => priceStatement(key, { city: i % 2 ? MILANO : 999 })));
    const urls = [
      ...(await pageText("/sitemap.xml")).matchAll(/<loc>https:\/\/[^/]+(\/bar\/[^<]+)</g),
    ].map((m) => m[1] ?? "");
    expect(urls).toHaveLength(40);
    const linked = (await main("/milano")) + (await main("/copertura"));
    for (const url of urls) expect(linked).toContain(`href="${url}"`);
  });

  it("opens a bounded number of files (free plan: 50 subrequests)", async () => {
    await env.DB.batch(
      Array.from({ length: 80 }, (_, i) =>
        priceStatement(`n${String(500 + i)}`, { city: null, cell: `u0${String(10 + i)}z` }),
      ),
    );
    const original = env.ASSETS.fetch.bind(env.ASSETS);
    let reads = 0;
    env.ASSETS.fetch = (...args: Parameters<typeof original>) => {
      reads += 1;
      return original(...args);
    };
    try {
      expect((await main("/copertura")).match(/href="\/bar\//g)).toHaveLength(80);
      expect(reads).toBeLessThanOrEqual(35);
    } finally {
      env.ASSETS.fetch = original;
    }
  });

  it("a bar whose cell another page has read, beyond the files this one opens, is not taken for gone", async () => {
    const [key = ""] = await fixtureKeys("u0ndf", 1);
    await price(key, { city: null, cell: "u0ndf" });
    await get(`/bar/${key}`); // its cell file is now in memory
    await env.DB.batch(
      Array.from({ length: 80 }, (_, i) =>
        priceStatement(`n${String(500 + i)}`, { city: null, cell: `u0${String(10 + (i % 40))}z` }),
      ),
    );
    expect(await pageText("/sitemap.xml")).toContain(`/bar/${key}?c=u0ndf<`);
    expect(await main("/copertura")).toContain(`href="/bar/${key}?c=u0ndf"`);
  });

  it("more than 100 user bars do not break a page (D1 binds at most 100 values)", async () => {
    await env.DB.batch(
      Array.from({ length: 120 }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (?1, ?2, 1, 45.46, 9.19, 'u0nd9', 'approved')",
        ).bind(i + 1, `Bar ${String(i + 1)}`),
      ),
    );
    await env.DB.batch(
      Array.from({ length: 120 }, (_, i) => priceStatement(`u${String(i + 1)}`, { city: null })),
    );
    expect(await main("/copertura")).toContain('<a href="/bar/u120?c=u0nd9">Bar 120</a>');
  });
});

describe("bar pages", () => {
  it("link the other bars of the cell, the city page and /copertura", async () => {
    await userBar(1, "Tajolino", "u0nd9");
    await price("n10081337586", { cents: 800 });
    await price("n10013246997");
    await price("u1", { city: null });
    await price("n10128978471", { status: "quarantined" });
    const html = await main("/bar/n10081337586");
    const near = html.slice(html.indexOf("<h2>Altri bar con un prezzo in zona</h2>"));
    expect(near).toContain('<a href="/bar/n10013246997?c=u0nd9">Vesta</a>');
    expect(near).toContain('<a href="/bar/u1?c=u0nd9">Tajolino</a>');
    expect(near).not.toContain("/bar/n10081337586"); // not itself
    expect(near).not.toContain("/bar/n10128978471"); // not a price in review
    expect(html).toContain('<a href="/milano">Dove bere a Milano</a>');
    expect(html).toContain('href="/copertura"');
    // the user bar, which Google never indexed from the sitemap alone, links back
    expect(await main("/bar/u1")).toContain('<a href="/bar/n10081337586?c=u0nd9">');
  });

  it("of a crowded cell are all linked by some other bar page, at most 30 links each", async () => {
    const keys = await fixtureKeys("u0nd9", 70);
    await env.DB.batch(keys.map((key) => priceStatement(key)));
    const linked = new Set<string>();
    for (const key of keys.slice(0, 70)) {
      const hrefs = [...(await main(`/bar/${key}`)).matchAll(/href="\/bar\/([a-z0-9]+)\?c=/g)];
      expect(hrefs.length).toBeLessThanOrEqual(30);
      for (const m of hrefs) linked.add(m[1] ?? "");
    }
    expect(linked.size).toBe(70);
  }, 60_000);

  it("say the day of each price and, from five prices up, the median of the zone", async () => {
    const others = (await fixtureKeys("u0nd9", 20)).filter((k) => k !== "n10081337586").slice(0, 4);
    await price("n10081337586", { cents: 800 });
    await price("n10081337586", { drink: "negroni", cents: 900 });
    for (const [i, key] of others.entries()) await price(key, { cents: 600 + i * 10 });
    const html = await main("/bar/n10081337586");
    expect(html).toContain("<li>Spritz: 8,00 € (10 ott 2026), mediana in zona 6,20 €</li>");
    expect(html).toContain("<li>Negroni: 9,00 € (10 ott 2026)</li>");
  });

  it("read the zone from the snapshot of the cell, not from its prices (ADR 0020)", async () => {
    await env.DB.batch((await fixtureKeys("u0nd9", 20)).map((key) => priceStatement(key)));
    await get("/api/prices/u0nd9"); // the snapshot is ready
    const prepared: string[] = [];
    const original = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql: string) => {
      prepared.push(sql);
      return original(sql);
    };
    try {
      await get("/bar/n10081337586");
    } finally {
      env.DB.prepare = original;
    }
    expect(prepared.some((sql) => sql.includes("FROM cell_snapshot"))).toBe(true);
    expect(prepared.filter((sql) => /FROM prices_current\s+WHERE cell/.test(sql))).toEqual([]);
  });

  it("ask not to be indexed when the bar is gone or has no price", async () => {
    await price("n999999999"); // gone from OSM: its price stays as history (SPEC 5.1)
    for (const path of ["/bar/n999999999", "/bar/n10128978471"])
      expect(await pageText(path), path).toContain('<meta name="robots" content="noindex" />');
    await price("n10081337586");
    for (const path of ["/bar/n10081337586", "/milano", "/", "/copertura"])
      expect(await pageText(path), path).not.toContain("noindex");
  });

  it("never ask for noindex because of a failure: the page stays what it was", async () => {
    await price("n10128978471");
    const original = env.DB.batch.bind(env.DB);
    env.DB.batch = () => Promise.reject(new Error("D1 down"));
    try {
      expect(await pageText("/bar/n10128978471")).not.toContain("noindex");
    } finally {
      env.DB.batch = original;
    }
    // A cell file that cannot be read is a failure, not a bar that is gone.
    await price("n888", { city: null, cell: "zzzzz" });
    expect(await pageText("/bar/n888")).not.toContain("noindex");
  });
});
