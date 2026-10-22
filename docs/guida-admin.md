# Guida: pagina admin

La pagina **/admin** serve a:
- **nascondere** una voce che non è un bar (o è chiusa): sparisce dalla mappa e non riceve più prezzi;
- **aggiungere** un bar che non c'è su OpenStreetMap: compare subito sulla mappa;
- **approvare o rimuovere** i bar aggiunti e i prezzi segnalati o in quarantena;
- **ripristinare** un bar nascosto per errore.

È protetta da **Cloudflare Access** (D-19): solo la tua email entra, con un codice che ricevi per posta.
Il Worker controlla comunque la firma di Access a ogni richiesta: se Access non è configurato, la pagina
mostra "Accesso riservato" e le API rispondono 403.

## 1. Configurare Access (una volta, circa 10 minuti)

1. Apri <https://one.dash.cloudflare.com/> (Zero Trust). Alla prima apertura scegli un **nome del team**
   (es. `dovebevo`) e il piano **Free** (fino a 50 utenti, 0 €).
2. **Access → Applications → Add an application → Self-hosted**.
   - **Application name**: `Dove bevo admin (staging)`.
   - **Session duration**: 24 hours.
   - **Public hostname** (aggiungi due righe, stesso dominio):
     - Domain `dovebevo-staging.dovebevo.workers.dev`, Path `admin`
     - Domain `dovebevo-staging.dovebevo.workers.dev`, Path `api/admin/*`
3. **Policies → Add a policy**: nome `Solo Roberto`, Action **Allow**, Include → **Emails** →
   `<la tua email>` (quella con cui entri in Cloudflare; non scriverla nel repo). Salva.
4. **Login methods**: lascia **One-time PIN** (codice via email).
5. Salva l'applicazione, poi aprila e copia l'**Application Audience (AUD) Tag** (una stringa esadecimale lunga).
6. Il **team domain** è `<nome-del-team>.cloudflareaccess.com` (lo vedi in Settings → Custom pages o
   nell'URL di login).

## 2. Comunicarmi i due valori (non sono segreti)

Scrivimi in chat:
- team domain, es. `dovebevo.cloudflareaccess.com`
- AUD tag

Li metto in `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` dell'ambiente staging) e arrivano con il
prossimo deploy automatico. Sono identificativi pubblici, non password: senza la tua email nessuno entra.

## 3. Usare la pagina

Apri <https://dovebevo-staging.dovebevo.workers.dev/admin>, inserisci la tua email, poi il codice
ricevuto.

- **Trova un bar sulla mappa**: città + parte del nome → **Nascondi** sulle voci che non sono bar.
- **Aggiungi un bar che manca**: nome, tipo, coordinate. Le coordinate: su Google Maps tieni premuto sul
  punto (da computer: tasto destro) e copia i due numeri, es. `45.4642, 9.1900`.
- **Prezzi da rivedere**: *Approva* lo rimette sulla mappa, *Rimuovi* lo toglie.
- **Bar nascosti**: *Ripristina* annulla un "Nascondi".

Le modifiche si vedono sulla mappa al ricaricamento della pagina (cache di 60 secondi al massimo).
