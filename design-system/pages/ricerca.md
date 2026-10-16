# Pagina: Ricerca — override di MASTER

Riferimento: `docs/brand/mockup/6-cerca.png`, ADR 0024.

- Stesso `SearchSheet` a tutta altezza, nessuna schermata nuova. Casella in alto, focus automatico, "Chiudi"; schema ARIA `combobox` (frecce, Invio, Esc); numero di risultati in `aria-live="polite"`.
- **Elenco unico** con il tipo indicato: città (nome + numero di bar in `caption`) e bar (nome, tipo, città, distanza se nota). La parte corrispondente del nome è in `<mark>` su fondo `affare` con testo `on-affare`. Righe 56 px, tutto il rigo toccabile.
- **"I più economici qui"** (M4-04): titolo `subtitle`, al massimo 10 righe con `PricePill` a destra e data in `meta`.
- **Download del frammento**: indicatore discreto, la digitazione non si blocca.
- **Nessun risultato**: "Non trovo questo locale" e il pulsante "Non trovi il bar?" col nome già scritto.
- **Errore di rete**: "Ricerca non disponibile ora, cerca una città"; le città restano.
