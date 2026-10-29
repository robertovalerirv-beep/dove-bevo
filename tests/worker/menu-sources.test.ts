import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { romeDay } from "../../src/worker/lib/day";
import { createSession } from "../../src/worker/lib/session";
import type { CellPrices } from "../../src/shared/api-types";
import type { MenuPriceSources } from "../../src/shared/menu-seed";

const ORIGIN = "https://dovebevo.example";
const BAR = "n2420779240";
const CELL = "u0nd9";
const DAY = romeDay();
let sequence = 0;
const headers = () => ({ "CF-Connecting-IP": `198.19.0.${String(++sequence)}` });
const path = (key = BAR, query = `c=${CELL}`) => `/api/venues/${key}/menu-sources?${query}`;
const get = (url = path()) => exports.default.fetch(`${ORIGIN}${url}`, { headers: headers() });

async function seed(key = BAR, cell = CELL) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO prices_current VALUES (?1,'spritz',0,?2,62505581,750,?3,0,'active','menu')`,
    ).bind(key, cell, DAY),
    env.DB.prepare(
      `INSERT INTO price_obs (venue_key,drink,hh,price_cents,observed_on,source,status)
       VALUES (?1,'spritz',0,750,?2,'menu','active')`,
    ).bind(key, DAY),
    env.DB.prepare(
      `INSERT INTO menu_seed_prices
       (record_hash,batch_id,venue_key,drink,hh,cell,price_cents,currency,checked_on,
        published_on,menu_url,menu_item,serving,context,source_obs_id)
       VALUES (?1,'test',?2,'spritz',0,?3,750,'EUR',?4,NULL,
         'https://venue.example/menu','Aperol Spritz',NULL,'Prezzo normale',last_insert_rowid())`,
    ).bind("a".repeat(64), key, cell, DAY),
  ]);
}

beforeEach(async () => {
  await env.DB.batch(
    [
      "menu_seed_prices",
      "menu_seed_batches",
      "prices_current",
      "price_obs",
      "venues_hidden",
      "venues_user",
      "cell_snapshot",
      "reports",
      "counters",
      "dedup",
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
});

describe("one-off official menu provenance", () => {
  it("keeps the exact released cell contract and exposes provenance separately", async () => {
    await seed();
    const cell = await exports.default.fetch(`${ORIGIN}/api/prices/${CELL}`, {
      headers: headers(),
    });
    const data: CellPrices = await cell.json();
    expect(Object.keys(data).sort()).toEqual(["g", "h", "p", "pend", "u"]);
    expect(data.p).toEqual([[BAR, "spritz", 0, 750, DAY, 0, 0]]);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      prices: [
        {
          drink: "spritz",
          hh: 0,
          price_cents: 750,
          checked_on: DAY,
          published_on: null,
          menu_url: "https://venue.example/menu",
          menu_item: "Aperol Spritz",
          serving: null,
          context: "Prezzo normale",
        },
      ],
    });
  });

  it("does not expose sources for a hidden venue, wrong cell or unknown venue", async () => {
    await seed();
    expect((await get(path(BAR, "c=u0nd8"))).status).toBe(404);
    expect((await get(path("n999999999999"))).status).toBe(404);
    await env.DB.prepare(
      "INSERT INTO venues_hidden (venue_key,name,cell,day) VALUES (?1,'Hidden',?2,?3)",
    )
      .bind(BAR, CELL, DAY)
      .run();
    expect((await get()).status).toBe(404);
  });

  it("never exposes a pending user venue's sources", async () => {
    await env.DB.prepare(
      "INSERT INTO venues_user (id,name,kind,lat,lon,cell,status) VALUES (1,'Pending',1,45.46,9.19,?1,'pending')",
    )
      .bind(CELL)
      .run();
    await seed("u1");
    expect((await get(path("u1"))).status).toBe(404);
  });

  it("requires the exact owned history observation rather than a matching current value alone", async () => {
    await seed();
    await env.DB.prepare("UPDATE menu_seed_prices SET source_obs_id = source_obs_id + 10").run();
    expect(await (await get()).json()).toEqual({ prices: [] });
    await env.DB.prepare("UPDATE menu_seed_prices SET source_obs_id = source_obs_id - 10").run();
    await env.DB.prepare("UPDATE price_obs SET venue_key='n999999'").run();
    expect(await (await get()).json()).toEqual({ prices: [] });
  });

  it("drops stale attribution when a real customer writes a new price", async () => {
    await seed();
    const { token } = await createSession("test-session-hmac-key");
    const response = await exports.default.fetch(`${ORIGIN}/api/prices`, {
      method: "POST",
      headers: {
        ...headers(),
        Origin: ORIGIN,
        "Content-Type": "application/json",
        Cookie: `__Host-sid=${token}`,
      },
      body: JSON.stringify({
        venue: BAR,
        cell: CELL,
        source: "manual",
        items: [{ drink: "spritz", hh: 0, price_cents: 800 }],
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [{ status: "active" }] });
    expect(await (await get()).json()).toEqual({ prices: [] });
    expect(
      await env.DB.prepare("SELECT source,price_cents FROM prices_current WHERE venue_key=?1")
        .bind(BAR)
        .first(),
    ).toEqual({ source: "manual", price_cents: 800 });
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM price_obs WHERE venue_key=?1")
          .bind(BAR)
          .first<{ n: number }>()
      )?.n,
    ).toBe(2);
  });

  it("does not attribute changed dates, prices, cells or moderated rows to the menu", async () => {
    await seed();
    for (const sql of [
      "UPDATE prices_current SET price_cents=751",
      "UPDATE prices_current SET price_cents=750, observed_on='2020-01-01'",
      `UPDATE prices_current SET observed_on='${DAY}', cell='u0nd8'`,
      "UPDATE prices_current SET cell='u0nd9',status='quarantined'",
    ]) {
      await env.DB.prepare(sql).run();
      const result: MenuPriceSources = await (await get()).json();
      expect(result.prices).toEqual([]);
    }
  });

  for (const query of ["", "c=u0nd9&c=u0nd9", "c=u0nd9&extra=1", "c=bad", "c=u0ND9"]) {
    it(`rejects ambiguous or invalid source queries ${query}`, async () => {
      expect((await get(path(BAR, query))).status).toBe(400);
    });
  }
});
