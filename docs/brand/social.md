# Social: stile e account

Riferimento per post, reel e storie. Vale insieme a `02-voce.md` (regole di voce e parole vietate D-31); in caso di dubbio prevalgono quelle, tranne dove questo file dichiara una deroga (solo emoji 18+, sotto). Grafica solo dal kit del brand (`tokens.json`, `fonts/`, `components/`, `assets/`). I file dei contenuti (immagini, video) non stanno nel repository.

Ultimo allineamento: 02/11/2026, con le decisioni di Roberto in chat (i reel hanno audio: voce e musica; dal 4° contenuto i reel hanno un protagonista, Bevino).

## Account

- **Instagram:** @dovebevo · nome «Dove Bevo» · immagine: simbolo crema su fondo `spritz`.
- **Bio attuale** (confermata da Roberto il 27/10/2026):

  ```
  Stessa storia, stessa piazza, stesso drink: 5€ da una parte e 11€ dall'altra.
  Dove si spende meno?
  Coming soon. 🔞
  ```

- **Link in bio:** nessuno per ora. **Decisione aperta (Roberto, 27/10/2026): se e quando metterlo.** Il sito è raggiungibile su `www.dovebevo.com` dal 25/10/2026 (ADR 0035), quindi il vincolo non è più il dominio. Quando si decide, «Coming soon» lascia il posto a un invito diretto e si aggiunge il link; questo file va aggiornato nello stesso giorno.

## Come scriviamo

Lo stile è quello della caption del reel 01, scritta da Roberto il 24/10/2026.

- **Si apre con una scena vissuta**, in seconda persona: la cassa, il conto, lo scontrino.
- **Riferimenti locali**: Navigli, quartieri, abitudini milanesi e italiane.
- **Iperbole e ironia**, sempre sul prezzo o sul posto.
- **Complicità**: «Capita a tutti».
- **Lessico da chat**: «top secret», «spoiler», «seguici», «coming soon».
- Frasi brevi, un'idea per riga, chiusura con un invito diretto.
- **Fase attuale (dal 26/10/2026):** contrasto di prezzo reale, «stessa birra, due prezzi» (carosello «Stessa birra.»: 3,50 € contro 9,00 €, «Più del doppio. Cambia solo dove paghi.»), con «Coming soon» finché non si decide il link. La suspense dei primi due contenuti (la mappa, chi ha appena pagato) non è più la linea principale.

Esempio, la caption del reel 01 con la prima riga corretta:

```
Quante volte alla cassa hai scoperto che lo spritz costava quanto un affitto sui Navigli?
Capita a tutti.

Stiamo lavorando a un progetto che potrebbe salvarti da queste spiacevoli sorprese.

Cos'è di preciso? Per ora è top secret. Diciamo solo che c'entra una mappa. E qualcuno che il conto l'ha appena pagato.

Spoiler, manca poco. Seguici.

Per maggiorenni.
#dovebevo #aperitivo #prezzi #bar
```

## Limiti fissi

- **L'esagerazione cade sul conto, mai su quanto si beve** (L. 125/2001, art. 13). Sì: «lo spritz costava quanto un affitto sui Navigli». No: «ti sei bevuto anche il naviglio».
- **Prezzi: solo reali, presi dai dati inseriti dagli utenti** (decisione di Roberto, 27/10/2026). Niente prezzi illustrativi, stimati o inventati, nemmeno «per esempio». Ogni cifra di una grafica o di una caption si controlla sulla mappa il giorno in cui si pubblica; se non si può controllare, non si pubblica. Il segnaposto `?,??` resta solo per i contenuti che parlano di dati non ancora disponibili.
- **Niente emoji, con una deroga:** l'emoji 18+ (🔞) come segnale per maggiorenni, in bio e nelle caption, come oggi. È una deroga a `02-voce.md` valida solo sui social; l'interfaccia dell'app resta senza emoji.
- «Per maggiorenni» in fondo a ogni caption e nell'ultima schermata dei video.
- Hashtag: `#dovebevo #aperitivo #prezzi #bar`.
- Prima delle campagne con creator, verifica di un legale (`01-strategia.md`).

## Cadenza

- **Almeno 3 contenuti a settimana nel feed** (due reel e un carosello). Roberto vuole farne di più: non c'è un tetto, si sale quando i contenuti si riescono a produrre con la stessa cura (decisione del 27/10/2026).
- Le storie si fanno quando hanno uno scopo preciso: finora 31 e 43 visualizzazioni, quasi nessuna interazione.

## Formati

- **Post:** carosello 4:5 (1080×1350), 4 slide: domanda → problema → promessa coperta → attesa. Testo alternativo per ogni slide.
- **Reel:** 1080×1920, circa 15 s, con audio: voce e musica insieme (decisione di Roberto, 31/10/2026). La musica si sceglie dalla libreria di Instagram; la voce, propria o sintetica, è da decidere. Testi nella fascia centrale, tra y 260 e y 1480, lontani dal bordo destro. Copertina dalla scena più curiosa.

## Bevino (reel con protagonista)

- **Chi è:** Bevino, un tappo a corona vivo che ricalca il simbolo: disco arancio `spritz` lucido, bordo zigrinato a 21 denti con contorno scuro, due occhi grandi e scuri, sorriso piccolo, braccia e gambe nere sottili. Personaggio originale, alto 25 cm nella scena.
- **Come si produce (artigianale):** clip generate con Sora (opengen), 9:16, in inglese per il prompt e in italiano per le battute; le clip si uniscono su Clipchamp (già su Windows 11). Il blocco di descrizione di Bevino si ripete identico in ogni prompt.
- **Continuità tra clip:** stessa location descritta con le stesse parole, stato finale di una clip = stato iniziale della successiva, ultimo fotogramma come immagine di partenza quando si può. Niente testo leggibile nel video: schermate, messaggi e «Per maggiorenni» si sovrappongono nel montaggio.
- Valgono tutti i limiti fissi: prezzi solo reali e controllati il giorno, nessuna enfasi sul bere molto.

## Pubblicati

Dati di Instagram al 27/10/2026, ore 13:19 (35 follower, 1.001 visualizzazioni in totale, 117 visite al profilo, 0 tocchi sul link). I numeri si aggiornano nel tempo: la colonna serve come punto di partenza.

| Data | Formato | Contenuto | Visual. · Like · Invii |
|---|---|---|---|
| 24/10/2026 | Post | «Quanto l'hai pagato?»: scontrino a `?,??`, mappa coperta, «Ci siamo quasi.» | 320 · 10 · 1 |
| 24/10/2026 | Reel | «Coming soon»: le stesse quattro scene animate, prezzi che girano e si fermano su `?,??` | 442 · 12 · 6 |
| 26/10/2026 | Post | «Stessa birra.»: 3,50 € contro 9,00 €, «Più del doppio. Cambia solo dove paghi.» (caption: «Alla cassa: «sono 9€»…») | 243 (dopo 16 h) · 8 · 4 |
| 25–26/10/2026 | Storie | Due storie: il simbolo «coming soon» e il telefono con la tastiera | 31 e 43 · 1 e 0 · 0 |
| 02/11/2026 | Reel | Bevino, appena arrivato a Milano, chiama Franco, scopre dovebevo.com ed esce verso Piazza del Duomo: «Trova dove andare a bere vicino a te con dovebevo.com». Fatto con Sora (opengen) | da rilevare |

Ordine dei contenuti nel feed al 02/11/2026: 1° carosello (24/10), 2° reel (24/10), 3° carosello (26/10), 4° reel con Bevino (02/11). Le storie non contano.
