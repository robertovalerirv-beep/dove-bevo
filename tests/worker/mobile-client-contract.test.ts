import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { createMobileClient, MOBILE_ORIGIN } from "../../src/app/lib/native-client";
import { challengeParameters, completionUrl } from "../../src/mobile-auth/protocol";
import worker from "../../src/worker/index";

it("authenticates the actual native client through the Worker and acknowledges a price", async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mobile_auth_codes"),
    env.DB.prepare("DELETE FROM counters"),
    env.DB.prepare("DELETE FROM dedup"),
    env.DB.prepare("DELETE FROM price_obs"),
    env.DB.prepare("DELETE FROM prices_current"),
  ]);
  const bindings = {
    ...env,
    MOBILE_PREVIEW_ENABLED: "true",
    TURNSTILE_HOSTNAME: new URL(MOBILE_ORIGIN).hostname,
  };
  // The transport forwards the client's URL unchanged to the real router and middleware.
  // Only external Turnstile is fake (vitest.config.ts); D1, quotas and signatures are real.
  const calls: { request: Request; status: number }[] = [];
  const callAt = (index: number) => {
    const call = calls.at(index);
    if (!call) throw new Error("Missing client request");
    return call;
  };
  const dispatch = async (request: Request) => {
    const response = await worker.fetch(request.clone(), bindings, createExecutionContext());
    calls.push({ request: request.clone(), status: response.status });
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    return response;
  };
  let closed = false;
  let callbackAccepted = false;
  let callback = "";
  const client = createMobileClient({
    origin: MOBILE_ORIGIN,
    allowFixture: true,
    request: (url, init) => {
      expect(init.credentials).toBe("omit");
      expect(init.redirect).toBe("error");
      expect(init.headers.has("Cookie")).toBe(false);
      // workerd Request supports only manual/follow. Direct dispatch never follows redirects;
      // keep the client's error policy assertion above, without changing its URL or headers.
      return dispatch(new Request(url, { ...init, redirect: "manual" }));
    },
    open: async (raw) => {
      const url = new URL(raw);
      expect(url.origin).toBe(MOBILE_ORIGIN);
      expect(url.pathname).toBe("/mobile-auth");
      const parameters = challengeParameters(url.search);
      if (!parameters) throw new Error("Invalid hosted challenge parameters");
      const response = await dispatch(
        new Request(new URL("/api/mobile/authorize", url), {
          method: "POST",
          headers: { Origin: url.origin, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...parameters,
            token: `ok-mobile:${parameters.codeChallenge}:preview-host`,
          }),
        }),
      );
      expect(response.status).toBe(200);
      callback = completionUrl(await response.json(), parameters.nonce);
      callbackAccepted = await client.receiveCallback(callback);
    },
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  });
  try {
    expect(await client.initialize()).toMatchObject({ dataVersion: "fixture" });
    const body = {
      venue: "n2420779240",
      cell: "u0nd9",
      source: "manual",
      items: [{ drink: "spritz", hh: 0, price_cents: 550 }],
    };
    const outcome = await client.post("/api/prices", body).catch((error: unknown) => error);
    const redemption = callAt(2);
    // This assertion reproduced the original real-client /redeem versus server /session 403.
    expect(redemption.status).toBe(200);
    expect(new URL(redemption.request.url).pathname).toBe("/api/mobile/session");
    expect(redemption.request.headers.has("Authorization")).toBe(false);
    expect(redemption.request.headers.get("X-Dovebevo-Native")).toBe("1");
    expect(callbackAccepted).toBe(true);
    expect(closed).toBe(true);
    expect(await client.receiveCallback(callback)).toBe(false);
    if (!(outcome instanceof Response)) throw new Error("Native contribution failed");
    expect(outcome.status).toBe(200);
    expect(outcome.headers.get("Cache-Control")).toBe("no-store");
    expect(await outcome.json()).toMatchObject({ results: [{ status: "active" }] });
    expect(
      (await env.DB.prepare("SELECT price_cents, status FROM price_obs").all()).results,
    ).toEqual([{ price_cents: 550, status: "active" }]);
    expect((await dispatch(redemption.request.clone())).status).toBe(401);

    const mutation = callAt(3).request;
    expect(mutation.headers.get("Authorization")).toMatch(/^Bearer dvm1\./);
    for (const [header, value, status] of [
      ["X-Dovebevo-Native", null, 403],
      ["Origin", "https://evil.example", 403],
      ["Cookie", "__Host-sid=web-cookie", 401],
      ["Authorization", null, 401],
    ] as const) {
      const denied = new Request(mutation.clone());
      if (value === null) denied.headers.delete(header);
      else denied.headers.set(header, value);
      expect((await dispatch(denied)).status).toBe(status);
    }
    expect(
      (await dispatch(new Request(`${MOBILE_ORIGIN}/api/prices`, mutation.clone()))).status,
    ).toBe(401);
    expect(
      (
        await dispatch(
          new Request(`${MOBILE_ORIGIN}/api/mobile/redeem`, redemption.request.clone()),
        )
      ).status,
    ).toBe(403);
    const overQuota = await client.post("/api/prices", {
      ...body,
      items: Array.from({ length: 31 }, () => body.items[0]),
    });
    expect(overQuota.status).toBe(429);
    const publicRead = await client.read("/api/prices/u0nd9");
    expect(publicRead.status).toBe(200);
    expect(publicRead.headers.get("Cache-Control")).toContain("public");
    expect(callAt(-1).request.headers.has("Authorization")).toBe(false);
    expect(callAt(-1).request.headers.has("X-Dovebevo-Native")).toBe(false);
    const events = await client.events('{"events":[{"e":"app_open"}]}');
    expect(events.status).toBe(204);
    expect(callAt(-1).request.headers.has("Authorization")).toBe(false);
  } finally {
    client.forget();
  }
});
