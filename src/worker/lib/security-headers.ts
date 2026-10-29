import type { MiddlewareHandler } from "hono";

// SPEC 13.1 — keep in sync with public/_headers (tests/security/headers.spec.ts checks both).
const BASE_CSP =
  "default-src 'self'; %SCRIPT%; %STYLE%; " +
  "img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; " +
  "frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; " +
  "form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'";

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** The CSP of a response that is not a page: no inline code, scripts and styles from our own origin. */
export const STATIC_CSP = BASE_CSP.replace(
  "%SCRIPT%",
  "script-src 'self' https://challenges.cloudflare.com",
).replace("%STYLE%", "style-src 'self'");

/** The CSP of a page: every script and inline style carries this response's nonce; 'strict-dynamic' trusts what they load. */
export const pageCsp = (nonce: string) =>
  BASE_CSP.replace(
    "%SCRIPT%",
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' https://challenges.cloudflare.com`,
  ).replace("%STYLE%", `style-src 'self' 'nonce-${nonce}'`);

const newNonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
  const isPage =
    c.res.status === 200 && (c.res.headers.get("Content-Type") ?? "").includes("text/html");
  if (!isPage) {
    c.res.headers.set("Content-Security-Policy", STATIC_CSP);
    return;
  }
  const nonce = newNonce();
  const stamp = { element: (el: Element) => void el.setAttribute("nonce", nonce) };
  c.res = new HTMLRewriter()
    .on("script", stamp)
    .on("style", stamp)
    .on('link[rel="modulepreload"]', stamp)
    .transform(new Response(c.res.body, c.res));
  // After the assignment: Hono copies the old headers onto a new response, and the old validators and the
  // static CSP describe another body. A 304 would pair this header with an old body and its old nonce.
  c.res.headers.delete("ETag");
  c.res.headers.delete("Last-Modified");
  c.res.headers.delete("Content-Length");
  c.res.headers.set("Content-Security-Policy", pageCsp(nonce));
};
