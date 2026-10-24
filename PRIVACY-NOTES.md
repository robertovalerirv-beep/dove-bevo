# Note per l'informativa privacy (bozza)

La versione completa si scrive in M5 (SPEC 7.8). Qui le righe già decise, da non perdere.

- **Posizione:** resta sul dispositivo. Al server e alla CDN arrivano solo celle geohash5 (~5 km), che dicono dove si guarda la mappa, non dove si è (SPEC 14). Il pallino della posizione (D-33) è disegnato sul telefono dalla posizione già letta per «Vicino a me»: non genera richieste.
- **Ricerca per nome** (SPEC 14, ADR 0024): al CDN arriva il nome del frammento, cioè i primi 2 o 3 caratteri di una parola digitata, mai la posizione. La ricerca non chiede il permesso di posizione e non fa richieste a `/api/*`.
- **Dati sul dispositivo** (SPEC 12, D-29): `localStorage` conserva solo la data del primo uso e il numero di prezzi inseriti (`dovebevo-first-use`, `dovebevo-prices`); servono alla Tessera e all'invito all'installazione. Non vengono mai inviati.
