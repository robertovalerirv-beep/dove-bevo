import { env, exports } from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { CellPrices, VenuePrices } from "../../src/shared/api-types";
import type { WeekHours } from "../../src/shared/hours";
import { summarizeMetrics, type MetricRow } from "../../src/shared/metrics";
import { getCellPrices, SNAPSHOT_SQL } from "../../src/worker/lib/db";
import { forgetCoverage } from "../../src/worker/lib/coverage";
import { romeDay } from "../../src/worker/lib/day";
import { resetSeoMemory } from "../../src/worker/lib/seo";
import { createSession } from "../../src/worker/lib/session";
import { accessJwt, ORIGIN } from "./access-jwt";

// «Gestore verificato» (SPEC 1.9, D-34, ADR 0033): MD-01, MD-02, MD-04, MD-05, MD-10, MD-11.
const CELL = "u0nd9";
const VESTA = "n10013246997"; // in the fixture cell u0nd9
const BISTROT = "n10081337586";
const HOURS: WeekHours = [
  [],
  [["08:00", "20:00"]],
  [["08:00", "20:00"]],
  [["08:00", "20:00"]],
  [
    ["08:00", "15:00"],
    ["18:00", "02:00"],
  ],
  [["18:00", "02:00"]],
  [],
];

const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] };

// Every request from its own address: the burst limit of the writes (SPEC 13.3) is not under test here.
let requests = 0;
const ip = () => {
  requests += 1;
  return `10.${String(Math.floor(requests / 250) % 250)}.${String(requests % 250)}.1`;
};
const get = (path: string) =>
  exports.default.fetch(`${ORIGIN}${path}`, { headers: { "CF-Connecting-IP": ip() } });
