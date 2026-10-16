# Mappa e pin

## Stile della mappa

- Parti da OpenFreeMap **Positron** per Bancone e **Dark** per Fuori orario. Modifica il JSON dello stile (Maputnik o script) e servilo dal proprio dominio: OpenFreeMap lo consente, a condizione di ospitare il JSON. Tessere, glifi e sprite restano su `tiles.openfreemap.org`, già in `connect-src`.
- Colori: `map-land`, `map-water`, `map-park`, `map-road`, `map-label`.
- Togli i punti di interesse (negozi, banche, fermate) e le etichette delle strade minori: sulla mappa i soli segnali forti sono i prezzi. Tieni le etichette di quartieri, piazze e Navigli, che servono a orientarsi.
- Attribuzione sempre visibile: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors.

## Pin

| Stato | Forma | Colori |
|---|---|---|
| Prezzo affare | pillola `radius-pill`, glifo `↓` e prezzo in `price` | `affare` + `on-affare`, bordo `ink` |
| Prezzo giusto | pillola, glifo `=` | `giusto` + `on-giusto`, bordo `ink` |
| Prezzo salato | pillola, glifo `↑` | `salato` + `on-salato`, bordo `ink` |
| Bar senza prezzo | punto di 10px | riempimento `surface`, bordo `ink` 2px |
| Gruppo (cluster) | cerchio con il numero di bar in `price` | `ink` + `bg` |
| Selezionato | tappo a corona con il prezzo sotto | `spritz` + `on-spritz`, rimbalzo 260 ms |
| Da confermare (oltre 90 giorni) | come il gradino, bordo tratteggiato, senza ombra, prezzo in corsivo | stessi token |

- Il bordo `ink` da 2px è obbligatorio: è lui a dare il contrasto 3:1 sul terreno chiaro, dove il lime da solo è 1,1:1.
- Implementazione: i pin restano un livello simbolo di MapLibre sulla sorgente GeoJSON con clustering, non marcatori HTML. L'immagine di ogni pin (pillola, glifo e prezzo in Geist Mono) si disegna su canvas al primo bisogno con l'evento `styleimagemissing` e `addImage`, con nome `pin-<gradino>-<prezzo>-<tema>`. I prezzi diversi in una zona sono poche decine, quindi poche immagini, nessun file in più e nessun glifo personalizzato per la mappa. Ridisegna solo al cambio di tema.
- L'alternativa accessibile alla mappa (elenco dei bar visibili) usa le stesse pillole in HTML.
