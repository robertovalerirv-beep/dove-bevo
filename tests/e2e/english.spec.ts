import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { en } from "../../src/app/i18n/en";
import { it as italian } from "../../src/app/i18n/it";
import { test } from "./fixtures";
import { atHour, mapRegion, mapStatus, THEME_HOURS } from "./helpers";

// ME-01…ME-08 (SPEC 1.11, D-36, ADR 0038): the public interface also in English, the choice kept only
// in memory. 390×844, like every e2e.

const AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const langButton = (page: Page) => page.getByRole("button", { name: /^(Lingua|Language)/ });
const langList = (page: Page) => page.getByRole("group", { name: /^(Lingua|Language)$/ });

async function chooseEnglish(page: Page) {
  await langButton(page).click();
  await langList(page).getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(langList(page)).toBeHidden();
}

// ---- no Italian left -------------------------------------------------------------------------

const strings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
};
const publicItalian = Object.fromEntries(Object.entries(italian).filter(([k]) => k !== "admin"));
const englishText = strings(en).join("\n");
// The Italian texts a person must not read in English (short ones and the names that are the same in
// both languages, like Spritz or Negroni, are left out).
const ITALIAN_ONLY = [...new Set(strings(publicItalian))].filter(
  (t) => t.length >= 5 && !englishText.includes(t),
);

/** Everything the person reads or hears on the page: visible text and the accessible names. */
async function pageText(page: Page): Promise<string> {
  const visible = await page.locator("body").innerText();
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-label],[title],[placeholder],img[alt]")].flatMap((e) =>
      ["aria-label", "title", "placeholder", "alt"].map((a) => e.getAttribute(a) ?? ""),
    ),
  );
  return `${visible}\n${names.join("\n")}`;
}
async function expectNoItalian(page: Page) {
  const text = await pageText(page);
  expect(ITALIAN_ONLY.filter((t) => text.includes(t))).toEqual([]);
}

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible");
  return b;
};

// ---- ME-02: the menu, top left, opposite the list ---------------------------------------------

test("ME-02 the menu is a 48 px button top left, opposite the list; the status starts after it", async ({
  page,
}, info) => {
  await page.goto("/");
  const button = langButton(page);
  await expect(button).toHaveText("IT");
  const region = await box(mapRegion(page));
  const lang = await box(button);
  const list = await box(page.getByRole("button", { name: "Elenco" }));
  expect(lang.width).toBeGreaterThanOrEqual(47.5);
  expect(lang.height).toBeGreaterThanOrEqual(47.5);
  // Mirror of the list: same top, the same distance from the opposite side.
  expect(lang.y).toBeCloseTo(list.y, 0);
  expect(lang.x - region.x).toBeCloseTo(region.x + region.width - (list.x + list.width), 0);
  expect(lang.x).toBeLessThan(list.x);
  // The status line starts after the menu and stops before the list, whatever it says.
  for (const state of ["initial", "english"] as const) {
    if (state === "english") await chooseEnglish(page);
    const status = await box(mapStatus(page));
    expect(status.x).toBeGreaterThanOrEqual(lang.x + lang.width);
    expect(status.x + status.width).toBeLessThanOrEqual(list.x);
    await page.screenshot({ path: info.outputPath(`me-02-${state}.png`) });
  }
  await expect(langButton(page)).toHaveText("EN");
});

test("ME-02 the menu opens and closes with a tap, the keyboard, Escape and a tap outside", async ({
  page,
}, info) => {
  await page.goto("/");
  const button = langButton(page);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(langList(page)).toBeHidden();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const options = langList(page).getByRole("button");
  await expect(options).toHaveText(["Italiano", "English"]);
  await expect(options.first()).toHaveAttribute("aria-current", "true");
  await expect(options.nth(1)).toHaveAttribute("lang", "en");
  await page.screenshot({ path: info.outputPath("me-02-open.png") });
  for (const option of await options.all())
    expect((await box(option)).height).toBeGreaterThan(47.5);
  await page.keyboard.press("Escape");
  await expect(langList(page)).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await expect(langList(page)).toBeVisible();
  await page.mouse.click(200, 500); // outside
  await expect(langList(page)).toBeHidden();
  // Choosing the language already shown only closes the list.
  await button.click();
  await langList(page).getByRole("button", { name: "Italiano" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(langList(page)).toBeHidden();
});

test("ME-02 switching keeps the map open, where it was, and does not resize it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Esplora la mappa" }).click();
  await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  const canvas = page.locator("canvas.maplibregl-canvas");
  await canvas.evaluate((c) => {
    (c as HTMLCanvasElement & { kept?: boolean }).kept = true;
  });
  const before = {
    height: (await box(mapRegion(page))).height,
    center: await mapRegion(page).getAttribute("data-center"),
    zoom: await mapRegion(page).getAttribute("data-zoom"),
  };
  await chooseEnglish(page);
  await page.waitForTimeout(1500);
  const region = page.getByRole("region", { name: "Map", exact: true });
  await expect(region).toHaveAttribute("data-ready", "true");
  expect((await box(region)).height).toBe(before.height);
  await expect(region).toHaveAttribute("data-center", before.center ?? "");
  await expect(region).toHaveAttribute("data-zoom", before.zoom ?? "");
  // The same canvas: the map was not made again.
  expect(
    await canvas.evaluate((c) => (c as HTMLCanvasElement & { kept?: boolean }).kept === true),
  ).toBe(true);
  await expect(canvas).toHaveAttribute("aria-label", "Interactive map of bars");
});

