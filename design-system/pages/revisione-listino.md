# Pagina: Revisione listino (foto, AI) — override di MASTER

- **Etichetta fissa** in cima, sempre visibile durante lo scorrimento: "Letti dall'intelligenza artificiale, controllati da te" (superficie con bordo `--color-focus`, icona decorativa).
- **Voci** come schede impilate (non tabella larga: 390 px), una per voce: nome letto (testo semplice, mai HTML), selettori drink e formato, campo prezzo, interruttore HH, casella "Includi" (48 px). Voci `confidence: "low"` o senza drink: bordo `--price-avg`, testo "Da controllare", "Includi" spento di default.
- **Azione**: "Salva N prezzi" primario fisso in basso, con N aggiornato; disabilitato con 0 voci.
- **Pausa AI**: stato vuoto con testo "Lettura dei listini in pausa, puoi inserire i prezzi a mano" e pulsante verso l'inserimento manuale.
