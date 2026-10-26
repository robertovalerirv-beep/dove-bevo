import { describe, expect, it } from "vitest";
import { MOBILE_CALLBACK_URL, MOBILE_CLIENT_ID } from "../../src/shared/mobile";
import { challengeParameters, completionUrl } from "../../src/mobile-auth/protocol";

const challenge = "a".repeat(43);
const nonce = "b".repeat(43);
const query = () =>
  new URLSearchParams({ codeChallenge: challenge, nonce, clientId: MOBILE_CLIENT_ID });

describe("hosted native authorization page boundary", () => {
  it("accepts only an exact preview client and S256 challenge", () => {
    expect(challengeParameters(query().toString())).toEqual({
      codeChallenge: challenge,
      nonce,
      clientId: MOBILE_CLIENT_ID,
    });
    const wrong = query();
    wrong.set("clientId", "another.app");
    expect(challengeParameters(wrong.toString())).toBeNull();
  });

  it("rejects missing, duplicate, unknown and malformed query values", () => {
    for (const field of ["codeChallenge", "nonce", "clientId"]) {
      const missing = query();
      missing.delete(field);
      expect(challengeParameters(missing.toString())).toBeNull();
      const duplicate = query();
      duplicate.append(field, duplicate.get(field) ?? "");
      expect(challengeParameters(duplicate.toString())).toBeNull();
    }
    const redirected = query();
    redirected.set("redirect", "https://evil.example/");
    expect(challengeParameters(redirected.toString())).toBeNull();
    for (const invalid of ["", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "/"]) {
      const changed = query();
      changed.set("codeChallenge", invalid);
      expect(challengeParameters(changed.toString())).toBeNull();
    }
  });

  it("constructs a fixed callback only after the exact nonce is returned", () => {
    const url = new URL(completionUrl({ code: "c".repeat(43), state: nonce }, nonce));
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe(MOBILE_CALLBACK_URL);
    expect(url.searchParams.get("code")).toBe("c".repeat(43));
    expect(url.searchParams.get("state")).toBe(nonce);
    expect(() => completionUrl({ code: "c".repeat(43), state: "wrong" }, nonce)).toThrow();
  });

  it("rejects arbitrary redirects, malformed codes and extra response fields", () => {
    for (const response of [
      null,
      [],
      { code: "https://evil.example/", state: nonce },
      { code: "c".repeat(43), state: nonce, redirect: "https://evil.example/" },
    ]) {
      expect(() => completionUrl(response, nonce)).toThrow();
    }
  });
});