// ---- ME-03: nothing stored, always Italian at the start ---------------------------------------

test("ME-03 nothing is stored or sent, and a reload starts in Italian", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const snapshot = () =>
    page.evaluate(() => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
      cookie: document.cookie,
    }));
  const before = await snapshot();
  expect(requests.filter((p) => /\/assets\/en-/.test(p))).toEqual([]); // no English until chosen
  const seen = requests.length;
  await chooseEnglish(page);
  await page.waitForLoadState("networkidle");
  expect(await snapshot()).toEqual(before);
  const after = requests.slice(seen);
  expect(after.filter((p) => p.startsWith("/api/"))).toEqual([]);
  expect(after.filter((p) => /\/assets\/en-.*\.js$/.test(p))).toHaveLength(1);
  // Back to Italian and again to English: the file is not asked for twice.
  await langButton(page).click();
  await langList(page).getByRole("button", { name: "Italiano" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByRole("button", { name: "Cerca città o bar" })).toBeVisible();
  await chooseEnglish(page);
  expect(requests.filter((p) => /\/assets\/en-.*\.js$/.test(p))).toHaveLength(1);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByRole("button", { name: "Cerca città o bar" })).toBeVisible();
  await expect(langButton(page)).toHaveText("IT");
  expect(await snapshot()).toEqual(before);
});

// ---- ME-04: every public view in English -------------------------------------------------------

test("ME-04 the check for leftover Italian is not vacuous: it sees the Italian page", async ({
  page,
}) => {
  expect(ITALIAN_ONLY.length).toBeGreaterThan(100);
  await page.goto("/");
  const text = await pageText(page);
  expect(ITALIAN_ONLY.filter((t) => text.includes(t)).length).toBeGreaterThan(5);
});

test("ME-04 the map screen and the drink menu are in English", async ({ page }, info) => {
  await page.goto("/");
  await chooseEnglish(page);
  await expect(page.getByRole("button", { name: "Search city or bar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Near me" })).toBeVisible();
  await expect(page.getByRole("button", { name: "List" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore the map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a price" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a missing place" })).toBeVisible();
  await expect(mapStatus(page)).toHaveText("Zoom in to see prices, or search for a city.");
  const menu = page.getByRole("button", { name: /^Choose what to drink/ });
  await expect(menu).toContainText("Medium beer");
  await menu.click();
  const drinks = page.getByRole("group", { name: "Drinks" });
  await expect(drinks.getByRole("checkbox")).toHaveCount(9);
  for (const name of [
    "Medium beer",
    "Spritz",
    "Negroni",
    "Sbagliato",
    "Gin and tonic",
    "Gin lemon",
    "Glass of wine",
    "Non-alcoholic",
    "Water",
  ])
    await expect(drinks.getByRole("checkbox", { name })).toBeAttached();
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-map-menu.png") });
});

