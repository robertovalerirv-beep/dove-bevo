# Rollback (M6-03)

Un rollback riporta il Worker alla versione precedente in pochi secondi. **Lo esegue Roberto o la CI**: Claude Code non lancia comandi di deploy né comandi D1 `--remote`.

## Quando
- Dopo un deploy, `/api/health` non risponde 200 o la mappa non si apre.
- Un errore nel codice fa perdere o sporcare dati nuovi.
- Non per un dato sbagliato in D1: quello si corregge da `/admin`.

## 1. Riporta il codice alla versione precedente

```bash
npx wrangler deployments list --env staging
```

```bash
npx wrangler rollback --env staging
```

Per un'altra versione: `npx wrangler rollback <version-id> --env staging`. In produzione si usa `--env production`.

Il comando riporta Worker e **asset** (cioè anche i file dei bar di quella versione). La variabile `DATA_VERSION` è quella della versione ripristinata.

## 2. Controlla

```bash
curl -fsS https://<ambiente>/api/health
```

La risposta deve avere `"status":"ok"` e il `data_version` della versione ripristinata. Poi apri la mappa su un telefono e segna un prezzo di prova su un bar di test (e rimuovilo da `/admin`).

## 3. Database

Le migrazioni D1 **non tornano indietro**: sono solo additive (regola del progetto) e la versione precedente del codice funziona con lo schema nuovo. Se una migrazione è la causa del guasto:
1. non modificare quella già applicata: si scrive una migrazione nuova che la corregge;
2. D1 conserva un backup a punti nel tempo (Time Travel): `npx wrangler d1 time-travel info DB --env <ambiente>` mostra le finestre, il ripristino è una decisione di Roberto e si fa con `time-travel restore` indicando un istante prima del guasto.

## 4. Dopo

- Annota in `docs/PROGRESS.md` cosa è successo, la versione ripristinata e il motivo.
- Il tag `v0.x.y` difettoso non si cancella: se ne pubblica uno nuovo con la correzione.

## Prova in staging (M6-03: da fare prima del lancio)

1. `npx wrangler deployments list --env staging` e prendi nota della versione attuale.
2. Fai un deploy qualsiasi (basta un merge su `main`), poi `npx wrangler rollback --env staging`.
3. `curl https://dovebevo-staging.dovebevo.workers.dev/api/health` risponde 200 con il `data_version` della versione ripristinata; la mappa si apre.
4. Rimetti in avanti con un nuovo deploy (merge o `npx wrangler rollback <version-id> --env staging` verso la versione più nuova).
5. Scrivi qui sotto data, versioni e esito.

| Data | Da → a | Esito |
|---|---|---|
| _da compilare dopo la prova_ | | |
