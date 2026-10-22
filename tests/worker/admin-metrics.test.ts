import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { summarizeMetrics } from "../../src/shared/metrics";
import { accessJwt, call } from "./access-jwt";

const rows: [string, string, string, number][] = [
  ["2026-10-20", "app_open", "day_bucket:0", 6],
  ["2026-10-20", "app_open", "day_bucket:1-7", 3],
  ["2026-10-20", "app_open", "day_bucket:30+", 1],
  ["2026-10-20", "app_open", "-", 2], // an open without a bucket still counts as a visit
  ["2026-10-20", "price_added", "drink:spritz", 4],
  ["2026-10-20", "price_added", "source:manual", 4], // one event, two props: counted once
  ["2026-10-20", "visit_contributed", "-", 3],
  ["2026-10-21", "venue_viewed", "-", 9],
  ["2026-10-21", "price_confirmed", "drink:spritz", 2],
  ["2026-09-01", "app_open", "day_bucket:0", 100], // outside the window
];

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM metrics_daily").run();
  await env.DB.batch(
    rows.map(([day, event, prop, n]) =>
      env.DB.prepare(
        "INSERT INTO metrics_daily (day, event, prop, n) VALUES (?1, ?2, ?3, ?4)",
      ).bind(day, event, prop, n),
    ),
  );
});

describe("summarizeMetrics (M5-03)", () => {
  it("one line per day, newest first; visits, returning visits, prices, confirmations, bars, contributing visits", () => {
    expect(
      summarizeMetrics(rows.map(([day, event, prop, n]) => ({ day, event, prop, n }))),
    ).toEqual([
      {
        day: "2026-10-21",
        opens: 0,
        returning: 0,
        added: 0,
        confirmed: 2,
        viewed: 9,
        contributed: 0,
      },
      {
        day: "2026-10-20",
        opens: 12,
        returning: 4,
        added: 4,
        confirmed: 0,
        viewed: 0,
        contributed: 3,
      },
      {
        day: "2026-09-01",
        opens: 100,
        returning: 0,
        added: 0,
        confirmed: 0,
        viewed: 0,
        contributed: 0,
      },
    ]);
  });
});

describe("GET /api/admin/metrics (M5-03)", () => {
  it("403 without a valid Access JWT", async () => {
    expect((await call("metrics", null)).status).toBe(403);
    expect((await call("metrics", await accessJwt({}, true))).status).toBe(403);
  });

  it("200 with the last 14 days, not cached", async () => {
    const response = await call("metrics", await accessJwt());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { days } = await response.json<{ days: { day: string }[] }>();
    // The window is 14 Rome days back from today: the fixture days of October 2026 may fall
    // outside it when the suite runs later, so only the shape is fixed here.
    expect(Array.isArray(days)).toBe(true);
    expect(days.map((d) => d.day)).not.toContain("2026-09-01");
  });

  it("reads one range of metrics_daily by its primary key", async () => {
    const plan = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT day, event, prop, n FROM metrics_daily WHERE day >= ?1 ORDER BY day DESC",
    )
      .bind("2026-10-01")
      .all<{ detail: string }>();
    expect(plan.results.map((r) => r.detail).join(" ")).toMatch(
      /SEARCH .* USING .*(PRIMARY KEY|INDEX)/,
    );
  });
});
