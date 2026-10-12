import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../../src/worker/lib/session";

const ORIGIN = "https://dovebevo.example";
const BAR = "n2420779240"; // Bistrot Duomo, fixture cell u0nd9
const OTHER_BARS = ["n13001337602", "w549495264", "n13001316579", "n7953838530", "n12898930855"];

interface Results {
  results: { status: string; code?: string }[];
}

async function newSession(): Promise<string> {
  const { token } = await createSession("test-session-hmac-key");
  return `__Host-sid=${token}`;
}

function post(path: string, body: unknown, cookie: string, ip = "203.0.113.7") {
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

const priceBody = (items: object[], venue = BAR, cell = "u0nd9") => ({
  venue,
  cell,
  source: "manual",
  items,
});
const spritz = (price_cents: number) => ({ drink: "spritz", size_ml: 0, hh: 0, price_cents });

async function current(venue = BAR, drink = "spritz") {
  return env.DB.prepare("SELECT * FROM prices_current WHERE venue_key = ? AND drink = ?")
    .bind(venue, drink)
    .first<{
      price_cents: number;
      status: string;
      confirmations: number;
      city: number;
      cell: string;
    }>();
}

beforeEach(async () => {
  await env.DB.batch(
    ["prices_current", "price_obs", "counters", "dedup", "reports"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

describe("POST /api/prices validation (M2-08)", () => {
  it("saves a valid price with cell and city taken from the static file", async () => {
    const response = await post("/api/prices", priceBody([spritz(750)]), await newSession());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [{ status: "active" }] });
    expect(await current()).toMatchObject({
      price_cents: 750,
      status: "active",
      cell: "u0nd9",
      city: 62505581,
    });
    const obs = await env.DB.prepare("SELECT COUNT(*) AS n FROM price_obs").first<{ n: number }>();
    expect(obs?.n).toBe(1);
  });

  it("rejects an out-of-range price with a code, without saving it", async () => {
    const body: Results = await (
      await post("/api/prices", priceBody([spritz(9900)]), await newSession())
    ).json();
    expect(body.results).toEqual([{ status: "rejected", code: "out_of_range" }]);
    expect(await current()).toBeNull();
  });

  it("400 for a bar not in the cell, a drink or a size outside the catalog", async () => {
    const cookie = await newSession();
    expect(
      (await post("/api/prices", priceBody([spritz(750)], "n1", "u0nd9"), cookie)).status,
    ).toBe(400);
    expect((await post("/api/prices", priceBody([spritz(750)], BAR, "u0ndf"), cookie)).status).toBe(
      400,
    );
    expect((await post("/api/prices", priceBody([spritz(750)], BAR, "zzzzz"), cookie)).status).toBe(
      400,
    );
    const whisky = { drink: "whisky", size_ml: 0, hh: 0, price_cents: 800 };
    expect((await post("/api/prices", priceBody([whisky]), cookie)).status).toBe(400);
    const pint = { drink: "beer_draft", size_ml: 568, hh: 0, price_cents: 600 };
    expect((await post("/api/prices", priceBody([pint]), cookie)).status).toBe(400);
  });

  it("menu_photo without an extraction token → 403 (D-09)", async () => {
    const body = { ...priceBody([spritz(750)]), source: "menu_photo" };
    expect((await post("/api/prices", body, await newSession())).status).toBe(403);
  });
});

describe("anti-fraud quarantine (M2-09, D-10)", () => {
  it("quarantines a price far from the cell median; another session's confirmation activates it", async () => {
    for (const [i, bar] of OTHER_BARS.entries()) {
      await post(
        "/api/prices",
        priceBody([spritz(480 + i * 10)], bar),
        await newSession(),
        `198.51.100.${String(i)}`,
      );
    }
    const author = await newSession();
    const body: Results = await (
      await post("/api/prices", priceBody([spritz(900)]), author)
    ).json();
    expect(body.results).toEqual([{ status: "quarantined" }]);
    const cell: { p: unknown[][] } = await (
      await exports.default.fetch(`${ORIGIN}/api/prices/u0nd9`)
    ).json();
    expect(cell.p.find((p) => p[0] === BAR)?.[7]).toBe(1); // q = 1: off the map, in "In verifica"

    const confirm = { venue: BAR, drink: "spritz", size_ml: 0, hh: 0 };
    await post("/api/prices/confirm", confirm, author); // the author does not count
    expect((await current())?.status).toBe("quarantined");
    const other = await post("/api/prices/confirm", confirm, await newSession(), "192.0.2.50");
    expect(await other.json()).toMatchObject({ status: "confirmed" });
    expect(await current()).toMatchObject({ status: "active", confirmations: 1 });
  });
});

describe("same price same day = confirmation (M2-10)", () => {
  it("counts an identical insert from another session as a confirmation, without a new current row", async () => {
    await post("/api/prices", priceBody([spritz(750)]), await newSession());
    const second: Results = await (
      await post("/api/prices", priceBody([spritz(750)]), await newSession(), "192.0.2.9")
    ).json();
    expect(second.results).toEqual([{ status: "confirmed" }]);
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM prices_current").first<{
      n: number;
    }>();
    expect(rows?.n).toBe(1);
    expect((await current())?.confirmations).toBe(1);
  });

  it("a different price replaces the current one and resets the confirmations", async () => {
    await post("/api/prices", priceBody([spritz(750)]), await newSession());
    await post("/api/prices", priceBody([spritz(750)]), await newSession(), "192.0.2.9");
    await post("/api/prices", priceBody([spritz(800)]), await newSession(), "192.0.2.10");
    expect(await current()).toMatchObject({ price_cents: 800, confirmations: 0 });
    const obs = await env.DB.prepare("SELECT COUNT(*) AS n FROM price_obs").first<{ n: number }>();
    expect(obs?.n).toBe(2);
  });
});

describe("Confermo (M2-11)", () => {
  it("one tap increments, a second tap of the same session does not", async () => {
    await post("/api/prices", priceBody([spritz(750)]), await newSession());
    const me = await newSession();
    const confirm = { venue: BAR, drink: "spritz", size_ml: 0, hh: 0 };
    expect(
      await (await post("/api/prices/confirm", confirm, me, "192.0.2.20")).json(),
    ).toMatchObject({
      status: "confirmed",
      confirmations: 1,
    });
    expect(
      await (await post("/api/prices/confirm", confirm, me, "192.0.2.20")).json(),
    ).toMatchObject({
      status: "already",
      confirmations: 1,
    });
    expect((await post("/api/prices/confirm", { ...confirm, drink: "negroni" }, me)).status).toBe(
      404,
    );
  });
});

describe("quotas (M2-14)", () => {
  it("the 31st manual price of the day → 429 with Retry-After, per session and per IP", async () => {
    const cookie = await newSession();
    const drinks = ["spritz", "gin_tonic", "negroni", "alcohol_free", "beer_bottle", "soft_drink"];
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        drink: drinks[i % 6],
        size_ml: [0, 0, 0, 0, 330, 330][i % 6],
        hh: i % 2,
        price_cents: 500,
      }));
    expect((await post("/api/prices", priceBody(items(30)), cookie, "192.0.2.30")).status).toBe(
      200,
    );
    const over = await post("/api/prices", priceBody(items(1)), cookie, "192.0.2.31");
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await over.json()).toMatchObject({ error: { code: "rate_limited" } });
    // Same IP, fresh sessions: the IP quota is the same 30.
    const ip = "192.0.2.40";
    expect((await post("/api/prices", priceBody(items(30)), await newSession(), ip)).status).toBe(
      200,
    );
    expect((await post("/api/prices", priceBody(items(1)), await newSession(), ip)).status).toBe(
      429,
    );
  });
});

describe("no personal data stored (M2-16)", () => {
  it("no table outside counters/dedup holds a sid, an IP or a hash of them", async () => {
    const cookie = await newSession();
    const ip = "198.51.100.77";
    await post("/api/prices", priceBody([spritz(750)]), cookie, ip);
    await post(
      "/api/prices/confirm",
      { venue: BAR, drink: "spritz", size_ml: 0, hh: 0 },
      await newSession(),
      ip,
    );
    const sid = cookie.slice("__Host-sid=".length);
    const tables = [
      "prices_current",
      "price_obs",
      "venues_user",
      "reports",
      "ai_usage",
      "metrics_daily",
    ];
    for (const table of tables) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      const dump = JSON.stringify(results);
      expect(dump).not.toContain(ip);
      expect(dump).not.toContain(sid.split(".")[0] ?? "");
      expect(dump).not.toMatch(/[0-9a-f]{32}/); // HMAC keys of counters/dedup
    }
    const counters = await env.DB.prepare("SELECT k FROM counters").all<{ k: string }>();
    for (const { k } of counters.results) expect(k).toMatch(/^[0-9a-f]{32}$/);
  });
});
