import type { MiddlewareHandler } from "hono";

// SPEC 13.1 — keep in sync with public/_headers (tests/security/headers.spec.ts checks both).
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; " +
    "img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; " +
    "frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
};
