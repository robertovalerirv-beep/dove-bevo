import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// SPEC 13.3: burst limit per IP (Workers Rate Limiting binding, 20 requests / 10 s).
describe("rate limiting binding", () => {
  it("answers 429 with Retry-After beyond the burst limit, per IP", async () => {
    const get = (ip: string) =>
      exports.default.fetch("https://dovebevo.example/api/venues/n1/prices", {
        headers: { "CF-Connecting-IP": ip },
      });
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await get("192.0.2.250")).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    const last = await get("192.0.2.250");
    expect(last.status).toBe(429);
    expect(last.headers.get("Retry-After")).toBe("10");
    expect((await get("192.0.2.251")).status).toBe(200); // another IP is not affected
  });
});
