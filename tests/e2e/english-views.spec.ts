import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { box, chooseEnglish, expectNoItalian, langButton, langList } from "./english-helpers";
import { test } from "./fixtures";
import {
  atHour,
  DUOMO,
  mapStatus,
  smallTargets,
  stubTurnstile,
  stubWrites,
  type StubAnswer,
  THEME_HOURS,
} from "./helpers";

// What english.spec.ts leaves open of ME-03, ME-04, ME-06 and ME-07 (SPEC 1.13): the title of the map, the
// price step after Save, install invitation, errors and the pin step in English; nothing leaving its box on
// any public view; Italian distances and the Italian admin; 48 px targets and axe on every public view.
// Read-only: what would be saved is answered by a stub (stubWrites), nothing reaches the local D1.

const AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const nearBars = (page: Page) =>
  page.getByRole("list", { name: "Nearby bars" }).getByRole("button");
/** After Save (SPEC 1.20): the bar page, no panel; "Price saved" is only read out. */
const barPage = (page: Page) =>
  page.getByRole("dialog").filter({ has: page.locator(".scontrino") });
const BARS_HERE = /\d+ of [1-9]\d* bars here have a price/;

/** The page in English, the position found and the map running, near the Duomo. */
async function openNearMe(page: Page) {
  await page.goto("/");
  await chooseEnglish(page);
  await page.getByRole("button", { name: "Near me" }).click();
  await expect(mapStatus(page)).toHaveText(BARS_HERE, { timeout: 30_000 });
}

/** Bar → drink → price → Save, for the nearest bar. */
async function savePrice(page: Page, drink: RegExp, price: string) {
  await page.getByRole("button", { name: "Add a price" }).click();
  await expect(nearBars(page)).toHaveCount(5);
  await nearBars(page).first().click();
  await page.getByRole("dialog").getByRole("button", { name: drink }).click();
  await page.getByRole("textbox", { name: "Price in euros" }).fill(price);
  await page.getByRole("button", { name: "Save" }).click();
}

/** Save, then the bar page that opens is closed: back on the map. */
async function saveAndClose(page: Page, drink: RegExp, price: string) {
  await savePrice(page, drink, price);
  await expect(barPage(page).getByRole("heading", { level: 2 })).toBeVisible();
  await barPage(page).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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

  test("a price already seen fills the field; after Save the bar page, in English", async ({
    page,
  }, info) => {
    await stubTurnstile(page);
    const sent = await stubWrites(page, () => ({
      status: 200,
      json: { results: [{ status: "confirmed" }] },
    }));
    await openNearMe(page);
    await page.getByRole("button", { name: "Add a price" }).click();
    await page.getByRole("searchbox", { name: "Search the bar by name" }).fill("Straf Bar");
    await nearBars(page).filter({ hasText: "Straf Bar" }).first().click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Spritz/ })
      .click();
    const seen = page.getByRole("list", { name: "Prices already seen here" });
    await expect(seen.getByRole("button", { name: "7,50 €" })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      "Tap a price to put it in the field, then Save.",
    );
    await expectNoItalian(page);
    await seen.getByRole("button", { name: "7,50 €" }).click();
    await expect(page.getByRole("textbox", { name: "Price in euros" })).toHaveValue("7,50");
    expect(sent).toEqual([]); // the tap only fills the digits
    await page.getByRole("button", { name: "Save" }).click();

    await expect(barPage(page).getByRole("heading", { name: "Straf Bar" })).toBeFocused();
    await expect(
      page.getByRole("status").filter({
        hasText: "Thanks: the price you entered confirms the one that was already there.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expectNoItalian(page);
    await page.screenshot({ path: info.outputPath("me-04-dopo-save.png") });
    expect(sent).toHaveLength(1);
  });

  test("the second price: the invitation to install", async ({ page }) => {
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
    await saveAndClose(page, /^Sbagliato/, "6,10");
    await expect(invite).toHaveCount(0);
    await saveAndClose(page, /^Gin and tonic/, "6,20");
    await expect(invite).toBeVisible();
    await expect(invite).toContainText("Put Dove bevo on your Home screen: it opens faster.");
    await expect(invite.getByRole("button", { name: "Install" })).toBeVisible();
    await expect(invite.getByRole("button", { name: "Not now" })).toBeVisible();
    await expectNoItalian(page);
  });

  test("the errors of saving: an unusual price, too many today, under review, a failure", async ({
    page,
  }) => {
    await stubTurnstile(page);
    let answer: () => StubAnswer = () => ({ status: 200, json: {} });
    await stubWrites(page, () => answer());
    await openNearMe(page);
    const cases: [StubAnswer, string][] = [
      [
        { status: 200, json: { results: [{ status: "rejected", code: "out_of_range" }] } },
        "Sbagliato: we accept prices from 4,00 € to 20,00 €. Check the digits.",
      ],
      [
        {
          status: 429,
          headers: { "Retry-After": "36000" },
          json: { error: { code: "rate_limited", message: "x" } },
        },
        "You've already logged 30 prices today, the most for one day. You can log more from midnight.",
      ],
      [
        { status: 200, json: { results: [{ status: "rejected", code: "under_review" }] } },
        "The price of this drink here was reported and is being checked: it can't be changed for now.",
      ],
      [
        { status: 500, json: { error: { code: "internal", message: "x" } } },
        "I couldn't save the price: try again shortly.",
      ],
    ];
    for (const [i, [reply, text]] of cases.entries()) {
      answer = () => reply;
      await savePrice(page, /^Sbagliato/, `6,${String(10 + i)}`);
      await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
      await expectNoItalian(page);
      // The price step is on top of the bar page that Save opened: close both.
      await page.getByRole("dialog").last().getByRole("button", { name: "Close" }).first().click();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await barPage(page).getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
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
  // Wait for each sheet to be gone: while the report sheet is still closing its «Close» is the first one,
  // and while the bar sheet is still closing its «Add a price here» makes the next click ambiguous.
  await expect(page.getByRole("dialog", { name: "Report an error" })).toBeHidden();
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(bar).toBeHidden();

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
  await expect(barPage(page).getByRole("heading", { level: 2 })).toBeFocused();
  await check("bar page after Save");

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
