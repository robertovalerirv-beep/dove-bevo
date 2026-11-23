import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { readFileSync } from "node:fs";
import {
  DRINK_NAMES,
  DUOMO,
  drinkList,
  drinkMenuButton,
  goToMilano,
  openDrinkMenu,
  waitForBars,
  chooseDrinks,
  stubTurnstile,
  stubWrites,
  type StubAnswer,
} from "./helpers";

interface CellFile {
  v: [string, string, number, number, number, string, number][];
}
const fixture = (cell: string) =>
  JSON.parse(readFileSync(`tests/fixtures/data/v/${cell}.json`, "utf8")) as CellFile;

/** The 5 fixture bars nearest to a point, with the app's formula (D-16). */
function nearestNames(lat: number, lon: number): string[] {
  const rad = Math.PI / 180;
  const rows = [
    "u0nd2",
    "u0nd3",
    "u0nd6",
    "u0nd8",
    "u0nd9",
    "u0ndb",
    "u0ndc",
    "u0ndd",
    "u0ndf",
  ].flatMap((c) => fixture(c).v);
  const d = (r: CellFile["v"][number]) =>
    Math.sin(((r[3] - lat) * rad) / 2) ** 2 +
    Math.cos(lat * rad) * Math.cos(r[3] * rad) * Math.sin(((r[4] - lon) * rad) / 2) ** 2;
  return rows
    .sort((a, b) => d(a) - d(b))
    .slice(0, 5)
    .map((r) => r[1]);
}

const barChoices = (page: Page) =>
  page.getByRole("list", { name: "Bar vicini" }).getByRole("button");

test.describe("with the position (Duomo)", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("M2-07 proposes the 5 nearest bars", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await waitForBars(page);
    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await expect(barChoices(page)).toHaveCount(5); // the list fills once the cells are loaded
    const names = (await barChoices(page).allTextContents()).map((t) => t.trim());
    const expected = nearestNames(DUOMO.latitude, DUOMO.longitude);
    expect(names).toHaveLength(5);
    for (const [i, name] of expected.entries()) expect(names[i]).toContain(name);
  });

  test("the drinks of the map menu and the drinks to enter are the same list", async ({ page }) => {
    await page.goto("/");
    await openDrinkMenu(page);
    const chipNames = (await drinkList(page).locator("label").allTextContents()).map((t) =>
      t.trim(),
    );
    await drinkMenuButton(page).click();
    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await expect(barChoices(page)).toHaveCount(5);
    await barChoices(page).first().click();
    const entered = await page.getByRole("dialog").locator(".drink__name").allTextContents();
    expect(entered.length).toBeGreaterThan(0);
    // One list, in one order (SPEC 1.6).
    expect(entered.map((t) => t.trim())).toEqual(chipNames);
    expect(chipNames).toEqual([...DRINK_NAMES]);
  });

  test("M2-02 + M2-05 from a cold start: four taps plus the digits; Turnstile only after Salva; then the bar page", async ({
    page,
  }) => {
    const turnstile = await stubTurnstile(page);
    await page.goto("/"); // no prior tap: the map is still the static picture

    await page.getByRole("button", { name: "Aggiungi prezzo" }).click(); // 1
    await expect(barChoices(page)).toHaveCount(5); // position already granted → nearest bars
    await barChoices(page).filter({ hasText: "The View Milano" }).click(); // 2 (the nearest one, Terrazza Duomo 21, has a price under review in the seed)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Spritz/ })
      .click(); // 3
    // The field has the focus (the phone keyboard opens): typing the digits is enough.
    await expect(page.getByRole("textbox", { name: "Prezzo in euro" })).toBeFocused();
    await page.keyboard.type("7,50"); // the digits
    expect(turnstile).toEqual([]); // nothing from Cloudflare until Salva
    const saved = page.waitForResponse(
      // The first try may get 401 (no session yet): the client runs Turnstile and sends again.
      (r) =>
        r.url().endsWith("/api/prices") && r.request().method() === "POST" && r.status() === 200,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Salva" }).click(); // 4

    // SPEC 1.20: no panel after Salva. The bar page opens, its name has the focus, and "Prezzo salvato"
    // is only read out.
    const sheet = page.getByRole("dialog", { name: "The View Milano" });
    await expect(sheet.getByRole("heading", { name: "The View Milano" })).toBeFocused();
    await expect(page).toHaveURL(/\/bar\/[nwr]\d+\?c=u0nd/);
    await expect(page.locator(".toast-region .sr-only")).toHaveText("Prezzo salvato");
    await expect(page.getByRole("button", { name: "Annulla" })).toHaveCount(0);
    await expect(page.locator(".toast__progress, .stamp, .tessera")).toHaveCount(0);
    await expect.poll(() => turnstile.length).toBeGreaterThan(0); // loaded at the first contribution

    const response = await saved;
    const body = response.request().postDataJSON() as { items: unknown[] };
    expect(body.items).toEqual([{ drink: "spritz", hh: 0, price_cents: 750 }]);
    // The page shows the new price as soon as the Worker has it, without a reload by hand.
    await expect(sheet.getByRole("listitem").filter({ hasText: "Spritz" }).first()).toContainText(
      "7,50 €",
    );

    // «Indietro» of the phone: back to the map, where "Aggiungi prezzo" started.
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "The View Milano" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });
});

