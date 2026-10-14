import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../../src/worker/lib/session";

// Findings of the red-team audit of 14/10/2026 (SECURITY.md, ADR 0021).
const ORIGIN = "https://dovebevo.example";

beforeEach(async () => {
  await env.DB.batch(
    ["venues_user", "counters", "dedup"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});

describe("bar keys are canonical", () => {
  const history = (key: string) => exports.default.fetch(`${ORIGIN}/api/venues/${key}/prices`);

  it("refuses zero-padded keys: 'u007' would alias the approved bar u7", async () => {
    expect((await history("u7")).status).toBe(200);
    expect((await history("n123")).status).toBe(200);
    for (const key of ["u007", "n0123", "w00", "u0", "r0001"])
      expect((await history(key)).status, key).toBe(400);
  });
});

describe("GET /api/prices/:cell is metered", () => {
  it("answers 429 with Retry-After when the read limiter refuses, and 200 otherwise", async () => {
    const url = `${ORIGIN}/api/prices/u0nd9`;
    expect((await exports.default.fetch(url)).status).toBe(200);
    const real = env.READ_LIMITER;
    (env as { READ_LIMITER: unknown }).READ_LIMITER = {
      limit: () => Promise.resolve({ success: false }),
    };
    try {
      const refused = await exports.default.fetch(url);
      expect(refused.status).toBe(429);
      expect(refused.headers.get("Retry-After")).toBe("60");
      expect(await refused.json()).toMatchObject({ error: { code: "rate_limited" } });
    } finally {
      (env as { READ_LIMITER: unknown }).READ_LIMITER = real;
    }
  });
});

describe("pending proposals are capped per cell", () => {
  it("beyond 15 waiting in one cell the answer is a polite 503; other cells are not affected", async () => {
    const fill = (cell: string, n: number) =>
      Array.from({ length: n }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO venues_user (name, kind, lat, lon, cell, status, confirmations, day) VALUES (?, 1, 45.4, 9.1, ?, 'pending', 1, date('now'))",
        ).bind(`Riempitivo ${cell} ${String(i)}`, cell),
      );
    await env.DB.batch(fill("u0nd9", 15));
    const propose = async (name: string, lat: number, lon: number, ip: string) =>
      exports.default.fetch(`${ORIGIN}/api/venues`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/json",
          Cookie: `__Host-sid=${(await createSession("test-session-hmac-key")).token}`,
          "CF-Connecting-IP": ip,
        },
        body: JSON.stringify({ name, kind: 1, lat, lon }),
      });
    // Duomo cell (u0nd9): full.
    const full = await propose("Bar Quindicesimo Piu Uno", 45.4651, 9.1911, "203.0.113.50");
    expect(full.status).toBe(503);
    expect(await full.json()).toMatchObject({ error: { code: "busy" } });
    // Rome: another cell, still open.
    expect((await propose("Bar Roma Prova", 41.9028, 12.4964, "203.0.113.51")).status).toBe(200);
  });
});
