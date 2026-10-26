import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

// This is a bundled-shell test with a mocked native bridge. It is not device evidence.
const nativeRoot = fileURLToPath(new URL("../../dist/native/", import.meta.url).href);
test.skip(
  !existsSync(join(nativeRoot, "index.html")),
  "Build the native preview before these tests",
);
async function serveNative(page: Page) {
  await page.route("https://native.example/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const path = join(nativeRoot, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!path.startsWith(nativeRoot) || /[%\\]/.test(pathname) || !existsSync(path))
      return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ path });
  });
}

async function bridge(page: Page) {
  await page.addInitScript(() => {
    interface Options {
      eventName?: string;
      url?: string;
      headers?: Record<string, string>;
      data?: string;
    }
    interface ProofWindow {
      androidBridge: object;
      Capacitor: object;
      nativeEvents: Record<string, (value: object) => void>;
      nativeRequests: Options[];
      nativeExits: number;
    }
    const proof = window as unknown as ProofWindow;
    proof.androidBridge = {};
    proof.nativeEvents = {};
    proof.nativeRequests = [];
    proof.nativeExits = 0;
    const methods = (names: string[]) => names.map((name) => ({ name, rtype: "promise" }));
    proof.Capacitor = {
      PluginHeaders: [
        { name: "DoveBevoHttp", methods: methods(["request"]) },
        {
          name: "App",
          methods: [
            ...methods(["getLaunchUrl", "exitApp"]),
            { name: "addListener", rtype: "callback" },
          ],
        },
        {
          name: "Browser",
          methods: [...methods(["open", "close"]), { name: "addListener", rtype: "callback" }],
        },
        {
          name: "Geolocation",
          methods: methods(["checkPermissions", "requestPermissions", "getCurrentPosition"]),
        },
      ],
      nativeCallback: (
        _plugin: string,
        _method: string,
        options: Options,
        callback: (value: object) => void,
      ) => {
        if (options.eventName) proof.nativeEvents[options.eventName] = callback;
        return Promise.resolve("listener");
      },
      nativePromise: (plugin: string, method: string, options: Options = {}) => {
        if (plugin === "DoveBevoHttp") {
          proof.nativeRequests.push(options);
          const path = new URL(options.url ?? "https://invalid.example").pathname;
          const body: unknown =
            path === "/api/mobile/config"
              ? {
                  version: 1,
                  clientId: "com.dovebevo.app.preview",
                  callbackUrl: "dovebevopreview://auth/callback",
                  challengePath: "/mobile-auth",
                  dataVersion: "fixture",
                }
              : path.endsWith("/places.json") || path.endsWith("/s/index.json")
                ? []
                : path.startsWith("/api/prices/")
                  ? { p: [], u: [], pend: [], h: [], g: [] }
                  : path.startsWith("/data/")
                    ? { c: [], v: [] }
                    : path === "/api/venues/approved"
                      ? { v: [] }
                      : {};
          return Promise.resolve({
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
        }
        if (plugin === "Geolocation")
          return Promise.resolve({ location: "denied", coarseLocation: "denied" });
        if (method === "getLaunchUrl") return Promise.resolve(undefined);
        if (method === "exitApp") proof.nativeExits += 1;
        return Promise.resolve({});
      },
    };
  });
}

test("native missing bridge exposes an Italian retry instead of web authentication", async ({
  page,
}) => {
  await serveNative(page);
  await page.goto("https://native.example/");
  await expect(page.getByRole("status")).toContainText("Anteprima non disponibile");
  await expect(page.getByRole("button", { name: "Riprova", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aggiungi prezzo", exact: true })).toHaveCount(0);
});

test("native denial retains search, back closes the overlay, lifecycle events stay anonymous", async ({
  page,
}) => {
  await serveNative(page);
  await bridge(page);
  await page.goto("https://native.example/");
  await expect(page.getByRole("button", { name: "Aggiungi prezzo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Vicino a me", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { nativeEvents: Record<string, (value: object) => void> }
    ).nativeEvents.backButton?.({});
  });
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.evaluate(() => {
    (
      window as unknown as { nativeEvents: Record<string, (value: object) => void> }
    ).nativeEvents.appStateChange?.({ isActive: false });
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { nativeRequests: { url: string }[] }).nativeRequests.some(
          (request) => request.url.endsWith("/api/mobile/events"),
        ),
      ),
    )
    .toBe(true);
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          nativeRequests: { url: string; headers: Record<string, string>; data?: string }[];
        }
      ).nativeRequests,
  );
  expect(
    requests.every(
      (request) => !Object.keys(request.headers).some((key) => /authorization|cookie/i.test(key)),
    ),
  ).toBe(true);
  expect(requests.some((request) => /latitude|longitude|45\.4|9\.1/.test(request.data ?? ""))).toBe(
    false,
  );
});
