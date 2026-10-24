# Instagram

Account aperto il 24/10/2026. Voce e limiti da `../../02-voce.md`: si parla di prezzi e di posti, mai di bere tanto; niente emoji; servizio per maggiorenni (L. 125/2001, art. 13).

## Profilo

- **Nome utente:** @dovebevo
- **Nome:** Dove bevo · prezzi dei bar
- **Immagine:** `profilo-1080.png` (sorgente `profilo.svg`): simbolo dell'icona dell'app su fondo `spritz`, quadrato pieno perché Instagram ritaglia a cerchio.
- **Biografia** (141 caratteri):

  ```
  Quanto costa uno spritz qui?
  A breve te lo diciamo noi. Anzi, chi l'ha appena pagato.
  Gratis, senza account. Per maggiorenni.
  Ci siamo quasi.
  ```

- **Link:** nessuno finché il dominio non è comprato. Quel giorno l'ultima riga diventa `Ci siamo. Segna il tuo ↓` e si aggiunge il link.

## Post 01 — l'attesa

Carosello di 4 slide, 1080×1350 (4:5), in `post-01/` (`1.png` … `4.png`). Sorgente `post-01/slide.html`; si rigenerano con `node docs/brand/social/instagram/render.mjs` dopo `npm ci`.

Arco: domanda → problema → promessa coperta → attesa. I prezzi sono tutti `?,??`: non mostriamo numeri inventati, e il punto interrogativo è la suspense.

| Slide | Testo | Testo alternativo |
|---|---|---|
| 1 | Quanto l'hai pagato? | Fondo arancione, icona di un bicchiere da spritz e la scritta "Quanto l'hai pagato?". |
| 2 | Il conto lo scopri sempre dopo. | Uno scontrino di "un bar qualsiasi" con spritz, birra media e negroni, tutti a prezzo "?,??". Totale: sorpresa. |
| 3 | Il prezzo, prima del conto. | Una mappa di città con segnaposto colorati, tutti con prezzo "?,??". |
| 4 | Ci siamo quasi. | Fondo scuro, simbolo di Dove bevo e la scritta "Ci siamo quasi". Per maggiorenni. |

### Caption

```
Ti è mai arrivato il conto e hai fatto finta di niente?
Capita a tutti.

Stiamo preparando una cosa per sapere quanto costa uno spritz prima di sederti. Non prima di pagare: prima di sederti.

Cos'è di preciso, per ora resta tra noi. Diciamo solo che c'entra una mappa. E chi il conto l'ha appena pagato.

Seguici, manca poco.

Per maggiorenni.
#dovebevo #aperitivo #prezzi #bar
```