/** Like the `call` of access-jwt.ts, from a fresh address. */
function call(path: string, jwt: string | null, body?: unknown) {
  const headers: Record<string, string> = { Origin: ORIGIN, "CF-Connecting-IP": ip() };
  if (jwt) headers["Cf-Access-Jwt-Assertion"] = jwt;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return exports.default.fetch(`${ORIGIN}/api/admin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const cellRead = async () => (await get(`/api/prices/${CELL}`)).json<CellPrices>();
const barRead = async (key: string) => (await get(`/api/venues/${key}/prices`)).json<VenuePrices>();
const activate = async (body: Record<string, unknown>) =>
  call("verified", await accessJwt(), { venue: VESTA, cell: CELL, hours: HOURS, ...body });
const userBar = async (status: "approved" | "pending") => {
  const row = await env.DB.prepare(
    "INSERT INTO venues_user (name, kind, lat, lon, cell, status) VALUES ('Bar Prova', 1, 45.47211, 9.18697, ?1, ?2) RETURNING id",
  )
    .bind(CELL, status)
    .first<{ id: number }>();
  return `u${String(row?.id)}`;
};
const beacon = (events: unknown[]) =>
  exports.default.fetch(`${ORIGIN}/api/events`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "text/plain;charset=UTF-8",
      "CF-Connecting-IP": ip(),
    },
    body: JSON.stringify({ events }),
  });

beforeEach(async () => {
  await env.DB.batch(
    [
      "venues_verified",
      "venues_hidden",
      "venues_user",
      "prices_current",
      "cell_snapshot",
      "metrics_daily",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await caches.default.delete(new Request(`${ORIGIN}/api/prices/${CELL}`));
});

describe("venues_verified table (MD-01, MD-10)", () => {
  it("has only the key, the cell, the bar name and the hours: no personal or economic data", async () => {
    const { results } = await env.DB.prepare("PRAGMA table_info(venues_verified)").all<{
      name: string;
      pk: number;
    }>();
    expect(results.map((c) => c.name)).toEqual(["venue_key", "cell", "name", "hours"]);
    expect(results.find((c) => c.pk === 1)?.name).toBe("venue_key");
    const table = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'venues_verified'",
    ).first<{ sql: string }>();
    expect(table?.sql).toMatch(/WITHOUT ROWID/);
    const plan = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT venue_key FROM venues_verified WHERE cell = ?1",
    )
      .bind(CELL)
      .all<{ detail: string }>();
    expect(plan.results.map((r) => r.detail).join(" ")).toMatch(/vv_cell/);
  });

  it("the migration empties the cell snapshots, whose answer gains `g`", async () => {
    const migration = TEST_MIGRATIONS.find((m) => m.name.startsWith("0008"));
    expect(migration?.name).toBe("0008_verified_venues.sql");
    await env.DB.batch([
      env.DB.prepare("DROP INDEX vv_cell"),
      env.DB.prepare("DROP TABLE venues_verified"),
      env.DB.prepare("INSERT INTO cell_snapshot (cell, v, at, body) VALUES ('u0nd9', 3, 1, '{}')"),
    ]);
    for (const query of migration?.queries ?? []) await env.DB.prepare(query).run();
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM cell_snapshot").first<{
      n: number;
    }>();
    expect(left?.n).toBe(0);
  });
});

describe("admin routes (MD-02)", () => {
  it("all three need a valid Access JWT", async () => {
    const forged = await accessJwt({}, true);
    for (const jwt of [null, forged]) {
      expect((await call("verified", jwt)).status).toBe(403);
      expect((await call("verified", jwt, { venue: VESTA, cell: CELL, hours: HOURS })).status).toBe(
        403,
      );
      expect((await call("verified/remove", jwt, { venue: VESTA })).status).toBe(403);
    }
    const expired = await accessJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect((await call("verified", expired)).status).toBe(403);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM venues_verified").first<{
      n: number;
    }>();
    expect(n?.n).toBe(0);
  });

  it("activates an OSM bar with the name of the static file, never the client's", async () => {
    const response = await activate({});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "verified" });
    const row = await env.DB.prepare("SELECT * FROM venues_verified").first();
    expect(row).toEqual({
      venue_key: VESTA,
      cell: CELL,
      name: "Vesta",
      hours: JSON.stringify(HOURS),
    });
    // A name or anything else from the client is refused, not stored.
    expect((await activate({ name: "Bar finto" })).status).toBe(400);
    expect((await activate({ paid_until: "2027-10-25" })).status).toBe(400);
  });

  it("saving again replaces the hours of the same bar (one row)", async () => {
    await activate({});
    const closed: WeekHours = [[], [], [], [], [], [], [["10:00", "12:00"]]];
    expect((await activate({ hours: closed })).status).toBe(200);
    const { results } = await env.DB.prepare("SELECT hours FROM venues_verified").all<{
      hours: string;
    }>();
    expect(results).toEqual([{ hours: JSON.stringify(closed) }]);
  });

  it("refuses bad hours, a bar not in the cell, a hidden bar and a bar not approved", async () => {
    for (const hours of [
      [[], [], [], [], [], []],
      [[], [], [], [], [], [], [["8", "12"]]],
      [[], [], [], [], [], [], [["<b>08:00</b>", "12:00"]]],
      "lun-ven 8-20",
    ])
      expect((await activate({ hours })).status).toBe(400);
    expect((await activate({ cell: "u0ndd" })).status).toBe(400); // Vesta is not in u0ndd
    expect((await activate({ venue: "n1" })).status).toBe(400); // not in the file
    expect((await activate({ venue: "x1" })).status).toBe(400); // not a key
    expect((await activate({ cell: "U0ND9" })).status).toBe(400);
    await env.DB.prepare(
      "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES (?1, ?2, 'Vesta', '2026-10-01')",
    )
      .bind(VESTA, CELL)
      .run();
    expect((await activate({})).status).toBe(400);
    const pending = await userBar("pending");
    expect((await activate({ venue: pending })).status).toBe(400);
    const approved = await userBar("approved");
    expect((await activate({ venue: approved, cell: "u0ndd" })).status).toBe(400);
    expect((await activate({ venue: approved })).status).toBe(200);
    const { results } = await env.DB.prepare("SELECT venue_key, name FROM venues_verified").all();
    expect(results).toEqual([{ venue_key: approved, name: "Bar Prova" }]);
  });

  it("every write forgets the cell: the D1 snapshot and the edge copy", async () => {
    // A cell with something in it, so that its answer is stored as a snapshot.
    await env.DB.prepare(
      "INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES (?1, 'spritz', 0, ?2, 1, 700, '2026-10-10', 0, 'active', 'manual')",
    )
      .bind(BISTROT, CELL)
      .run();
    const edge = new Request(`${ORIGIN}/api/prices/${CELL}`);
    for (const write of [
      () => activate({}),
      async () => call("verified/remove", await accessJwt(), { venue: VESTA }),
    ]) {
      await env.DB.prepare("DELETE FROM cell_snapshot").run();
      await cellRead();
      await caches.default.put(
        edge,
        new Response("{}", { headers: { "Cache-Control": "max-age=60" } }),
      );
      const before = await env.DB.prepare(SNAPSHOT_SQL)
        .bind(CELL)
        .first<{ v: number; body: string | null }>();
      expect(before?.body).not.toBeNull();
      expect((await write()).status).toBe(200);
      const after = await env.DB.prepare(SNAPSHOT_SQL)
        .bind(CELL)
        .first<{ v: number; body: string | null }>();
      expect(after?.body).toBeNull();
      expect(after?.v).toBe((before?.v ?? 0) + 1);
      expect(await caches.default.match(edge)).toBeUndefined();
    }
  });

  it("remove takes the bar off and an unknown bar is 404", async () => {
    await activate({});
    const jwt = await accessJwt();
    const removed = await call("verified/remove", jwt, { venue: VESTA });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ status: "removed" });
    expect((await call("verified/remove", jwt, { venue: VESTA })).status).toBe(404);
    expect((await call("verified/remove", jwt, { venue: VESTA, cell: CELL })).status).toBe(400);
  });

  it("lists the verified bars with their hours and the bar page openings of 30 days", async () => {
    await activate({});
    const day = romeDay();
    const old = new Date(Date.parse(`${day}T12:00:00Z`) - 31 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO metrics_daily (day, event, prop, n) VALUES (?1, 'venue_viewed', ?2, 4), (?3, 'venue_viewed', ?2, 9), (?1, 'venue_viewed', '-', 7)",
      ).bind(day, `venue:${VESTA}`, old),
    ]);
    const response = await call("verified", await accessJwt());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      v: [{ key: VESTA, cell: CELL, name: "Vesta", hours: HOURS }],
      views: [[VESTA, day, 4]],
    });
  });
});

describe("public reads (MD-04)", () => {
  it("the cell lists the verified public bars in `g`, the bar page gives their hours in `o`", async () => {
    expect((await cellRead()).g).toEqual([]);
    expect((await barRead(VESTA)).o).toBeUndefined();
    await activate({});
    expect((await cellRead()).g).toEqual([VESTA]);
    expect((await barRead(VESTA)).o).toEqual(HOURS);
    expect((await barRead(BISTROT)).o).toBeUndefined();
    await call("verified/remove", await accessJwt(), { venue: VESTA });
    expect((await cellRead()).g).toEqual([]);
    expect((await barRead(VESTA)).o).toBeUndefined();
  });

  it("a bar hidden or no longer approved after the activation never shows as verified", async () => {
    const approved = await userBar("approved");
    await activate({});
    await activate({ venue: approved });
    expect((await cellRead()).g?.sort()).toEqual([VESTA, approved].sort());
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES (?1, ?2, 'Vesta', '2026-10-01')",
      ).bind(VESTA, CELL),
      env.DB.prepare("UPDATE venues_user SET status = 'removed'"),
      env.DB.prepare("DELETE FROM cell_snapshot"),
    ]);
    // As the admin's hide and remove do (forgetCell): the edge copy goes too.
    await caches.default.delete(new Request(`${ORIGIN}/api/prices/${CELL}`));
    expect((await cellRead()).g).toEqual([]);
    expect((await barRead(VESTA)).o).toBeUndefined();
    expect((await barRead(approved)).o).toBeUndefined();
  });
});

describe("D1 cost (MD-05)", () => {
  it("a cold cell read is one batch with one more statement; a ready snapshot stays one row", async () => {
    let statements = 0;
    const counting = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "batch")
          return (list: D1PreparedStatement[]) => {
            statements += list.length;
            return target.batch(list);
          };
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    await getCellPrices(counting, CELL);
    expect(statements).toBe(4); // prices, user bars, hidden bars, verified bars

    const insert = Array.from({ length: 300 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES (?, ?, 0, ?, 1, 700, '2026-10-10', 0, 'active', 'manual')",
      ).bind(`n${String(Math.floor(i / 3) + 1)}`, ["spritz", "negroni", "gin_tonic"][i % 3], CELL),
    );
    await env.DB.batch(insert);
    await activate({});
    expect((await cellRead()).p).toHaveLength(300);
    const hit = await env.DB.prepare(SNAPSHOT_SQL).bind(CELL).all();
    expect(hit.meta.rows_read).toBeLessThanOrEqual(5);
  });

  it("the admin route writes at most 5 rows; a contribution in the same cell stays at 10", async () => {
    // Every row of every table, before and after: what a request added, removed or changed.
    const rows = async () => {
      const { results: tables } = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%' AND name NOT LIKE 'd1%'",
      ).all<{ name: string }>();
      const all = new Set<string>();
      for (const { name } of tables)
        for (const row of (await env.DB.prepare(`SELECT * FROM ${name}`).all()).results)
          all.add(`${name}:${JSON.stringify(row)}`);
      return all;
    };
    const written = (before: Set<string>, after: Set<string>) => {
      const gone = [...before].filter((r) => !after.has(r)).map((r) => r.slice(0, r.indexOf(":")));
      const added = [...after].filter((r) => !before.has(r)).map((r) => r.slice(0, r.indexOf(":")));
      // A changed row is one removed and one added in the same table: count it once.
      let n = added.length;
      for (const table of gone) {
        const k = added.indexOf(table);
        if (k >= 0) added.splice(k, 1);
        else n += 1;
      }
      return n;
    };

    let before = await rows();
    expect((await activate({})).status).toBe(200);
    expect(written(before, await rows())).toBeLessThanOrEqual(5);

    before = await rows();
    const { token } = await createSession("test-session-hmac-key");
    const response = await exports.default.fetch(`${ORIGIN}/api/prices`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        Cookie: `__Host-sid=${token}`,
        "CF-Connecting-IP": ip(),
      },
      body: JSON.stringify({
        venue: VESTA,
        cell: CELL,
        source: "manual",
        items: [{ drink: "spritz", hh: 0, price_cents: 750 }],
      }),
    });
    expect(response.status).toBe(200);
    expect(written(before, await rows())).toBeLessThanOrEqual(10);
  });
});

describe("bar page openings (MD-11)", () => {
  const viewed = async () =>
    (
      await env.DB.prepare(
        "SELECT prop, n FROM metrics_daily WHERE event = 'venue_viewed' ORDER BY prop",
      ).all<{ prop: string; n: number }>()
    ).results;

  it("counts the key of a verified bar, and a plain view for any other key", async () => {
    await activate({});
    const response = await beacon([
      { e: "venue_viewed", p: { venue: VESTA } },
      { e: "venue_viewed", p: { venue: BISTROT } }, // not verified: a plain view
      { e: "venue_viewed" },
    ]);
    expect(response.status).toBe(204);
    expect(await viewed()).toEqual([
      { prop: "-", n: 2 },
      { prop: `venue:${VESTA}`, n: 1 },
    ]);
    // The total of bar pages viewed is unchanged by the key (M5-03).
    const { results } = await env.DB.prepare(
      "SELECT day, event, prop, n FROM metrics_daily",
    ).all<MetricRow>();
    expect(summarizeMetrics(results)[0]?.viewed).toBe(3);
  });

  it("refuses a malformed key or a key on another event", async () => {
    for (const events of [
      [{ e: "venue_viewed", p: { venue: "x1" } }],
      [{ e: "venue_viewed", p: { venue: "n1".repeat(20) } }],
      [{ e: "price_added", p: { venue: VESTA } }],
      [{ e: "app_open", p: { venue: VESTA } }],
    ])
      expect((await beacon(events)).status).toBe(400);
    expect(await viewed()).toEqual([]);
  });

  it("a verified bar hidden or no longer approved counts as a plain view, like its page shows it", async () => {
    const approved = await userBar("approved");
    await activate({});
    await activate({ venue: approved });
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES (?1, ?2, 'Vesta', '2026-10-01')",
      ).bind(VESTA, CELL),
      env.DB.prepare("UPDATE venues_user SET status = 'removed'"),
    ]);
    const response = await beacon([
      { e: "venue_viewed", p: { venue: VESTA } },
      { e: "venue_viewed", p: { venue: approved } },
    ]);
    expect(response.status).toBe(204);
    expect(await viewed()).toEqual([{ prop: "-", n: 2 }]);
  });

  it("an invented key never reaches metrics_daily", async () => {
    await beacon([{ e: "venue_viewed", p: { venue: "n999999999" } }]);
    expect(await viewed()).toEqual([{ prop: "-", n: 1 }]);
  });
});

describe("pages for search engines (MD-09)", () => {
  it("the bar page and the city page are the same with or without «Gestore verificato»", async () => {
    await env.DB.batch(
      [VESTA, BISTROT].map((key) =>
        env.DB.prepare(
          "INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES (?1, 'spritz', 0, ?2, 62505581, 700, '2026-10-10', 0, 'active', 'manual')",
        ).bind(key, CELL),
      ),
    );
    const pages = async () => {
      resetSeoMemory();
      forgetCoverage();
      return Promise.all(
        [`/bar/${BISTROT}`, `/bar/${VESTA}`, "/milano"].map(async (path) =>
          (await get(path)).text(),
        ),
      );
    };
    const before = await pages();
    expect(before[0]).toContain("Bistrot Italia"); // a real page, not the bare shell
    expect((await activate({ venue: BISTROT })).status).toBe(200);
    const after = await pages();
    expect(after).toEqual(before);
    for (const html of after) expect(html).not.toMatch(/Gestore verificato|Sponsorizzato/);
  });
});
