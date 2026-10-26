import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { goToMilano } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("dovebevo.session-until", String(Date.now() + 3_600_000));
  });
});

test("a restricted confirmation explains the limit and can be retried after revocation without reauthentication", async ({
  page,
}) => {
  let attempts = 0,
    authentication = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/session")) authentication++;
  });
  await page.route("**/api/prices/confirm", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 429, json: { error: { code: "contribution_restricted" } } })
      : route.fulfill({ json: { status: "confirmed", confirmations: 2 } });
  });
  await page.goto("/bar/n5471678323?c=u0nd9");
  const row = page.getByRole("listitem").filter({ hasText: "Spritz" }).first();
  await row.getByRole("button", { name: "Confermo" }).click();
  await expect(row.getByRole("alert")).toContainText("I contributi sono temporaneamente limitati");
  await expect(row.getByRole("alert")).toContainText("Puoi ancora segnalare");
  expect(attempts).toBe(1);
  await row.getByRole("button", { name: "Confermo" }).click();
  await expect(row.getByRole("button", { name: "Confermato" })).toBeDisabled();
  expect(attempts).toBe(2);
  expect(authentication).toBe(0);
});

test("a restricted price keeps the draft and shows the restriction instead of the daily quota", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/prices", (route) => {
    attempts++;
    return route.fulfill({ status: 429, json: { error: { code: "contribution_restricted" } } });
  });
  await page.goto("/");
  await goToMilano(page);
  await page.getByRole("button", { name: "Aggiungi prezzo" }).click();
  await page.getByRole("searchbox", { name: "Cerca il bar per nome" }).fill("Straf Bar");
  await page
    .getByRole("list", { name: "Bar vicini" })
    .getByRole("button")
    .filter({ hasText: "Straf Bar" })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Spritz/ })
    .click();
  await page.getByRole("textbox", { name: "Prezzo in euro" }).fill("7,50");
  await page.getByRole("button", { name: "Salva" }).click();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("dialog")).toContainText(
    "I contributi sono temporaneamente limitati",
    { timeout: 40_000 },
  );
  await expect(page.getByRole("dialog")).not.toContainText("Per oggi hai segnato tanto");
  await expect(page.getByRole("textbox", { name: "Prezzo in euro" })).toHaveValue("7,50");
  expect(attempts).toBe(1);
});
