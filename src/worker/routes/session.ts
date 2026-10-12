// POST /api/session: Turnstile token → __Host-sid (SPEC 13.2, M2-03).
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { createSession, SESSION_COOKIE, SESSION_TTL_S } from "../lib/session";
import type { AppEnv } from "../types";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION = "contribute";

const Body = z.strictObject({ token: z.string().min(1).max(2048) });
const Verdict = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
});

export const session = new Hono<AppEnv>();

session.post("/", async (c) => {
  const { token } = await readJson(c, Body);
  // No remoteip: the user's IP is never sent anywhere (SPEC 14).
  const form = new FormData();
  form.set("secret", c.env.TURNSTILE_SECRET);
  form.set("response", token);
  const verdict = Verdict.safeParse(
    await (await fetch(SITEVERIFY, { method: "POST", body: form })).json(),
  );
  const host = new URL(c.req.url).hostname;
  if (
    !verdict.success ||
    !verdict.data.success ||
    verdict.data.hostname !== host ||
    verdict.data.action !== TURNSTILE_ACTION
  ) {
    throw new ApiError("forbidden");
  }
  const { token: cookie } = await createSession(c.env.SESSION_HMAC_KEY);
  setCookie(c, SESSION_COOKIE, cookie, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    maxAge: SESSION_TTL_S,
  });
  return c.body(null, 204);
});
