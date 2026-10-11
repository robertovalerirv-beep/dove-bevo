# 0011 · Design system dalla categoria più vicina del catalogo

- **Stato:** accettata (M0-10, risultato approvato da Roberto l'11/10/2026) · **Data:** 2026-10-11

## Contesto
SPEC 15.1 chiede di generare il design system con UI UX Pro Max usando una query precisa. Quella query (in italiano) e una riformulazione in inglese hanno restituito un risultato fuori tema: una landing per documentazione con font accademici. Il catalogo della skill non ha la categoria "nightlife", e la skill vieta di salvare un risultato non verificato.

## Decisione
- Si usa la categoria più vicina del catalogo, **Food Delivery / On-Demand** (mobile, mappa, uso rapido, prezzi): stile "Vibrant & Block-based".
- Si scarta la coppia di font suggerita (Playfair Display SC + Karla) perché supererebbe 2 file woff2. Al suo posto c'è un solo font variabile, Plus Jakarta Sans.
- La palette finale è la C, "Blu e arancio", scelta da Roberto fra tre varianti, tutte verificate AA.
- `MASTER.md` e gli override di pagina sono scritti a mano a partire dalle ricerche per dominio, ciascuna citata in `MASTER.md`.

## Conseguenze
Il design system non è l'output diretto del comando di SPEC 15.1, ma una sintesi dichiarata. Le revisioni future partono da `MASTER.md`. Rigenerarlo con la skill richiederebbe `--force` e l'autorizzazione di Roberto.
