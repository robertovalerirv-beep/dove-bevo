# Checklist di rilascio `v0.1.0` (M6)

Cosa fa Roberto, cosa fa Claude Code. Dopo l'acquisto del dominio.

## A. Dominio (Roberto)
1. Comprare il dominio su Cloudflare (registrar) e controllare che il DNS sia sul tuo account.
2. Comunicare il nome a Claude Code: cambia `APP_DOMAIN` in `src/shared/config.ts` (il resto del sito usa l'indirizzo della richiesta) e aggiunge `routes` / dominio personalizzato al blocco `production` di `wrangler.jsonc`.
3. L'indirizzo di contatto è `dovebevo@gmail.com` (casella del progetto, `CONTACT_EMAIL` in `src/shared/config.ts`): non dipende dal dominio. Quando vorrai un indirizzo col dominio, Email Routing di Cloudflare lo inoltra alla stessa casella.

## B. Ambiente di produzione (Roberto; Claude Code prepara i file)
1. D1: `dovebevo-production` (dashboard o `wrangler d1 create`). Il suo `database_id` va nel blocco `production`.
2. Queue e Rate Limiting come per staging (stessi binding, `namespace_id` propri).
3. Turnstile: widget con il dominio vero; `TURNSTILE_SITE_KEY` e `TURNSTILE_HOSTNAME` nelle vars del blocco.
4. Cloudflare Access: applicazione su `<dominio>/admin*` e `<dominio>/api/admin/*` (`docs/guida-admin.md`); `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` nelle vars.
5. Segreti, solo da te: `npx wrangler secret put TURNSTILE_SECRET --env production`, `SESSION_HMAC_KEY` e `HASH_KEY` (due stringhe casuali lunghe, diverse da quelle di staging).
6. Blocco `env.production` in `wrangler.jsonc`: stessa forma di `staging` (nome `dovebevo`, `d1_databases`, `ratelimits`, `queues`, `triggers.crons`, `vars`); `node scripts/check-config.mjs` deve restare verde, rifiuta i segnaposto.
7. GitHub → Settings → Environments → `production`: reviewer obbligatorio = Roberto; i secret `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` anche lì.
8. Il modello `docs/templates/deploy-production.yml.example` va copiato in `.github/workflows/deploy-production.yml` solo dopo il punto 6 (la guardia `scripts/check-config.mjs` rifiuta un workflow con un ambiente che `wrangler.jsonc` non ha). Parte da un tag `v0.x.y` su un commit già in `main`: applica le migrazioni D1 a produzione, importa OSM, fa il deploy e lo smoke test.

## C. Prima del tag (Claude Code)
- `npm run verify` verde, `docs/feature_list.json` con `passes: true` tranne le voci M6 che dipendono da produzione.
- `CHANGELOG.md` aggiornato, `docs/PROGRESS.md` aggiornato.

## D. Rilascio (Roberto)
1. Prova del rollback in staging (`docs/runbook-rollback.md`), esito scritto nel file (M6-03).
2. Tag `v0.1.0` su `main` con CI verde; approva l'environment `production` quando il job lo chiede.
3. La migrazione `0006_no_sizes.sql` e le altre arrivano da sole con il workflow. Dopo il rilascio le tabelle `archive_sizes_*` si possono cancellare (decisione tua).

## E. Dopo il deploy (Claude Code, solo letture)
- `/api/health`, una cella, header e CSP sul dominio (M6-01, M6-05); `cf-cache-status: HIT` su una cella dopo due richieste (Cache API attiva sul dominio, SPEC D-01).
- HSTS: dopo la verifica del dominio aggiungi `preload` all'header (SPEC 13.1) e registra il dominio su hstspreload.org.
- `/admin` apre solo con Access; `/privacy` e `/regole` si aprono.
- `sitemap.xml` e `robots.txt` escono con il dominio della richiesta: controlla che citino il dominio nuovo.

## F. Legale (Roberto)
- Rileggi `/privacy` e `/regole` (testi in `src/app/i18n/it.ts`, sezione `legal`): la bozza non indica il titolare del trattamento. Completala con l'informativa iubenda o con i dati del titolare prima di promuovere il servizio.
