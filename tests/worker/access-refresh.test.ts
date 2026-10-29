import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { accessJwt } from "./access-jwt";

// Audit 28/10/2026: a well-formed token with an unknown `kid` made the Worker download the Access keys again
// on every request (41 downloads for 40 requests), and GET /api/admin/* had no rate limit.
const ORIGIN = "https://dovebevo.example";
const CERTS = "/cdn-cgi/access/certs";

const get = (path: string, jwt: string, ip: string) =>
  exports.default.fetch(`${ORIGIN}/api/admin/${path}`, {
    headers: { Origin: ORIGIN, "Cf-Access-Jwt-Assertion": jwt, "CF-Connecting-IP": ip },
  });

/** A token with right audience, issuer and expiry, a key of a stranger and a `kid` nobody has. */
async function unknownKid(kid: string): Promise<string> {
  const forged = await accessJwt({}, true);
  const [head = "", ...rest] = forged.split(".");
  const header = JSON.parse(atob(head.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
    string,
    unknown
  >;
  const swapped = btoa(JSON.stringify({ ...header, kid }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return [swapped, ...rest].join(".");
}

const certFetches = (spy: MockInstance<typeof fetch>) =>
  spy.mock.calls.filter(([input]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.includes(CERTS);
  }).length;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Access keys are not downloaded again for every unknown kid", () => {
  it("40 requests with unknown kids download the keys at most once", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    for (let i = 0; i < 40; i++) {
      const res = await get(
        "overview",
        await unknownKid(`k-${String(i)}`),
        `198.51.100.${String(i + 1)}`,
      );
      expect(res.status).toBe(403);
    }
    expect(certFetches(spy)).toBeLessThanOrEqual(1);
  });

  it("a real key rotation is still picked up, once, after the minimum interval", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await get("overview", await unknownKid("warm-up"), "198.51.100.101"); // makes sure the keys are cached
    const before = certFetches(spy);
    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + 31_000);
    await get("overview", await unknownKid("after-30s"), "198.51.100.102");
    expect(certFetches(spy) - before).toBe(1);
    await get("overview", await unknownKid("right-after"), "198.51.100.103");
    expect(certFetches(spy) - before).toBe(1);
  });

  it("a valid token is accepted", async () => {
    const res = await get("overview", await accessJwt(), "198.51.100.110");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/* has a burst limit like the writes", () => {
  it("answers 429 with Retry-After beyond 20 requests in 10 seconds from one address", async () => {
    const jwt = await unknownKid("burst");
    const codes: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 25; i++) {
      const res = await get("overview", jwt, "198.51.100.200");
      codes.push(res.status);
      if (res.status === 429) retryAfter = res.headers.get("Retry-After");
    }
    expect(codes.slice(0, 20).every((c) => c === 403)).toBe(true);
    expect(codes.slice(20).every((c) => c === 429)).toBe(true);
    expect(retryAfter).toBe("10");
  });

  it("another address is not affected", async () => {
    const res = await get("overview", await accessJwt(), "198.51.100.201");
    expect(res.status).toBe(200);
  });
});
