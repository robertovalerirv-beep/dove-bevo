# 0036 · Un solo ambiente vivo: `staging` è la produzione

- **Stato:** decisa da Roberto il 27/10/2026 in chat · **Data:** 2026-10-27 · SPEC 1.10 (tag `spec-approved-11`); completa l'ADR 0035 e cambia M6-02, M6-04 e M6-05

## Contesto
Con l'ADR 0035 il dominio `www.dovebevo.com` è collegato al Worker `dovebevo-staging` e al suo D1, con i bar e i prezzi già inseriti. La SPEC 1.9 prevedeva però due ambienti (`staging` e `production`, ciascuno con Worker, D1 e segreti) e un deploy di produzione solo da tag. Roberto ha ripetuto di non volere per ora il doppio ambiente.

## Decisione
- L'ambiente `staging` è il sito vivo. Nome, Worker, D1, segreti, Access e Turnstile non cambiano (rinominarli cambierebbe indirizzi e regole senza vantaggio).
- Ogni merge su `main` con CI verde aggiorna il sito, come oggi (`deploy-staging.yml`). Chi unisce una PR pubblica: la CI resta il filtro.
- Il tag `v0.x.y` segna sul `main` la versione rilasciata (CHANGELOG, punto di ritorno del rollback). Non parte nessun secondo deploy: il workflow `docs/templates/deploy-production.yml.example` resta un modello inattivo.
- Non si creano ora: blocco `env.production` in `wrangler.jsonc`, D1 `dovebevo-production`, secret e environment GitHub `production`. Restano un passo futuro, deciso da Roberto; il giorno che serve basta seguire `docs/release-checklist.md` (sezione «Se un giorno serve l'ambiente separato»).
- M6-02: i segreti da firmare sono quelli dell'ambiente `staging`. M6-03: la prova del rollback si fa sull'ambiente vivo. M6-04: il tag senza secondo deploy. M6-05: lo smoke test sul dominio vivo.

## Conseguenze
- Un deploy sbagliato arriva subito agli utenti: la rete di sicurezza è `npm run verify`, la CI e il rollback (`docs/runbook-rollback.md`, provato prima del tag).
- Le prove con dati finti non vanno fatte sul sito vivo: per quelle servono il fixture locale o un ambiente a parte.
- Nessuna migrazione dei dati, nessun costo.
- Quando nascerà un ambiente separato servirà una nuova versione della SPEC e un tag nuovo, perché cambierebbero ancora M6 e il capitolo 16.
