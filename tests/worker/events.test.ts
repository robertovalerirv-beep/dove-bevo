import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { romeDay } from "../../src/worker/lib/day";

const ORIGIN = "https://dovebevo.example";

// sendBeacon sends text/plain with no cookie: the route must work like that (D-06).
const beacon = (body: unknown, init: { origin?: string | null; type?: string; ip?: string } = {}) =>
  exports.default.fetch(`${ORIGIN}/api/events`, {
    method: "POST",
    headers: {
      ...(init.origin === null ? {} : { Origin: init.origin ?? ORIGIN }),
      "Content-Type": init.type ?? "text/plain;charset=UTF-8",
      "CF-Connecting-IP": init.ip ?? "203.0.113.9",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const rows = async () =>
  (
    await env.DB.prepare("SELECT event, prop, n FROM metrics_daily ORDER BY event, prop").all<{
      event: string;
      prop: string;
      n: number;
    }>()
  ).results;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM metrics_daily").run();
});

describe("POST /api/events (M5-01, D-06)", () => {
  it("counts a visit without a session or JSON content type", async () => {
    const res = await beacon({
      events: [
        { e: "app_open", p: { day_bucket: "1-7" } },
        { e: "price_added", p: { drink: "spritz" } },
        { e: "price_added", p: { drink: "spritz" } },
        { e: "venue_viewed" },
      ],
    });
    expect(res.status).toBe(204);
    const day = romeDay();
    const all = await env.DB.prepare("SELECT day FROM metrics_daily").all<{ day: string }>();
    expect(new Set(all.results.map((r) => r.day))).toEqual(new Set([day]));
    expect(await rows()).toEqual([
      { event: "app_open", prop: "day_bucket:1-7", n: 1 },
      { event: "price_added", prop: "drink:spritz", n: 2 },
      { event: "venue_viewed", prop: "-", n: 1 },
      { event: "visit_contributed", prop: "-", n: 1 },
    ]);
  });

  it("counts visit_contributed once per beacon with a price_added, not otherwise", async () => {
    await beacon({ events: [{ e: "app_open" }, { e: "venue_viewed" }] });
    expect((await rows()).some((r) => r.event === "visit_contributed")).toBe(false);
    await beacon({ events: [{ e: "price_added" }] });
    await beacon({ events: [{ e: "price_added" }] });
    expect((await rows()).find((r) => r.event === "visit_contributed")?.n).toBe(2);
  });

  it("adds up across beacons", async () => {
    await beacon({ events: [{ e: "price_confirmed" }] });
    await beacon({ events: [{ e: "price_confirmed" }] });
    expect(await rows()).toEqual([{ event: "price_confirmed", prop: "-", n: 2 }]);
  });

  it("rejects events and properties outside the list with 400", async () => {
    for (const body of [
      { events: [{ e: "page_view" }] },
      { events: [{ e: "app_open", p: { day_bucket: "9999" } }] },
      { events: [{ e: "price_added", p: { drink: "prosecco" } }] },
      { events: [{ e: "price_added", p: { source: "menu_photo" } }] },
      { events: [{ e: "price_added", p: { city: "12345" } }] }, // unbounded values would grow the table
      { events: [{ e: "price_added", p: { ip: "1.2.3.4" } }] },
      { events: [{ e: "app_open", extra: 1 }] },
      { events: [{ e: "app_open" }], sid: "x" },
      { events: Array.from({ length: 11 }, () => ({ e: "app_open" })) },
      { events: [] },
      "not json",
    ]) {
      expect((await beacon(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await rows()).toEqual([]);
  });

  it("accepts the allowed properties", async () => {
    const res = await beacon({
      events: [{ e: "price_added", p: { source: "manual" } }, { e: "venue_viewed" }],
    });
    expect(res.status).toBe(204);
    expect(await rows()).toEqual([
      { event: "price_added", prop: "source:manual", n: 1 },
      { event: "venue_viewed", prop: "-", n: 1 },
      { event: "visit_contributed", prop: "-", n: 1 },
    ]);
  });

  it("answers 413 above 2 KB, even without Content-Length", async () => {
    const big = JSON.stringify({ events: [{ e: "app_open" }], pad: "x".repeat(3000) });
    expect((await beacon(big)).status).toBe(413);
    expect(await rows()).toEqual([]);
  });

  it("answers 403 to a foreign or missing Origin", async () => {
    expect(
      (await beacon({ events: [{ e: "app_open" }] }, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect((await beacon({ events: [{ e: "app_open" }] }, { origin: null })).status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it("stores nothing that links to a person: only day, event, prop and n", async () => {
    await beacon({ events: [{ e: "app_open" }] }, { ip: "198.51.100.77" });
    const dump = JSON.stringify(
      (await env.DB.prepare("SELECT * FROM metrics_daily").all()).results,
    );
    expect(dump).not.toContain("198.51.100.77");
    const cols = (
      await env.DB.prepare("PRAGMA table_info(metrics_daily)").all<{ name: string }>()
    ).results.map((c) => c.name);
    expect(cols).toEqual(["day", "event", "prop", "n"]);
  });
});
