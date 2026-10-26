// POST /api/session: Turnstile token → __Host-sid (SPEC 13.2, M2-03).
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import { TURNSTILE_TEST_SECRET } from "../config";
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
  // Do not add remoteip to Siteverify; the browser challenge has its own Cloudflare processing.
  const form = new FormData();
  form.set("secret", c.env.TURNSTILE_SECRET);
  form.set("response", token);
  const verdict = Verdict.safeParse(
    await (await fetch(SITEVERIFY, { method: "POST", body: form })).json(),
  );
  const testing = c.env.TURNSTILE_SECRET === TURNSTILE_TEST_SECRET;
  if (
    !verdict.success ||
    !verdict.data.success ||
    verdict.data.hostname !== c.env.TURNSTILE_HOSTNAME ||
    (!testing && verdict.data.action !== TURNSTILE_ACTION)
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

// GET /api/session — public Turnstile site key of this environment, read at the first contribution.
session.get("/", (c) => c.json({ siteKey: c.env.TURNSTILE_SITE_KEY, action: TURNSTILE_ACTION }));
