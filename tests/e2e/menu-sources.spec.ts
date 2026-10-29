import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { chooseEnglish } from "./english-helpers";

const KEY = "n13001337602";
const OTHER = "n10781209907";
const DAY = "2026-10-28";
const quote = {
  drink: "spritz",
  hh: 0,
  price_cents: 700,
  checked_on: DAY,
  menu_url: "https://venue.example/menu.pdf",
  menu_item: "Aperol <b>Spritz</b>",
  serving: "200 ml",
  context: "Indoor table service",
  published_on: null,
};

async function prices(page: Page, key = KEY, day = DAY) {
  await page.route(`**/api/venues/${key}/prices`, (route) =>
    route.fulfill({
      json: {
        p: [
          [key, "spritz", 0, 700, day, 0, 0],
          [key, "water", 0, 200, DAY, 1, 0],
        ],
        h: [],
      },
    }),
  );
}

test("official source stays within the receipt, replaces confirmation only for its exact row, and keeps customer actions", async ({
  page,
}, info) => {
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() === "POST") {
      writes.push(route.request().url());
      return route.abort();
    }
    return route.fallback();
  });
  await prices(page);
  await page.route(`**/api/venues/${KEY}/menu-sources?c=u0nd9`, (route) =>
    route.fulfill({ json: { prices: [quote] } }),
  );
  await page.goto(`/bar/${KEY}?c=u0nd9`);
  const sheet = page.getByRole("dialog", { name: "Camparino in Galleria" });
  const imported = sheet
    .locator("li.price")
    .filter({ has: page.locator(".price__name", { hasText: /^Spritz$/ }) });
  await expect(imported).toContainText("Dal menu ufficiale");
  await expect(imported).toContainText("Controllato il 28 ott 2026");
  await expect(imported).toContainText("Aperol <b>Spritz</b> · 200 ml · Indoor table service");
  await expect(imported.locator("b")).toHaveCount(0);
  await expect(imported.getByRole("link", { name: "Apri il menu ufficiale" })).toHaveAttribute(
    "href",
    quote.menu_url,
  );
  await expect(imported.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  await expect(imported.getByRole("button", { name: "Confermo", exact: true })).toHaveCount(0);
  await expect(
    sheet
      .locator("li.price")
      .filter({ hasText: "Acqua" })
      .getByRole("button", { name: "Confermo", exact: true }),
  ).toBeVisible();
  const overflows = await sheet.evaluate(
    (el) =>
      [...el.querySelectorAll<HTMLElement>(".price, .price__note")].filter((item) => {
        const box = item.getBoundingClientRect();
        return (
          box.left < 0 || box.right > innerWidth + 1 || item.scrollWidth > item.clientWidth + 1
        );
      }).length,
  );
  expect(overflows).toBe(0);
  await page.screenshot({ path: info.outputPath("official-menu-receipt-390.png") });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await imported.getByRole("button", { name: "È cambiato" }).click();
  await expect(page.getByRole("textbox", { name: "Prezzo in euro" })).toBeVisible();
  await page
    .getByRole("dialog")
    .filter({ has: page.getByRole("textbox", { name: "Prezzo in euro" }) })
    .getByRole("button", { name: "Chiudi", exact: true })
    .click();
  await imported.getByRole("button", { name: "Segnala un errore" }).click();
  await expect(page.getByRole("dialog", { name: "Segnala un errore" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "Segnala un errore" })
    .getByRole("button", { name: "Chiudi", exact: true })
    .click();
  await sheet.getByRole("button", { name: "Chiudi", exact: true }).click();
  await chooseEnglish(page);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Bars in this area" })
    .getByRole("link", { name: /^Camparino in Galleria/ })
    .click();
  await expect(page.locator("li.price").first()).toContainText("From the official menu");
  await expect(page.locator("li.price").first()).toContainText("Checked on");
  expect(writes).toEqual([]);
});

test("a newer customer observation is not labelled with stale source metadata", async ({
  page,
}) => {
  await prices(page, KEY, "2026-10-29");
  await page.route(`**/api/venues/${KEY}/menu-sources?c=u0nd9`, (route) =>
    route.fulfill({ json: { prices: [quote] } }),
  );
  await page.goto(`/bar/${KEY}?c=u0nd9`);
  const row = page
    .getByRole("dialog", { name: "Camparino in Galleria" })
    .locator("li.price")
    .first();
  await expect(row.getByRole("button", { name: "Confermo", exact: true })).toBeVisible();
  await expect(row).not.toContainText("Dal menu ufficiale");
  await expect(row.getByRole("link")).toHaveCount(0);
});

test("failed or unsafe optional metadata leaves legacy customer rows usable", async ({ page }) => {
  await prices(page);
  for (const response of [
    { contentType: "text/html", body: "<html>fallback</html>" },
    { json: { prices: [{ ...quote, menu_url: "javascript:alert(1)" }] } },
  ]) {
    await page.route(`**/api/venues/${KEY}/menu-sources?c=u0nd9`, (route) =>
      route.fulfill(response),
    );
    await page.goto(`/bar/${KEY}?c=u0nd9`);
    const row = page
      .getByRole("dialog", { name: "Camparino in Galleria" })
      .locator("li.price")
      .first();
    await expect(row.getByRole("button", { name: "Confermo", exact: true })).toBeVisible();
    await expect(row.getByRole("link")).toHaveCount(0);
    await expect(row).not.toContainText("Dal menu ufficiale");
    await page.unroute(`**/api/venues/${KEY}/menu-sources?c=u0nd9`);
  }
});

test("closing and opening another real venue retires the older source response", async ({
  page,
}) => {
  await prices(page);
  await prices(page, OTHER);
  let release: (() => void) | undefined;
  let requested: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/venues/${KEY}/menu-sources?c=u0nd9`, async (route) => {
    requested?.();
    await delayed;
    await route
      .fulfill({ json: { prices: [{ ...quote, menu_item: "Old venue only" }] } })
      .catch(() => undefined);
  });
  await page.route(`**/api/venues/${OTHER}/menu-sources?c=u0nd9`, (route) =>
    route.fulfill({
      json: {
        prices: [{ ...quote, menu_url: "https://other.example/menu", menu_item: "New venue only" }],
      },
    }),
  );
  await page.goto(`/bar/${KEY}?c=u0nd9`);
  await started;
  await page
    .getByRole("dialog", { name: "Camparino in Galleria" })
    .getByRole("button", { name: "Chiudi", exact: true })
    .click();
  await page.getByRole("button", { name: "Elenco", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Bar nella zona" })
    .getByRole("link", { name: /^The Dome/ })
    .click();
  const second = page.getByRole("dialog", { name: "The Dome" });
  await expect(second).toContainText("New venue only");
  release?.();
  await expect(second).not.toContainText("Old venue only");
  await expect(second.getByRole("link", { name: "Apri il menu ufficiale" })).toHaveAttribute(
    "href",
    "https://other.example/menu",
  );
});
