import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../../src/worker/lib/session";

// SPEC 11, ADR 0025 (perf C1/C2): a request with many prices is one batch of reads and one batch of
// writes instead of up to ~480 D1 calls. These scenarios were recorded on the sequential version;
// the batched one must give exactly the same answers and the same rows.
const ORIGIN = "https://dovebevo.example";
const BAR = "n2420779240"; // Bistrot Duomo, fixture cell u0nd9
const CELL = "u0nd9";

type Item = { drink: string; hh: 0 | 1; price_cents: number };
const spritz = (price_cents: number, hh: 0 | 1 = 0): Item => ({
  drink: "spritz",
  hh,
  price_cents,
});
const beer = (price_cents: number, hh: 0 | 1 = 0): Item => ({
  drink: "beer_draft",
  hh,
  price_cents,
});

async function newSession(): Promise<string> {
  const { token } = await createSession("test-session-hmac-key");
  return `__Host-sid=${token}`;
}

function post(path: string, body: unknown, cookie: string, ip: string) {
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: cookie,
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify(body),
  });
}

async function send(items: Item[], cookie: string, ip: string, venue = BAR) {
  const response = await post(
    "/api/prices",
    { venue, cell: CELL, source: "manual", items },
    cookie,
    ip,
  );
  expect(response.status).toBe(200);
  const body: { results: unknown[] } = await response.json();
  return body.results;
}

/** The rows a scenario leaves behind (no ids, no dedup keys: those hold random session ids). */
async function rows(venue = BAR) {
  const [current, obs] = await env.DB.batch([
    env.DB.prepare(
      `SELECT drink, hh, price_cents, confirmations, status FROM prices_current
       WHERE venue_key = ?1 ORDER BY drink, hh`,
    ).bind(venue),
    env.DB.prepare(
      `SELECT drink, hh, price_cents, status FROM price_obs WHERE venue_key = ?1 ORDER BY id`,
    ).bind(venue),
  ]);
  return {
    current: (current?.results ?? []) as Record<string, unknown>[],
    obs: (obs?.results ?? []) as Record<string, unknown>[],
  };
}

async function seedPeers(price: number, count: number) {
  await env.DB.batch(
    Array.from({ length: count }, (_, i) =>
      env.DB.prepare(
        `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
         VALUES (?1, 'spritz', 0, ?2, 1, ?3, '2026-10-01', 0, 'active', 'manual')`,
      ).bind(`n${String(900 + i)}`, CELL, price),
    ),
  );
}

