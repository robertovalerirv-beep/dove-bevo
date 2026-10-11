# 0009 · Lighthouse CI eseguito con npx, fuori dal lockfile

- **Stato:** accettata (M0-05) · **Data:** 2026-10-11

## Contesto
SPEC 4.1 ammette `@lhci/cli` e SPEC 16 chiede Lighthouse CI su ogni PR. La versione 0.15.1 installata come dipendenza porta pacchetti transitivi con vulnerabilità alte senza correzione compatibile (`basic-ftp`, `extract-zip`, via `proxy-agent` e `puppeteer-core`): `npm audit --audit-level=high`, anch'esso richiesto (M0-08), fallirebbe.

## Decisione
`@lhci/cli` non entra in `package.json`. Il job `lighthouse` lo esegue con `npx --yes @lhci/cli@0.15.1 autorun` a versione esatta. Il job ha solo `contents: read`, nessun segreto, e i report restano su file (`.lighthouseci/`, niente upload pubblico). In locale si usa lo stesso comando.

## Conseguenze
Le dipendenze di Lighthouse non sono fissate dal lockfile (rischio accettato: job isolato e senza segreti). Quando una versione di `@lhci/cli` passerà `npm audit`, si valuta di riportarla nel lockfile.
