# 0034 · Budget della shell: solo ciò che si scarica all'apertura

- **Stato:** accettata · **Data:** 2026-10-25 · decisa da Roberto in chat; nessuna modifica a SPEC e a `feature_list.json`

## Contesto
SPEC 15 fissa «shell iniziale ≤ 50 KB gzip esclusa MapLibre» e M5-16 tratta la dashboard come «chunk caricato a richiesta», fuori dalla shell. `scripts/check-bundle-size.mjs` sommava invece ogni file JS e CSS di `dist/client/assets`, comprese le pagine admin e legali e la ricerca, che il visitatore non scarica all'apertura; non contava `theme.js`, che invece scarica. Con «Gestore verificato» (ADR 0033) la somma era a 51.136 B su 51.200, mentre la shell vera era a 38,5 KB.

## Decisione
`scripts/bundle-size.ts` ricava da `index.html` gli script e i fogli di stile caricati all'apertura (`<script src>`, `<link rel="stylesheet|modulepreload">`) e segue i loro `import` statici; ciò che sta dietro `import()` è a richiesta. Il budget di 50 KB vale su quella somma; i chunk a richiesta sono stampati a parte. MapLibre resta escluso. Test in `tests/unit/bundle-size.test.ts`.

## Conseguenze
- Shell iniziale misurata: 38.508 B (index.html, `theme.js`, JS e CSS principali).
- Un modulo spostato per errore dalla parte a richiesta a quella statica entra nella somma, perché si seguono gli import statici.
- Il peso dei chunk a richiesta resta visibile nel log; se crescesse troppo serve un budget a parte, da decidere.
