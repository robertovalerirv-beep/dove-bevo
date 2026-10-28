# 0040 · Pulsante centrale all'apertura, attribuzioni da 24 px, titolo neutro

- **Stato:** decisa da Roberto il 28/10/2026 in chat · **Data:** 2026-10-28 · SPEC 1.13 (tag `spec-approved-14`); completa gli ADR 0014, 0038 e 0039 e cambia ME-03, M1-07 più le nuove MG-01, MH-01, MH-02

## Contesto
- **iPhone.** Roberto ha provato il sito su iPhone (Safari) dopo il rilascio del download in anticipo (ADR 0039): il primo tocco sulla mappa resta lento come prima. Il `fetch` parte (provato con WebKit), ma Safari non lo traduce in un tocco più veloce.
- **Primo tocco.** All'apertura la mappa è una foto ferma (ADR 0014): chi prova a zoomare non vede nulla muoversi e pensa che il sito non funzioni. Il messaggio che spiega cosa fare stava in alto, in una pillola piccola.
- **Attribuzioni.** I link della riga delle attribuzioni sono più bassi del minimo WCAG 2.2 (24×24 px, criterio 2.5.8): `axe` li segnala, e i test li escludevano a mano.
- **Titolo.** Sulla mappa il titolo della pagina è «Dove bevo», un nome di marca, uguale in italiano e in inglese: ME-03 prometteva invece che «seguisse la lingua».

## Decisione
- Al centro della mappa, finché è la foto ferma, c'è un pulsante «Clicca sulla mappa o cerca una città» (inglese «Tap the map or search for a city»). Si può toccare il pulsante o la mappa. In questa fase la pillola «Avvicinati per vedere i prezzi, o cerca una città.» in alto non compare; dopo il primo tocco il pulsante sparisce e la pillola torna come prima. È un pulsante a sé, fratello (non figlio) del pulsante a tutta area «Esplora la mappa»: un pulsante dentro un altro non è valido.
- Il download in anticipo (ADR 0039) **resta com'è**: aiuta gli altri browser e non fa danni. Su Safari non migliora il primo tocco; MF-02 resta aperta.
- Le attribuzioni restano una riga sola e piccola nell'angolo (SPEC 1.8), ma ogni link è alto almeno 24 px. La riga cresce di pochi pixel (da circa 18 a circa 24); la legenda e i messaggi sopra di lei seguono da soli (`--attribution-h` è misurato a run time).
- Il titolo della pagina sulla mappa resta «Dove bevo» in entrambe le lingue; segue la lingua solo in `/privacy` e `/regole`. ME-03 si riscrive di conseguenza.

## Conseguenze
- La riga di attribuzioni è più alta di circa 6 px: il test che la voleva «≤ 20 px per riga» passa a «≤ 26 px» (il requisito cambia, accessibilità prima del design, SPEC 2).
- Il messaggio «Avvicinati…» non si legge più alla primissima schermata: M1-07 lo attende dopo il primo tocco.
- Un pulsante in più sulla schermata d'apertura: nessuna richiesta di rete, nessun cambio all'altezza della mappa (M1-16).
- Il testo inglese del pulsante è una mia traduzione, da rileggere.
