import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";

// «Gestore verificato» (SPEC 1.9, D-34): MD-02 on the running Worker, MD-10 on the schema.

test("the admin routes of «Gestore verificato» refuse anyone without Cloudflare Access", async ({
  request,
  baseURL,
}) => {
  // Same origin, so the 403 is Access's and not the Origin check's.
  const headers = { Origin: new URL(baseURL ?? "").origin, "Content-Type": "application/json" };
  const week = [[], [], [], [], [], [], []];
  const calls = [
    request.get("/api/admin/verified", { headers }),
    request.post("/api/admin/verified", {
      headers,
      data: { venue: "n13001337602", cell: "u0nd9", hours: week },
    }),
    request.post("/api/admin/verified/remove", { headers, data: { venue: "n13001337602" } }),
  ];
  for (const response of await Promise.all(calls)) {
    expect(response.status()).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("forbidden");
  }
});

test("venues_verified holds only the bar key, its cell, its name and the hours (MD-10)", () => {
  const sql = readFileSync("migrations/0008_verified_venues.sql", "utf8");
  const body = /CREATE TABLE venues_verified \(([\s\S]*?)\) WITHOUT ROWID/.exec(sql)?.[1] ?? "";
  const columns = body
    .split(",")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
  expect(columns).toEqual(["venue_key", "cell", "name", "hours"]);
  // No later migration may widen it with personal or economic data without changing this test.
  for (const name of readdirSync("migrations").filter((n) => Number(n.slice(0, 4)) > 8)) {
    const later = readFileSync(`migrations/${name}`, "utf8");
    expect(later, name).not.toMatch(/venues_verified/i);
  }
});

test("the cell answer lists verified bars as keys only", async ({ request }) => {
  const response = await request.get("/api/prices/u0nd9");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { g?: unknown };
  expect(Array.isArray(body.g)).toBe(true);
  for (const key of body.g as unknown[]) expect(key).toMatch(/^[nwru][1-9]\d{0,14}$/);
});
