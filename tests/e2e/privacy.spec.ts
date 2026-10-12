import { expect, test } from "@playwright/test";
import { DUOMO, mapRegion, waitForBars } from "./helpers";

// M1-14: the user's position never leaves the device (SPEC 14).
test.use({ geolocation: DUOMO, permissions: ["geolocation"] });

test("no request carries the simulated coordinates or their roundings", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    sent.push([r.url(), JSON.stringify(r.headers()), r.postData() ?? ""].join("\n"));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Vicino a me" }).click();
  await waitForBars(page);
  await page.getByRole("button", { name: "Elenco" }).click(); // distances are computed here
  await expect(page.getByRole("dialog", { name: "Bar nella zona" })).toContainText("m");
  await mapRegion(page).locator("canvas").focus();
  await page.waitForTimeout(500);

  // 45.46437, 9.18951 and any rounding to 2+ decimals (45.46, 45.464, 9.19, 9.190, 9.1895…)
  const leak = /45\.46\d*|9\.1[89]\d*/;
  expect(sent.length).toBeGreaterThan(5);
  expect(sent.filter((s) => leak.test(s))).toEqual([]);
});
