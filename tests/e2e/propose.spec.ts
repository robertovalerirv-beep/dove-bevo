import { expect, test, type Page } from "@playwright/test";
import { goToMilano, mapRegion } from "./helpers";

// M3-11 (v1.1, ADR 0019): "Non trovi il bar?" → name → kind → pin on the map → send. The bar stays
// pending until the admin approves it. Turnstile is Cloudflare's script: stubbed as in contribute.spec.
const TURNSTILE_STUB = `window.turnstile = {
  render(el, o) { setTimeout(() => o.callback("XXXX.DUMMY.TOKEN.XXXX"), 50); return "w"; },
  remove() {}, reset() {},
};`;

/** A name with letters only: digits in a row would read as a phone number. */
const uniqueName = () =>
  `Bar Prova ${Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")}`;

/** The user moves the map under the cross: 60 px at zoom 17 is about 25 m (negative: back the other way). */
async function dragMap(page: Page, pixels = 60) {
  const box = await mapRegion(page).boundingBox();
  if (!box) throw new Error("no map");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + pixels, y + pixels, { steps: 4 });
  if (pixels !== 0) await page.waitForTimeout(250); // stand still before letting go: no inertia
  await page.mouse.up();
}

async function startProposal(page: Page, name: string) {
  // D-28: the missing bar is reached from the Bar step of "Aggiungi prezzo".
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await page.getByRole("button", { name: "Non trovi il bar?" }).click();
  await page.getByRole("textbox", { name: "Nome del bar" }).fill(name);
  await page.getByRole("button", { name: "Avanti" }).click();
}

test("M3-11 a proposed bar: pin, send, then its price can be added at once", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/**", (route) => {
    void route.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB });
  });
  await page.goto("/");
  await goToMilano(page);

  const name = uniqueName();
  // The first try can meet a missing session (401): Turnstile runs and the same request is repeated.
  const answered = page.waitForResponse(
    (r) => r.url().endsWith("/api/venues") && r.request().method() === "POST" && r.status() !== 401,
  );
  await startProposal(page, name);

  // The map zooms in on the pin; the confirm button waits until it is close enough.
  const pin = page.getByRole("region", { name: `Dov'è «${name}»?` });
  await expect(pin).toBeVisible();
  await expect(page.getByTestId("pin-mark")).toBeVisible();
  const confirm = pin.getByRole("button", { name: "Conferma e invia" });
  await expect(mapRegion(page)).toHaveAttribute("data-zoom", /^1[6-9]|^2/, { timeout: 20_000 });
  // Where the map started could be the device's position: the pin must be moved away from it
  // (more than 10 m, not a tap) before it can be sent (SPEC 14, ADR 0021).
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dragMap(page, 0); // a tap does not place the pin
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dragMap(page);
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  const center = (await mapRegion(page).getAttribute("data-center")) ?? "";
  await confirm.click();

  const response = await answered;
  const request = response.request();
  const body = request.postDataJSON() as { name: string; kind: number; lat: number; lon: number };
  expect(body).toMatchObject({ name, kind: 1 });
  // Only the pin the user confirmed is sent, to 5 decimals: it is the map centre, not a position.
  const [lat = 0, lon = 0] = center.split(",").map(Number);
  expect(Math.abs(body.lat - lat)).toBeLessThan(0.0005);
  expect(Math.abs(body.lon - lon)).toBeLessThan(0.0005);
  expect(String(body.lat).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(5);
  expect(response.status()).toBe(200);

  await expect(
    page.getByRole("status").filter({ hasText: "Roberto controlla che esista" }),
  ).toBeVisible();
  // The price of the new bar can be added at once: the drink step is open for it.
  await expect(page.getByRole("dialog").getByRole("heading", { name })).toBeVisible();

  // Pending: never on the map nor in the bar list of the map (D-05).
  await page.keyboard.press("Escape"); // closes the add sheet
  await page.getByRole("button", { name: "Elenco" }).click();
  await expect(page.getByRole("dialog").getByText(name)).toHaveCount(0);
  await page.keyboard.press("Escape"); // closes the list

  // In the bar choice of "Aggiungi prezzo" it appears as new, to be confirmed.
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await page.getByRole("searchbox", { name: "Cerca il bar per nome" }).fill(name);
  await expect(
    page.getByRole("list", { name: "Bar vicini" }).getByRole("button", { name: new RegExp(name) }),
  ).toContainText("Nuovo, da confermare");
});

test("M3-12 the same bar proposed twice leads to the existing one (409)", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/**", (route) => {
    void route.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB });
  });
  await page.goto("/");
  await goToMilano(page);
  const name = uniqueName();
  for (const attempt of [1, 2]) {
    const answered = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/venues") && r.request().method() === "POST" && r.status() !== 401,
    );
    await startProposal(page, name);
    const confirm = page.getByRole("button", { name: "Conferma e invia" });
    await expect(mapRegion(page)).toHaveAttribute("data-zoom", /^1[6-9]|^2/, { timeout: 20_000 });
    // The second time the pin goes back to the first spot (25 m away from where the map starts).
    await dragMap(page, attempt === 1 ? 60 : -60);
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    await confirm.click();
    expect((await answered).status()).toBe(attempt === 1 ? 200 : 409);
    await expect(page.getByRole("dialog").getByRole("heading", { name })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("M3-12 a name with a link is refused before leaving the device", async ({ page }) => {
  await page.goto("/");
  await goToMilano(page);
  await startProposal(page, "Visita www.esempio.it");
  await expect(page.getByRole("alert").filter({ hasText: "senza link" })).toBeVisible();
});

test("M3-19 an API answered with the app page is a polite wait, not an error", async ({ page }) => {
  test.slow(); // the map loads MapLibre first: slow under the parallel load of the whole suite
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/api/prices/*", (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html></html>",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Cerca" }).click();
  await page.getByRole("searchbox", { name: "Cerca una città o un bar" }).fill("milano");
  await page
    .getByRole("list", { name: "Città e paesi" })
    .getByRole("button", { name: /^Milano/ })
    .first()
    .click();
  await expect(page.getByTestId("map-status")).toHaveText(
    "Il servizio è molto richiesto, riprova più tardi.",
    { timeout: 30_000 },
  );
  expect(errors.filter((e) => !e.includes("Failed to load resource"))).toEqual([]);
});

test("M3-11 the same proposal is reachable from Aggiungi prezzo (Non trovi il bar?)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Aggiungi locale mancante" })).toHaveCount(0);
  await page.screenshot({ path: "docs/screenshots/m3/home-390.png" });
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await page.getByRole("button", { name: "Non trovi il bar?" }).click();
  await expect(page.getByRole("textbox", { name: "Nome del bar" })).toBeFocused();
});
