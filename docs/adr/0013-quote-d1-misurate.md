# 0013 · Quote D1: stima con misure reali

- **Stato:** accettata (M1-05) · **Data:** 2026-10-11

## Contesto
SPEC 8 chiede di stimare l'uso delle quote gratuite di D1 (5 milioni di righe lette e 100.000 scritte al giorno) con misure reali in M1. Le misure vengono da `tests/worker/d1-reads.test.ts` (D1 locale in workerd, stesso motore SQLite di produzione), che resta come test di regressione.

## Misure
- **Lettura di una cella** (`GET /api/prices/:cell`): con 300 prezzi nella cella e 2.000 in un'altra, `rows_read` = **601**, cioè circa 2 righe per prezzo restituito (voce dell'indice `pc_cell` più chiave primaria) più la sonda finale. Le altre celle non vengono lette. Il piano usa `pc_cell` e `vu_cell` (indice coprente).
- **Scrittura di un prezzo** (percorso di SPEC 8: `INSERT` in `price_obs` più upsert in `prices_current`, in un'unica `batch()`): `rows_written` = **3** (`price_obs` 2: riga e indice `po_venue`; `prices_current` 1). Con le quote di M2 (`counters` per sessione e per IP) si stimano **5–7 righe** per contributo.

## Stima
| Scenario | Letture/giorno | % di 5 M | Scritture/giorno | % di 100.000 |
|---|---|---|---|---|
| Avvio: 1.000 visite, 8 celle a visita, 10 prezzi per cella | ≈ 170.000 | 3,4 % | 300 contributi × 7 ≈ 2.100 | 2,1 % |
| Maturità: 1.000 visite, 8 celle, 50 prezzi per cella | ≈ 810.000 | 16 % | 1.000 × 7 ≈ 7.000 | 7 % |
| Picco: 5.000 visite, 8 celle, 100 prezzi per cella | ≈ 8 M | **160 %** | 5.000 × 7 ≈ 35.000 | 35 % |

La stima di SPEC 8 (< 1 % delle letture) era ottimista: a regime le letture sono la quota che si esaurisce per prima.

## Decisione
- Si resta sullo schema di SPEC 8: letture e scritture sono proporzionali ai dati restituiti o scritti (lo verifica il test).
- Mitigazioni, in quest'ordine, quando le letture superano il 30 % della quota:
  1. Cache API di 60 s sul dominio vero (M6; su `workers.dev` è inattiva), che assorbe le celle più viste.
  2. Indice coprente su `prices_current (cell, status, …)`, per scendere a circa 1 riga per prezzo al costo di una scrittura d'indice in più per contributo.
  3. Piano a pagamento di D1, da valutare con Roberto.
- `/admin` (M5) mostrerà le richieste di cella al giorno, per accorgersene in tempo.

## Conseguenze
Nessun cambiamento per M1. Il test di regressione fallisce se una modifica alla query o allo schema fa leggere più di circa 2 righe per prezzo o scrivere più di 6 righe per contributo.
