La scheda del bar è uno scontrino: metadati in `meta`, nome in `title`, una riga per drink con icona, data e conferme, prezzo come pin.

- Il consumatore fornisce: nome, tipo, quartiere o città, indirizzo, righe di prezzo.
- Bordo inferiore seghettato con `mask-image` (SVG in `data:`, ammesso dalla CSP in `img-src`).
- Massimo cinque righe visibili, poi "Vedi tutti". Ordine: drink del filtro attivo per primo.
- Date solo come giorno e mese, mai l'orario (privacy).
- Azioni: "Confermo" secondario, "Segna" primario, "È cambiato" e "Segnala un errore" come link sotto.
- Dentro un foglio dal basso (`radius-lg`) a 390px di larghezza.
