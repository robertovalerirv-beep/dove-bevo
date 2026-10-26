import { describe, expect, it, vi } from "vitest";
import {
  createMobileClient,
  parseMobileCallback,
  resolveMobileUrl,
  type NativeTransport,
  nativeVenuePath,
} from "../../src/app/lib/native-client";
import { MOBILE_CALLBACK_URL, MOBILE_CLIENT_ID, MOBILE_REDEEM_PATH } from "../../src/shared/mobile";
import { fragmentPath, leadWord } from "../../src/app/lib/search-match";
const origin = "https://mobile-preview.dovebevo.com";
const config = {
  version: 1,
  clientId: MOBILE_CLIENT_ID,
  callbackUrl: MOBILE_CALLBACK_URL,
  challengePath: "/mobile-auth",
  dataVersion: "20261024",
};
const callback = (state: string) => `${MOBILE_CALLBACK_URL}?code=${"c".repeat(43)}&state=${state}`;
function setup() {
  const request = vi.fn<NativeTransport>().mockResolvedValue(Response.json(config));
  const open = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
  const client = createMobileClient({ origin, request, open, close: () => Promise.resolve() });
  return { client, request, open };
}
describe("native mobile boundary", () => {
  it("admits generated Unicode and split search fragments without widening URL rules", () => {
    const word = leadWord("Østerbar");
    if (!word) throw new Error("missing search word");
    expect(fragmentPath(word, [])).toBe("s/_s.json");
    expect(fragmentPath(word, ["_s"])).toBe("s/_st.json");
    for (const fragment of [fragmentPath(word, []), fragmentPath(word, ["_s"])])
      expect(resolveMobileUrl(origin, `/data/20261024/${fragment}`)).toBe(
        origin + `/data/20261024/${fragment}`,
      );
    for (const fragment of [
      "s/_s.json?x=y",
      "s/_s/extra.json",
      "s/_s-long.json",
      "s/_s%2f.json",
      "s/_s.json#x",
    ])
      expect(() => resolveMobileUrl(origin, `/data/20261024/${fragment}`)).toThrow();
  });
  it("accepts canonical venue links without location or extra parameters", () => {
    expect(nativeVenuePath("https://www.dovebevo.com/bar/n1?c=u0nd9")).toBe("/bar/n1?c=u0nd9");
    for (const url of [
      "https://evil.example/bar/n1?c=u0nd9",
      "https://user@www.dovebevo.com/bar/n1?c=u0nd9",
      "https://www.dovebevo.com/admin?c=u0nd9",
      "https://www.dovebevo.com/bar/n1?c=u0nd9&lat=45",
      "https://www.dovebevo.com/bar/n1?c=u0nd9&c=u0nd9",
      "https://www.dovebevo.com/bar/n1?c=u0nd9#x",
      "https://www.dovebevo.com/bar/%6e1?c=u0nd9",
    ])
      expect(nativeVenuePath(url)).toBeNull();
  });
  it("fails closed for unreviewed origins and URL tricks", () => {
    for (const value of [
      "http://mobile-preview.dovebevo.com",
      "https://evil.example",
      origin + "/extra",
    ])
      expect(() => resolveMobileUrl(value, "/api/mobile/config")).toThrow();
    for (const path of [
      "//evil.example/x",
      "/api/admin/metrics",
      "/api/mobile/prices/extra",
      "/api/%6dobile/config",
      "/data/20261024/../x",
      "/api/prices/u0nd9?lat=45.4",
      origin + "/api/mobile/config",
    ])
      expect(() => resolveMobileUrl(origin, path)).toThrow();
    expect(resolveMobileUrl(origin, "/api/prices/u0nd9")).toBe(origin + "/api/prices/u0nd9");
  });
  it("rejects malformed or ambiguous callbacks", () => {
    const state = "n".repeat(43);
    expect(parseMobileCallback(callback(state), state)).toBe("c".repeat(43));
    for (const url of [
      callback("wrong"),
      callback(state) + "&state=" + state,
      callback(state) + "#x",
      callback(state).replace("auth/", "other/"),
      callback(state).replace("callback?", "callback/?"),
      callback(state) + "&token=secret",
    ])
      expect(parseMobileCallback(url, state)).toBeNull();
  });
  it("rejects disabled or incompatible config before opening authentication", async () => {
    const { client, request, open } = setup();
    request.mockResolvedValueOnce(new Response("disabled", { status: 404 }));
    await expect(client.initialize()).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
    for (const invalid of [
      { ...config, version: 2 },
      { ...config, dataVersion: "" },
      { ...config, dataVersion: "fixture" },
      { ...config, callbackUrl: "evil://auth" },
    ]) {
      request.mockResolvedValueOnce(Response.json(invalid));
      await expect(client.initialize()).rejects.toThrow();
    }
  });
  it("binds S256 and nonce, keeps bearer on mobile writes only and rejects replay", async () => {
    const { client, request, open } = setup();
    await client.initialize();
    const auth = client.ensureSession();
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledOnce();
    });
    const challenge = new URL(open.mock.calls[0]?.[0] ?? "");
    expect(challenge.pathname).toBe("/mobile-auth");
    expect(challenge.searchParams.get("codeChallenge")).toMatch(/^[\w-]{43}$/);
    expect(challenge.searchParams.has("codeVerifier")).toBe(false);
    request.mockResolvedValueOnce(Response.json({ token: "session-test-token", expiresIn: 1800 }));
    const url = callback(challenge.searchParams.get("nonce") ?? "");
    expect(await client.receiveCallback(url)).toBe(true);
    await auth;
    expect(await client.receiveCallback(url)).toBe(false);
    const redemption = request.mock.calls[1];
    if (!redemption) throw new Error("missing redemption");
    expect(redemption[0]).toBe(origin + MOBILE_REDEEM_PATH);
    expect(redemption[1].headers.get("Authorization")).toBeNull();
    const verifier = (
      JSON.parse(typeof redemption[1].body === "string" ? redemption[1].body : "") as {
        codeVerifier: string;
      }
    ).codeVerifier;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    expect(
      btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, ""),
    ).toBe(challenge.searchParams.get("codeChallenge"));
    request.mockResolvedValue(Response.json({}));
    await client.post("/api/prices", { test: true });
    expect(request.mock.calls.at(-1)?.[0]).toBe(origin + "/api/mobile/prices");
    expect(request.mock.calls.at(-1)?.[1].headers.get("Authorization")).toBe(
      "Bearer session-test-token",
    );
    for (const path of [
      "/api/prices/u0nd9",
      "/data/20261024/places.json",
      "/api/venues/approved",
    ]) {
      await client.read(path);
      expect(request.mock.calls.at(-1)?.[1].headers.get("Authorization")).toBeNull();
    }
    await client.events('{"events":[]}');
    expect(request.mock.calls.at(-1)?.[0]).toBe(origin + "/api/mobile/events");
    expect(request.mock.calls.at(-1)?.[1].headers.get("Authorization")).toBeNull();
    await expect(client.post("/api/admin/verified", {})).rejects.toThrow();
  });
  it("cancels pending authentication and rejects redirects without delivering a token", async () => {
    const { client, request, open } = setup();
    await client.initialize();
    const auth = client.ensureSession();
    const rejected = expect(auth).rejects.toThrow();
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    client.cancel();
    await rejected;
    request.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: "https://evil.example" } }),
    );
    await expect(client.read("/api/prices/u0nd9")).rejects.toThrow();
    expect(request.mock.calls.at(-1)?.[1]?.redirect).toBe("error");
    expect(request.mock.calls.at(-1)?.[1]?.credentials).toBe("omit");
  });
  it("does not accept an expired callback or a redemption completed after cancellation", async () => {
    const { client, request, open } = setup();
    await client.initialize();
    const auth = client.ensureSession();
    const cancelled = expect(auth).rejects.toThrow();
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledOnce();
    });
    const nonce = new URL(open.mock.calls[0]?.[0] ?? "").searchParams.get("nonce") ?? "";
    let finish: (response: Response) => void = () => {
      throw new Error("redemption not started");
    };
    request.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const redemption = client.receiveCallback(callback(nonce));
    expect(await client.receiveCallback(callback(nonce))).toBe(false);
    client.cancel();
    await cancelled;
    finish(Response.json({ token: "discard-this-token", expiresIn: 1800 }));
    expect(await redemption).toBe(false);
    const next = client.ensureSession();
    const expired = expect(next).rejects.toThrow();
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledTimes(2);
    });
    const nextNonce = new URL(open.mock.calls[1]?.[0] ?? "").searchParams.get("nonce") ?? "";
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 121000);
    expect(await client.receiveCallback(callback(nextNonce))).toBe(false);
    await expired;
    vi.useRealTimers();
  });
});
