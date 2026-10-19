import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
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

  test("the map chips and the drinks to enter are the same list", async ({ page }, info) => {
    await page.goto("/");
    if (info.project.name.startsWith("chromium")) {
      await page.screenshot({
        path: "docs/screenshots/m3/chips-390.png",
        clip: { x: 0, y: 0, width: 390, height: 130 },
      });
    }
    const chipNames = await page
      .getByRole("group", { name: "Drink" })
      .getByRole("button")
      .allTextContents();
    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await expect(barChoices(page)).toHaveCount(5);
    await barChoices(page).first().click();
    const entered = await page.getByRole("dialog").locator(".drink__name").allTextContents();
    expect(entered.length).toBeGreaterThan(0);
    // A drink with several sizes has one chip per size, so a chip is its drink's name, plus the size.
    const same = (chip: string, name: string) => chip === name || chip.startsWith(`${name} `);
    for (const name of entered) expect(chipNames.some((c) => same(c, name))).toBe(true);
    for (const chip of chipNames) expect(entered.some((name) => same(chip, name))).toBe(true);
  });

  test("M2-02 + M2-05 from a cold start: four taps plus the digits; Turnstile only after Salva", async ({
    page,
  }) => {
    test.slow(); // waits out the real 10 s undo window
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
    try {
      await barChoices(page).nth(2).click({ timeout: 25_000 });
    } catch (error) {
      // CI-only WebKit hang: print what moves on the page, then fail with the original error.
      const state = await page.evaluate(async () => {
        const button = document.querySelectorAll('[aria-label="Bar vicini"] button')[2];
        const rects: string[] = [];
        let mutations = 0;
        const observer = new MutationObserver((list) => {
          mutations += list.length;
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
        const map = document.querySelector('[aria-label="Mappa"]');
        const before = map?.getAttribute("data-center") ?? "";
        for (let i = 0; i < 6; i++) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          const r = button?.getBoundingClientRect();
          rects.push(r ? [r.x, r.y, r.width, r.height].map(Math.round).join(",") : "none");
        }
        observer.disconnect();
        return {
          visibility: document.visibilityState,
          rects,
          mutationsIn1800ms: mutations,
          mapMoved: before !== (map?.getAttribute("data-center") ?? ""),
          disabled: button instanceof HTMLButtonElement ? button.disabled : "no button",
          animations: document.getAnimations().map((a) => `${a.constructor.name}:${a.playState}`),
          buttons: document.querySelectorAll('[aria-label="Bar vicini"] button').length,
          dialogs: document.querySelectorAll("dialog[open]").length,
        };
      });
      console.log("M2-06 DIAG " + JSON.stringify(state));
      throw error;
    }
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
  // The toast lands where the pointer last clicked; a hovered toast holds its countdown (WCAG 2.2.1).
  await page.mouse.move(0, 0);
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

test("M3-16 'Aggiungi un altro drink qui': two drinks of the same bar leave in one request", async ({
  page,
}) => {
  test.slow(); // waits out the real 10 s undo window
  await stubTurnstile(page);
  const posts: { items: unknown[]; venue: string }[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/prices") && r.method() === "POST")
      posts.push(r.postDataJSON() as { items: unknown[]; venue: string });
  });
  await page.goto("/bar/n13001316579?c=u0nd9");
  await page.getByRole("button", { name: "Aggiungi un prezzo qui" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Bibita/ })
    .click();
  await page.keyboard.type("3,00");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Aggiungi un altro drink qui" }).click();
  // The bar stays selected: straight to the drinks.
  await expect(page.getByRole("heading", { name: "Che cosa hai preso?" })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Analcolico/ })
    .click();
  await page.keyboard.type("4,50");
  await page.keyboard.press("Enter");
  await expect.poll(() => posts.length, { timeout: 25_000 }).toBe(1);
  expect(posts[0]?.items).toEqual([
    { drink: "soft_drink", size_ml: 330, hh: 0, price_cents: 300 },
    { drink: "alcohol_free", size_ml: 0, hh: 0, price_cents: 450 },
  ]);
  await page.waitForTimeout(1_000);
  expect(posts).toHaveLength(1); // one request, not two
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

// F3 of the brand package. These write a price, so they live with the other writes.
test.describe("MB-10 MB-11 MB-12 with the position (Duomo)", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("a price already seen in the zone saves in four taps; the Timbro, Copertura and Tessera appear", async ({
    page,
  }, info) => {
    test.slow(); // waits out the real 10 s undo window
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
    await page.screenshot({ path: info.outputPath("mb-10-prezzi-visti.png") });
    const saved = page.waitForRequest(
      (r) => r.url().endsWith("/api/prices") && r.method() === "POST",
      { timeout: 40_000 },
    );
    await tap(seen.getByRole("button", { name: "7,50 €" }).click());
    expect(taps).toBe(4);
    await page.mouse.move(0, 0); // a pointer resting on the toast holds the 10 s (WCAG 2.2.1)

    const stamp = page.getByRole("status").filter({ hasText: "Prezzo salvato" });
    await expect(stamp).toBeVisible();
    await expect(stamp).toContainText("Segnato. Il prossimo che passa sa già quanto spende.");
    await expect(stamp).toContainText("Primo prezzo segnato.");
    await expect(stamp.locator(".stamp__mark")).toHaveText(/^\d{1,2} [A-Z]{3}$/);
    await expect(stamp).toContainText(/Copertura \+1: \d+ bar su \d+ qui hanno un prezzo/);
    await page.screenshot({ path: info.outputPath("mb-11-timbro.png") });
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage)
          .sort()
          .map((k) => k),
      ),
    ).toEqual(["dovebevo-first-use", "dovebevo-prices"]);

    const request = await saved;
    const body = request.postDataJSON() as { items: { price_cents: number }[] };
    expect(body.items.map((i) => i.price_cents)).toEqual([750]);
    // Only the contribution itself (and the session that comes with it) leaves the device.
    expect(posts.every((u) => /\/api\/(prices|session)$/.test(u))).toBe(true);
  });

  test("Annulla takes the price back from the Tessera count", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Vicino a me" }).click();
    await waitForBars(page);
    await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
    await page.getByRole("searchbox", { name: "Cerca il bar per nome" }).fill("Straf Bar");
    await barChoices(page).filter({ hasText: "Straf Bar" }).first().click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Spritz/ })
      .click();
    await page.getByRole("textbox", { name: "Prezzo in euro" }).fill("7,00");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("dovebevo-prices"))).toBe("1");
    await page.getByRole("button", { name: "Annulla" }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("dovebevo-prices"))).toBe("0");
  });
});

// M4-09: the invitation to install appears after the second price, once. Prosecco, so the spritz
// prices that MB-10 looks at are left alone.
async function saveProsecco(page: Page, price: string) {
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await expect(barChoices(page)).toHaveCount(5);
  await barChoices(page).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Calice di prosecco/ })
    .click();
  await page.getByRole("textbox", { name: "Prezzo in euro" }).fill(price);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Prezzo salvato" })).toBeVisible();
}

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
    await saveProsecco(page, "6,10");
    await expect(invite).toHaveCount(0);
    await saveProsecco(page, "6,20");
    await expect(invite).toBeVisible();
    await expect(invite).toContainText("Metti Dove bevo sulla schermata Home");
    await page.screenshot({ path: info.outputPath("m4-09-invito.png") });
    await invite.getByRole("button", { name: "Installa" }).click();
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(
      true,
    );
    await expect(invite).toHaveCount(0);
    await saveProsecco(page, "6,30");
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
    await saveProsecco(page, "6,40");
    await expect(invite).toHaveCount(0);
    await saveProsecco(page, "6,50");
    await expect(invite).toContainText("Aggiungi alla schermata Home");
    await invite.getByRole("button", { name: "Ho capito" }).click();
    await expect(invite).toHaveCount(0);
  });
});