test("ME-04 search, list, bar page, report, add a price and a missing bar are in English", async ({
  page,
}, info) => {
  await page.goto("/");
  await chooseEnglish(page);

  // Search: a city, then the bar.
  await page.getByRole("button", { name: "Search city or bar" }).click();
  const search = page.getByRole("dialog", { name: "Search" });
  const field = search.getByRole("combobox", { name: "Search a city or a bar" });
  await field.fill("milano");
  await expect(
    search.getByRole("listbox", { name: "Results" }).getByRole("option").first(),
  ).toContainText("Milano");
  await expect(search).toContainText(/\d+ results?/);
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-search.png") });
  await expect(async () => {
    if (await search.count())
      await search
        .getByRole("option", { name: /^Milano/ })
        .first()
        .click({ timeout: 5_000 });
    await expect(search).toHaveCount(0, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(mapStatus(page)).toHaveText(/\d+ of [1-9]\d* bars here have a price/, {
    timeout: 30_000,
  });
  await expectNoItalian(page);

  // The list of the bars in view.
  await page.getByRole("button", { name: "List" }).click();
  const list = page.getByRole("dialog", { name: "Bars in this area" });
  await expect(list.locator(".row").first()).toBeVisible();
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-list.png") });
  await list.getByRole("button", { name: "Close" }).first().click();
  await expect(list).toHaveCount(0);

  // The bar page, a report on it.
  await page.getByRole("button", { name: "Search city or bar" }).click();
  await page.getByRole("combobox", { name: "Search a city or a bar" }).fill("camparino");
  await page
    .getByRole("dialog", { name: "Search" })
    .getByRole("option", { name: /Camparino/ })
    .first()
    .click();
  const bar = page.getByRole("dialog", { name: "Camparino in Galleria" });
  await expect(bar.getByRole("heading", { name: "Camparino in Galleria" })).toBeVisible();
  await expect(bar).toContainText("Prices");
  await expect(bar).toContainText("Spritz");
  await expect(bar).toContainText("1 confirmation");
  await expect(bar.getByRole("link", { name: "Directions" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "I confirm" }).first()).toBeVisible();
  await expect(bar.getByRole("button", { name: "It changed" }).first()).toBeVisible();
  await expect(bar.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Rules" })).toBeVisible();
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-bar.png") });
  await bar.getByRole("button", { name: "Report an error" }).first().click();
  const report = page.getByRole("dialog", { name: "Report an error" });
  await expect(report.getByRole("radio", { name: "Wrong price" })).toBeVisible();
  await expect(report.getByRole("radio", { name: "Offensive content" })).toBeVisible();
  await expect(report.getByRole("button", { name: "Send" })).toBeDisabled();
  await expectNoItalian(page);
  await report.getByRole("button", { name: "Close" }).click();
  await expect(report).toHaveCount(0);

  // Add a price: bar → drink → price (nothing is saved).
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Add a price" }).click();
  const add = page.getByRole("dialog", { name: "Choose the bar" });
  await expect(add.getByRole("searchbox", { name: "Search the bar by name" })).toBeVisible();
  await expect(add.getByRole("button", { name: "Can't find the bar?" })).toBeVisible();
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-add-bar.png") });
  await add.locator(".row").first().click();
  await expect(page.getByRole("heading", { name: "What did you have?" })).toBeVisible();
  await expectNoItalian(page);
  await page.getByRole("button", { name: /^Spritz/ }).click();
  const price = page.getByRole("textbox", { name: "Price in euros" });
  await expect(page.getByText("How much did you pay?")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Happy hour" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await price.fill("7,50");
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-add-price.png") });
  await page.getByRole("button", { name: "Close" }).first().click();

  // A missing bar.
  await page.getByRole("button", { name: "Add a missing place" }).click();
  const propose = page.getByRole("dialog", { name: "Add a bar" });
  await expect(propose.getByLabel("Bar name")).toBeVisible();
  await expect(propose.getByText("What kind of place is it?")).toBeVisible();
  await expect(propose.getByText("Evening venue")).toBeVisible();
  await expect(propose.getByRole("button", { name: "Next" })).toBeDisabled();
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-propose.png") });
});

test.describe("ME-04 a denied position", () => {
  test.use({ permissions: [] });

  test("the messages of «Near me» are in English", async ({ page, context }) => {
    await context.clearPermissions();
    await page.goto("/");
    await chooseEnglish(page);
    await page.getByRole("button", { name: "Near me" }).click();
    const search = page.getByRole("dialog", { name: "Search" });
    await expect(search.getByText(/tap the padlock next to the address/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(mapStatus(page)).toHaveText(
      "Turn on location for this site in settings, or search for a city.",
    );
    await expectNoItalian(page);
  });

  test("a message already on screen follows the language", async ({ page, context }) => {
    await context.clearPermissions();
    await page.goto("/");
    // The map is already running: a message of «Vicino a me» lasts until the map moves.
    await page.getByRole("button", { name: "Esplora la mappa" }).click();
    await expect(mapRegion(page)).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await page.getByRole("button", { name: "Vicino a me" }).click();
    const search = page.getByRole("dialog", { name: "Cerca" });
    await expect(search.getByText(/tocca il lucchetto accanto all'indirizzo/)).toBeVisible({
      timeout: 15_000,
    });
    await search.getByRole("button", { name: "Chiudi" }).first().click();
    await expect(mapStatus(page)).toHaveText(
      "Attiva la posizione per questo sito nelle impostazioni, oppure cerca una città.",
    );
    await chooseEnglish(page);
    await expect(mapStatus(page)).toHaveText(
      "Turn on location for this site in settings, or search for a city.",
    );
  });
});

// ---- ME-05: Privacy and Rules in English -------------------------------------------------------

for (const { path, it: italianTitle, title, heading, sectionCount } of [
  { path: "/privacy", it: "Privacy", title: "Privacy", heading: "Your location", sectionCount: 9 },
  { path: "/regole", it: "Regole", title: "Rules", heading: "Service for adults", sectionCount: 7 },
] as const) {
  test(`ME-05 ${path} in English: same sections, menu in the header, title and links follow`, async ({
    page,
  }, info) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: italianTitle })).toBeVisible();
    const sections = await page.locator("main h2").count();
    expect(sections).toBe(sectionCount);
    // The menu is in the header of the page, not over a map (there is none).
    const button = page.locator("header.legal__head").getByRole("button", { name: /^Lingua/ });
    await expect(button).toBeVisible();
    expect((await box(button)).width).toBeGreaterThanOrEqual(47.5);
    await button.click();
    await page
      .getByRole("group", { name: "Lingua" })
      .getByRole("button", { name: "English" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    expect(await page.locator("main h2").count()).toBe(sections);
    await expect(page.locator("main")).toContainText("Last updated");
    await expect(page.getByRole("link", { name: "Back to the map" }).first()).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(`^${title} · Dove bevo`));
    if (path === "/privacy") {
      // The two things kept on the phone, as in the Italian text.
      await expect(page.locator("main")).toContainText("date of first use");
      await expect(page.locator("main")).toContainText("how many prices");
    }
    await expectNoItalian(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`me-05-${title.toLowerCase()}.png`),
      fullPage: true,
    });
    // A reload is Italian again.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: italianTitle })).toBeVisible();
  });
}

// ---- ME-06: Italian formats, Italian admin -----------------------------------------------------

test("ME-06 prices and dates keep the Italian format in English", async ({ page }) => {
  await page.goto("/");
  await chooseEnglish(page);
  await page.getByRole("button", { name: "Search city or bar" }).click();
  await page.getByRole("combobox", { name: "Search a city or a bar" }).fill("camparino");
  await page
    .getByRole("dialog", { name: "Search" })
    .getByRole("option", { name: /Camparino/ })
    .first()
    .click();
  const bar = page.getByRole("dialog", { name: "Camparino in Galleria" });
  await expect(bar).toContainText("12,00 €");
  await expect(bar).toContainText(
    /\d{1,2} (gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic) \d{4}/,
  );
  await expect(bar).not.toContainText("€12");
  await expect(bar).not.toContainText(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b \d/);
  await page.getByRole("link", { name: "Directions" }).waitFor();
});

test("ME-06 /admin is a page of its own and stays Italian", async ({ page }) => {
  await page.route("**/api/admin/**", (route) =>
    route.fulfill({ status: 403, json: { error: { code: "forbidden", message: "x" } } }),
  );
  await page.goto("/");
  await chooseEnglish(page);
  await page.goto("/admin");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByRole("heading", { level: 1, name: "Amministrazione" })).toBeVisible();
  await expect(page.getByText(/Accesso riservato/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Lingua|Language)/ })).toHaveCount(0);
});

