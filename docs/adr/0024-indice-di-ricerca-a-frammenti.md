# 0024 · Ricerca dei bar per nome con un indice statico a frammenti

- **Stato:** proposta (decisioni B4 di Roberto del 2026-10-16, in attesa dell'ok al passo 1) · **Data:** 2026-10-16

## Contesto
Oggi `SearchSheet` trova le città in `places.json` e i bar solo tra le celle già caricate (M4-06). Roberto ha verificato che per gli utenti è più naturale cercare il nome del locale. Vincoli: nessuna ricerca lato server (SPEC 7.6, 20), zero richieste a `/api/*` e zero letture D1 per ricerca, nessuna dipendenza, file statici ≤ 15.000 e ≤ 1 MB ciascuno, al CDN solo i primi caratteri digitati. La ricerca per quartiere è esclusa (dati OSM incompleti).

## Misure (passo 0, dati reali di staging `20261014`)
- Import: 60.667 bar, 1.326 luoghi, **8.127 file**: margine di 6.873 file.
- Simulazione su 59.974 bar (98,9%, ricostruiti dai file statici di staging): parole normalizzate di almeno 3 caratteri, senza parole vuote, nel frammento del loro prefisso di 2 caratteri → 510 frammenti, 2.085 KB gzip in tutto. Più grandi: `ca` 96,5 KB, `pa` 68,1, `ma` 64,3, `co` 58,1, `bi` 44,2, `ba` 41,2, `pi` 40,3.
- Con divisione a 3 caratteri sopra 40 KB gzip: 7 prefissi divisi, **661 file** (indice compreso), totale **8.788 file**; il più grande è `caf` con 39,3 KB.
- Ricerche tipiche: `bar sport` → 21,5 KB, `caffè roma` → 37,4 KB, `osteria` → 10,3 KB, più l'indice. Tutte sotto i 60 KB.
- Un indice unico peserebbe circa 2 MB gzip; uno per città obbligherebbe a scegliere prima la città. Il disegno a frammenti regge con le misure.

## Decisione
1. **Una sola normalizzazione** in `src/shared/venue.ts`: `searchKey` (invariato) e una nuova `searchWords(text)`, che divide su tutto ciò che non è lettera o cifra. L'import (`scripts/osm-import/osm.ts`, che già importa da `src/shared/`) e il client usano le stesse funzioni e la stessa lista di parole vuote (`bar`, `caffe`, `cafe`, `pub`, `di`, `da`, `del`, `della`, `dei`, `delle`, `dal`, `la`, `il`, `lo`, `le`, `gli`, `the`, `and`, `e`, `al`, `alla`, `ai`, `in`, `con`). Il test usa casi reali: `Caffè`, `l'Osteria`, `Bar Sport`, `Più`, `Trattoria da Mario`.
2. **Generazione nell'import**: accanto ai file attuali, `public/data/<DATA_VERSION>/s/<prefisso>.json` con voci `[key, nome, lat, lon, cityId]`. `cityId` è l'ID del nodo OSM (D-11), stabile tra versioni. Ogni bar compare una sola volta per frammento. I frammenti sopra 40 KB gzip si dividono in prefissi di 3 caratteri; `s/index.json` elenca i prefissi divisi. Lo script **fallisce** se un frammento supera 40 KB gzip, se i file superano 15.000 o se un file supera 1 MB. Nei nomi dei file vanno solo `[a-z0-9]`: i 3 prefissi con altri caratteri (misura) si traslitterano con la stessa normalizzazione oppure finiscono in `s/_.json`, a seconda di cosa costa meno righe al passo 3.
3. **Client**, caricato a richiesta (chunk separato, nessun peso sulla shell): da 3 caratteri scarica `s/index.json` e il frammento della prima parola significativa, una volta per visita; tiene le voci in cui ogni parola digitata è prefisso di una parola del nome (l'ordine delle parole non conta); mostra al massimo 8 bar insieme alle città.
4. **Ordine**: nome esatto, poi inizio del nome, poi distanza dal centro della mappa o dalla posizione, solo se il permesso è già concesso (mai chiesto), poi alfabetico.
5. **Scelta**: volo a zoom 17 (rispettando `prefers-reduced-motion`), le celle si caricano come oggi, si apre la scheda dalla `key`. I risultati non mostrano prezzi: nessuna lettura prima della scelta.
6. **Nessun risultato**: «Non trovo questo locale» e un pulsante che apre «Non trovi il bar?» (SPEC 7.5) col nome già scritto.
7. **Errore di rete sul frammento**: «Ricerca non disponibile ora, cerca una città»; la ricerca per città continua.

## Limiti accettati (decisioni di Roberto)
- **Bar nascosti dall'admin** (ADR 0017): restano nei frammenti, che sono generati al deploy. Dopo il volo la cella porta già la lista `h` dei nascosti: la scheda non si apre e compare «Questo locale non è più sulla mappa». Zero codice nel Worker, zero letture in più.
- **Bar utente approvati** (`u…`): non sono nei file statici, quindi non si trovano per nome. Compaiono comunque sulla mappa e nell'elenco.
- **997 bar con nomi fatti solo di parole vuote** («Bar», «Caffè», «Pub»): non si trovano per nome, solo dalla mappa e dall'elenco.
- I bar senza nome sono già esclusi dall'import (SPEC 5.1). Il log non separa i bar senza nome dalle altre esclusioni: in tutto ne sono stati esclusi 12.501.

## Privacy
Al CDN arriva il nome del frammento, cioè i primi 2 o 3 caratteri di una parola digitata, mai la posizione. Una riga in `PRIVACY-NOTES.md` lo dichiara.

## Budget bloccanti
Frammento ≤ 40 KB gzip · ricerca tipica ≤ 60 KB scaricati · risultati ≤ 150 ms con il frammento in memoria e ≤ 1 s su rete mobile media · codice di ricerca a richiesta · file totali ≤ 15.000.
