# Guida: inserire un prezzo

Indirizzo di prova (staging): <https://dovebevo-staging.roberto-valeri-rv.workers.dev>

Funziona da telefono e da computer, senza registrazione. Sul telefono puoi aggiungerla alla schermata Home
dal menu del browser ("Aggiungi a schermata Home").

## In 4 tocchi

1. Tocca **Aggiungi prezzo** (pulsante blu in basso).
2. Scegli il **bar**: in cima ci sono i 5 più vicini. Se hai concesso la posizione sono vicini a te,
   altrimenti al centro della mappa. Non lo vedi? Scrivi parte del nome nel campo di ricerca.
3. Scegli il **drink**. Il formato più comune è già selezionato (per la birra alla spina puoi cambiarlo:
   0,2 · 0,4 · 0,5 l).
4. Scrivi il **prezzo** (es. `7,50`) e tocca **Salva** (o Invio). Se era in happy hour attiva l'interruttore
   *Happy hour* prima di salvare.

Compare **"Prezzo salvato"** con **Annulla** per 10 secondi: se hai sbagliato, tocca Annulla e non parte
nulla. Se tieni il dito o il cursore sul messaggio, il tempo si ferma. Passati i 10 secondi (o se chiudi
l'app) il prezzo viene inviato.

La prima volta Cloudflare fa un controllo anti-robot, di solito invisibile.

## Dalla scheda di un bar

Tocca un bar sulla mappa (o in **Elenco**):
- **Aggiungi un prezzo qui**: come sopra, con il bar già scelto.
- **Confermo**: il prezzo è ancora giusto (un tocco).
- **È cambiato**: apre l'inserimento con bar, drink e formato già scelti; basta scrivere il prezzo nuovo.
- **Segnala un errore** / **Segnala un problema con il bar**: motivi a scelta, nessun testo libero.

## Cosa può succedere

- **"Ci sembra un prezzo insolito…"**: il prezzo è fuori dai limiti del drink (es. spritz sopra 15 €).
  Controlla le cifre.
- **"Salvato: comparirà quando…"**: il prezzo è molto lontano da quelli della zona e resta **in verifica**
  finché qualcun altro lo conferma.
- **"Questo prezzo c'era già"**: lo stesso prezzo era già presente; vale come conferma.
- Limiti giornalieri per persona: 30 prezzi, 50 conferme, 20 segnalazioni.

## Per i test

- I prezzi si vedono sulla mappa da zoom vicino (città o quartiere): cerca una città in alto o tocca
  **Vicino a me**.
- I dati dei bar vengono da OpenStreetMap: se una voce non è un bar o manca un bar, si corregge dalla pagina
  admin (`docs/guida-admin.md`).
