import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DUOMO, goToMilano, waitForBars } from "./helpers";

// Turnstile is Cloudflare's script: replaced by a stub that answers with the public dummy token.
// The local Worker verifies it with Cloudflare's always-pass test secret (wrangler.jsonc vars).
const TURNSTILE_STUB = `window.turnstile = {
  render(el, o) { setTimeout(() => o.callback("XXXX.DUMMY.TOKEN.XXXX"), 50); return "w"; },
  remove() {}, reset() {},
};`;

async function stubTurnstile(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route("https://challenges.cloudflare.com/**", (route) => {
    requests.push(route.request().url());
    void route.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB });
  });
  return requests;
}

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

  test("M2-02 + M2-05 from a cold start: four taps plus the digits; Turnstile only after Salva", async ({
    page,
  }) => {
    test.slow(); // waits out the real 10 s undo window
    const turnstile = await stubTurnstile(page);
    await page.goto("/"); // no prior tap: the map is still the static picture

    await page.getByRole("button", { name: "Aggiungi prezzo" }).click(); // 1
    await expect(barChoices(page)).toHaveCount(5); // position already granted → nearest bars
    await barChoices(page).first().click(); // 2
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Spritz/ })
      .click(); // 3
    // The field has the focus (the phone keyboard opens): typing the digits is enough.
    await expect(page.getByRole("textbox", { name: "Prezzo in euro" })).toBeFocused();
    await page.keyboard.type("7,50"); // the digits
    expect(turnstile).toEqual([]); // nothing from Cloudflare until Salva
    const saved = page.waitForRequest(
      (r) => r.url().endsWith("/api/prices") && r.method() === "POST",
      {
        timeout: 20_000,
      },
    );
    await page.getByRole("button", { name: "Salva" }).click(); // 4
    await expect(page.getByRole("status").filter({ hasText: "Prezzo salvato" })).toBeVisible();
    await expect.poll(() => turnstile.length).toBeGreaterThan(0); // loaded at the first contribution

    const request = await saved; // after the 10 s of "Annulla"
    const body = request.postDataJSON() as { venue: string; cell: string; items: unknown[] };
    expect(body.items).toEqual([{ drink: "spritz", size_ml: 0, hh: 0, price_cents: 750 }]);
    expect((await request.response())?.status()).toBe(200);
    await page.goto(`/bar/${body.venue}?c=${body.cell}`);
    await expect(page.getByRole("listitem").filter({ hasText: "Spritz" }).first()).toContainText(
      "7,50 €",
    );
  });
});

test("M2-06 Annulla sends nothing; going to the background sends at once with keepalive", async ({
  page,
}) => {
  test.slow(); // waits out the real 10 s undo window
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
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/prices") && r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/");
  await goToMilano(page);

  const addProsecco = async (price: string) => {
    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await barChoices(page).nth(2).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Calice di prosecco/ })
      .click();
    await page.getByRole("textbox", { name: "Prezzo in euro" }).fill(price);
    await page.getByRole("button", { name: "Salva" }).click();
  };

  await addProsecco("8,00");
  await page.getByRole("button", { name: "Annulla" }).click();
  await page.waitForTimeout(11_000);
  expect(posts).toEqual([]);

  await addProsecco("8,20");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => posts.length, { timeout: 5_000 }).toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { keepalive: boolean[] }).keepalive),
  ).toEqual([true]);
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
  webkit: { url: "/bar/n13001337602?c=u0nd9", row: "Birra alla spina" }, // Camparino
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
  test.slow(); // waits out the real 10 s undo window
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
  await page.keyboard.press("Enter"); // sent when the 10 s of "Annulla" run out
  await sent;
  await page.goto("/bar/w549495264?c=u0nd9");
  const row = page.getByRole("listitem").filter({ hasText: "Negroni" }).first();
  await row.getByRole("button", { name: "Confermo" }).click();
  await expect(row.getByRole("button", { name: "Già confermato" })).toBeDisabled();
  await expect(row.getByRole("status")).toContainText("chi ha inserito il prezzo");
});

test("M2-12 È cambiato opens the price step with bar, drink, size and band already chosen", async ({
  page,
}) => {
  await stubTurnstile(page);
  await page.goto("/bar/n13001337602?c=u0nd9"); // Camparino: beer 0,4 l 9,00 €
  const row = page.getByRole("listitem").filter({ hasText: "Birra alla spina 0,4 l" });
  await row.getByRole("button", { name: "È cambiato" }).click();
  const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" }).last();
  await expect(sheet).toContainText("Birra alla spina");
  await expect(sheet.getByRole("radio", { name: "0,4 l" })).toBeChecked();
  await expect(sheet.getByRole("switch", { name: "Happy hour" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await sheet.getByRole("textbox", { name: "Prezzo in euro" }).fill("9,50");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/prices") && r.method() === "POST");
  await sheet.getByRole("button", { name: "Salva" }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const body = (await sent).postDataJSON() as { venue: string; items: unknown[] };
  expect(body.venue).toBe("n13001337602");
  expect(body.items).toEqual([{ drink: "beer_draft", size_ml: 400, hh: 0, price_cents: 950 }]);
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

test("M2-09 a quarantined price is shown in 'In verifica' and not on the map", async ({ page }) => {
  await page.goto("/bar/w549495264?c=u0nd9"); // Motta: gin tonic 20,00 € quarantined (seed)
  const sheet = page.getByRole("dialog", { name: "Motta" });
  await expect(sheet.getByRole("heading", { name: "In verifica" })).toBeVisible();
  await expect(sheet.getByRole("listitem").filter({ hasText: "Gin tonic" })).toContainText(
    "20,00 €",
  );
  await sheet.getByRole("button", { name: "Chiudi" }).click();
  await goToMilano(page);
  await page
    .getByRole("group", { name: "Drink" })
    .getByRole("button", { name: "Gin tonic" })
    .click();
  await page.waitForTimeout(1500);
  expect(
    (await page
      .getByRole("region", { name: "Mappa", exact: true })
      .getAttribute("data-prices-shown")) ?? "",
  ).not.toContain("20,00 €");
});

test("Annulla works over the bar page and holds the countdown while focused (WCAG 2.2.1)", async ({
  page,
}) => {
  test.slow(); // waits out the real 10 s undo window
  await stubTurnstile(page);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/prices") && r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/bar/w549495264?c=u0nd9"); // Motta
  await page.getByRole("button", { name: "Aggiungi un prezzo qui" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Bibita/ })
    .click();
  await page.keyboard.type("3,00");
  await page.keyboard.press("Enter"); // Enter saves, like Salva
  const undo = page.getByRole("button", { name: "Annulla" });
  await expect(undo).toBeVisible();
  await undo.focus();
  await page.waitForTimeout(11_500);
  expect(posts).toEqual([]); // held while focused
  await undo.press("Enter"); // reachable from the keyboard: not under the bar page backdrop
  await expect(page.getByRole("status").filter({ hasText: "Annullato" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Motta" })).toBeFocused(); // not lost to <body>
  await page.waitForTimeout(1_000);
  expect(posts).toEqual([]);
});
