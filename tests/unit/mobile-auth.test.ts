import { describe, expect, it } from "vitest";
import { MOBILE_CLIENT_ID, MOBILE_SESSION_TTL_S } from "../../src/shared/mobile";
import {
  base64url,
  createMobileSession,
  mobileHash,
  readMobileSession,
} from "../../src/worker/lib/mobile-auth";
import { sign } from "../../src/worker/lib/hmac";
import { createSession, readSession } from "../../src/worker/lib/session";

const KEY = "test-mobile-signing-key";
const ORIGIN = "https://mobile-preview.example";
const NOW = 1_760_000_000_000;

describe("mobile preview cryptography", () => {
  it("matches the independent RFC7636 S256 test vector", async () => {
    expect(await mobileHash("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
  it("round trips a random anonymous session only within its key, environment and lifetime", async () => {
    const session = await createMobileSession(KEY, ORIGIN, NOW);
    expect(session.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await readMobileSession(KEY, session.token, ORIGIN, NOW)).toBe(session.id);
    expect(await readMobileSession("other-key", session.token, ORIGIN, NOW)).toBeNull();
    expect(await readMobileSession(KEY, session.token, "https://other.example", NOW)).toBeNull();
    expect(
      await readMobileSession(KEY, session.token, ORIGIN, NOW + MOBILE_SESSION_TTL_S * 1000),
    ).toBeNull();
    expect(await readMobileSession(KEY, session.token, ORIGIN, NOW - 1000)).toBeNull();
    expect((await createMobileSession(KEY, ORIGIN, NOW)).id).not.toBe(session.id);
  });
  it("cannot be accepted as a web cookie and never accepts a web cookie", async () => {
    const mobile = await createMobileSession(KEY, ORIGIN, NOW);
    const web = await createSession(KEY, NOW);
    expect(await readSession(KEY, mobile.token, NOW)).toBeNull();
    expect(await readMobileSession(KEY, web.token, ORIGIN, NOW)).toBeNull();
  });
  it("rejects invalid encodings, tampering, extra segments and overlong input", async () => {
    const { token } = await createMobileSession(KEY, ORIGIN, NOW);
    for (const value of [
      "",
      "dvm1.%%%.xxx",
      token + ".extra",
      token.replace("dvm1.", "dvm2."),
      token.slice(0, 50) + "!" + token.slice(51),
      "x".repeat(1025),
    ]) {
      expect(await readMobileSession(KEY, value, ORIGIN, NOW)).toBeNull();
    }
  });
  it("checks audience and strict payload even on correctly signed input", async () => {
    const encoder = new TextEncoder();
    const derived = base64url(
      await sign(KEY, encoder.encode("dovebevo/mobile-preview/session/v1")),
    );
    for (const payload of [
      { v: 1, aud: "another-app", env: ORIGIN, id: "x".repeat(43), exp: NOW / 1000 + 60 },
      {
        v: 1,
        aud: MOBILE_CLIENT_ID,
        env: ORIGIN,
        id: "x".repeat(43),
        exp: NOW / 1000 + 60,
        extra: true,
      },
    ]) {
      const message = `dvm1.${base64url(encoder.encode(JSON.stringify(payload)))}`;
      const token = `${message}.${base64url(await sign(derived, encoder.encode(message)))}`;
      expect(await readMobileSession(KEY, token, ORIGIN, NOW)).toBeNull();
    }
  });
});
