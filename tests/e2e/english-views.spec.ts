import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { UNDO_MS } from "../../src/shared/config";
import { box, chooseEnglish, expectNoItalian, langButton, langList } from "./english-helpers";
import { test } from "./fixtures";
import {
  atHour,
  DUOMO,
  mapStatus,
  smallTargets,
  stubTurnstile,
  stubWrites,
  THEME_HOURS,
} from "./helpers";

// What english.spec.ts leaves open of ME-03, ME-04, ME-06 and ME-07 (SPEC 1.13): the title of the map, the
// Timbro, Undo, Tessera, install invitation, errors and the pin step in English; nothing leaving its box on
// any public view; Italian distances and the Italian admin; 48 px targets and axe on every public view.
// Read-only: what would be saved is answered by a stub (stubWrites), nothing reaches the local D1.

const AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const nearBars = (page: Page) =>
  page.getByRole("list", { name: "Nearby bars" }).getByRole("button");
const stamp = (page: Page) => page.getByRole("status").filter({ hasText: "Price saved" });
const BARS_HERE = /\d+ of [1-9]\d* bars here have a price/;

/** The page in English, the position found and the map running, near the Duomo. */
async function openNearMe(page: Page) {
  await page.goto("/");
  await chooseEnglish(page);
  await page.getByRole("button", { name: "Near me" }).click();
  await expect(mapStatus(page)).toHaveText(BARS_HERE, { timeout: 30_000 });
}

/** Bar → drink → price → Save, for the nearest bar. The Timbro is on the screen at the end. */
async function savePrice(page: Page, drink: RegExp, price: string) {
  await page.getByRole("button", { name: "Add a price" }).click();
  await expect(nearBars(page)).toHaveCount(5);
  await nearBars(page).first().click();
  await page.getByRole("dialog").getByRole("button", { name: drink }).click();
  await page.getByRole("textbox", { name: "Price in euros" }).fill(price);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(stamp(page)).toBeVisible();
}

// ---- ME-03: the title and the language of the page ---------------------------------------------

test("ME-03 the title of the map is the same in both languages; html lang follows the menu", async ({
  page,
}) => {
  await page.goto("/");
  const title = await page.title();
  expect(title).toContain("Dove bevo"); // the name of the brand, not a sentence to translate
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await chooseEnglish(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.title()).toBe(title);
  await page.getByRole("button", { name: "Tap the map or search for a city" }).click();
  await expect(page.getByRole("region", { name: "Map", exact: true })).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30_000 },
  );
  expect(await page.title()).toBe(title);
  // And back: the menu is the only way, the title still the same.
  await langButton(page).click();
  await langList(page).getByRole("button", { name: "Italiano" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  expect(await page.title()).toBe(title);
});

// ---- ME-04: what comes after Save, errors, the pin of a missing bar -----------------------------

