import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { VenuePrices } from "../../src/shared/api-types";

const get = (path: string) => exports.default.fetch(`https://dovebevo.example${path}`);
const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;

beforeEach(async () => {
  const obs = [
    ...Array.from({ length: 12 }, (_, i) => ["n1", "spritz", 0, 0, 700 + i, day(i + 1), "active"]),
    ["n1", "beer_draft", 400, 0, 500, day(3), "active"],
    ["n1", "beer_draft", 400, 1, 400, day(4), "quarantined"],
    ["n1", "beer_draft", 500, 0, 600, day(5), "removed"],
    ["n2", "spritz", 0, 0, 900, day(6), "active"],
  ];
  await env.DB.batch([
    env.DB.prepare("DELETE FROM price_obs"),
    env.DB.prepare("DELETE FROM prices_current"),
    ...obs.map((o) =>
      env.DB.prepare(
        "INSERT INTO price_obs (venue_key, drink, size_ml, hh, price_cents, observed_on, source, status) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)",
      ).bind(...o),
    ),
    env.DB.prepare(
      `INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES
       ('n1','spritz',0,0,'u0nd9',1,711,'2026-09-12',1,'active','manual'),
       ('n1','beer_draft',400,0,'u0nd9',1,550,'2026-09-03',0,'review','manual')`,
    ),
  ]);
});

describe("GET /api/venues/:key/prices (M1-15)", () => {
  it("returns current prices and at most 10 observations per drink and size, dates only", async () => {
    const response = await get("/api/venues/n1/prices");
    expect(response.status).toBe(200);
    const body: VenuePrices = await response.json();
    expect(body.p).toEqual([["n1", "spritz", 0, 0, 711, "2026-09-12", 1, 0, 0]]);
    const spritz = body.h.filter(([drink]) => drink === "spritz");
    expect(spritz).toHaveLength(10);
    expect(spritz[0]).toEqual(["spritz", 0, 0, 711, "2026-09-12"]);
    expect(spritz[9]).toEqual(["spritz", 0, 0, 702, "2026-09-03"]);
    expect(body.h.filter(([drink]) => drink === "beer_draft")).toEqual([
      ["beer_draft", 400, 1, 400, "2026-09-04"],
      ["beer_draft", 400, 0, 500, "2026-09-03"],
    ]);
    for (const row of body.h) expect(row[4]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
