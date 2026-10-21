import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../../src/worker/lib/session";

// A saved price or a confirmation must show at once in the cell the map reads: the cell answer is cached
// at the edge for 60 s (SPEC 5.4) and the cache is dropped by every write of a person, not only by the admin.

const ORIGIN = "https://dovebevo.example";
const BAR = "n2420779240"; // Bistrot Duomo, fixture cell u0nd9
const CELL = "u0nd9";

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

const save = (cents: number, cookie: string, ip: string) =>
  post(
    "/api/prices",
    {
      venue: BAR,
      cell: CELL,
      source: "manual",
      items: [{ drink: "spritz", hh: 0, price_cents: cents }],
    },
    cookie,
    ip,
  );

/** The spritz row of the bar in the cell answer, as the map reads it: [price, confirmations]. */
async function spritzInCell(): Promise<[number, number] | undefined> {
  const response = await exports.default.fetch(`${ORIGIN}/api/prices/${CELL}`);
  const { p } = await response.json<{ p: [string, string, number, number, string, number][] }>();
  const row = p.find((r) => r[0] === BAR && r[1] === "spritz");
  return row ? [row[3], row[5]] : undefined;
}

beforeEach(async () => {
  await env.DB.batch(
    ["prices_current", "price_obs", "counters", "dedup", "reports"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  await caches.default.delete(new Request(`${ORIGIN}/api/prices/${CELL}`));
});

describe("the cell cache follows the writes of people", () => {
  it("a changed price is in the next read of the cell, not up to 60 s later", async () => {
    const cookie = await newSession();
    expect((await save(700, cookie, "203.0.113.10")).status).toBe(200);
    expect(await spritzInCell()).toEqual([700, 0]); // read and cached
    expect((await save(800, cookie, "203.0.113.10")).status).toBe(200);
    expect(await spritzInCell()).toEqual([800, 0]);
  });

  it("a confirmation is in the next read of the cell", async () => {
    expect((await save(700, await newSession(), "203.0.113.11")).status).toBe(200);
    expect(await spritzInCell()).toEqual([700, 0]);
    const other = await newSession();
    const response = await post(
      "/api/prices/confirm",
      { venue: BAR, drink: "spritz", hh: 0 },
      other,
      "203.0.113.12",
    );
    expect(await response.json()).toMatchObject({ status: "confirmed", confirmations: 1 });
    expect(await spritzInCell()).toEqual([700, 1]);
  });
});