test("M2-06 no Annulla: the price leaves at once, with keepalive, so closing the app does not lose it", async ({
  page,
}) => {
  await stubTurnstile(page);
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    (window as unknown as { keepalive: boolean[] }).keepalive = [];
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/prices")) {
        (window as unknown as { keepalive: boolean[] }).keepalive.push(init?.keepalive === true);
      }
      return original(input, init);
    };
  });
  const sent = await stubWrites(page);
  await page.goto("/");
  await goToMilano(page);
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await barChoices(page).nth(2).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Sbagliato/ })
    .click();
  await page.getByRole("textbox", { name: "Prezzo in euro" }).fill("8,00");
  await page.getByRole("button", { name: "Salva" }).click();
  // Before SPEC 1.20 the request waited 5 s for «Annulla»: now it leaves at once.
  await expect.poll(() => sent.length, { timeout: 2_000 }).toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { keepalive: boolean[] }).keepalive),
  ).toEqual([true]);
  await expect(page.getByRole("button", { name: "Annulla" })).toHaveCount(0);
  await expect(page.locator(".toast__progress")).toHaveCount(0);
});

/** From the map: the first proposed bar, Sbagliato, the digits, Salva. */
async function saveFromMap(page: Page, price: string) {
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await expect(barChoices(page)).toHaveCount(5);
  await barChoices(page).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Sbagliato/ })
    .click();
  await page.getByRole("textbox", { name: "Prezzo in euro" }).fill(price);
  await page.getByRole("button", { name: "Salva" }).click();
}

