import { Hono } from "hono";
import { z } from "zod";
import {
  MOBILE_API_PREFIX,
  MOBILE_CALLBACK_URL,
  MOBILE_CLIENT_ID,
  MOBILE_CODE_TTL_S,
  MOBILE_PROTOCOL_VERSION,
  MOBILE_REDEEM_PATH,
  MOBILE_SESSION_TTL_S,
  type MobileConfig,
} from "../../shared/mobile";
import { addToCounter, consumeMobileCode, storeMobileCode } from "../lib/db";
import { romeDay } from "../lib/day";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { createMobileSession, mobileHash, randomMobileValue } from "../lib/mobile-auth";
import { clientIp, secondsToRomeMidnight } from "../lib/quota";
import type { AppEnv } from "../types";
import { events } from "./events";
import { prices } from "./prices";
import { reports } from "./reports";
import { TURNSTILE_ACTION } from "./session";
import { venues } from "./venues";

const Value = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const Authorize = z.strictObject({
  token: z.string().min(1).max(2048),
  codeChallenge: Value,
  nonce: Value,
  clientId: z.literal(MOBILE_CLIENT_ID),
});
const Redeem = z.strictObject({
  code: Value,
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  nonce: Value,
  clientId: z.literal(MOBILE_CLIENT_ID),
});
const Verdict = z.object({
  success: z.boolean(),
  hostname: z.string(),
  action: z.string(),
  cdata: z.string(),
});
const codeHash = (code: string) => mobileHash(`dovebevo/mobile-preview/code/v1\0${code}`);

export const mobile = new Hono<AppEnv>();

mobile.get("/config", (c) =>
  c.json({
    version: MOBILE_PROTOCOL_VERSION,
    clientId: MOBILE_CLIENT_ID,
    callbackUrl: MOBILE_CALLBACK_URL,
    challengePath: "/mobile-auth",
    dataVersion: c.env.DATA_VERSION,
  } satisfies MobileConfig),
);

mobile.post("/authorize", async (c) => {
  const body = await readJson(c, Authorize);
  const day = romeDay();
  const ip = clientIp(c.req.raw);
  const minute = String(Math.floor(Date.now() / 60_000));
  try {
    for (const [period, limit, retry] of [
      [minute, 5, 60],
      ["day", 60, secondsToRomeMidnight()],
    ] as const) {
      const key = await hmacHex(c.env.HASH_KEY, [day, "mobile-authorize", period, ip]);
      if (!(await addToCounter(c.env.DB, key, day, 1, limit)))
        throw new ApiError("rate_limited", { "Retry-After": String(retry) });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("busy");
  }
  const form = new FormData();
  form.set("secret", c.env.TURNSTILE_SECRET);
  form.set("response", body.token);
  let verdict;
  try {
    verdict = Verdict.safeParse(
      await (
        await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: form,
        })
      ).json(),
    );
  } catch {
    throw new ApiError("busy");
  }
  if (
    !verdict.success ||
    !verdict.data.success ||
    verdict.data.hostname !== c.env.TURNSTILE_HOSTNAME ||
    verdict.data.action !== TURNSTILE_ACTION ||
    verdict.data.cdata !== body.codeChallenge
  )
    throw new ApiError("forbidden");
  const code = randomMobileValue();
  try {
    if (
      !(await storeMobileCode(c.env.DB, {
        codeHash: await codeHash(code),
        challengeHash: await mobileHash(body.codeChallenge),
        nonceHash: await mobileHash(body.nonce),
        audience: MOBILE_CLIENT_ID,
        callback: MOBILE_CALLBACK_URL,
        environment: new URL(c.req.url).origin,
        expiresAt: Date.now() + MOBILE_CODE_TTL_S * 1000,
      }))
    )
      throw new ApiError("busy");
  } catch {
    throw new ApiError("busy");
  }
  return c.json({ code, state: body.nonce });
});

mobile.post(MOBILE_REDEEM_PATH.slice(MOBILE_API_PREFIX.length), async (c) => {
  const body = await readJson(c, Redeem);
  const environment = new URL(c.req.url).origin;
  let consumed;
  try {
    consumed = await consumeMobileCode(c.env.DB, {
      codeHash: await codeHash(body.code),
      challengeHash: await mobileHash(await mobileHash(body.codeVerifier)),
      nonceHash: await mobileHash(body.nonce),
      audience: MOBILE_CLIENT_ID,
      callback: MOBILE_CALLBACK_URL,
      environment,
    });
  } catch {
    throw new ApiError("busy");
  }
  if (!consumed) throw new ApiError("unauthorized");
  const { token } = await createMobileSession(c.env.SESSION_HMAC_KEY, environment);
  return c.json({ token, expiresIn: MOBILE_SESSION_TTL_S });
});

// Same business handlers and quotas. Native reads stay on the canonical public API paths.
mobile.route("/events", events);
mobile.route("/prices", prices);
mobile.route("/reports", reports);
mobile.route("/venues", venues);
