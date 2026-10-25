# 0033 · Gestore verificato

- **Stato:** accettata · **Data:** 2026-10-25 · SPEC 1.9 (D-34, 7.10, MD-01…MD-11), decisa da Roberto in chat

## Contesto
Roberto vuole un'entrata dai gestori dei locali senza far pagare gli utenti (vincolo 2.7) e senza toccare i prezzi, che restano degli utenti. Il contratto con il gestore (fuori dal repository) prevede la spunta «Gestore verificato», l'etichetta «Sponsorizzato», il posto in cima all'Elenco e gli orari nella scheda, attivati solo dall'admin. Una classifica a pagamento non dichiarata è sempre ingannevole (art. 23 c. 1 lett. m-bis Codice del Consumo).

## Decisione
- Tabella `venues_verified (venue_key, cell, name, hours)` (migrazione `0008`): una riga = gestore verificato. Nessuna data di contratto, importo, stato di pagamento o contatto: Roberto li tiene fuori dal progetto e attiva o disattiva a mano.
- La spunta e gli orari stanno in D1, non nei file statici dei bar: sono dati nostri (ADR 0003, ODbL) e devono cambiare subito, mentre i file restano in cache un anno.
- Lettura: `g` (chiavi verificate) nella risposta della cella, nello stesso `batch` e nella stessa riga istantanea (ADR 0032); `o` (orari) solo nella scheda, che li mostra. La definizione di bar pubblico resta una (`isPublicBar`, ADR 0017/0019).
- Scrittura: tre rotte admin dietro Cloudflare Access; cella e nome dal file del bar o da `venues_user`; ogni scrittura svuota la cella.
- Orari: un solo modulo `src/shared/hours.ts` (zod nel Worker e controllo nel client), sette giorni da lunedì, fino a 2 fasce; niente «aperto ora».
- Trasparenza: «Sponsorizzato» sempre accanto alla spunta, solo nell'Elenco e nella scheda; pin, ricerca, «I più economici qui», mediane, colori e pagine SEO invariati.
- Aperture della scheda: `venue_viewed` porta la chiave solo per un bar verificato; il Worker la conta solo se il bar è in tabella, così nessuno può riempire `metrics_daily` di chiavi inventate.
- Colore: nuovo token `verified` (blu, gli stessi valori di `focus` e `map-me`) con contrasto ≥ 3:1 su `bg` e `surface` nei due temi.

## Alternative scartate
Una colonna su `venues_user` (i bar OSM non sono in D1); la spunta nei file statici (cache immutabile e share-alike ODbL); un'area riservata per i gestori (più codice e più superficie d'attacco); date di validità e stato di pagamento in D1 (Roberto li vuole fuori dal progetto); pagamenti nell'app (vincolo 2.7, M3-18); «aperto ora» (non richiesto, e sensibile a orari sbagliati).

## Conseguenze
- Una lettura a snapshot vuoto fa una query in più sull'indice `vv_cell`; a snapshot pronto il costo resta una riga.
- Chi ha già la cella in memoria vede attivazioni e disattivazioni entro 60 s.
- Il colore della spunta è un token di brand: cambiarlo passa da `tokens.json` e dai test di contrasto.
