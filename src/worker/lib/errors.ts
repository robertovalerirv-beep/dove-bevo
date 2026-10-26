import type { Context } from "hono";
import { it } from "../../app/i18n/it";

// SPEC 9.1 error codes.
const STATUS = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  contribution_restricted: 429,
  busy: 503,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;

export function apiError(c: Context, code: ErrorCode, headers?: Record<string, string>) {
  return c.json({ error: { code, message: it.errors[code] } }, STATUS[code], headers);
}

/** Thrown by guards and handlers, answered by the app's onError with the SPEC 9.1 format. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly headers?: Record<string, string>,
  ) {
    super(code);
  }
}
