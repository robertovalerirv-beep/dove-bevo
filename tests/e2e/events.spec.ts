import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { mapRegion } from "./helpers";

// M5-01: one visit sends one anonymous beacon to /api/events when the page goes to the background.
test("a visit sends a single beacon, only when hidden, with closed-list events", async ({
  page,
}) => {
  // WebKit does not expose a beacon's body to Playwright: record what the page hands to sendBeacon.
  await page.addInitScript(() => {
    const sent: { url: string; body: Promise<string>; type: string }[] = [];
    (window as unknown as { __beacons: typeof sent }).__beacons = sent;
    navigator.sendBeacon = (url, data) => {
      const blob = data as Blob;
      sent.push({ url: String(url), body: blob.text(), type: blob.type });
      return true;
    };
  });
  const beacons = async () =>
    page.evaluate(async () => {
      const all = (
        window as unknown as { __beacons: { url: string; body: Promise<string>; type: string }[] }
      ).__beacons;
      return Promise.all(all.map(async (b) => ({ url: b.url, body: await b.body, type: b.type })));
    });
  await page.goto("/");
  await expect(mapRegion(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(await beacons()).toHaveLength(0); // nothing while the page is in use

  const hide = () =>
    page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  await hide();
  await expect.poll(async () => (await beacons()).length).toBe(1);
  await hide(); // nothing new happened: no second beacon
  await page.waitForTimeout(500);
  expect(await beacons()).toHaveLength(1);

  const [beacon] = await beacons();
  expect(beacon?.url).toBe("/api/events");
  expect(beacon?.type).toMatch(/^text\/plain/);
  expect(JSON.parse(beacon?.body ?? "")).toEqual({
    events: [{ e: "app_open", p: { day_bucket: "0" } }],
  });
});
