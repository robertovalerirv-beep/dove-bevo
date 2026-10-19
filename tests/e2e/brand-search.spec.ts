import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { atHour, goToMilano, mapRegion, THEME_HOURS } from "./helpers";

// F4 of the brand package: search of bars by name in all Italy (M4-11…M4-16, ADR 0024).
// Read-only: no price is written. Fixture: Milano centro (9 cells), search fragments in data/s/.

const box = (page: Page) => page.getByRole("combobox", { name: "Cerca una città o un bar" });
const options = (page: Page) =>
  page.getByRole("listbox", { name: "Risultati" }).getByRole("option");
const openSearch = (page: Page) => page.getByRole("button", { name: "Cerca città o bar" }).click();

test("M4-12 a bar outside the loaded cells is found by name in two taps, with no /api request", async ({
  page,
}, info) => {
  const api: string[] = [];
  await page.goto("/");
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  let taps = 0;
  await openSearch(page);
  taps++;
  await box(page).fill("campar");
  const camparino = options(page).filter({ hasText: "Camparino in Galleria" });
  await expect(camparino).toBeVisible();
  await expect(camparino.locator("mark")).toHaveText("Campar");
  // Only the short list of approved user bars (ADR 0025); nothing typed is ever sent.
  expect(api.map((url) => new URL(url).pathname)).toEqual(["/api/venues/approved"]);
  expect(api.every((url) => !url.includes("campar"))).toBe(true);
  await page.screenshot({ path: info.outputPath("m4-12-risultati.png") });
  await camparino.click();
  taps++;
  expect(taps).toBe(2);
  await expect(page.getByRole("dialog", { name: "Camparino in Galleria" })).toBeVisible();
  await expect
    .poll(async () => Number(await mapRegion(page).getAttribute("data-zoom")), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(16.5);
});

test("M4-12 accents, case and word order do not matter; every word is needed", async ({ page }) => {
  await page.goto("/");
  await openSearch(page);
  const names = async () => (await options(page).allTextContents()).map((t) => t.trim());
  for (const q of ["caffe roma", "roma caf", "CAFFÈ ROMA"]) {
    await box(page).fill(q);
    await expect(options(page).filter({ hasText: "Caffè Romagna" })).toBeVisible();
    expect((await names()).some((n) => n.startsWith("Bar Porta Romana"))).toBe(false);
  }
  await box(page).fill("bar duomo");
  await expect(options(page).filter({ hasText: "Bar Duomo" }).first()).toBeVisible();
  const forward = (await names()).sort();
  expect(forward.some((n) => n.startsWith("Bistrot Duomo"))).toBe(false);
  await box(page).fill("duomo bar");
  await expect(options(page).filter({ hasText: "Bar Duomo" }).first()).toBeVisible();
  expect((await names()).sort()).toEqual(forward);
});

test("M4-13 searching never asks for the position", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { geoCalls: string[] }).geoCalls = calls;
    const geo = navigator.geolocation as unknown as Record<string, () => number>;
    for (const method of ["getCurrentPosition", "watchPosition"]) {
      geo[method] = () => {
        calls.push(method);
        return 0;
      };
    }
  });
  await page.goto("/");
  await goToMilano(page);
  await page.getByRole("button", { name: "Cerca città o bar" }).click();
  await box(page).fill("bar duomo");
  await expect(options(page).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { geoCalls: string[] }).geoCalls)).toEqual(
    [],
  );
});

test("M4-14 no result: the way to propose the bar, with the name already written", async ({
  page,
}) => {
  await page.goto("/");
  await openSearch(page);
  await box(page).fill("zzqxw");
  await expect(page.getByText("Non trovo questo locale").first()).toBeVisible();
  await page.getByRole("button", { name: "Non trovi il bar?" }).click();
  await expect(page.getByRole("textbox", { name: "Nome del bar" })).toHaveValue("zzqxw");
});

test("M4-14 a fragment that cannot be downloaded: gentle message, the cities still work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
  await page.route("**/data/fixture/s/**", (route) => route.abort());
  await page.goto("/");
  await openSearch(page);
  await box(page).fill("campar");
  await expect(
    page.getByText("Ricerca non disponibile ora, cerca una città.").first(),
  ).toBeVisible();
  await box(page).fill("milano");
  await expect(
    options(page)
      .filter({ hasText: /^Milano/ })
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("M4-14 a bar the admin hid: after the choice it says so", async ({ page }) => {
  await page.route("**/api/prices/u0nd9", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: { p: [], u: [], pend: [], h: ["n13001337602"] },
    }),
  );
  await page.goto("/");
  await openSearch(page);
  await box(page).fill("campar");
  await options(page).filter({ hasText: "Camparino in Galleria" }).click();
  await expect(page.getByText("Questo locale non è più sulla mappa.").first()).toBeVisible();
});

