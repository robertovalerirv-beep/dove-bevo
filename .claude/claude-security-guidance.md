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
- [ ] Every POST except `/api/session`, `/api/events`, `/api/menu-extract` requires the session and `Content-Type: application/json`.
- [ ] `/api/events`: no session, Origin check, body ≤ 2 KB, closed zod schema, ≤ 10 events, IP rate limit.
- [ ] JSON bodies ≤ 16 KB, enforced while reading the stream, not only via `Content-Length`.
- [ ] Every Worker input validated with zod `.strict()`; the client is never the source of truth for venue existence, cell or city.
- [ ] SQL only with bound parameters (`prepare(...).bind(...)`); no string concatenation.
- [ ] Error responses: `{ error: { code, message } }`, Italian message, no stack traces or internal details.
- [ ] No CORS headers anywhere.

## Session and anti-abuse
- [ ] Turnstile siteverify without `remoteip`; check `success`, `hostname`, `action`; reused token rejected.
- [ ] Cookie `__Host-sid`: `HttpOnly; Secure; SameSite=Strict; Path=/`, 30 min, HMAC-SHA256 signed, constant-time comparison, expiry enforced server-side.
- [ ] Daily quotas per session and per IP (30 manual prices, 10 photos, 50 confirmations, 5 venues, 20 reports) plus Rate Limiting binding if available.
- [ ] `menu_photo` prices require a valid, single-use extraction token bounded to the extracted item count.

## Uploads and AI
- [ ] Upload ≤ 1.5 MB checked on `Content-Length` and during streaming; JPEG magic bytes `FF D8 FF`.
- [ ] Images stay in memory: never written to storage, KV, D1, R2 or logs.
- [ ] Client re-encodes photos via canvas (EXIF stripped) before upload.
- [ ] System prompt holds no secrets and no security rules (treated as public, LLM07).
- [ ] Image text is data, never instructions (LLM01); model output validated with zod, truncated (80 items, 60 chars), mapped to catalog, price limits re-applied (LLM05).
- [ ] Model output rendered only as text: no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`.
- [ ] `stop_reason` `refusal` and `max_tokens` handled.
- [ ] Budget reserved atomically before the call (single conditional UPDATE on daily and monthly cap), corrected after; `AI_ENABLED=false` disables; 503 `ai_paused` at cap (LLM10).

## Secrets and supply chain
- [ ] `ANTHROPIC_API_KEY`, `TURNSTILE_SECRET`, `SESSION_HMAC_KEY`, `HASH_KEY` only as Wrangler secrets; never in code, tests, fixtures, logs or the client bundle.
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
