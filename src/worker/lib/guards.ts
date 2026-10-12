// Common checks for POST routes (SPEC 9.1, M2-04).
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { z } from "zod";
import type { AppEnv } from "../types";
import { ApiError } from "./errors";
import { readSession, SESSION_COOKIE } from "./session";

export const JSON_LIMIT = 16 * 1024;

/** Origin must be our own origin; absent or different → 403. */
export const requireOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method === "POST" && c.req.header("Origin") !== new URL(c.req.url).origin) {
    throw new ApiError("forbidden");
  }
  await next();
};

/** Valid __Host-sid → c.var.sid; otherwise 401. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sid = await readSession(c.env.SESSION_HMAC_KEY, getCookie(c, SESSION_COOKIE) ?? "");
  if (!sid) throw new ApiError("unauthorized");
  c.set("sid", sid);
  await next();
};

/** Reads at most `limit` bytes even without Content-Length (SPEC 9.1). */
export async function readBody(c: Context, limit: number): Promise<Uint8Array> {
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (declared > limit) throw new ApiError("payload_too_large");
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = c.req.raw.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError("payload_too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** JSON body validated by a strict zod schema: 415 if not JSON, 413 if too big, 400 if invalid. */
export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const type = c.req.header("Content-Type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) throw new ApiError("unsupported_media_type");
  const bytes = await readBody(c, JSON_LIMIT);
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("bad_request");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError("bad_request");
  return parsed.data;
}
