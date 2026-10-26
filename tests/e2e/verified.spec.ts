import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import type { CellPrices, VenuePrices, VerifiedList } from "../../src/shared/api-types";
import type { WeekHours } from "../../src/shared/hours";
import { test } from "./fixtures";
import { formatDate } from "../../src/app/lib/format";
import { atHour, chooseDrinks, goToMilano, mapRegion, mapStatus, THEME_HOURS } from "./helpers";

// «Gestore verificato» (SPEC 1.9, D-34, ADR 0033): MD-06, MD-07, MD-08, MD-09, MD-11.
// The Worker side is in tests/worker/verified.test.ts; here the verified bar is added to the real
// answers of the local Worker, and the admin API is simulated (no Cloudflare Access locally).
const CAMPARINO = "n13001337602"; // fixture cell u0nd9, near the Duomo
const HOURS: WeekHours = [
  [],
  [["08:00", "20:00"]],
  [["08:00", "20:00"]],
  [["08:00", "20:00"]],
  [
    ["08:00", "15:00"],
    ["18:00", "02:00"],
  ],
  [["18:00", "02:00"]],
  [],
];
const AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The local Worker's answers, with Camparino verified. */
async function verifyCamparino(page: Page) {
  await page.route("**/api/prices/u0nd9", async (route) => {
    const body = (await (await route.fetch()).json()) as CellPrices;
    await route.fulfill({ json: { ...body, g: [CAMPARINO] } });
  });
  await page.route(`**/api/venues/${CAMPARINO}/prices`, async (route) => {
    const body = (await (await route.fetch()).json()) as VenuePrices;
    await route.fulfill({ json: { ...body, o: HOURS } });
  });
}

const listNames = async (page: Page) => {
  await page.getByRole("button", { name: "Elenco" }).click();
  const sheet = page.getByRole("dialog", { name: "Bar nella zona" });
  await expect(sheet.locator(".row").first()).toBeVisible();
  return sheet.locator(".row__name").allTextContents();
};

/**
 * What the map shows besides the order of the list: the price of every bar (the one its pin shows,
 * from the same bestPrice), the colour legend, the coverage line, «I più economici qui» and the
 * search results. None of it may change for a verified bar (D-34). The pins MapLibre happens to draw
 * (data-prices-shown) depend on collisions and timing, so the comparison uses what each pin carries.
 */
async function mapState(page: Page) {
  await chooseDrinks(page, "Calice di vino"); // five prices in u0nd9: the colours are on (D-12)
  await expect(mapRegion(page)).toHaveAttribute("data-prices-shown", /9,00 €/);
  await page.getByRole("button", { name: "Elenco" }).click();
  const sheet = page.getByRole("dialog", { name: "Bar nella zona" });
  await expect(sheet.locator(".row").first()).toBeVisible();
  const pins = (
    await sheet
      .locator(".row")
      .evaluateAll((rows) =>
        rows.map(
          (r) =>
            `${r.querySelector(".row__name")?.textContent ?? ""} ${r.querySelector(".row__price")?.textContent ?? ""}`,
        ),
      )
  ).sort();
  await page.keyboard.press("Escape");
  const legend = await page
    .getByRole("list", { name: "Legenda dei prezzi" })
    .getByRole("listitem")
    .allTextContents();
  const coverage = await mapStatus(page).textContent();
  const cheapestHere = await cheapest(page);
  await page.getByRole("button", { name: "Cerca" }).click();
  await page.getByRole("combobox", { name: "Cerca una città o un bar" }).fill("camparino");
  const options = page.getByRole("listbox", { name: "Risultati" }).getByRole("option");
  await expect(options.first()).toBeVisible();
  const search = await options.allTextContents();
  await page.keyboard.press("Escape");
  return { pins, legend, coverage, cheapestHere, search };
}

