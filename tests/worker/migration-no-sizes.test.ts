import { env } from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// MC-03 (SPEC 1.6, ADR 0028): migration 0006 takes the size out of the data. It is run here on the
// schema of before (0001 and 0003) filled with sized prices.
const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] };
const migration = TEST_MIGRATIONS.find((m) => m.name.startsWith("0006"));

const OLD_SCHEMA = [
  "DROP TABLE IF EXISTS archive_sizes_prices",
  "DROP TABLE IF EXISTS archive_sizes_obs",
  "DROP TABLE IF EXISTS archive_sizes_reports",
  "DROP TABLE prices_current",
  "DROP TABLE price_obs",
  "DROP TABLE reports",
  `CREATE TABLE prices_current (
     venue_key TEXT NOT NULL, drink TEXT NOT NULL, size_ml INTEGER NOT NULL, hh INTEGER NOT NULL DEFAULT 0,
     cell TEXT NOT NULL, city INTEGER, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
     confirmations INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','quarantined','review','removed')),
     source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')),
     PRIMARY KEY (venue_key, drink, size_ml, hh)) WITHOUT ROWID`,
  "CREATE INDEX pc_cell ON prices_current (cell, drink)",
  `CREATE TABLE price_obs (
     id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT NOT NULL, size_ml INTEGER NOT NULL,
     hh INTEGER NOT NULL, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')), status TEXT NOT NULL)`,
  "CREATE INDEX po_venue ON price_obs (venue_key, drink)",
  `CREATE TABLE reports (id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT, size_ml INTEGER, hh INTEGER,
     reason TEXT NOT NULL CHECK (reason IN ('wrong_price','closed','not_exists','wrong_info','offensive')),
     day TEXT NOT NULL, cell TEXT)`,
  "CREATE INDEX rp_bar ON reports (venue_key) WHERE drink IS NULL",
];

const SIZED: [string, number][] = [
  ["beer_draft", 200],
  ["beer_draft", 400],
  ["beer_draft", 500],
  ["beer_bottle", 330],
  ["prosecco", 150],
  ["soft_drink", 330],
  ["spritz", 0],
  ["wine_glass", 150],
];

describe("migration 0006: no sizes", () => {
  it("is there", () => {
    expect(migration).toBeDefined();
  });

  it("keeps the kept drinks, drops the size, and archives what has no place in the new list", async () => {
    const statements = [
      ...OLD_SCHEMA.map((sql) => env.DB.prepare(sql)),
      ...SIZED.map(([drink, size], i) =>
        env.DB.prepare(
          `INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source)
           VALUES ('n1', ?1, ?2, 0, 'u0nd9', 1, ?3, '2026-10-10', 2, 'active', 'manual')`,
        ).bind(drink, size, 500 + i),
      ),
      ...SIZED.map(([drink, size]) =>
        env.DB.prepare(
          `INSERT INTO price_obs (venue_key, drink, size_ml, hh, price_cents, observed_on, source, status)
           VALUES ('n1', ?1, ?2, 0, 500, '2026-10-10', 'manual', 'active')`,
        ).bind(drink, size),
      ),
      env.DB.prepare(
        `INSERT INTO reports (venue_key, drink, size_ml, hh, reason, day, cell) VALUES
           ('n1', NULL, NULL, NULL, 'closed', '2026-10-10', 'u0nd9'),
           ('n1', 'prosecco', 150, 0, 'wrong_price', '2026-10-10', 'u0nd9'),
           ('n1', 'beer_draft', 200, 0, 'wrong_price', '2026-10-10', 'u0nd9'),
           ('n1', 'spritz', 0, 0, 'wrong_price', '2026-10-10', 'u0nd9')`,
      ),
    ];
    await env.DB.batch(statements);

    await env.DB.batch((migration?.queries ?? []).map((sql) => env.DB.prepare(sql)));

    const current = await env.DB.prepare(
      "SELECT drink, price_cents FROM prices_current ORDER BY drink",
    ).all<{ drink: string; price_cents: number }>();
    // The 0.4 l beer is the beer; the 0.2 and 0.5 l ones and the three drinks that left are not here.
    expect(current.results).toEqual([
      { drink: "beer_draft", price_cents: 501 },
      { drink: "spritz", price_cents: 506 },
      { drink: "wine_glass", price_cents: 507 },
    ]);
    const columns = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('prices_current')",
    ).all<{
      name: string;
    }>();
    expect(columns.results.map((c) => c.name)).not.toContain("size_ml");
    for (const table of ["price_obs", "reports"]) {
      const info = await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{
        name: string;
      }>();
      expect(info.results.map((c) => c.name)).not.toContain("size_ml");
    }

    expect(
      (await env.DB.prepare("SELECT drink FROM price_obs ORDER BY drink").all()).results,
    ).toEqual([{ drink: "beer_draft" }, { drink: "spritz" }, { drink: "wine_glass" }]);
    // The bar report (no drink) stays; the report on the spritz stays; the two on dropped prices go.
    expect(
      (await env.DB.prepare("SELECT drink, reason FROM reports ORDER BY id").all()).results,
    ).toEqual([
      { drink: null, reason: "closed" },
      { drink: "spritz", reason: "wrong_price" },
    ]);

    // Nothing is lost: the rows that left are in the archive tables.
    const archived = await env.DB.prepare(
      "SELECT drink, size_ml FROM archive_sizes_prices ORDER BY drink, size_ml",
    ).all<{ drink: string; size_ml: number }>();
    expect(archived.results).toEqual([
      { drink: "beer_bottle", size_ml: 330 },
      { drink: "beer_draft", size_ml: 200 },
      { drink: "beer_draft", size_ml: 500 },
      { drink: "prosecco", size_ml: 150 },
      { drink: "soft_drink", size_ml: 330 },
    ]);
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM archive_sizes_obs").first<{ n: number }>())
        ?.n,
    ).toBe(5);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM archive_sizes_reports").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(2);

    // The new key: one row per bar, drink and band; the indexes are back.
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('pc_cell', 'po_venue', 'rp_bar') ORDER BY name",
    ).all<{ name: string }>();
    expect(indexes.results.map((i) => i.name)).toEqual(["pc_cell", "po_venue", "rp_bar"]);
  });
});
