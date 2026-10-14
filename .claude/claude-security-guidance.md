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

## Headers
- [ ] CSP, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy (`camera=()`, `geolocation=(self)`), COOP, CORP exactly as SPEC 13.1 on both `/api/*` and assets.
- [ ] No new origin added to CSP without an ADR.

## Logging
- [ ] Logs contain only error code, route without parameters, duration. Never bodies, images, IPs, cells, prices tied to sessions.
- [ ] `observability.logs.invocation_logs` stays `false`.

## Admin
- [ ] `/api/admin/*` verifies the Cloudflare Access JWT in the Worker (RS256 signature via WebCrypto, `aud`, `exp`), not only at the edge.
