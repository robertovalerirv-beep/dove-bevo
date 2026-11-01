# Dove bevo — security and privacy checklist

Project-specific rules for the security-guidance plugin. Source: `docs/SPEC.md` sections 13–14 (binding). Flag any code that violates one of these.

## Location and personal data
- [ ] User coordinates never leave the device: no lat/lon (or rounding) in URLs, headers, bodies, logs or storage. The server only receives geohash5 cells.
- [ ] No session ID, IP or their hash stored with prices, observations, reports or user venues.
- [ ] Session/IP linkage only as `HMAC(HASH_KEY, day ‖ kind ‖ sid|IP ‖ target)` in `counters` and `dedup`, deleted after 2 days.
- [ ] Contributions store the date only (`YYYY-MM-DD`, Europe/Rome), never a time.
- [ ] `localStorage` holds only first-use date and count of prices added.
- [ ] Reports have closed reasons only; no free text.

## Requests
- [ ] Every POST checks `Origin` equals the service origin (missing → 403).
- [ ] Every POST except `/api/session` and `/api/events` requires the session and `Content-Type: application/json`.
- [ ] `/api/events`: no session, Origin check, body ≤ 2 KB, closed zod schema, ≤ 10 events, IP rate limit.
- [ ] JSON bodies ≤ 16 KB, enforced while reading the stream, not only via `Content-Length`.
- [ ] Every Worker input validated with zod `.strict()`; the client is never the source of truth for venue existence, cell or city.
- [ ] SQL only with bound parameters (`prepare(...).bind(...)`); no string concatenation.
- [ ] Error responses: `{ error: { code, message } }`, Italian message, no stack traces or internal details.
- [ ] No CORS headers anywhere.

## Session and anti-abuse
- [ ] Turnstile siteverify without `remoteip`; check `success`, `hostname`, `action`; reused token rejected.
- [ ] Cookie `__Host-sid`: `HttpOnly; Secure; SameSite=Strict; Path=/`, 30 min, HMAC-SHA256 signed, constant-time comparison, expiry enforced server-side.
- [ ] Daily quotas per session and per IP (30 manual prices, 50 confirmations, 5 new venues, 20 reports) plus Rate Limiting binding if available; at most 200 proposed venues pending.
- [ ] A proposed venue is `pending` until the admin approves it, never automatically; its prices are not public, not on its page and not in the quarantine median (ADR 0019). The pin sent is the bar's position, never the device's.

## Content and AI
- [ ] No AI and no payment code anywhere (ADR 0018, N1): OWASP LLM items are "not applicable, no LLM".
- [ ] Venue names: one validation (`validVenueName`), rendered only as text.
- [ ] User text rendered only as text: no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`.

## Secrets and supply chain
- [ ] `TURNSTILE_SECRET`, `SESSION_HMAC_KEY`, `HASH_KEY` only as Wrangler secrets; never in code, tests, fixtures, logs or the client bundle.
- [ ] `.dev.vars.example` without values; `.dev.vars*` and `.env*` git-ignored.
- [ ] Only dependencies from SPEC 4.1, exact versions, lockfile, `npm ci`.
- [ ] No script from CDNs except Turnstile.
- [ ] GitHub Actions pinned to commit SHA, `permissions: contents: read` by default, no `pull_request_target`.

## Headers (SPEC 13.1, version 1.15, ADR 0045)
- [ ] CSP, HSTS (`max-age=63072000; includeSubDomains; preload`), `nosniff`, Referrer-Policy, Permissions-Policy (`camera=()`, `geolocation=(self)`), COOP, CORP exactly as SPEC 13.1 on pages, `/api/*` and files.
- [ ] Pages: a fresh nonce per response on every `<script>`, `<style>` and `<link rel="modulepreload">`; `script-src 'nonce-N' 'strict-dynamic' 'self' https://challenges.cloudflare.com`, `style-src 'self' 'nonce-N'`; never `'unsafe-inline'`; no ETag, Last-Modified or Content-Length on pages; a page with its nonce is never cached.
- [ ] API and files: the static CSP (`script-src 'self' https://challenges.cloudflare.com`, `style-src 'self'`).
- [ ] `require-trusted-types-for 'script'` everywhere; one `default` policy (`src/app/lib/trusted-types.ts`) that accepts only `/assets/*`, `/sw.js` and the Turnstile script URL and creates no HTML or script text.
- [ ] `/.well-known/*` answers 404 plain text except `security.txt`.
- [ ] No new origin added to CSP or to the Trusted Types policy without an ADR.

## Server-built HTML
- [ ] SEO pages, sitemap and `llms.txt` escape every OSM or user string (`escapeHtml`); JSON-LD only through `jsonLdScript`.

## Verified venues and native-app API
- [ ] `venues_verified` holds only `venue_key`, `cell`, `name`, `hours`: no personal or economic data; cell and name come from the bar file or `venues_user`, never from the client; every write clears the cell snapshot and the Cache API entry (ADR 0032, 0033).
- [ ] A hidden, unapproved or disabled venue never shows the tick (`g`) or the hours (`o`).
- [ ] `/api/mobile/*` (ADR 0041): the installation UUID is never stored raw; only purpose-separated HMACs; Rome-day budgets of 50 per installation and 200 per IP; no change to prices or sessions.

## Logging
- [ ] Logs contain only error code, route without parameters, duration. Never bodies, images, IPs, cells, prices tied to sessions.
- [ ] `observability.logs.invocation_logs` stays `false`.

## Admin
- [ ] `/api/admin/*` verifies the Cloudflare Access JWT in the Worker (RS256 signature via WebCrypto, `aud`, `iss`, `exp`; an unknown `kid` refreshes the keys at most once per interval), not only at the edge, on GETs too (ADR 0044).
