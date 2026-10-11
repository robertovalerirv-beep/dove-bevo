import type { Context } from "hono";
import { it } from "../../app/i18n/it";

// SPEC 9.1 error codes; further codes are added with the routes that use them.
const STATUS = { not_found: 404, internal: 500 } as const;

export type ErrorCode = keyof typeof STATUS;

export function apiError(c: Context, code: ErrorCode) {
  return c.json({ error: { code, message: it.errors[code] } }, STATUS[code]);
}
