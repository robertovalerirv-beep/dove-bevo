# 0015 · Conferme e segnalazioni uniche anche per IP

- **Stato:** accettata (Roberto, 12/10/2026) · **Data:** 2026-10-12

## Contesto
SPEC 7.2, 9.2 e 11 chiedono "una conferma per sessione per prezzo" e "una segnalazione per sessione per prezzo o bar". La sessione anonima dura 30 minuti e se ne ottiene una nuova ricaricando la pagina e superando Turnstile (spesso invisibile). Gli e2e e la revisione di sicurezza di M2 hanno mostrato che, con il solo vincolo per sessione:
- chi ricarica la pagina può confermare di nuovo lo stesso prezzo;
- quattro sessioni dallo stesso dispositivo bastano a mandare un prezzo in `review` (più di 3 segnalazioni);
- l'autore di un prezzo in quarantena può attivarlo da una sessione nuova.

## Decisione
Conferme, segnalazioni e marcatori d'autore sono unici **per sessione e per IP** (IPv6 ridotto al /64), sempre come chiavi HMAC con sale del giorno in `dedup` (SPEC 8, 14). La chiave per IP è rivendicata per prima e in modo atomico (`INSERT ... ON CONFLICT DO NOTHING RETURNING`), così due richieste concorrenti non contano due volte.

## Conseguenze
- Due persone sulla stessa rete (il Wi-Fi del bar, una rete mobile con CGNAT) contano come una sola conferma o segnalazione per prezzo al giorno. Accettato: una conferma in meno è un danno minore di un prezzo gonfiato o rimosso da una persona sola.
- Chi è sulla stessa rete vede la conferma già fatta (il contatore non sale) o "Avevi già segnalato questo errore." anche se non aveva agito di persona.
- Nessun dato personale nuovo: l'IP non è salvato, solo l'HMAC giornaliero, cancellato entro 48 ore (ADR 0016).
- Test: `tests/worker/prices-post.test.ts`, `tests/worker/reports-cron.test.ts` ("report abuse"), e2e M2-11 e M2-13.
