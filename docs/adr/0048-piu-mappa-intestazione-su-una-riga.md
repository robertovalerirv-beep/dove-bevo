# 0048 · Più mappa sul telefono: intestazione su una riga, controlli da 40 px su bersagli da 48 px

- **Stato:** decisa da Roberto l'11/11/2026 in chat (mockup e piano approvati) · **Data:** 2026-11-11 · SPEC 1.18 · completa l'ADR 0027 (barra a due tasti, mappa che non cambia altezza) e l'ADR 0028 (menu «Scegli cosa bere»). Non cambia schema, API, D1 e scritture. Cambia il testo della verifica MB-13 in `docs/feature_list.json`, quindi la guardia passa al tag `spec-approved-15`.

## Contesto
Su un iPhone in Safari lo schermo utile è di circa 874 px: 161 px sono di iOS e Safari. Alla mappa ne restavano 523 (402×713 utili) perché l'intestazione era su due righe da 48 px (125 px) e la barra in basso era alta 65 px, con «Aggiungi locale mancante» che andava a capo. In più, i segnaposto dei prezzi (32 px) e i cerchi dei gruppi (raggio 16–24 px) si coprivano tra loro e la fascia delle attribuzioni restava chiara sulla mappa scura.

## Decisione
1. **Intestazione su una riga:** simbolo, «Cerca», menu dei drink, «Vicino a me». Il menu mostra solo il drink scelto; «Scegli cosa bere» resta il nome accessibile (`sr-only`), quindi il nome del pulsante e i test non cambiano. «Cerca» è il testo visibile e «Cerca città o bar» il nome (WCAG 2.5.3: il nome inizia con il testo visibile). Sotto i 420 px (ogni iPhone tranne i Max) la ricerca è la sola icona da 48 px: con la parola «Cerca» il nome del drink avrebbe solo 160 px e si troncherebbe («Birra m…»). Intestazione e barra hanno 5 px di margine verso il bordo dello schermo, perché l'anello di focus (3 px a 2 px di distanza) non venga tagliato.
2. **Bersaglio 48 px, disegno 40 px.** I controlli della mappa (ricerca, menu dei drink, «Vicino a me», «IT», «Elenco», i due tasti in basso) restano scatole da 48 px, ma bordo, fondo e ombra a timbro sono disegnati da `::before`, 4 px più dentro in alto e in basso. Fuoco e pressione restano sulla scatola. Il vincolo dei 48 px (SPEC 2, 15) vale ancora: cambia ciò che si vede, non ciò che si tocca.
3. **Barra in basso:** «Aggiungi prezzo» e «**Aggiungi locale**» (inglese «**Add a place**»), colonne `auto` e `1fr`, testo su una riga fino a 320 px, altezza 54 px con il margine.
4. **Segnaposto più piccoli:** pin da 32 a 28 px, cifre da 15 a 14 px (il minimo del MASTER), margine interno da 28 a 24 px; cerchi dei gruppi di raggio 14, 17 e 20 px al posto di 16, 20 e 24. Il bersaglio di tocco dei pin non cambia.
5. **Frase della copertura su una riga** (≥ 375 px): la pillola parte a 60 px dal bordo (era 64) con 8 px di margine interno e, sotto i 480 px, la barretta della copertura non si disegna. È solo un disegno (`aria-hidden`), la frase che dice lo stesso è invariata (MB-08).
6. **Attribuzioni in Fuori orario:** fondo `surface` all'85% e testo `ink`, come di giorno ma coi token scuri. Testo, misura e link da 24 px invariati (SPEC 2.8, MG-01).
7. **Le app native non cambiano nell'aspetto.** Tutte le regole nuove del disegno valgono solo fuori dal guscio nativo (`:root:not([data-dovebevo-mobile-shell="1"])`); l'app Europa condivide `.map__lang` e `.map__list`, e le loro posizioni comuni sono rimaste. Il contratto di build delle app (`mobile-apps/web/build-contract.mjs`) fissa l'hash di `app.tsx` e di `maplibre-map.ts` e cerca il tasto di ricerca per classe: sono stati rivisti i punti di aggancio (ricerca, barra delle azioni, percorso, `pinImage`) e aggiornati hash e classe (`btn btn--slim search-field`); il menu dei drink nativo (`DrinkStrip`) ora sta nella riga dell'intestazione e `shell.css` lo fa riempire la riga. Il nome del secondo tasto cambia anche nelle app, che leggono lo stesso `it.ts`.

## Alternative scartate
- **Solo il testo visibile «Aggiungi locale», nome accessibile invariato:** chi usa il controllo vocale leggerebbe una frase e ne dovrebbe dire un'altra (WCAG 2.5.3).
- **Pulsanti da 40 px interi:** sotto i 48 px del vincolo e dei test (SPEC 2, MC-01, ME-02).
- **Barretta della copertura ridotta a 40 px:** misurata, non entra: la frase è larga 216–221 px e tra «IT» ed «Elenco» ce ne sono 262.
- **Menu dei drink fuori dalla riga con `display: contents`:** l'ordine di tabulazione non seguirebbe quello visivo (WCAG 2.4.3).

## Conseguenze
- Sull'iPhone di Roberto la mappa passa da 523 a 605 px (+82 px, +16%); a 390×844 da 654 a 736 px (+82 px, +13%): intestazione 125 → 54 px, barra 65 → 54 px.
- La barretta della copertura sparisce sotto i 480 px: sui telefoni resta solo la frase. Si ripristina togliendo la regola `@media (max-width: 479px)` in `app.css`, ma la frase andrebbe a capo.
- Dalla stessa riga il menu dei drink perde il titolo scritto: con più drink scelti il riepilogo si tronca con i puntini.
- I messaggi lunghi e passeggeri della pillola di stato («Avvicinati per vedere i prezzi, o cerca una città.», errori) restano su due righe: a 14 px non entrano tra «IT» ed «Elenco» e le frasi sono citate in SPEC e nei test.
- A 360 px la frase della copertura può ancora andare a capo (1 px); da 375 px in su sta su una riga.
- Il tag `spec-approved-15` sostituisce il 14 come riferimento della guardia della feature list.
- Rollback con `git revert` del ramo e del tag: nessun dato è stato toccato.

## Misure
Chromium, 390×844 e 402×713, prima e dopo, tema chiaro e scuro: vedi la voce di `docs/PROGRESS.md` dell'11/11/2026.
