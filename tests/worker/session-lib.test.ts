import { describe, expect, it } from "vitest";
import { romeDay } from "../../src/worker/lib/day";
import { hmacHex } from "../../src/worker/lib/hmac";
import { createSession, readSession, SESSION_TTL_S } from "../../src/worker/lib/session";

const KEY = "test-session-key-not-a-secret";

describe("romeDay (D-14)", () => {
  it("uses the Europe/Rome calendar day, not UTC", () => {
    expect(romeDay(new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12"); // 00:30 in Rome (CEST)
    expect(romeDay(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31"); // 23:59 in Rome (CET)
    expect(romeDay(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });
});

describe("hmacHex", () => {
  it("is deterministic, keyed and 32 hex chars", async () => {
    const a = await hmacHex("k1", ["2026-10-12", "price", "sid", "n1"]);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await hmacHex("k1", ["2026-10-12", "price", "sid", "n1"])).toBe(a);
    expect(await hmacHex("k2", ["2026-10-12", "price", "sid", "n1"])).not.toBe(a);
    // parts are separated: ["ab","c"] must differ from ["a","bc"]
    expect(await hmacHex("k1", ["ab", "c"])).not.toBe(await hmacHex("k1", ["a", "bc"]));
  });
});

describe("session cookie (SPEC 13.2)", () => {
  it("round-trips a fresh session", async () => {
    const now = 1_760_000_000_000;
    const { token, id } = await createSession(KEY, now);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await readSession(KEY, token, now + 1000)).toBe(id);
  });

  it("rejects an expired, tampered or foreign token", async () => {
    const now = 1_760_000_000_000;
    const { token } = await createSession(KEY, now);
    expect(await readSession(KEY, token, now + SESSION_TTL_S * 1000 + 1)).toBeNull();
    const [payload = "", sig = ""] = token.split(".");
    const flipped = `${payload}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    expect(await readSession(KEY, flipped, now)).toBeNull();
    expect(await readSession("other-key", token, now)).toBeNull();
    expect(await readSession(KEY, "garbage", now)).toBeNull();
    expect(await readSession(KEY, "", now)).toBeNull();
  });
});