test.describe("ME-04 saving a price, in English", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("the Timbro, the seconds to undo, the Tessera and Undo", async ({ page }, info) => {
    await stubTurnstile(page);
    const sent = await stubWrites(page);
    await openNearMe(page);
    await page.getByRole("button", { name: "Add a price" }).click();
    await page.getByRole("searchbox", { name: "Search the bar by name" }).fill("Straf Bar");
    await nearBars(page).filter({ hasText: "Straf Bar" }).first().click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Spritz/ })
      .click();
    // The prices already seen in the zone, and how long there is to undo (UNDO_MS, in seconds).
    const seen = page.getByRole("list", { name: "Prices already seen here" });
    await expect(seen.getByRole("button", { name: "7,50 €" })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      `you have ${String(UNDO_MS / 1000)} seconds to undo`,
    );
    await expectNoItalian(page);
    await seen.getByRole("button", { name: "7,50 €" }).click();
    await page.mouse.move(0, 0); // a pointer resting on the toast holds the countdown

    const toast = stamp(page);
    await expect(toast).toContainText(
      "Logged. Whoever comes next already knows what they'll spend.",
    );
    await expect(toast).toContainText("First price logged."); // the Tessera
    await expect(toast.locator(".stamp__mark")).toHaveText(/^\d{1,2} [A-Z]{3}$/); // the date keeps its format
    await expect(toast.getByRole("button", { name: "Undo" })).toBeVisible();
    await expectNoItalian(page);
    await page.screenshot({ path: info.outputPath("me-04-stamp.png") });

    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Undone" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(sent).toEqual([]); // Undo sends nothing
  });

  test("the second price: the Tessera count and the invitation to install", async ({ page }) => {
    await stubTurnstile(page);
    await stubWrites(page);
    await openNearMe(page);
    await page.evaluate(() => {
      // What Chrome sends when the app can be installed.
      window.dispatchEvent(
        Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
          prompt: () => Promise.resolve(),
        }),
      );
    });
    const invite = page.getByRole("region", { name: "Install" });
    await savePrice(page, /^Sbagliato/, "6,10");
    await expect(invite).toHaveCount(0);
    await savePrice(page, /^Gin and tonic/, "6,20");
    await expect(stamp(page)).toContainText("2 prices logged.");
    await expect(invite).toBeVisible();
    await expect(invite).toContainText("Put Dove bevo on your Home screen: it opens faster.");
    await expect(invite.getByRole("button", { name: "Install" })).toBeVisible();
    await expect(invite.getByRole("button", { name: "Not now" })).toBeVisible();
    await expectNoItalian(page);
  });

  test("the errors of saving: an unusual price, too many today, no connection", async ({
    page,
  }) => {
    test.slow(); // each one waits out the real undo window (UNDO_MS)
    await stubTurnstile(page);
    let answer: () => { status: number; json: unknown } = () => ({ status: 200, json: {} });
    await stubWrites(page, () => answer());
    await openNearMe(page);

    // An unusual price comes back from the Worker as «rejected».
    answer = () => ({ status: 200, json: { results: [{ status: "rejected" }] } });
    await savePrice(page, /^Sbagliato/, "6,10");
    const unusual = page.getByText(
      "That looks like an unusual price for Sbagliato: check the digits.",
    );
    await expect(unusual).toBeVisible({ timeout: UNDO_MS + 15_000 });
    await expectNoItalian(page);
    await page.getByRole("button", { name: "Close" }).first().click();

    answer = () => ({ status: 429, json: { error: { code: "rate_limited", message: "x" } } });
    await savePrice(page, /^Sbagliato/, "6,20");
    await expect(
      page.getByText("You've logged a lot today. Try again after midnight."),
    ).toBeVisible({ timeout: UNDO_MS + 15_000 });
    await expectNoItalian(page);
    await page.getByRole("button", { name: "Close" }).first().click();

    answer = () => ({ status: 500, json: { error: { code: "internal", message: "x" } } });
    await savePrice(page, /^Sbagliato/, "6,30");
    await expect(
      page.getByText("I couldn't save it: check your connection and try again."),
    ).toBeVisible({ timeout: UNDO_MS + 15_000 });
    await expectNoItalian(page);
  });
});

test("ME-04 a service that answers with the app page is a polite wait, in English", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
  await page.route("**/api/prices/*", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }),
  );
  await page.goto("/");
  await chooseEnglish(page);
  await page.getByRole("button", { name: "Search city or bar" }).click();
  await page.getByRole("combobox", { name: "Search a city or a bar" }).fill("milano");
  await page
    .getByRole("listbox", { name: "Results" })
    .getByRole("option", { name: /^Milano/ })
    .first()
    .click();
  await expect(mapStatus(page)).toHaveText("The service is very busy, please try again later.", {
    timeout: 30_000,
  });
  await expectNoItalian(page);
  expect(errors).toEqual([]);
});