test("M4-15 combobox: arrows, Enter, Esc, announced count, 48 px targets", async ({ page }) => {
  await page.goto("/");
  await openSearch(page);
  const field = box(page);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await field.fill("milano");
  await expect(options(page).first()).toBeVisible();
  await expect(field).toHaveAttribute("aria-expanded", "true");
  const announced = page.getByRole("status").filter({ hasText: /risultat/ });
  await expect(announced).toBeVisible();
  // Places answer at once, bars come from a fragment a moment later: wait until the
  // announcement and the list agree, then check the count that is shown.
  const label = (n: number) => (n === 1 ? "1 risultato" : `${String(n)} risultati`);
  await expect
    .poll(async () => (await announced.textContent()) === label(await options(page).count()))
    .toBe(true);
  for (const o of await options(page).all()) {
    expect((await o.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
  }
  await page.keyboard.press("ArrowDown");
  const first = options(page).first();
  await expect(first).toHaveAttribute("aria-selected", "true");
  const id = await first.getAttribute("id");
  await expect(field).toHaveAttribute("aria-activedescendant", id ?? "");
  await page.keyboard.press("ArrowUp"); // wraps to the last
  await expect(options(page).last()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape"); // the first Esc clears the text…
  await expect(field).toHaveValue("");
  await expect(page.getByRole("dialog", { name: "Cerca" })).toBeVisible();
  await page.keyboard.press("Escape"); // …the second one closes
  await expect(page.getByRole("dialog", { name: "Cerca" })).toHaveCount(0);
  await openSearch(page);
  await box(page).fill("milano");
  await expect(options(page).first()).toBeVisible(); // the results come asynchronously
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Cerca" })).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`M4-15 ${scheme}: no axe violations; screenshots of the states`, async ({ page }, info) => {
    await atHour(page, THEME_HOURS[scheme]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await openSearch(page);
    await page.screenshot({ path: info.outputPath(`m4-15-vuoto-${scheme}.png`) });
    await box(page).fill("cam");
    await expect(options(page).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`m4-15-risultati-${scheme}.png`) });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await box(page).fill("zzqxw");
    await expect(page.getByText("Non trovo questo locale").first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`m4-15-nessuno-${scheme}.png`) });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("M4-15 with reduced motion the map jumps instead of flying", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openSearch(page);
  await box(page).fill("campar");
  await options(page).filter({ hasText: "Camparino in Galleria" }).click();
  // flyTo lasts 800 ms; a jump is already there a moment after the sheet closed.
  await expect
    .poll(async () => Number(await mapRegion(page).getAttribute("data-zoom")), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(16.9);
});

test("M4-16 a typical search downloads little and answers fast once the fragment is in memory", async ({
  page,
}) => {
  const downloads: number[] = [];
  page.on("response", async (r) => {
    if (new URL(r.url()).pathname.includes("/data/fixture/s/"))
      downloads.push((await r.text()).length);
  });
  await page.goto("/");
  await openSearch(page);
  await box(page).fill("camp");
  await expect(options(page).filter({ hasText: "Camparino" })).toBeVisible();
  const total = downloads.reduce((a, b) => a + b, 0);
  console.log(
    `M4-16 typical search: ${String(downloads.length)} files, ${String(total)} bytes (raw)`,
  );
  expect(total).toBeLessThanOrEqual(60 * 1024);
  // The same fragment again: no download, and the list changes within 150 ms.
  await expect.poll(() => downloads.length).toBeGreaterThanOrEqual(2); // index + fragment, both counted
  const before = downloads.length;
  const ms = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const input = document.querySelector<HTMLInputElement>('[role="combobox"]');
        if (!input) {
          resolve(-1);
          return;
        }
        // A MutationObserver sees the new list as soon as it is in the DOM; polling with
        // requestAnimationFrame added up to a frame and the runner's frame throttling.
        const list = document.querySelector('[role="listbox"]');
        const done = () => {
          const text = document.querySelector('[role="option"]')?.textContent ?? "";
          if (!text.includes("Camparino")) return false;
          observer.disconnect();
          resolve(performance.now() - start);
          return true;
        };
        const observer = new MutationObserver(done);
        observer.observe(list ?? document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        const start = performance.now();
        input.value = "campari";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }),
  );
  console.log(`M4-16 results with the fragment in memory: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(150);
  expect(downloads.length).toBe(before);
});

test("M4-04 «I più economici qui»: ordered, at most 10, only active prices", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page);
  await page.getByRole("button", { name: "Cerca città o bar" }).click();
  const list = page.getByRole("list", { name: "I più economici qui" });
  const rows = list.getByRole("button");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(10);
  const prices = (await list.locator(".row__price").allTextContents()).map((t) =>
    Number(t.replace(/[^\d,]/g, "").replace(",", ".")),
  );
  expect(prices).toEqual([...prices].sort((a, b) => a - b));
  // The seeded quarantined gin tonic (Terrazza Duomo? w549495264) never appears here.
  await page.getByRole("button", { name: "Chiudi" }).click();
  await page
    .getByRole("group", { name: "Drink" })
    .getByRole("button", { name: "Gin tonic" })
    .click();
  await page.getByRole("button", { name: "Cerca città o bar" }).click();
  await expect(page.getByRole("list", { name: "I più economici qui" })).toHaveCount(0);
});

test("ADR 0025 a bar added by hand («Namasce») is found by name and opens its sheet", async ({
  page,
}, info) => {
  const bar = ["u9001", "Namasce", 1, 45.4642, 9.19];
  let asked = 0;
  await page.route("**/api/venues/approved", (route) => {
    asked++;
    return route.fulfill({ json: { v: [bar] } });
  });
  await page.goto("/");
  await openSearch(page);
  await box(page).fill("namasce");
  const hit = options(page).filter({ hasText: "Namasce" });
  await expect(hit).toBeVisible();
  await expect(hit.locator("mark")).toHaveText("Namasce");
  await page.screenshot({ path: info.outputPath("adr0025-namasce-risultato.png") });
  await box(page).fill("namas");
  await expect(hit).toBeVisible();
  expect(asked).toBe(1); // once per visit, and the typed text never goes to the server
  await hit.click();
  await expect(page).toHaveURL(/\/bar\/u9001\?c=u0nd9$/);
  await expect
    .poll(async () => Number(await mapRegion(page).getAttribute("data-zoom")), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(16.5);
});
