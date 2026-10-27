# Checklist di rilascio `v0.1.0` (M6)

Cosa fa Roberto, cosa fa Claude Code. **Un solo ambiente vivo (ADR 0036):** `staging` serve `www.dovebevo.com` con il suo D1 e i suoi segreti; il tag `v0.1.0` segna la versione su `main`, senza un secondo deploy.

## A. Dominio (fatto il 25/10/2026, ADR 0035)
1. Dominio comprato su Cloudflare, `APP_DOMAIN` = `www.dovebevo.com`, Redirect Rule radice → `www`, Turnstile e Access sul nuovo hostname.
2. L'indirizzo di contatto è `dovebevo@gmail.com` (`CONTACT_EMAIL` in `src/shared/config.ts`). Quando vorrai un indirizzo col dominio, Email Routing di Cloudflare lo inoltra alla stessa casella.
3. Da fare: `preload` di HSTS dopo la verifica del dominio (sezione E) e la regola WAF di rate limiting dell'ADR 0021.

## B. Segreti dell'ambiente vivo (Roberto, M6-02)
1. Solo da te, mai da Claude Code: `TURNSTILE_SECRET`, `SESSION_HMAC_KEY` e `HASH_KEY` dell'ambiente `staging` (`npx wrangler secret list --env staging` mostra i nomi, non i valori).
2. `SESSION_HMAC_KEY` e `HASH_KEY`: stringhe casuali lunghe, diverse da quelle di sviluppo (`wrangler.jsonc`). `TURNSTILE_SECRET`: quello del widget vero.
3. Firma in `docs/PROGRESS.md`: data e «segreti dell'ambiente staging impostati da me, diversi da quelli di sviluppo».
4. I secret `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` della CI sono già in GitHub.

## C. Prima del tag (Claude Code)
- `npm run verify` verde, `docs/feature_list.json` con `passes: true` tranne le voci M6 non ancora provate.
- `CHANGELOG.md`: «Non rilasciato» diventa `0.1.0` con la data; `docs/PROGRESS.md` aggiornato.
- Dipendenze: i rami Dependabot aperti uniti o scartati (CI verde).

## D. Rilascio (Roberto)
1. Prova del rollback sull'ambiente vivo (`docs/runbook-rollback.md`, M6-03): per qualche minuto il dominio serve la versione precedente, quindi in un momento con pochi utenti; esito scritto nella tabella del runbook.
2. Tag `v0.1.0` su un commit di `main` con CI e «Deploy staging» verdi (M6-04). Nessun secondo deploy parte dal tag.
3. Dopo il rilascio le tabelle `archive_sizes_*` si possono cancellare (decisione tua).

## E. Dopo il rilascio (Claude Code, solo letture, M6-05)
- `/api/health`, una cella, header e CSP su `www.dovebevo.com`; `cf-cache-status: HIT` su una cella dopo due richieste (Cache API attiva sul dominio, SPEC D-01).
- HSTS: dopo la verifica del dominio aggiungi `preload` all'header (SPEC 13.1) e registra il dominio su hstspreload.org.
- `/admin` apre solo con Access; `/privacy` e `/regole` si aprono.
- `sitemap.xml` e `robots.txt` escono con il dominio della richiesta: controlla che citino `www.dovebevo.com`.
- Nessun prezzo di prova sul sito vivo: gli smoke test sono solo letture.

## F. Legale (Roberto)
- Rileggi `/privacy` e `/regole` (testi in `src/app/i18n/it.ts`, sezione `legal`): la bozza non indica il titolare del trattamento. Completala con l'informativa iubenda o con i dati del titolare prima di promuovere il servizio.

## Se un giorno serve l'ambiente separato (non ora)
Serve una decisione tua e una nuova versione della SPEC con un tag nuovo, perché cambiano il capitolo 16 e M6. Poi:
1. D1 `dovebevo-production` (`wrangler d1 create`), con il suo `database_id`; Queue e Rate Limiting come per staging, con `namespace_id` propri.
2. Widget Turnstile e applicazione Access sul dominio, con `TURNSTILE_SITE_KEY`, `TURNSTILE_HOSTNAME`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` nelle vars.
3. Segreti: `npx wrangler secret put <NOME> --env production` per i tre, valori diversi da quelli di staging.
4. Blocco `env.production` in `wrangler.jsonc` (stessa forma di `staging`); `node scripts/check-config.mjs` deve restare verde.
5. GitHub → Settings → Environments → `production` con reviewer obbligatorio = Roberto e i secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
6. Copiare `docs/templates/deploy-production.yml.example` in `.github/workflows/deploy-production.yml` solo dopo il punto 4.
7. Decidere cosa fare dei dati del D1 attuale (copia o partenza da zero) e quale dominio punta a quale Worker.