test("ME-04 the pin step of a missing bar is in English", async ({ page }, info) => {
  await page.goto("/");
  await chooseEnglish(page);
  await page.getByRole("button", { name: "Search city or bar" }).click();
  await page.getByRole("combobox", { name: "Search a city or a bar" }).fill("milano");
  await page
    .getByRole("listbox", { name: "Results" })
    .getByRole("option", { name: /^Milano/ })
    .first()
    .click();
  await expect(mapStatus(page)).toHaveText(BARS_HERE, { timeout: 30_000 });
  await page.getByRole("button", { name: "Add a price" }).click();
  await page.getByRole("button", { name: "Can't find the bar?" }).click();
  await page.getByRole("textbox", { name: "Bar name" }).fill("Bar della prova");
  await page.getByRole("button", { name: "Next" }).click();
  const pin = page.getByRole("region", { name: "Where is “Bar della prova”?" });
  await expect(pin).toBeVisible();
  await expect(pin).toContainText("Move the map until the mark is on the bar, then confirm.");
  await expect(pin.getByRole("button", { name: "Confirm and send" })).toBeVisible();
  await expect(pin.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expectNoItalian(page);
  await page.screenshot({ path: info.outputPath("me-04-pin.png") });
});

// ---- the public views, one after the other -------------------------------------------------------

/**
 * Walks the public views in English and calls `check` on each one. Nothing is saved (stubWrites).
 * The map, its menus and sheets, the add-a-price steps, the Timbro, the pages of the rules and privacy.
 */
async function walkEnglishViews(page: Page, check: (view: string) => Promise<void>) {
  await stubTurnstile(page);
  await stubWrites(page);
  await page.goto("/");
  await chooseEnglish(page);
  await check("map picture");
  await langButton(page).click();
  await check("language menu");
  await langButton(page).click();

  await page.getByRole("button", { name: "Near me" }).click();
  await expect(mapStatus(page)).toHaveText(BARS_HERE, { timeout: 30_000 });
  await check("map");

  const drinks = page.getByRole("button", { name: /^Choose what to drink/ });
  await drinks.click();
  await check("drink menu");
  await drinks.click();

  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("dialog", { name: "Bars in this area" })).toBeVisible();
  await check("list");
  await page.getByRole("button", { name: "Close" }).first().click();

  await page.getByRole("button", { name: "Search city or bar" }).click();
  await check("search");
  await page.getByRole("combobox", { name: "Search a city or a bar" }).fill("camparino");
  await page
    .getByRole("dialog", { name: "Search" })
    .getByRole("option", { name: /Camparino/ })
    .first()
    .click();
  const bar = page.getByRole("dialog", { name: "Camparino in Galleria" });
  await expect(bar).toBeVisible();
  await check("bar page");
  await bar.getByRole("button", { name: "Report an error" }).first().click();
  await expect(page.getByRole("dialog", { name: "Report an error" })).toBeVisible();
  await check("report");
  await page
    .getByRole("dialog", { name: "Report an error" })
    .getByRole("button", { name: "Close" })
    .click();
  await page.getByRole("button", { name: "Close" }).first().click();

  await page.getByRole("button", { name: "Add a price" }).click();
  await expect(nearBars(page)).toHaveCount(5);
  await check("add a price: bar");
  await page.getByRole("button", { name: "Can't find the bar?" }).click();
  await check("add a bar: name");
  await page.getByRole("textbox", { name: "Bar name" }).fill("Bar della prova");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("region", { name: "Where is “Bar della prova”?" })).toBeVisible();
  await check("add a bar: pin");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Cancel" })
    .click()
    .catch(() => undefined);

  await page.getByRole("button", { name: "Add a price" }).click();
  await expect(nearBars(page)).toHaveCount(5);
  await nearBars(page).first().click();
  await expect(page.getByRole("heading", { name: "What did you have?" })).toBeVisible();
  await check("add a price: drink");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Sbagliato/ })
    .click();
  await check("add a price: price");
  await page.getByRole("textbox", { name: "Price in euros" }).fill("6,10");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(stamp(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await check("Timbro");

  for (const path of ["/privacy", "/regole"]) {
    await page.goto(path);
    await chooseEnglish(page);
    await check(path);
  }
}

// ---- ME-04: nothing leaves its box ------------------------------------------------------------------

/** Text that runs out of its box, or a view wider than the screen: both are defects at 390 and 360 px. */
async function leaks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) out.push("the page scrolls sideways");
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      if (el.closest(".maplibregl-map, .map__preview, svg, [inert], .sr-only")) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // A box with no text of its own is a container: a popup placed inside it may reach outside it by design.
      const ownText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
      );
      if (!ownText) continue;
      const label = `${el.tagName.toLowerCase()}.${el.className.split(" ")[0] ?? ""} "${el.textContent.trim().slice(0, 28)}"`;
      if (rect.left < -1 || rect.right > width + 1) out.push(`${label} is out of the screen`);
      // A scrolling box, or a line that ends with «…» on purpose, is not text running out of its box.
      const scrolls =
        ["auto", "scroll"].includes(style.overflowX) || style.textOverflow === "ellipsis";
      if (!scrolls && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
        out.push(
          `${label} runs out of its box (${String(el.scrollWidth)} > ${String(el.clientWidth)})`,
        );
    }
    return out;
  });
}