test("MD-07 the verified bar comes first in the list; the others, the map and the search do not change", async ({
  page,
}) => {
  await page.goto("/");
  await goToMilano(page);
  const before = await listNames(page);
  expect(before).toContain("Camparino in Galleria");
  expect(before[0]).not.toBe("Camparino in Galleria");
  await expect(
    page.getByRole("dialog", { name: "Bar nella zona" }).getByText("Gestore verificato"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  const stateBefore = await mapState(page);

  await verifyCamparino(page);
  await page.goto("/");
  await goToMilano(page);
  const after = await listNames(page);
  expect(after).toEqual([
    "Camparino in Galleria",
    ...before.filter((n) => n !== "Camparino in Galleria"),
  ]);
  const sheet = page.getByRole("dialog", { name: "Bar nella zona" });
  const first = sheet.locator(".row").first();
  await expect(first).toContainText("Gestore verificato");
  await expect(first).toContainText("Sponsorizzato");
  // Only that row, and the check never without «Sponsorizzato».
  await expect(sheet.getByText("Gestore verificato")).toHaveCount(1);
  await expect(sheet.getByText("Sponsorizzato")).toHaveCount(1);
  await page.keyboard.press("Escape");
  // Pins, colours, coverage, «I più economici qui» (a price ranking, art. 23 m-bis) and the search:
  // exactly as before.
  expect(await mapState(page)).toEqual(stateBefore);
});

/** The rows of «I più economici qui» in the search sheet, as text. */
async function cheapest(page: Page) {
  await page.getByRole("button", { name: "Cerca" }).click();
  const list = page.getByRole("list", { name: "I più economici qui" });
  await expect(list.getByRole("listitem").first()).toBeVisible();
  const rows = await list.getByRole("listitem").allTextContents();
  await page.keyboard.press("Escape");
  return rows;
}

for (const scheme of ["light", "dark"] as const) {
  test(`MD-08 the bar page shows the check, «Sponsorizzato» and the hours before the prices (${scheme})`, async ({
    page,
  }) => {
    await atHour(page, THEME_HOURS[scheme]);
    await verifyCamparino(page);
    await page.goto(`/bar/${CAMPARINO}?c=u0nd9`);
    const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" });
    await expect(sheet.getByText("Gestore verificato")).toBeVisible();
    await expect(sheet.getByText("Sponsorizzato")).toBeVisible();
    const hours = sheet.getByRole("region", { name: "Orari" });
    await expect(hours).toBeVisible();
    const rows = await hours.locator("dt, dd").allTextContents();
    expect(rows).toEqual([
      "Lunedì",
      "Chiuso",
      "Martedì",
      "08:00–20:00",
      "Mercoledì",
      "08:00–20:00",
      "Giovedì",
      "08:00–20:00",
      "Venerdì",
      "08:00–15:00 · 18:00–02:00",
      "Sabato",
      "18:00–02:00",
      "Domenica",
      "Chiuso",
    ]);
    // Hours come before the prices of the receipt.
    const pricesTitle = sheet.getByRole("heading", { name: "Prezzi" });
    expect(
      await hours.evaluate(
        (h, p) => Boolean(h.compareDocumentPosition(p as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
        await pricesTitle.elementHandle(),
      ),
    ).toBe(true);
    // Hours are only written: no «aperto ora», nothing computed from the clock.
    await expect(sheet).not.toContainText(/aperto ora|chiuso ora|apre alle|chiude alle|adesso/i);
    // No inline style in the receipt, badge and hours included (MB-09).
    expect(await sheet.locator(".scontrino [style]").count()).toBe(0);
    const axe = await new AxeBuilder({ page }).withTags(AXE).analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: `docs/screenshots/md/md-08-scheda-${scheme}.png`,
      fullPage: true,
    });

    await page.goto("/");
    await goToMilano(page);
    await page.getByRole("button", { name: "Elenco" }).click();
    const axeList = await new AxeBuilder({ page }).withTags(AXE).analyze();
    expect(axeList.violations).toEqual([]);
    await page.screenshot({ path: `docs/screenshots/md/md-07-elenco-${scheme}.png` });
  });
}

test("MD-09 /regole explains «Gestore verificato», «Sponsorizzato» and the order of the list", async ({
  page,
}) => {
  await page.goto("/regole");
  const section = page
    .getByRole("heading", { name: "Gestore verificato e Sponsorizzato" })
    .locator("xpath=..");
  await expect(section).toContainText("abbiamo controllato chi gestisce il locale");
  await expect(section).toContainText("«Sponsorizzato» vuol dire che quel primo posto è pagato");
  await expect(section).toContainText("prima i locali sponsorizzati, poi gli altri");
  await expect(section).toContainText("i prezzi non si comprano");
});

test("MD-08 a bar that is not verified has the same page as before", async ({ page }) => {
  await verifyCamparino(page);
  await page.goto("/bar/n2420779240?c=u0nd9");
  const sheet = page.getByRole("dialog").first();
  await expect(sheet.getByRole("heading", { name: "Prezzi" })).toBeVisible();
  await expect(sheet.getByText("Gestore verificato")).toHaveCount(0);
  await expect(sheet.getByText("Sponsorizzato")).toHaveCount(0);
  await expect(sheet.getByRole("region", { name: "Orari" })).toHaveCount(0);
});

test("MD-11 the bar page of a verified bar sends its key once per visit, another bar none", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const sent: Promise<string>[] = [];
    (window as unknown as { __beacons: typeof sent }).__beacons = sent;
    navigator.sendBeacon = (_url, data) => {
      sent.push((data as Blob).text());
      return true;
    };
  });
  const viewedEvents = async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const bodies = await page.evaluate(async () =>
      Promise.all((window as unknown as { __beacons: Promise<string>[] }).__beacons),
    );
    return bodies
      .flatMap((b) => (JSON.parse(b) as { events: { e: string; p?: unknown }[] }).events)
      .filter((e) => e.e === "venue_viewed");
  };
  await verifyCamparino(page);

  // A visit that opens the verified bar, closes it and opens it again: its key, once.
  await page.goto(`/bar/${CAMPARINO}?c=u0nd9`);
  const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" });
  await expect(sheet.getByText("Gestore verificato")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // Back to the same bar inside the visit, as the app's own links do (native history).
  await page.evaluate((key) => {
    history.pushState(null, "", `/bar/${key}?c=u0nd9`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, CAMPARINO);
  await expect(sheet).toBeVisible();
  expect(await viewedEvents()).toEqual([{ e: "venue_viewed", p: { venue: CAMPARINO } }]);

  // A visit to a bar that is not verified: a plain view, no key.
  await page.goto("/bar/n2420779240?c=u0nd9");
  await expect(page.getByRole("heading", { name: "Prezzi" })).toBeVisible();
  expect(await viewedEvents()).toEqual([{ e: "venue_viewed" }]);
});

// ---- Admin page «Gestori verificati» (MD-06) ----

const LIST: VerifiedList = {
  v: [{ key: "n2420779240", cell: "u0nd9", name: "Bar Magenta", hours: HOURS }],
  views: [
    ["n2420779240", "2026-10-24", 9],
    ["n2420779240", "2026-10-23", 4],
  ],
};

async function fakeVerified(page: Page, opts: { failPosts?: boolean } = {}) {
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      if (path === "/api/admin/verified") await route.fulfill({ json: LIST });
      else if (path === "/api/admin/metrics") await route.fulfill({ json: { days: [] } });
      else await route.fulfill({ json: { reports: [], venues: [], hidden: [], prices: [] } });
      return;
    }
    if (opts.failPosts) {
      await route.abort("failed");
      return;
    }
    posts.push({ path, body: request.postDataJSON() });
    await route.fulfill({ json: { status: path.endsWith("remove") ? "removed" : "verified" } });
  });
  return posts;
}

