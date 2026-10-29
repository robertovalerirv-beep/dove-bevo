import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { VenuePrices } from "../../src/shared/api-types";

const get = (path: string) => exports.default.fetch(`https://dovebevo.example${path}`);
const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;

beforeEach(async () => {
  const obs = [
    ...Array.from({ length: 12 }, (_, i) => ["n1", "spritz", 0, 700 + i, day(i + 1), "active"]),
    ["n1", "beer_draft", 0, 500, day(3), "active"],
    ["n1", "beer_draft", 1, 400, day(4), "quarantined"],
    ["n2", "spritz", 0, 900, day(6), "active"],
  ];
  await env.DB.batch([
    env.DB.prepare("DELETE FROM price_obs"),
    env.DB.prepare("DELETE FROM prices_current"),
    ...obs.map((o) =>
      env.DB.prepare(
        "INSERT INTO price_obs (venue_key, drink, hh, price_cents, observed_on, source, status) VALUES (?, ?, ?, ?, ?, 'manual', ?)",
      ).bind(...o),
    ),
    env.DB.prepare(
      `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES
       ('n1','spritz',0,'u0nd9',1,711,'2026-09-12',1,'active','manual'),
       ('n1','beer_draft',0,'u0nd9',1,550,'2026-09-03',0,'review','manual')`,
    ),
  ]);
});

describe("GET /api/venues/:key/prices (M1-15)", () => {
  it("returns current prices and at most 10 observations per drink and size, dates only", async () => {
    const response = await get("/api/venues/n1/prices");
    expect(response.status).toBe(200);
    const body: VenuePrices = await response.json();
    expect(body.p).toEqual([["n1", "spritz", 0, 711, "2026-09-12", 1, 0]]);
    const spritz = body.h.filter(([drink]) => drink === "spritz");
    expect(spritz).toHaveLength(10);
    expect(spritz[0]).toEqual(["spritz", 0, 711, "2026-09-12"]);
    expect(spritz[9]).toEqual(["spritz", 0, 702, "2026-09-03"]);
    expect(body.h.filter(([drink]) => drink === "beer_draft")).toEqual([
      ["beer_draft", 1, 400, "2026-09-04"],
      ["beer_draft", 0, 500, "2026-09-03"],
    ]);
    for (const row of body.h) expect(row[3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns empty lists for a bar without prices", async () => {
    const body: VenuePrices = await (await get("/api/venues/w42/prices")).json();
    expect(body).toEqual({ p: [], h: [] });
  });

  for (const key of ["x1", "n", "n12a", "u-1", "n1234567890123456"]) {
    it(`rejects the invalid key ${key} with 400`, async () => {
      expect((await get(`/api/venues/${key}/prices`)).status).toBe(400);
    });
  }
});

describe("GET /api/venues/approved (ADR 0025)", () => {
  it("lists only the approved user bars, for the name search", async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM venues_user"),
      env.DB.prepare(
        `INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES
         (1, 'Namasce', 1, 45.46, 9.19, 'u0nd9', 'approved'),
         (2, 'Da confermare', 1, 45.47, 9.2, 'u0nd9', 'pending'),
         (3, 'Rifiutato', 1, 45.48, 9.21, 'u0nd9', 'removed')`,
      ),
    ]);
    const response = await get("/api/venues/approved");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await response.json()).toEqual({ v: [["u1", "Namasce", 1, 45.46, 9.19]] });
    await env.DB.prepare("DELETE FROM venues_user").run();
  });
});

// Audit 28/10/2026: a bar the admin hid (closed, not a bar) is out of the map, the cell and the SEO pages;
// its prices must not stay readable by key either.
describe("a bar hidden by the admin", () => {
  const hide = () =>
    env.DB.prepare(
      "INSERT OR REPLACE INTO venues_hidden (venue_key, cell, name, day) VALUES ('n1', 'u0nd9', 'Bar', '2026-10-28')",
    ).run();
  const unhide = () => env.DB.prepare("DELETE FROM venues_hidden WHERE venue_key = 'n1'").run();

  it("returns no current prices and no history, and comes back when it is shown again", async () => {
    const before: VenuePrices = await (await get("/api/venues/n1/prices")).json();
    expect(before.p).toHaveLength(1);
    await hide();
    try {
      const body: VenuePrices = await (await get("/api/venues/n1/prices")).json();
      expect(body).toEqual({ p: [], h: [] });
    } finally {
      await unhide();
    }
    const back: VenuePrices = await (await get("/api/venues/n1/prices")).json();
    expect(back.p).toHaveLength(1);
    expect(back.h.length).toBeGreaterThan(0);
  });

  it("does not touch the other bars", async () => {
    await hide();
    try {
      const body: VenuePrices = await (await get("/api/venues/n2/prices")).json();
      expect(body.h).toEqual([["spritz", 0, 900, "2026-09-06"]]);
    } finally {
      await unhide();
    }
  });
});