beforeEach(async () => {
  await env.DB.batch(
    ["prices_current", "price_obs", "counters", "dedup", "reports", "venues_user"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

describe("a request with several prices (golden answers of the sequential version)", () => {
  it("mixed items: new, quarantine against the cell median, duplicates, out of range, same price again", async () => {
    await seedPeers(500, 5);
    const results = await send(
      [
        spritz(500), // new, peers at 5,00 → active
        spritz(900), // same triple: now compared with the median of 5 peers + own 5,00 → quarantined
        beer(600), // no peers → active
        { drink: "gin_tonic", hh: 0, price_cents: 9900 }, // out of range
        beer(450, 1), // happy hour is another price
        beer(600), // equals the current beer: a confirmation, but the author cannot confirm
      ],
      await newSession(),
      "203.0.113.10",
    );
    expect(results).toEqual([
      { status: "active" },
      { status: "quarantined" },
      { status: "active" },
      { status: "rejected", code: "out_of_range" },
      { status: "active" },
      { status: "confirmed", code: "already" },
    ]);
    expect(await rows()).toEqual({
      current: [
        {
          drink: "beer_draft",
          hh: 0,
          price_cents: 600,
          confirmations: 0,
          status: "active",
        },
        {
          drink: "beer_draft",
          hh: 1,
          price_cents: 450,
          confirmations: 0,
          status: "active",
        },
        {
          drink: "spritz",
          hh: 0,
          price_cents: 900,
          confirmations: 0,
          status: "quarantined",
        },
      ],
      obs: [
        { drink: "spritz", hh: 0, price_cents: 500, status: "active" },
        { drink: "spritz", hh: 0, price_cents: 900, status: "quarantined" },
        { drink: "beer_draft", hh: 0, price_cents: 600, status: "active" },
        { drink: "beer_draft", hh: 1, price_cents: 450, status: "active" },
      ],
    });
  });

  it("another person confirms the same price once; the same session and the same IP do not count again", async () => {
    const author = await newSession();
    await send([spritz(700), beer(500)], author, "203.0.113.20");
    const other = await newSession();
    expect(await send([spritz(700), beer(500)], other, "203.0.113.21")).toEqual([
      { status: "confirmed" },
      { status: "confirmed" },
    ]);
    expect(await send([spritz(700)], other, "203.0.113.21")).toEqual([
      { status: "confirmed", code: "already" },
    ]);
    // a new session behind the same IP is the same person
    expect(await send([spritz(700)], await newSession(), "203.0.113.21")).toEqual([
      { status: "confirmed", code: "already" },
    ]);
    // the author, from a new IP, is stopped by the author marker of the session
    expect(await send([spritz(700)], author, "203.0.113.99")).toEqual([
      { status: "confirmed", code: "already" },
    ]);
    const { current } = await rows();
    expect(current.map((r) => [r["drink"], r["confirmations"]])).toEqual([
      ["beer_draft", 1],
      ["spritz", 1],
    ]);
  });

  it("a different price replaces the current one and resets its confirmations", async () => {
    await send([spritz(700)], await newSession(), "203.0.113.30");
    await send([spritz(700)], await newSession(), "203.0.113.31"); // 1 confirmation
    expect(await send([spritz(750)], await newSession(), "203.0.113.32")).toEqual([
      { status: "active" },
    ]);
    const { current, obs } = await rows();
    expect(current).toEqual([
      { drink: "spritz", hh: 0, price_cents: 750, confirmations: 0, status: "active" },
    ]);
    expect(obs.map((o) => o["price_cents"])).toEqual([700, 750]);
  });

  it("a quarantined price becomes active when another person confirms it", async () => {
    await seedPeers(500, 5);
    expect(await send([spritz(900)], await newSession(), "203.0.113.40")).toEqual([
      { status: "quarantined" },
    ]);
    expect(await send([spritz(900)], await newSession(), "203.0.113.41")).toEqual([
      { status: "confirmed" },
    ]);
    expect((await rows()).current).toEqual([
      { drink: "spritz", hh: 0, price_cents: 900, confirmations: 1, status: "active" },
    ]);
  });

  it("a price under review or removed is rejected for everyone but the admin", async () => {
    await send([spritz(700), beer(500)], await newSession(), "203.0.113.50");
    await env.DB.prepare(
      "UPDATE prices_current SET status = 'review' WHERE drink = 'spritz'",
    ).run();
    await env.DB.prepare(
      "UPDATE prices_current SET status = 'removed' WHERE drink = 'beer_draft'",
    ).run();
    expect(await send([spritz(710), beer(510)], await newSession(), "203.0.113.51")).toEqual([
      { status: "rejected", code: "under_review" },
      { status: "rejected", code: "under_review" },
    ]);
  });

  it("the prices of a proposed bar do not count as peers until the bar is approved (ADR 0019)", async () => {
    await env.DB.prepare(
      `INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES
       (1, 'Nuovo', 1, 45.4642, 9.19, ?1, 'pending'), (2, 'Approvato', 1, 45.4643, 9.19, ?1, 'approved')`,
    )
      .bind(CELL)
      .run();
    await seedPeers(500, 3);
    await send([spritz(500)], await newSession(), "203.0.113.60", "u1"); // pending bar
    await send([spritz(500)], await newSession(), "203.0.113.61", "u2"); // approved bar
    // 3 other bars + the approved one = 4 public peers < 5: not an outlier yet (the pending one is out)
    expect(await send([spritz(900)], await newSession(), "203.0.113.62")).toEqual([
      { status: "active" },
    ]);
    await env.DB.prepare("DELETE FROM prices_current WHERE venue_key = ?1").bind(BAR).run();
    await env.DB.prepare(
      `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
       VALUES ('n903', 'spritz', 0, ?1, 1, 500, '2026-10-01', 0, 'active', 'manual')`,
    )
      .bind(CELL)
      .run();
    // 4 other bars + the approved one = 5 public peers → 9,00 is an outlier
    expect(await send([spritz(900)], await newSession(), "203.0.113.63")).toEqual([
      { status: "quarantined" },
    ]);
  });

  it("30 items for the same bar (more than one batch of statements) give the answers of 30 one-by-one requests", async () => {
    await seedPeers(500, 5);
    const items = Array.from({ length: 30 }, (_, i) =>
      spritz(i % 2 ? 500 : i % 4 === 0 ? 1000 : 480),
    );
    const results = (await send(items, await newSession(), "203.0.113.70")) as {
      status: string;
      code?: string;
    }[];
    // Recorded on the sequential version: a 10,00 € outlier is held back (the own price counts as a
    // peer only while it is active), the 5,00 € and 4,80 € after it are fine.
    const status = (i: number) => (i % 4 === 0 ? "quarantined" : "active");
    expect(results).toEqual(items.map((_, i) => ({ status: status(i) })));
    expect(await rows()).toEqual({
      current: [
        {
          drink: "spritz",
          hh: 0,
          price_cents: 500,
          confirmations: 0,
          status: "active",
        },
      ],
      obs: items.map((item, i) => ({
        drink: "spritz",
        hh: 0,
        price_cents: item.price_cents,
        status: status(i),
      })),
    });
  });
});

describe("D1 round trips (ADR 0025)", () => {
  it("30 prices for one bar take a handful of batches, not hundreds of calls", async () => {
    await seedPeers(500, 5);
    let batches = 0;
    const original = env.DB.batch.bind(env.DB);
    env.DB.batch = (statements: D1PreparedStatement[]) => {
      batches++;
      return original(statements);
    };
    try {
      const items = Array.from({ length: 30 }, (_, i) => spritz(i % 2 ? 500 : 480));
      await send(items, await newSession(), "203.0.113.80");
    } finally {
      env.DB.batch = original;
    }
    // reads (1) + writes in slices of 100 statements (30 items × 4 statements = 120 → 2) + quota/venue
    // checks outside the batches; the sequential version made ~150 calls for the same request
    expect(batches).toBeGreaterThan(0);
    expect(batches).toBeLessThanOrEqual(5);
  });
});
