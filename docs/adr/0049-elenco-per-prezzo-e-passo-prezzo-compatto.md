# 0049 · Elenco per prezzo e passo Prezzo compatto

- **Stato:** decisa da Roberto l'11/11/2026 in chat (piano approvato) · **Data:** 2026-11-11 · SPEC 1.19 · modifica l'ADR 0033 (ordine dell'Elenco con «Gestore verificato»). Non cambia schema, API, D1 e scritture. Cambia il testo della verifica MD-07 in `docs/feature_list.json`, quindi la guardia passa al tag `spec-approved-16`.

## Contesto
Due cose viste da Roberto su iPhone l'11/11/2026:
1. L'Elenco «Bar nella zona» non aiuta a scegliere: senza posizione i bar con un prezzo vengono in ordine alfabetico (8,00 · 8,00 · 8,00 · 10,00 · 9,00 · 8,00 €), con la posizione per distanza.
2. Il passo Prezzo di «Aggiungi prezzo» è lento da usare: domanda da 44 px, cifre da 48 px in un campo alto 112 px, molti spazi; «Salva» finisce sotto la barra di Safari e il titolo diventa «Terra…» perché «Indietro» scritto per esteso occupa l'intestazione.

## Decisione
1. **Elenco per prezzo crescente** (`compareListRowsByPrice` in `src/app/lib/list-order.ts`): i bar con «Gestore verificato» restano in cima con spunta e «Sponsorizzato» (D-34); dentro ciascun gruppo vale il prezzo mostrato (il più basso tra i drink scelti, da `bestPrice`, HH solo se manca il normale), i bar senza prezzo vanno in fondo, a parità di prezzo la distanza se la posizione è nota e poi il nome. Roberto ha scelto il crescente (economico in alto), coerente con «I più economici qui».
2. **Passo Prezzo compatto** (`.price-form` in `app.css`): domanda con `--type-title` (26 px), cifre con il nuovo token `price-lg` (32 px, da `docs/brand/tokens.json`) in un campo alto 56 px, margini più stretti. Bersagli invariati (48 px). A 390×844 «Salva» si vede senza scorrere anche con cinque prezzi già visti e la riga della mediana.
3. **«Indietro» con la sola freccia** nei passi di «Aggiungi prezzo» (prop `iconBack` di `Sheet`): il nome accessibile «Indietro»/«Back» resta in `.sr-only`, il bersaglio è 48×48; il nome del bar nell'intestazione passa alla misura dei sottotitoli (19 px), così «Terrazza Aperol» si legge per intero a 390 px. La domanda resta il titolo grande del passo.
4. **Le app native non cambiano** (scelta di Roberto): `MobileListSheet` usa ancora `compareListRows`, il loro `AddPriceSheet` non passa `iconBack` e il loro modulo ha le sue regole (`.mobile-price-form`); le regole nuove sono tutte sotto `.price-form` e `.sheet__head--steps`. Il contratto di build (`build-contract.mjs`) fissa solo `app.tsx` e la mappa, non toccati.

## Alternative scartate
- **Ordine decrescente (caro in alto):** scartato da Roberto; l'utente cerca dove si spende meno.
- **«Salva» fisso in fondo al foglio:** non scelto; con il passo compatto si vede già senza scorrere.
- **Anche «Chiudi» con la sola icona:** non richiesto; il sottotitolo basta perché il nome entri a 390 px.

## Conseguenze
- Il testo di `/regole` sull'ordine dell'Elenco cambia (italiano e inglese) e dice «sul sito»: le app native aprono la stessa pagina ma tengono il loro ordine (verificati in cima, poi distanza oppure prima i bar con un prezzo e poi alfabetico). Se un giorno anche le app passano all'ordine per prezzo, si toglie «sul sito».
- A 320 px un nome lungo nell'intestazione finisce ancora con «…»: il nome intero resta nella scheda del bar.
- Il tag `spec-approved-16` sostituisce il 15 come riferimento della guardia della feature list.
- Rollback con `git revert`: nessun dato è stato toccato.