// ---- ME-07: accessibility in English ------------------------------------------------------------

for (const scheme of ["light", "dark"] as const) {
  test(`ME-07 axe and 48 px targets in English, ${scheme} theme`, async ({ page }) => {
    await atHour(page, THEME_HOURS[scheme]);
    await page.goto("/");
    await chooseEnglish(page);
    // The attribution is small by design (SPEC 1.8, 2.8): as in the other axe tests of the map, the
    // 24 px target rule leaves it out.
    const onMap = () => new AxeBuilder({ page }).withTags(AXE).exclude(".map__attribution");
    expect((await onMap().analyze()).violations).toEqual([]);
    // With the menu open.
    await langButton(page).click();
    expect((await onMap().analyze()).violations).toEqual([]);
    await langButton(page).click();
    // Map started, the bar page open.
    await page.getByRole("button", { name: "Search city or bar" }).click();
    await page.getByRole("combobox", { name: "Search a city or a bar" }).fill("camparino");
    await page
      .getByRole("dialog", { name: "Search" })
      .getByRole("option", { name: /Camparino/ })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: "Camparino in Galleria" })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include("dialog[open]").withTags(AXE).analyze()).violations,
    ).toEqual([]);
    // The page of the rules.
    await page.goto("/regole");
    await langButton(page).click();
    await page
      .getByRole("group", { name: "Lingua" })
      .getByRole("button", { name: "English" })
      .click();
    expect((await new AxeBuilder({ page }).withTags(AXE).analyze()).violations).toEqual([]);
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    await page.screenshot({ path: `docs/screenshots/english/rules-${scheme}.png`, fullPage: true });
  });
}

test("ME-07 no CSP violation while the language changes", async ({ page }) => {
  const csp: string[] = [];
  page.on("console", (msg) => {
    if (/content security policy|refused to/i.test(msg.text())) csp.push(msg.text());
  });
  await page.goto("/");
  await chooseEnglish(page);
  await page.waitForLoadState("networkidle");
  expect(csp).toEqual([]);
});
