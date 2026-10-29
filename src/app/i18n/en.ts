import type { Dict } from "./lang";

// The public interface in English (SPEC 1.11, D-36, ADR 0038). Same groups, names and functions as
// it.ts; the admin is not translated. The type makes a missing or misplaced text a compile error.
// Prices, dates and distances keep the Italian format (lib/format.ts): this is an Italian web app.
export const en: Dict = {
  meta: {
    description:
      "Where to drink and at what price: the free map of bars with the real prices of beers and drinks.",
  },
  errors: {
    bad_request: "Invalid request.",
    unauthorized: "Session expired: please try again.",
    forbidden: "Operation not allowed.",
    not_found: "Resource not found.",
    payload_too_large: "The content sent is too large.",
    unsupported_media_type: "Unsupported format.",
    rate_limited: "Too many requests: please try again later.",
    conflict: "This bar already exists.",
    busy: "Too many requests being checked: please try again later.",
    internal: "Something went wrong. Please try again in a moment.",
  },
  common: {
    close: "Close",
  },
  lang: {
    menu: "Language",
    italian: "Italiano",
    english: "English",
  },
  map: {
    region: "Map",
    canvas: "Interactive map of bars",
    zoomIn: "Zoom in to see prices, or search for a city.",
    offline: "You're offline: the map and prices come back when you're connected",
    tooManyCells: "Zoom in to see the prices of this area",
    loading: "Loading the prices of this area…",
    loadError: "Can't load the prices of this area. Check your connection.",
    busy: "The service is very busy, please try again later.",
    coverage: (withPrice, total) =>
      `${String(withPrice)} of ${String(total)} bars here have a price`,
    legend: "Price legend",
    tiers: { affare: "Bargain", giusto: "Fair", salato: "Pricey" },
    drinks: "Drinks",
    pickDrinks: "Choose what to drink",
    nearMe: "Near me",
    locating: "Finding your position…",
    position: {
      denied: "Turn on location for this site in settings, or search for a city.",
      deniedHelp: {
        app: "Location doesn't work in this app. Open the link in Chrome or Safari, or search for a city.",
        ios: "To use location: tap aA in the address bar, then Website Settings, Location, Allow. Or search for a city.",
        other:
          "To use location: tap the padlock next to the address, then Permissions, Location, Allow. Or search for a city.",
      },
      unavailable: "Can't find you. Search for a city.",
      timeout: "Can't find you. Search for a city.",
    },
    list: "List",
    actions: "Map actions",
    retry: "Try again",
    explore: "Explore the map",
    start: "Tap the map or search for a city",
    loadingMap: "Loading the map…",
    mapError: "The map won't load: check your connection and reload the page.",
    attribution: {
      openFreeMap: "OpenFreeMap",
      openMapTiles: "© OpenMapTiles",
      openStreetMap: "© OpenStreetMap contributors",
    },
  },
  search: {
    open: "Search city or bar",
    title: "Search",
    label: "Search a city or a bar",
    listLabel: "Results",
    kindPlace: "City",
    kindBar: "Bar",
    searching: "Searching…",
    cheapest: "Cheapest here",
    results: (n) => (n === 1 ? "1 result" : `${String(n)} results`),
    none: "I can't find this place",
    barsFailed: "Search isn't available now, search for a city.",
    barsCount: (n) => (n === 1 ? "1 bar" : `${String(n)} bars`),
    loadError: "Can't load the list of cities. Check your connection.",
  },
  verified: {
    badge: "Verified manager",
    sponsored: "Sponsored",
    hoursTitle: "Hours",
    closed: "Closed",
    rangeJoin: " · ",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  list: {
    title: "Bars in this area",
    empty: "No bars in this area.",
    noPrice: "No price",
  },
  bar: {
    directions: "Directions",
    prices: "Prices",
    noPrices: "No prices yet.",
    inReview: "Under review",
    inReviewHelp: "Unusual prices: they become visible when someone else confirms them.",
    confirmations: (n) =>
      n === 0 ? "No confirmations" : n === 1 ? "1 confirmation" : `${String(n)} confirmations`,
    officialMenu: "From the official menu",
    menuChecked: (date) => `Checked on ${date}`,
    menuLink: "Open the official menu",
    receiptMenuFoot: "Prices and sources listed above",
    happyHour: "HH",
    notFound: "This place is no longer on the map.",
    loading: "Loading the bar…",
    pricesError: "Can't load the prices. Check your connection.",
    stale: (ago) => `Seen ${ago}. Been there? Confirm it.`,
    toConfirm: "To confirm",
    seeAll: (n) => `See all (${String(n)})`,
    seeLess: "Show less",
    receiptFoot: "Logged by whoever orders",
    drinkCount: (n) => (n === 1 ? "1 drink" : `${String(n)} drinks`),
  },
  install: {
    prompt: "Put Dove bevo on your Home screen: it opens faster.",
    ios: "On iPhone: tap Share, then “Add to Home Screen”.",
    action: "Install",
    dismiss: "Not now",
    ok: "Got it",
  },
  tessera: {
    messages: {
      1: "First price logged.",
      5: "5 prices logged. You're a regular.",
      10: "10 prices logged. The bar knows you.",
      25: "25 prices logged. You run the area now.",
      50: "50 prices logged. The map is yours too.",
    },
    count: (n) => (n === 1 ? "1 price logged." : `${String(n)} prices logged.`),
  },
  add: {
    open: "Add a price",
    addMissing: "Add a missing place",
    back: "Back",
    chooseBar: "Choose the bar",
    nearBars: "Nearby bars",
    searchBar: "Search the bar by name",
    noBars: "Zoom in on the map or use “Near me” to see the bars around here.",
    question: "How much did you pay?",
    chooseDrink: "What did you have?",
    price: "Price in euros",
    happyHour: "Happy hour",
    save: "Save",
    badFormat: "Write the price in euros, for example 7,50.",
    outOfRange: (drink) => `That looks like an unusual price for ${drink}: check the digits.`,
    underReview: "This price is under review: it can't be changed for now.",
    quota: "You've logged a lot today. Try again after midnight.",
    network: "I couldn't save it: check your connection and try again.",
    saved: "Price saved",
    stamp: "Logged. Whoever comes next already knows what they'll spend.",
    stampDay: (day) => `Stamp of ${day}`,
    coverageUp: (withPrice, total) =>
      `Coverage +1: ${String(withPrice)} of ${String(total)} bars here have a price`,
    seenHere: "Prices already seen here",
    // The seconds are UNDO_MS (tests/unit/lang.test.ts keeps them equal).
    seenHelp: "Tap a price to log it right away: you have 5 seconds to undo.",
    zoneRange: (min, max, median) =>
      `In this area it ranges from ${min} to ${max} €, median ${median} €`,
    undo: "Undo",
    undone: "Undone",
    quarantined: "Saved: it will appear when someone else confirms it.",
    confirmedSame: "Thanks: you confirmed the price that was already there.",
    alreadyThere: "This price was already there: nothing to add.",
    verifying: "One moment, checking you're not a robot…",
    another: "Add another drink here",
    pendingBar: "New, to be confirmed",
    missingBar: "Can't find the bar?",
  },
  propose: {
    title: "Add a bar",
    name: "Bar name",
    nameHelp: "2 to 80 characters, no links, emails or phone numbers.",
    kind: "What kind of place is it?",
    kinds: { 1: "Bar", 2: "Pub", 4: "Evening venue" },
    next: "Next",
    badName: "Write just the name of the bar, with no links, emails or phone numbers.",
    pinTitle: (name) => `Where is “${name}”?`,
    pinHelp: "Move the map until the mark is on the bar, then confirm.",
    pinCloser: "Zoom in further on the map to point to the exact spot.",
    similar: "Is it one of these?",
    confirm: "Confirm and send",
    cancel: "Cancel",
    sending: "Sending…",
    thanks:
      "Thanks: Roberto checks that it exists and then it appears on the map. Meanwhile you can add a price.",
    exists: "This bar is already there: add the price here.",
    rejected: "This bar has already been checked: it isn't among the places.",
    quota: "You've proposed many bars today: try again tomorrow.",
    failed: "I couldn't send it: check your connection and try again.",
  },
  actions: {
    confirm: "I confirm",
    confirmed: "Confirmed",
    alreadyConfirmed: "Already confirmed",
    alreadyHelp:
      "Each person counts once, and whoever entered the price can't confirm it: someone else has to confirm it.",
    changed: "It changed",
    report: "Report an error",
    addHere: "Add a price here",
    reportBar: "Report a problem with the bar",
    failed: "I couldn't send it: try again.",
  },
  report: {
    title: "Report an error",
    reasons: {
      wrong_price: "Wrong price",
      closed: "Permanently closed bar",
      not_exists: "Bar doesn't exist",
      wrong_info: "Wrong name or address",
      offensive: "Offensive content",
    },
    send: "Send",
    thanks: "Thanks for the report",
    thanksBar: "Thanks: we'll check before taking the bar off the map.",
    already: "You had already reported this error.",
  },
  // A draft translation of the two legal texts: to be read again before the release (ADR 0038).
  legal: {
    logoAlt: "Dove bevo",
    backToMap: "Back to the map",
    privacyLink: "Privacy",
    rulesLink: "Rules",
    linksLabel: "Information",
    contactLabel: "Write to us",
    privacy: {
      title: "Privacy",
      updated: "Last updated: 25 October 2026",
      intro:
        "Dove bevo works without accounts and without tracking. Here we explain in a few lines what we use, what we store and for how long.",
      sections: [
        {
          heading: "In short",
          paragraphs: [
            "We don't ask for your name, email or password. We don't use tracking cookies or advertising. Your location stays on your phone.",
          ],
        },
        {
          heading: "Your location",
          paragraphs: [
            "Your location is only used on your phone: to centre the map, show the dot and suggest the nearest bars when you log a price. We never send it and we never store it.",
            "The server only receives requests for a “cell” of about 5 km, which says where you are looking on the map, not where you are.",
          ],
        },
        {
          heading: "When you log a price",
          paragraphs: [
            "We store the bar, the drink, the price and the day. We don't store who logged it: no name, no session identifier, no IP address together with the price.",
            "To stop bots and too many submissions we use anonymous codes, calculated with a salt that changes every day. They don't let anyone trace you back and they are deleted within 48 hours.",
          ],
        },
        {
          heading: "Cookies and data on your phone",
          paragraphs: [
            "When you log your first price we set a single technical cookie, which lasts 30 minutes and is used to tell a person from an automated program. No banner is needed because it doesn't track anyone.",
            "Only two things stay on your phone: the date of first use and how many prices you have logged, for the stamp card and for the invitation to install the app. The date and the number are never sent: the anonymous counts only receive an age band, for example “1-7 days”.",
          ],
        },
        {
          heading: "Anti-bot check",
          paragraphs: [
            "Before your first price we use Cloudflare Turnstile, which only loads at that moment. It shows no advertising and doesn't follow you on other sites.",
          ],
        },
        {
          heading: "Search and anonymous counts",
          paragraphs: [
            "When you search for a bar, the text you type stays on your phone: only the first 2 or 3 characters of a word reach the network, to download the right list, never your location.",
            "We count anonymously how many visits there are and how many prices are logged and confirmed. These are numbers per day, with no link to people.",
            "For sponsored venues we also count how many times their page is opened, day by day: it is only a number, with no link to whoever opened it.",
          ],
        },
        {
          heading: "Who helps us",
          paragraphs: [
            "Cloudflare hosts the site and runs the anti-bot check. OpenFreeMap provides the maps: your phone asks them directly for the map tiles. GitHub holds the code, with no user data. The bars come from OpenStreetMap (ODbL licence).",
          ],
        },
        {
          heading: "Your rights",
          paragraphs: [
            "You have the rights provided by the GDPR: access, rectification, erasure, objection. Since we don't keep data that identifies you, there is usually nothing to delete, but write to us and we'll reply. You can also contact the Garante per la protezione dei dati personali, the Italian data protection authority.",
          ],
        },
        {
          heading: "Adults",
          paragraphs: ["The service is meant for adults. We don't collect data of minors."],
        },
      ],
    },
    rules: {
      title: "Rules",
      updated: "Last updated: 25 October 2026",
      intro:
        "Dove bevo is made of real prices, logged by people who have been there. A few rules to keep it useful.",
      sections: [
        {
          heading: "What to log",
          paragraphs: [
            "The price you really paid, in a bar where you have been, for a drink on the list. For each bar there is one price per drink and per band (normal or happy hour): if it has changed, log the new one.",
          ],
        },
        {
          heading: "What is not allowed",
          paragraphs: [
            "Made-up prices or prices from bars where you haven't been, fake venue names, offensive content. Prices far from the ones in the area stay under review until someone else confirms them.",
          ],
        },
        {
          heading: "How to report an error",
          paragraphs: [
            "From the bar page tap “Report an error” and choose the reason. If several people report the same price, it leaves the map and we check it. Nothing disappears on its own without a check.",
          ],
        },
        {
          heading: "A missing bar",
          paragraphs: [
            "If you can't find the bar, propose it: name, type and point on the map. It appears for everyone only after we have checked it.",
          ],
        },
        {
          heading: "Are you the manager of a venue?",
          paragraphs: [
            "If some data of your venue is wrong (name, address, closing), write to us with the name of the venue and the correction and we'll fix it. Prices can't be bought and aren't changed on request: customers log them.",
            "If you want to become a “Verified manager”, write to us.",
          ],
        },
        {
          heading: "Verified manager and Sponsored",
          paragraphs: [
            "A manager can sign a paid agreement with us: their venue shows the blue check “Verified manager” with “Sponsored”, the opening hours on its page and the first place in the List.",
            "“Verified manager” means we have checked who runs the venue, not that we guarantee the venue or the prices. “Sponsored” means that first place is paid for.",
            "The List shows sponsored venues first, then the others, in the usual order: by distance if location is on, otherwise first those with a price, then alphabetical. Map, search, “Cheapest here”, colours and prices don't change: prices can't be bought.",
          ],
        },
        {
          heading: "Service for adults",
          paragraphs: [
            "Dove bevo is about prices and places, it doesn't encourage drinking. It is a service for adults.",
          ],
        },
      ],
    },
  },
  kinds: ["Café", "Bar", "Pub", "Beer garden", "Nightclub"],
  drinks: {
    beer_draft: "Medium beer",
    spritz: "Spritz",
    negroni: "Negroni",
    sbagliato: "Sbagliato",
    gin_tonic: "Gin and tonic",
    gin_lemon: "Gin lemon",
    wine_glass: "Glass of wine",
    alcohol_free: "Non-alcoholic",
    water: "Water",
  },
};
