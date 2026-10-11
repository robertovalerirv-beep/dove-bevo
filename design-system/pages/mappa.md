# Pagina: Mappa (schermata iniziale) — override di MASTER

- **Struttura dall'alto**: barra di ricerca (campo 48 px, apre la vista Ricerca) · fila di chip dei drink scorrevole in orizzontale (5 chip, SPEC 6) · mappa a pieno schermo · in basso, sopra l'area sicura: riga con "Vicino a me" (icona + testo, 48 px) ed "Elenco" (48 px), poi il pulsante primario fisso **"Aggiungi prezzo"** (56 px, larghezza piena meno 16 px di margine).
- **Attribuzioni**: piccole (14 px) ma con contrasto AA su fondo `--color-surface` semitrasparente pieno al 90%, sopra la fila dei pulsanti; mai coperte.
- **Segnaposto**: pill con prezzo (`7,50 €`), colore D-12; "HH" come suffisso testuale; prezzi > 90 giorni con bordo tratteggiato e etichetta "da confermare" nella scheda e nell'elenco. Bar senza prezzo: punto 12 px neutro, area di tocco 48 px. Cluster: cerchio superficie con numero in 600.
- **Sotto zoom 13**: messaggio centrato su superficie "Avvicinati o cerca una città" (`role="status"`), nessun segnaposto.
- **Stati**: caricamento celle annunciato con `aria-live="polite"` ("Carico i prezzi della zona"), errore di rete con "Riprova".
- **Elenco** (alternativa accessibile, SPEC 7.1): foglio a tutta altezza con lista di righe 56 px: nome (600), prezzo del drink scelto con testo del confronto, distanza se nota; ogni riga è un link alla scheda.
