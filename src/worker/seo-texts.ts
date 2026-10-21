// Texts of the pages for search engines and AI assistants (ADR 0025): the HTML a crawler reads
// without running JavaScript, robots.txt and llms.txt. Italian, like every user-facing text; kept
// out of src/app/i18n/it.ts so they never weigh on the app's shell (SPEC 15). tests/unit/voice.test.ts
// checks them against the forbidden words of D-31 as well.
import { APP_NAME } from "../shared/config";

/** "1 prezzo", "2 prezzi". */
const prices = (n: number) => `${String(n)} ${n === 1 ? "prezzo" : "prezzi"}`;
const bars = (n: number) => `${String(n)} bar`;

export const seoText = {
  homeTitle: `${APP_NAME} — dove bere in Italia? Prezzi nei bar`,
  homeDescription:
    "Mappa collaborativa dei prezzi di birre, cocktail e drink nei bar d'Italia. Trova dove bere a Milano, Roma, Torino e in altre città.",
  homeH1: "Dove bere in Italia: i prezzi nei bar",
  homeIntro:
    "Una mappa gratuita dei bar italiani con i prezzi reali di birre e drink, segnalati e confermati da chi li ha pagati.",
  homeCities: "Le città",
  cityLink: (city: string) => `Dove bere a ${city}`,
  faq: [
    {
      q: "Dove vado a bere a Milano?",
      a: `${APP_NAME} è una mappa collaborativa dei prezzi nei bar di Milano. Nella pagina di Milano trovi i bar con i prezzi di birre, spritz e cocktail segnalati dagli utenti.`,
    },
    {
      q: "Quanto costa uno spritz a Milano?",
      a: "Il prezzo dello spritz cambia da bar a bar. Nella pagina di Milano trovi il prezzo mediano e i bar più economici, con la data dell'ultima segnalazione.",
    },
    {
      q: "Dove bere una birra economica a Milano?",
      a: "Nella pagina di Milano i bar sono ordinati per prezzo della birra alla spina: i prezzi sono segnalati e confermati dalla community.",
    },
  ],

  cityTitle: (city: string) => `Dove bere a ${city}? Prezzi di birra, spritz e cocktail nei bar`,
  cityDescription: (city: string, barCount: number) =>
    `Prezzi di birre, spritz e cocktail nei bar di ${city}, segnalati dagli utenti: ${bars(barCount)} con almeno un prezzo.`,
  cityH1: (city: string) => `Dove bere a ${city}: prezzi nei bar`,
  cityIntro: (city: string, barCount: number, priceCount: number) =>
    `A ${city} ci sono ${bars(barCount)} con almeno un prezzo, per ${prices(priceCount)} segnalati dagli utenti.`,
  cityDrink: (label: string, median: string, low: string, high: string, count: number) =>
    `${label}: mediana ${median}, da ${low} a ${high} (${prices(count)}).`,
  cityCheapest: (label: string) => `I più economici: ${label}`,
  cityEmpty: (city: string) => `Per ${city} non ci sono ancora prezzi: puoi inserire il primo.`,

  venueTitle: (name: string) => `${name}: prezzi di birra, spritz e cocktail`,
  venueDescription: (name: string, summary: string) =>
    `Prezzi segnalati dagli utenti da ${name}: ${summary}.`,
  venueH1: (name: string) => `Prezzi da ${name}`,
  venueIntro: "Prezzi segnalati dalla community, con la data dell'ultima segnalazione.",
  venueLast: (day: string) => `Ultimo prezzo segnalato il ${day}.`,

  coverageTitle: `Copertura di ${APP_NAME}: città e bar mappati`,
  coverageDescription:
    "Le città coperte da Dove bevo, con il numero di bar che hanno almeno un prezzo segnalato.",
  coverageH1: "Copertura: città e bar con prezzi",
  coverageLine: (city: string, barCount: number, priceCount: number) =>
    `${city}: ${bars(barCount)} con prezzo, ${prices(priceCount)}`,

  osm: "Posizione e nomi dei bar: © OpenStreetMap contributors (licenza ODbL).",
  more: `Apri ${APP_NAME} per vedere la mappa e inserire un prezzo.`,
  hh: "happy hour",

  robots: (origin: string) => `User-agent: *
Allow: /
Allow: /api/ai/cerca
Disallow: /api/
Disallow: /admin

User-agent: GPTBot
Allow: /
Allow: /api/ai/cerca
Disallow: /api/
Disallow: /admin

User-agent: OAI-SearchBot
Allow: /
Allow: /api/ai/cerca
Disallow: /api/
Disallow: /admin

User-agent: PerplexityBot
Allow: /
Allow: /api/ai/cerca
Disallow: /api/
Disallow: /admin

User-agent: ClaudeBot
Allow: /
Allow: /api/ai/cerca
Disallow: /api/
Disallow: /admin

User-agent: Google-Extended
Allow: /
Allow: /api/ai/cerca
Disallow: /api/
Disallow: /admin

User-agent: CCBot
Allow: /
Allow: /api/ai/cerca
Disallow: /api/
Disallow: /admin

Sitemap: ${origin}/sitemap.xml
`,

  llms: (origin: string) => `# ${APP_NAME}

> Mappa collaborativa dei prezzi di birre, cocktail e drink nei bar d'Italia.
> Gli utenti segnalano i prezzi; la community conferma o segnala i dati errati.
> Città con più dati: Milano, Roma, Torino, Bologna, Firenze, Napoli.

## Cosa puoi trovare
- Prezzi aggiornati di birra media, spritz, negroni, sbagliato, gin tonic, gin lemon, vino, analcolico e acqua
- La differenza tra il prezzo pieno e quello dell'happy hour
- La posizione dei bar su una mappa interattiva
- La copertura per città, con il numero di bar che hanno un prezzo

## Pagine chiave
- [Dove bere a Milano](${origin}/milano)
- [Dove bere a Roma](${origin}/roma)
- [Dove bere a Torino](${origin}/torino)
- [Dove bere a Bologna](${origin}/bologna)
- [Dove bere a Firenze](${origin}/firenze)
- [Dove bere a Napoli](${origin}/napoli)
- [Città coperte e bar mappati](${origin}/copertura)

## API pubblica (nessuna autenticazione)
- [Ricerca per città, con i prezzi più bassi per primi](${origin}/api/ai/cerca?citta=Milano)
- Prezzi di una cella geografica: ${origin}/api/prices/:cella
- Prezzi di un bar: ${origin}/api/venues/:chiave/prices

## Domande a cui rispondiamo
- "Dove vado a bere a Milano?"
- "Quanto costa uno spritz a Milano?"
- "Quali bar hanno l'happy hour a Milano?"
- "Dove bere una birra economica a Milano?"
- "Prezzi dei cocktail a Roma"

## Lingua e dati
I contenuti sono in italiano. I prezzi sono segnalati dagli utenti; la posizione e i nomi dei bar vengono da OpenStreetMap (© OpenStreetMap contributors, ODbL).
`,
};