test("M2-06 a failure reopens the price step with the digits and the exact reason", async ({
  page,
}) => {
  await stubTurnstile(page);
  const rejected = (code: string): StubAnswer => ({
    status: 200,
    json: { results: [{ status: "rejected", code }] },
  });
  const error = (status: number, code: string, headers?: Record<string, string>): StubAnswer => ({
    status,
    headers,
    json: { error: { code, message: "x" } },
  });
  let answer: () => StubAnswer = () => ({ status: 200, json: {} });
  await stubWrites(page, () => answer());
  await page.goto("/");
  await goToMilano(page);

  const cases: [StubAnswer, string][] = [
    [
      error(429, "rate_limited", { "Retry-After": "36000" }), // until midnight: the daily quota
      "Oggi hai già segnato 30 prezzi, il massimo per un giorno. Potrai segnarne altri da mezzanotte.",
    ],
    [
      error(429, "rate_limited", { "Retry-After": "60" }), // the burst limit
      "Stai segnando molti prezzi di fila: aspetta un minuto e riprova.",
    ],
    [
      error(503, "busy"),
      "Il servizio è molto richiesto: il prezzo non è partito, riprova tra poco.",
    ],
    [
      { status: 200, contentType: "text/html", body: "<!doctype html><title>Dove bevo</title>" },
      "Il servizio è molto richiesto: il prezzo non è partito, riprova tra poco.",
    ],
    [
      rejected("under_review"),
      "Il prezzo di questo drink qui è stato segnalato ed è in controllo: per ora non si può cambiare.",
    ],
    [
      rejected("out_of_range"),
      "Sbagliato: accettiamo prezzi da 4,00 € a 20,00 €. Controlla le cifre.",
    ],
    [error(500, "internal"), "Non sono riuscito a salvare il prezzo: riprova tra poco."],
  ];
  for (const [i, [reply, text]] of cases.entries()) {
    answer = () => reply;
    const price = `6,${String(10 + i)}`;
    await saveFromMap(page, price);
    const step = page.getByRole("dialog").filter({ has: page.getByRole("textbox") });
    await expect(step.getByRole("alert")).toHaveText(text);
    await expect(step.getByRole("textbox", { name: "Prezzo in euro" })).toHaveValue(price);
    await step.getByRole("button", { name: "Chiudi" }).first().click();
    // The bar page opened by Salva is still under it: back to the map for the next case.
    await page.goto("/");
    await goToMilano(page);
  }

  // Offline: nothing is sent, the reason says so.
  answer = () => ({ status: 200, json: { results: [{ status: "active" }] } });
  await page.context().setOffline(true);
  await saveFromMap(page, "6,40");
  await expect(page.getByRole("alert").filter({ hasText: "Sei offline" })).toHaveText(
    "Sei offline: il prezzo non è partito. Riprova quando torna la connessione.",
  );
  await page.context().setOffline(false);
});

test("M2-06 a Turnstile that does not pass says so and keeps the digits", async ({ page }) => {
  await stubTurnstile(page, true);
  // No session: the Worker asks for one (401), and the check fails.
  await stubWrites(page, () => ({
    status: 401,
    json: { error: { code: "unauthorized", message: "x" } },
  }));
  await page.goto("/");
  await goToMilano(page);
  await saveFromMap(page, "6,50");
  await expect(page.getByRole("alert").filter({ hasText: "robot" })).toHaveText(
    "Non sono riuscito a verificare che tu non sia un robot: riprova.",
  );
  await expect(page.getByRole("textbox", { name: "Prezzo in euro" })).toHaveValue("6,50");
});

test("MB-11 the same price again: a one-line banner that goes away by itself", async ({ page }) => {
  await stubTurnstile(page);
  await stubWrites(page, () => ({ status: 200, json: { results: [{ status: "confirmed" }] } }));
  await page.goto("/");
  await goToMilano(page);
  await saveFromMap(page, "6,60");
  const banner = page.getByRole("status").filter({
    hasText: "Grazie, il prezzo inserito da te conferma il prezzo che era già presente.",
  });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button")).toHaveCount(0); // nothing to press, nothing to wait for
  await expect(page.getByRole("dialog").getByRole("heading", { level: 2 })).toBeVisible(); // the bar page
  await expect(banner).toHaveCount(0, { timeout: 10_000 });
});

test("M2-07 without the position, the nearest to the map centre", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page); // centre: the Milano place node
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await expect(barChoices(page)).toHaveCount(5); // the list fills once the cells are loaded
  const names = (await barChoices(page).allTextContents()).map((t) => t.trim());
  const expected = nearestNames(45.46419, 9.18963);
  expect(names).toHaveLength(5);
  for (const [i, name] of expected.entries()) expect(names[i]).toContain(name);
});

// Browsers share the local D1: each one works on its own seeded price.
const CONFIRM_TARGET = {
  chromium: { url: "/bar/n5471678323?c=u0nd9", row: "Spritz" }, // Terrazza Aperol (HH)
  webkit: { url: "/bar/n13001337602?c=u0nd9", row: "Birra media" }, // Camparino
} as const;
const countOf = async (text: Promise<string>) => {
  const match = /(\d+) conferm|Nessuna conferma/.exec(await text);
  return match?.[1] ? Number(match[1]) : 0;
};