const timeInput = (page: Page, day: string, which: string) =>
  page.getByRole("group", { name: day }).getByLabel(which, { exact: true });

test("MD-06 the admin turns a bar into «Gestore verificato» with its hours", async ({ page }) => {
  const posts = await fakeVerified(page);
  await page.goto("/admin");
  // From the header of /admin (SPEC 7.10).
  await page
    .locator("header.admin__head")
    .getByRole("link", { name: "Gestori verificati" })
    .click();
  await expect(page).toHaveURL(/\/admin\/verificati$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gestori verificati" })).toBeVisible();

  // The list of today, with the openings of 30 days (one entry; its hours are a list of their own).
  const current = page
    .getByRole("list", { name: "Gestori verificati attivi" })
    .locator(":scope > li");
  await expect(current).toHaveCount(1);
  await expect(current).toContainText("Bar Magenta");
  await expect(current).toContainText("Venerdì 08:00–15:00 · 18:00–02:00");
  await expect(current).toContainText("13 aperture della scheda negli ultimi 30 giorni");
  // The openings day by day, newest first (MD-11).
  await current.getByText("Aperture per giorno").click();
  await expect(current.locator(".admin__views li")).toHaveText([
    `${formatDate("2026-10-24")}: 9`,
    `${formatDate("2026-10-23")}: 4`,
  ]);

  // Find Camparino and turn it on.
  await page.getByLabel("Città del locale").fill("milano");
  await page.getByLabel("Nome del locale").fill("camparino");
  await page.getByRole("button", { name: "Cerca il locale" }).click();
  const found = page
    .getByRole("list", { name: "Risultati della ricerca" })
    .getByRole("listitem")
    .filter({ hasText: "Camparino in Galleria" });
  await expect(found).toHaveCount(1);
  await found.getByRole("button", { name: "Attiva" }).click();

  await timeInput(page, "Lunedì", "Apre").fill("08:00");
  await timeInput(page, "Lunedì", "Chiude").fill("20:00");
  await page.getByRole("button", { name: "Copia su tutti i giorni" }).click();
  await expect(timeInput(page, "Giovedì", "Chiude")).toHaveValue("20:00");
  await page.getByRole("group", { name: "Lunedì" }).getByLabel("Chiuso").check();
  await page.getByRole("group", { name: "Domenica" }).getByLabel("Chiuso").check();
  await timeInput(page, "Venerdì", "Chiude").fill("15:00");
  await timeInput(page, "Venerdì", "Riapre").fill("18:00");
  await timeInput(page, "Venerdì", "Richiude").fill("02:00");
  await timeInput(page, "Sabato", "Apre").fill("18:00");
  await timeInput(page, "Sabato", "Chiude").fill("02:00");
  await page.getByRole("button", { name: "Salva e pubblica" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Salvato" })).toBeVisible();
  expect(posts).toEqual([
    { path: "/api/admin/verified", body: { venue: CAMPARINO, cell: "u0nd9", hours: HOURS } },
  ]);
  // The form closes and the focus goes back to the button that opened it (WCAG 2.4.3).
  await expect(found.getByRole("button", { name: "Attiva" })).toBeFocused();
});

test("MD-06 wrong hours are explained before any request; a network error keeps the form", async ({
  page,
}) => {
  const posts = await fakeVerified(page, { failPosts: true });
  await page.goto("/admin/verificati");
  await current(page).getByRole("button", { name: "Modifica orari" }).click();
  await expect(timeInput(page, "Venerdì", "Richiude")).toHaveValue("02:00");
  await timeInput(page, "Martedì", "Chiude").fill("08:00"); // same as the opening
  await page.getByRole("button", { name: "Salva e pubblica" }).click();
  await expect(page.getByRole("alert")).toContainText("Martedì");
  expect(posts).toEqual([]);

  await timeInput(page, "Martedì", "Chiude").fill("21:00");
  await page.getByRole("button", { name: "Salva e pubblica" }).click();
  await expect(page.getByRole("alert")).toContainText("Salvataggio non riuscito");
  await expect(timeInput(page, "Martedì", "Chiude")).toHaveValue("21:00");
});

const current = (page: Page) =>
  page.getByRole("list", { name: "Gestori verificati attivi" }).getByRole("listitem").first();

test("MD-06 search messages are announced; cancel and disable keep the focus where it was", async ({
  page,
}) => {
  await fakeVerified(page);
  await page.goto("/admin/verificati");
  await page.getByLabel("Città del locale").fill("milano");
  await page.getByLabel("Nome del locale").fill("nessun bar con questo nome");
  await page.getByRole("button", { name: "Cerca il locale" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nessun bar trovato" })).toBeVisible();

  const edit = current(page).getByRole("button", { name: "Modifica orari" });
  await edit.click();
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByRole("group", { name: "Lunedì" })).toHaveCount(0);
  await expect(edit).toBeFocused();

  page.once("dialog", (d) => void d.accept());
  await current(page).getByRole("button", { name: "Disattiva" }).click();
  await expect(page.getByRole("heading", { name: /Gestori verificati attivi/ })).toBeFocused();
});

test("MD-06 turning it off asks first, then removes it", async ({ page }) => {
  const posts = await fakeVerified(page);
  await page.goto("/admin/verificati");
  page.once("dialog", (d) => void d.dismiss());
  await current(page).getByRole("button", { name: "Disattiva" }).click();
  expect(posts).toEqual([]);
  page.once("dialog", (d) => void d.accept());
  await current(page).getByRole("button", { name: "Disattiva" }).click();
  await expect
    .poll(() => posts)
    .toEqual([{ path: "/api/admin/verified/remove", body: { venue: "n2420779240" } }]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`MD-06 the admin page is accessible, 48 px targets, no horizontal scroll (${scheme})`, async ({
    page,
  }) => {
    await atHour(page, THEME_HOURS[scheme]);
    await fakeVerified(page);
    await page.goto("/admin/verificati");
    await current(page).getByRole("button", { name: "Modifica orari" }).click();
    await expect(page.getByRole("group", { name: "Domenica" })).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(AXE).analyze();
    expect(axe.violations).toEqual([]);
    for (const box of await page
      // Checkboxes count by their label, which is the whole touch target.
      .locator(
        "main button, main input:not([type=checkbox]), main a.btn, main label.check, main .admin__list a",
      )
      .evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect().toJSON() as { width: number; height: number }),
      )) {
      expect(box.height).toBeGreaterThanOrEqual(47.5);
      expect(box.width).toBeGreaterThanOrEqual(47.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // The hours summary reads as one entry: its day lines have no padding or divider of their own.
    for (const style of await page
      .locator(".admin__hours li")
      .evaluateAll((els) =>
        els.map((e) => [getComputedStyle(e).paddingTop, getComputedStyle(e).borderBottomWidth]),
      ))
      expect(style).toEqual(["0px", "0px"]);
    await page.screenshot({
      path: `docs/screenshots/md/md-06-admin-${scheme}.png`,
      fullPage: true,
    });
  });
}

test("MD-06 the bar found by the link of its page can be turned on", async ({ page }) => {
  const posts = await fakeVerified(page);
  await page.goto("/admin/verificati");
  await page
    .getByLabel("Oppure il link della scheda del locale")
    .fill(`https://dovebevo.example/bar/${CAMPARINO}?c=u0nd9`);
  await page.getByRole("button", { name: "Cerca il locale" }).click();
  const found = page.getByRole("list", { name: "Risultati della ricerca" }).locator(":scope > li");
  await expect(found).toHaveCount(1);
  await expect(found).toContainText("Camparino in Galleria");
  await found.getByRole("button", { name: "Attiva" }).click();
  for (const day of ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"])
    await page.getByRole("group", { name: day }).getByLabel("Chiuso").check();
  await page.getByRole("button", { name: "Salva e pubblica" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Salvato" })).toBeVisible();
  expect(posts).toEqual([
    {
      path: "/api/admin/verified",
      body: { venue: CAMPARINO, cell: "u0nd9", hours: [[], [], [], [], [], [], []] },
    },
  ]);
});

test("MD-06 the page is a chunk of its own: /admin/verificati loads it, the map never does", async ({
  page,
}) => {
  // The suite runs on the production build: a module bundled into the shell would never be
  // requested on its own, so seeing the request proves the separate chunk.
  const loaded: string[] = [];
  page.on("request", (r) => loaded.push(new URL(r.url()).pathname));
  const verifiedChunk = (paths: string[]) =>
    paths.filter((p) => /\/VerifiedPage[-.][^/]*\.js$/.test(p));
  await page.goto("/");
  await goToMilano(page);
  expect(verifiedChunk(loaded)).toEqual([]);

  await fakeVerified(page);
  await page.goto("/admin/verificati");
  await expect(page.getByRole("heading", { level: 1, name: "Gestori verificati" })).toBeVisible();
  expect(verifiedChunk(loaded)).toHaveLength(1);
});