for (const width of [390, 360] as const) {
  test.describe(`ME-04 at ${String(width)} px`, () => {
    test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

    test(`no text leaves its box on any public view in English`, async ({ page }) => {
      test.slow(); // about twenty views in one test
      await page.setViewportSize({ width, height: 844 });
      await walkEnglishViews(page, async (view) => {
        expect(await leaks(page), view).toEqual([]);
      });
    });
  });
}

// ---- ME-06: Italian distances, Italian admin --------------------------------------------------------

test.describe("ME-06 distances in English", () => {
  test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

  test("the list and the nearby bars show «350 m» and «1,2 km», never miles or a decimal point", async ({
    page,
  }) => {
    await openNearMe(page);
    await page.getByRole("button", { name: "List" }).click();
    const rows = page.getByRole("dialog", { name: "Bars in this area" }).locator(".row");
    await expect(rows.first()).toBeVisible();
    const listed = (await rows.allTextContents()).join("\n");
    expect(listed).toMatch(/\b\d+ m\b|\b\d+,\d km\b/);
    await page.getByRole("button", { name: "Close" }).first().click();

    await page.getByRole("button", { name: "Add a price" }).click();
    await expect(nearBars(page)).toHaveCount(5);
    const near = (await nearBars(page).allTextContents()).join("\n");
    expect(near).toMatch(/\b\d+ m\b|\b\d+,\d km\b/);
    for (const text of [listed, near]) {
      expect(text).not.toMatch(/\d\.\d+ ?km/);
      expect(text).not.toMatch(/\bmi(les?)?\b/i);
    }
  });
});

test("ME-06 /admin/verificati is a page of its own and stays Italian", async ({ page }) => {
  await page.route("**/api/admin/**", (route) =>
    route.fulfill({ status: 403, json: { error: { code: "forbidden", message: "x" } } }),
  );
  await page.goto("/");
  await chooseEnglish(page);
  await page.goto("/admin/verificati");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByText("Gestori verificati").first()).toBeVisible();
  await expect(langButton(page)).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/\b(Language|Verified operators)\b/);
});

// ---- ME-07: every public view, 48 px and axe, with nothing left out -------------------------------------

for (const scheme of ["light", "dark"] as const) {
  test.describe(`ME-07 every public view in English, ${scheme}`, () => {
    test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

    test("axe finds nothing and every target is at least 48 px", async ({ page }) => {
      test.slow(); // about twenty views in one test
      await atHour(page, THEME_HOURS[scheme]);
      await walkEnglishViews(page, async (view) => {
        const axe = await new AxeBuilder({ page }).withTags(AXE).analyze();
        expect(
          axe.violations.map(
            (v) => `${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
          ),
          view,
        ).toEqual([]);
        expect(await smallTargets(page), view).toEqual([]);
      });
    });
  });
}

// The first view of the walk is the picture with its button: its box is a button of 48 px at least.
test("ME-07 the button in the centre keeps 48 px in English", async ({ page }) => {
  await page.goto("/");
  await chooseEnglish(page);
  const start = await box(page.getByRole("button", { name: "Tap the map or search for a city" }));
  expect(start.height).toBeGreaterThanOrEqual(48);
  expect(start.width).toBeGreaterThanOrEqual(48);
});