test("M2-11 Confermo: one tap counts, a second tap of the same session does not", async ({
  page,
  browserName,
}) => {
  const target = CONFIRM_TARGET[browserName as keyof typeof CONFIRM_TARGET];
  await stubTurnstile(page);
  await page.goto(target.url);
  const row = page.getByRole("listitem").filter({ hasText: target.row }).first();
  await expect(row).toContainText(/conferm/);
  const before = await countOf(row.textContent().then((t) => t ?? ""));
  await row.getByRole("button", { name: "Confermo" }).click();
  await expect(row.getByRole("button", { name: "Confermato" })).toBeDisabled();
  expect(await countOf(row.textContent().then((t) => t ?? ""))).toBe(before + 1);
  // After a reload the tab remembers it: still "Confermato", nothing to tap again.
  await page.reload();
  const kept = page.getByRole("listitem").filter({ hasText: target.row }).first();
  await expect(kept.getByRole("button", { name: "Confermato" })).toBeDisabled();
  // Even with the memory wiped, the server counts this person once: "Già confermato".
  await page.evaluate(() => {
    sessionStorage.clear();
  });
  await page.reload();
  const again = page.getByRole("listitem").filter({ hasText: target.row }).first();
  await again.getByRole("button", { name: "Confermo" }).click();
  await expect(again.getByRole("button", { name: "Già confermato" })).toBeDisabled();
  await expect(again.getByRole("status")).toContainText("una volta sola");
  expect(await countOf(again.textContent().then((t) => t ?? ""))).toBe(before + 1);
});

