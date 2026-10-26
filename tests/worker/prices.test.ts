import { exports } from "cloudflare:workers";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { CellPrices } from "../../src/shared/api-types";

const get = (path: string) => exports.default.fetch(`https://dovebevo.example${path}`);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM prices_current"),
    env.DB.prepare("DELETE FROM venues_user"),
    env.DB.prepare(
      `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES
       ('n1','spritz',0,'u0nd9',62505581,750,'2026-10-10',2,'active','manual'),
       ('n1','beer_draft',1,'u0nd9',62505581,500,'2026-10-09',0,'quarantined','manual'),
       ('u7','spritz',0,'u0nd9',NULL,650,'2026-10-10',0,'active','manual'),
       ('u8','spritz',0,'u0nd9',NULL,650,'2026-10-10',0,'active','manual'),
       ('u9','spritz',0,'u0nd9',NULL,650,'2026-10-10',0,'active','manual'),
       ('n2','spritz',0,'u0nd9',62505581,800,'2026-10-08',0,'review','manual'),
       ('n3','spritz',0,'u0nd9',62505581,900,'2026-10-08',0,'removed','manual'),
       ('n4','spritz',0,'u0ndd',62505581,600,'2026-10-08',0,'active','manual')`,
    ),
    env.DB.prepare(
      `INSERT INTO venues_user (id, name, kind, lat, lon, cell, status, confirmations) VALUES
       (7,'Bar Nuovo',1,45.4641,9.1901,'u0nd9','approved',2),
       (8,'Bar In Attesa',0,45.4642,9.1902,'u0nd9','pending',1),
       (9,'Bar Rimosso',0,45.4643,9.1903,'u0nd9','removed',0)`,
    ),
  ]);
});

describe("GET /api/prices/:cell (M1-08)", () => {
  it("returns the compact format of SPEC 9.2 without review and removed prices, nor those of unapproved user bars", async () => {
    const response = await get("/api/prices/u0nd9");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const body: CellPrices = await response.json();
    expect(body).toEqual({
      p: [
        ["n1", "beer_draft", 1, 500, "2026-10-09", 0, 1],
        ["n1", "spritz", 0, 750, "2026-10-10", 2, 0],
        ["u7", "spritz", 0, 650, "2026-10-10", 0, 0],
      ],
      u: [["u7", "Bar Nuovo", 1, 45.4641, 9.1901]],
      pend: [["u8", "Bar In Attesa", 0, 45.4642, 9.1902, 1]],
      h: [],
      g: [],
    });
  });

  it("returns empty arrays for a cell without data", async () => {
    const body: CellPrices = await (await get("/api/prices/u0ndf")).json();
    expect(body).toEqual({ p: [], u: [], pend: [], h: [], g: [] });
  });

  for (const cell of ["u0nda", "u0nd", "u0nd9x", "U0ND9", "u0nd%27"]) {
    it(`rejects the invalid cell ${cell} with 400`, async () => {
      const response = await get(`/api/prices/${cell}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "bad_request", message: expect.any(String) as unknown },
      });
    });
  }
});
