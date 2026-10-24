# 0031 · Pallino della posizione e attribuzioni in una riga

- **Stato:** decisa da Roberto il 24/10/2026 in chat · **Data:** 2026-10-24 · tocca SPEC 7.1, D-33, MC-05 (SPEC 1.8, tag `spec-approved-9`)

## Contesto
Dallo screenshot di Roberto (iPhone, 390 px): (1) le attribuzioni della mappa, a 14 px su due righe in una fascia larga quanto lo schermo, sembrano pubblicità e tolgono spazio; (2) dopo «Vicino a me» la mappa si centra ma non mostra dove si è.

## Decisione
- **Attribuzioni:** restano (licenza ODbL e linee guida OSMF, SPEC 2.8) con lo stesso testo, ma in una riga sola a 11 px (`--size-legal`), in un'etichetta piccola nell'angolo in basso a destra. Possono andare a capo (telefono stretto, testo spaziato come in WCAG 1.4.12): mai tagliate né fuori schermo, e la legenda segue la loro altezza misurata (`--attribution-h`). Scartata l'icona ⓘ che le apre: non sarebbero più «sempre visibili».
- **Pallino:** un cerchio `circle` di MapLibre da 12 px (token `map-me`, bordo chiaro) con un alone `map-me` al 25% di 24 px: nel tema scuro un bar senza prezzo è un pallino chiaro e il colore da solo non basterebbe a distinguerli (WCAG 1.4.1), sotto i prezzi e non toccabile. Lo accende solo «Vicino a me»: le altre letture della posizione (Aggiungi prezzo) non lo mostrano. È statico, quindi niente `watchPosition` (GPS non acceso in continuo, codice minimo), e si sposta a ogni nuovo tocco. `locate()` accetta una posizione vecchia fino a 60 s, quindi un tocco entro un minuto può ridare quella precedente: accettato.

## Conseguenze
- Privacy invariata: la posizione resta sul dispositivo, nessuna richiesta in più (M1-14 la verifica col pallino acceso).
- Il layer `me-dot` viene rimesso al cambio di tema insieme agli altri; la sua posizione sullo schermo è esposta nel DOM (`data-me`, solo pixel) per gli e2e.
- La legenda sta 8 px sopra le attribuzioni, misurate con un `ResizeObserver` (prima: 64 px fissi).