test("the author confirming their own price is told it needs someone else", async ({ page }) => {
  await stubTurnstile(page);
  await page.goto("/bar/w549495264?c=u0nd9"); // Motta
  await page.getByRole("button", { name: "Aggiungi un prezzo qui" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Negroni/ })
    .click();
  await page.keyboard.type("8,00");
  const sent = page.waitForResponse(
    // The first try may get 401 (no session yet): the client runs Turnstile and sends again.
    (r) => r.url().endsWith("/api/prices") && r.request().method() === "POST" && r.status() === 200,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Enter"); // sent at once (SPEC 1.20)
  await sent;
  await page.goto("/bar/w549495264?c=u0nd9");
  const row = page.getByRole("listitem").filter({ hasText: "Negroni" }).first();
  await row.getByRole("button", { name: "Confermo" }).click();
  await expect(row.getByRole("button", { name: "Già confermato" })).toBeDisabled();
  await expect(row.getByRole("status")).toContainText("chi ha inserito il prezzo");
});

test("M2-12 È cambiato opens the price step with bar, drink and band already chosen", async ({
  page,
}) => {
  await stubTurnstile(page);
  await page.goto("/bar/n13001337602?c=u0nd9"); // Camparino: beer 9,00 €
  const row = page.getByRole("listitem").filter({ hasText: "Birra media" });
  await row.getByRole("button", { name: "È cambiato" }).click();
  const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" }).last();
  await expect(sheet).toContainText("Birra media");
  await expect(sheet.getByRole("switch", { name: "Happy hour" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await sheet.getByRole("textbox", { name: "Prezzo in euro" }).fill("9,50");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/prices") && r.method() === "POST");
  await sheet.getByRole("button", { name: "Salva" }).click();
  const body = (await sent).postDataJSON() as { venue: string; items: unknown[] };
  expect(body.venue).toBe("n13001337602");
  expect(body.items).toEqual([{ drink: "beer_draft", hh: 0, price_cents: 950 }]);
});

test("M2-13 reporting uses closed reasons", async ({ page, browserName }) => {
  await stubTurnstile(page);
  // One report per IP per target: each browser reports a different bar (Terrazza Aperol, Camparino).
  await page.goto(
    browserName === "webkit" ? "/bar/n13001337602?c=u0nd9" : "/bar/n5471678323?c=u0nd9",
  );
  await page.getByRole("button", { name: "Segnala un errore" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Segnala un errore" });
  for (const reason of [
    "Prezzo sbagliato",
    "Bar chiuso definitivamente",
    "Bar inesistente",
    "Nome o indirizzo errato",
    "Contenuto offensivo",
  ]) {
    await expect(dialog.getByRole("radio", { name: reason })).toBeVisible();
  }
  await expect(dialog.getByRole("textbox")).toHaveCount(0); // no free text (D-07)
  await dialog.getByRole("radio", { name: "Prezzo sbagliato" }).check();
  await dialog.getByRole("button", { name: "Invia" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Grazie per la segnalazione" }),
  ).toBeVisible();
});

test("a bar report from a cold start: Turnstile gets a widget that is still in the page", async ({
  page,
  browserName,
}) => {
  // A widget whose host left the page never answers: the report used to wait forever, with no message.
  await page.route("https://challenges.cloudflare.com/**", (route) => {
    void route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(el, o) { setTimeout(() => { if (el.isConnected) o.callback("XXXX.DUMMY.TOKEN.XXXX"); }, 100); return "w"; },
        remove() {}, reset() {},
      };`,
    });
  });
  await page.goto(
    browserName === "webkit" ? "/bar/n13001337602?c=u0nd9" : "/bar/n5471678323?c=u0nd9",
  );
  await page.getByRole("button", { name: "Segnala un errore" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Segnala un errore" });
  await dialog.getByRole("radio", { name: "Bar chiuso definitivamente" }).check();
  await dialog.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByRole("status").filter({ hasText: "la verifichiamo" })).toBeVisible();
});

test("M2-09 a quarantined price is shown in 'In verifica' with its reason, and not on the map", async ({
  page,
}) => {
  await page.goto("/bar/w549495264?c=u0nd9"); // Motta: gin tonic 20,00 € quarantined (seed)
  const sheet = page.getByRole("dialog", { name: "Motta" });
  await expect(sheet.getByRole("heading", { name: "In verifica" })).toBeVisible();
  const row = sheet.getByRole("listitem").filter({ hasText: "Gin tonic" });
  await expect(row).toContainText("20,00 €");
  // Why it is not in the list (SPEC 1.20, D-10); the seed has no median for the gin tonic here.
  await expect(row).toContainText(
    "Molto diverso dagli altri prezzi della zona: entra in elenco e in mappa quando qualcun altro lo conferma.",
  );
  await sheet.getByRole("button", { name: "Chiudi" }).click();
  await goToMilano(page);
  await chooseDrinks(page, "Gin tonic");
  await page.waitForTimeout(1500);
  expect(
    (await page
      .getByRole("region", { name: "Mappa", exact: true })
      .getAttribute("data-prices-shown")) ?? "",
  ).not.toContain("20,00 €");
});

test("M3-16 another drink of the same bar: «Aggiungi un prezzo qui» of the page opened by Salva", async ({
  page,
}) => {
  await stubTurnstile(page);
  const sent = (await stubWrites(page)) as {
    items: unknown[];
    venue: string;
  }[];
  await page.goto("/bar/n13001316579?c=u0nd9");
  await page.getByRole("button", { name: "Aggiungi un prezzo qui" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Acqua/ })
    .click();
  await page.keyboard.type("3,00");
  await page.keyboard.press("Enter");
  await expect.poll(() => sent.length, { timeout: 2_000 }).toBe(1);
  await expect(page.getByRole("button", { name: "Aggiungi un altro drink qui" })).toHaveCount(0);
  await page.getByRole("button", { name: "Aggiungi un prezzo qui" }).click();
  // The bar stays chosen: straight to the drinks.
  await expect(page.getByRole("heading", { name: "Che cosa hai preso?" })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Analcolico/ })
    .click();
  await page.keyboard.type("4,50");
  await page.keyboard.press("Enter");
  await expect.poll(() => sent.length, { timeout: 2_000 }).toBe(2);
  expect(sent.map((b) => b.items)).toEqual([
    [{ drink: "water", hh: 0, price_cents: 300 }],
    [{ drink: "alcohol_free", hh: 0, price_cents: 450 }],
  ]);
  expect(sent.every((b) => b.venue === "n13001316579")).toBe(true);
});

test("Salva from the bar page stays on it: the focus on its name, no new history entry", async ({
  page,
}) => {
  await stubTurnstile(page);
  const sent = await stubWrites(page);
  await page.goto("/bar/w549495264?c=u0nd9"); // Motta
  const entries = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Aggiungi un prezzo qui" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Acqua/ })
    .click();
  await page.keyboard.type("3,00");
  await page.keyboard.press("Enter"); // Enter saves, like Salva
  await expect.poll(() => sent.length, { timeout: 2_000 }).toBe(1);
  await expect(page.getByRole("heading", { name: "Motta" })).toBeFocused(); // not lost to <body>
  await expect(page.getByRole("status").filter({ hasText: "Prezzo salvato" })).toHaveCount(1);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await expect(page).toHaveURL(/\/bar\/w549495264\?c=u0nd9$/);
});

// F3 of the brand package. These write a price, so they live with the other writes.
test.describe("MB-10 MB-11 MB-12 with the position (Duomo)", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("a price already seen in the zone fills the digits; Salva sends it: four taps, no panel", async ({
    page,
  }, info) => {
    await stubTurnstile(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await waitForBars(page);
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/")) posts.push(r.url());
    });
    let taps = 0;
    const tap = async (click: Promise<void>) => {
      await click;
      taps++;
    };

    await tap(page.getByRole("button", { name: "Aggiungi prezzo" }).click());
    await page.getByRole("searchbox", { name: "Cerca il bar per nome" }).fill("Straf Bar");
    await tap(barChoices(page).filter({ hasText: "Straf Bar" }).first().click());
    await tap(
      page
        .getByRole("dialog")
        .getByRole("button", { name: /^Spritz/ })
        .click(),
    );
    const seen = page.getByRole("list", { name: "Prezzi già visti qui" });
    // Other write tests may have added prices in this zone: ours are there, the order is by price.
    await expect(seen.getByRole("button", { name: "7,50 €" })).toBeVisible();
    await expect(seen.getByRole("button", { name: "12,00 €" })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      "Tocca un prezzo per metterlo nel campo, poi Salva.",
    );
    await page.screenshot({ path: info.outputPath("mb-10-prezzi-visti.png") });

    // The tap puts the digits in the field, in place of typing them: nothing leaves yet.
    await seen.getByRole("button", { name: "7,50 €" }).click();
    await expect(page.getByRole("textbox", { name: "Prezzo in euro" })).toHaveValue("7,50");
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);

    const saved = page.waitForRequest(
      (r) => r.url().endsWith("/api/prices") && r.method() === "POST",
      { timeout: 20_000 },
    );
    await tap(page.getByRole("button", { name: "Salva" }).click());
    expect(taps).toBe(4);
    const request = await saved;
    const body = request.postDataJSON() as { items: { price_cents: number }[] };
    expect(body.items.map((i) => i.price_cents)).toEqual([750]);

    // No Timbro, no Tessera: the bar page (MB-11, MB-12).
    await expect(page.getByRole("heading", { name: "Straf Bar" })).toBeFocused();
    await expect(page.locator(".stamp, .tessera, .toast__progress")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("mb-11-scheda-dopo-salva.png"),
    });
    // Only the contribution itself (and the session that comes with it) leaves the device.
    expect(posts.every((u) => /\/api\/(prices|session)$/.test(u))).toBe(true);
  });

  test("MB-12 the counter on the device still grows by one per price, with no new key", async ({
    page,
  }) => {
    await stubTurnstile(page);
    await stubWrites(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await waitForBars(page);
    const count = () => page.evaluate(() => localStorage.getItem("dovebevo-prices"));
    expect(await count()).toBeNull();
    await saveFromMap(page, "6,70");
    await expect.poll(count).toBe("1");
    await page.getByRole("dialog").getByRole("button", { name: "Chiudi" }).click();
    await saveFromMap(page, "6,80");
    await expect.poll(count).toBe("2");
    await expect(page.locator(".tessera")).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([
      "dovebevo-first-use",
      "dovebevo-prices",
    ]);
  });
});

// M4-09: the invitation to install appears after the second price, once. Sbagliato, so the spritz
// prices that MB-10 looks at are left alone. Salva opens the bar page: the invitation is on the map,
// seen when the page is closed.
async function saveSbagliato(page: Page, price: string) {
  await saveFromMap(page, price);
  const bar = page.getByRole("dialog").filter({ has: page.locator(".scontrino") });
  await expect(bar.getByRole("heading", { level: 2 })).toBeVisible();
  await bar.getByRole("button", { name: "Chiudi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Heights of the map and of the bottom bar: the map never changes size (M1-16). */
const layout = (page: Page) =>
  page.evaluate(() => ({
    map: document.querySelector(".map")?.getBoundingClientRect().height ?? 0,
    bar: document.querySelector(".bottom")?.getBoundingClientRect().height ?? 0,
  }));

test.describe("M4-09 install invitation", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("with the browser's prompt: absent after the first price, there after the second, not again", async ({
    page,
  }, info) => {
    await stubTurnstile(page);
    await page.goto("/");
    await page.evaluate(() => {
      // What Chrome sends when the app can be installed.
      window.dispatchEvent(
        Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
          prompt: () => {
            (window as unknown as { prompted: boolean }).prompted = true;
            return Promise.resolve();
          },
        }),
      );
    });
    const invite = page.getByRole("region", { name: "Installa" });
    await saveSbagliato(page, "6,10");
    await expect(invite).toHaveCount(0);
    await saveSbagliato(page, "6,20");
    await expect(invite).toBeVisible();
    await expect(invite).toContainText("Metti Dove bevo sulla schermata Home");
    await page.screenshot({ path: info.outputPath("m4-09-invito.png") });
    await invite.getByRole("button", { name: "Installa" }).click();
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(
      true,
    );
    await expect(invite).toHaveCount(0);
    await saveSbagliato(page, "6,30");
    await expect(invite).toHaveCount(0);
  });
});

test.describe("M4-09 install hint on iPhone", () => {
  test.use({
    geolocation: DUOMO,
    permissions: ["geolocation"],
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test("a written hint after the second price", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/");
    const invite = page.getByRole("region", { name: "Installa" });
    await saveSbagliato(page, "6,40");
    await expect(invite).toHaveCount(0);
    const before = await layout(page);
    await saveSbagliato(page, "6,50");
    await expect(invite).toContainText("Aggiungi alla schermata Home");
    // The invitation is over the map: it must not resize it (M1-16, D-28).
    expect(await layout(page)).toEqual(before);
    await invite.getByRole("button", { name: "Ho capito" }).click();
    await expect(invite).toHaveCount(0);
  });
});

// After Salva nothing is drawn over the bar page, whatever the screen (SPEC 1.20).
test.describe("after Salva on a small screen", () => {
  test.use({
    geolocation: DUOMO,
    permissions: ["geolocation"],
    viewport: { width: 320, height: 568 },
  });

  test("the bar page, with nothing over it", async ({ page }, info) => {
    await stubTurnstile(page);
    await stubWrites(page);
    await page.goto("/");
    await saveFromMap(page, "6,60");
    const name = page.getByRole("dialog").getByRole("heading", { level: 2 });
    await expect(name).toBeFocused();
    await expect(page.locator(".toast")).toHaveCount(0);
    const box = await name.boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
    await page.screenshot({ path: info.outputPath("dopo-salva-320.png") });
  });
});
