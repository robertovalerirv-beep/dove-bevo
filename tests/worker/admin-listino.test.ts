import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { romeDay } from "../../src/worker/lib/day";
import { accessJwt, call } from "./access-jwt";

const shift = (days: number) =>
  new Date(Date.parse(`${romeDay()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  await env.DB.batch(
    ["venues_hidden", "venues_user", "prices_current", "price_obs", "counters", "dedup"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

const base = (observed_on: string, items: unknown[]) => ({
  venue: "n2420779240",
  cell: "u0nd9",
  observed_on,
  items,
});
const spritz = { drink: "spritz", hh: 0, price_cents: 700 };

describe("price list entry in admin (M3-17)", () => {
  it("needs the Access JWT", async () => {
    expect((await call("listino", null, base(shift(-1), [spritz]))).status).toBe(403);
  });

  it("saves the prices with the day they were seen, as active", async () => {
    const jwt = await accessJwt();
    const day = shift(-10);
    const response = await call(
      "listino",
      jwt,
      base(day, [spritz, { ...spritz, drink: "water", price_cents: 300 }]),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ status: "active" }, { status: "active" }],
    });
    const { results } = await env.DB.prepare(
      "SELECT drink, price_cents, observed_on, status FROM prices_current ORDER BY drink",
    ).all();
    expect(results).toEqual([
      { drink: "spritz", price_cents: 700, observed_on: day, status: "active" },
      { drink: "water", price_cents: 300, observed_on: day, status: "active" },
    ]);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM price_obs").first<{
      n: number;
    }>();
    expect(count?.n).toBe(2);
  });

  it("refuses a future day, a day older than 90 days and a malformed day with 400", async () => {
    const jwt = await accessJwt();
    for (const day of [shift(1), shift(-91), "2026-02-30", "26-10-01", "ieri"])
      expect((await call("listino", jwt, base(day, [spritz]))).status).toBe(400);
    expect((await call("listino", jwt, base(shift(-90), [spritz]))).status).toBe(200);
    expect((await call("listino", jwt, base(shift(0), [spritz]))).status).toBe(200);
  });

  it("applies the catalog and the limits of a person's entry", async () => {
    const jwt = await accessJwt();
    const day = shift(-1);
    for (const item of [
      { ...spritz, price_cents: 100 }, // under the limit
      { ...spritz, price_cents: 9_000 }, // over the limit
      { ...spritz, drink: "prosecco" }, // not in the catalog
      { ...spritz, size_ml: 200 }, // extra field
    ])
      expect((await call("listino", jwt, base(day, [item]))).status).toBe(400);
    expect((await call("listino", jwt, base(day, []))).status).toBe(400);
    // Nothing was written by the refused requests.
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM prices_current").first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
  });

  it("refuses a bar that is not in the cell", async () => {
    const jwt = await accessJwt();
    expect(
      (await call("listino", jwt, { ...base(shift(-1), [spritz]), cell: "u0nd8" })).status,
    ).toBe(400);
  });

  it("never replaces a newer price with an older one, nor one under review", async () => {
    const jwt = await accessJwt();
    await call("listino", jwt, base(shift(-1), [spritz]));
    const older = await call("listino", jwt, base(shift(-5), [{ ...spritz, price_cents: 900 }]));
    expect(await older.json()).toEqual({ results: [{ status: "skipped", code: "newer_exists" }] });
    await env.DB.prepare("UPDATE prices_current SET status = 'review'").run();
    const review = await call("listino", jwt, base(shift(0), [{ ...spritz, price_cents: 800 }]));
    expect(await review.json()).toEqual({ results: [{ status: "skipped", code: "under_review" }] });
    const row = await env.DB.prepare("SELECT price_cents FROM prices_current").first<{
      price_cents: number;
    }>();
    expect(row?.price_cents).toBe(700);
  });
});
