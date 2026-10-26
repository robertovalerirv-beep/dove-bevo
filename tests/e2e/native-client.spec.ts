import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { atHour, THEME_HOURS } from "./helpers";

// This is a bundled-shell test with a mocked native bridge. It is not device evidence.
const nativeRoot = fileURLToPath(new URL("../../dist/native/", import.meta.url).href);
async function serveNative(page: Page) {
  await page.route("https://native.example/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const path = join(
      nativeRoot,
      /^\/(?:privacy|regole)?\/?$/.test(pathname) ? "index.html" : pathname.slice(1),
    );
    if (!path.startsWith(nativeRoot) || /[%\\]/.test(pathname) || !existsSync(path))
      return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ path });
  });
}

async function bridge(page: Page, holdConfig = false) {
  await page.addInitScript((holdConfig) => {
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
      nativeOpens: string[];
      nativeConfigRespond: ((status: number) => void) | null;
    }
    const proof = window as unknown as ProofWindow;
    proof.androidBridge = {};
    proof.nativeEvents = {};
    proof.nativeRequests = [];
    proof.nativeExits = 0;
    proof.nativeOpens = [];
    proof.nativeConfigRespond = null;
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
          const response = {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          };
          if (holdConfig && path === "/api/mobile/config") {
            return new Promise((resolve) => {
              proof.nativeConfigRespond = (status) => {
                proof.nativeConfigRespond = null;
                resolve({ ...response, status });
              };
            });
          }
          return Promise.resolve(response);
        }
        if (plugin === "Geolocation")
          return Promise.resolve({ location: "denied", coarseLocation: "denied" });
        if (method === "getLaunchUrl") return Promise.resolve(undefined);
        if (method === "exitApp") proof.nativeExits += 1;
        if (plugin === "Browser" && method === "open" && options.url)
          proof.nativeOpens.push(options.url);
        return Promise.resolve({});
      },
    };
  }, holdConfig);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`native startup and retry have page margins and touch bounds in ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await atHour(page, THEME_HOURS[colorScheme]);
    await serveNative(page);
    await bridge(page, true);
    await page.goto("https://native.example/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    const root = page.locator("#app");
    await expect(root).toHaveText("Caricamento anteprima…");
    const loading = await root.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: text.x,
        y: text.y,
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(loading.x).toBeGreaterThanOrEqual(16);
    expect(loading.y).toBeGreaterThanOrEqual(16);
    expect(loading.padding.map(Number.parseFloat).every((value) => value >= 16)).toBe(true);
    expect(loading.overflow).toBe(false);
    await expect(page.getByRole("button", { name: "Riprova", exact: true })).toHaveCount(0);
    const respond = (status: number) =>
      page.evaluate((status) => {
        const proof = window as unknown as {
          nativeConfigRespond: ((status: number) => void) | null;
        };
        if (!proof.nativeConfigRespond) throw new Error("Native config request was not waiting");
        proof.nativeConfigRespond(status);
      }, status);
    await expect
      .poll(() =>
        page.evaluate(
          () => typeof (window as unknown as { nativeConfigRespond: unknown }).nativeConfigRespond,
        ),
      )
      .toBe("function");
    await respond(503);
    const message = page.getByRole("status").filter({
      hasText: "Anteprima non disponibile. Controlla la connessione e riprova.",
    });
    await expect(message).toHaveText(
      "Anteprima non disponibile. Controlla la connessione e riprova.",
    );
    const retry = page.getByRole("button", { name: "Riprova", exact: true });
    await expect(retry).toBeVisible();
    const bounds = await retry.boundingBox();
    const messageBounds = await message.boundingBox();
    expect(bounds).not.toBeNull();
    expect(messageBounds).not.toBeNull();
    if (!bounds || !messageBounds) throw new Error("Startup controls have no visible bounds");
    expect(bounds.width).toBeGreaterThanOrEqual(48);
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    expect(bounds.x).toBeGreaterThanOrEqual(16);
    expect(bounds.y).toBeGreaterThanOrEqual(messageBounds.y + messageBounds.height + 16);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(374);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(828);
    await page.screenshot({ path: testInfo.outputPath("native-startup-unavailable.png") });
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    await retry.press("Enter");
    await expect(root).toHaveText("Caricamento anteprima…");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { nativeRequests: { url: string }[] }).nativeRequests.filter(
              (request) => request.url.endsWith("/api/mobile/config"),
            ).length,
        ),
      )
      .toBe(2);
    await respond(200);
    await expect(page.getByRole("button", { name: "Aggiungi prezzo", exact: true })).toBeVisible();
    await expect(root).not.toHaveClass(/native-startup/);
    await expect(root).toHaveCSS("padding", "0px");
    await expect(page.getByText("Caricamento anteprima…", { exact: true })).toHaveCount(0);
    await expect(message).toHaveCount(0);
  });
}

test("native legal support email permits OS handoff without admitting other protocols", async ({
  page,
}) => {
  await serveNative(page);
  await bridge(page);
  await page.goto("https://native.example/privacy");
  const support = page.getByRole("link", { name: "dovebevo@gmail.com", exact: true });
  await expect(support).toBeVisible();
  // Observe the real app listener's decision, then stop the desktop test browser
  // from launching a mail client. The native OS handoff still requires a device check.
  await page.evaluate(() => {
    const proof = window as unknown as {
      nativeLinkDecisions: { href: string; prevented: boolean }[];
    };
    proof.nativeLinkDecisions = [];
    document.addEventListener("click", (event) => {
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.origin === location.origin) return;
      proof.nativeLinkDecisions.push({ href: link.href, prevented: event.defaultPrevented });
      event.preventDefault();
    });
  });
  await support.click();
  const decisions = () =>
    page.evaluate(
      () =>
        (window as unknown as { nativeLinkDecisions: { href: string; prevented: boolean }[] })
          .nativeLinkDecisions,
    );
  expect(await decisions()).toEqual([{ href: "mailto:dovebevo@gmail.com", prevented: false }]);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { nativeOpens: string[] }).nativeOpens),
  ).toEqual([]);

  const rejected = [
    "mailto:other@example.com",
    "mailto:dovebevo@gmail.com?bcc=other@example.com",
    "mailto:dovebevo@gmail.com,other@example.com",
    "mailto:dovebevo@gmail.com#extra",
    "tel:+39000000000",
    "intent://email/#Intent;scheme=mailto;end",
    "https://evil.example/",
    "https://www.dovebevo.com.evil.example/",
    "https://user@maps.apple.com/",
    "https://maps.apple.com:8443/",
  ];
  for (const href of rejected) {
    await page.evaluate((value) => {
      const link = document.createElement("a");
      link.href = value;
      document.body.append(link);
      link.click();
    }, href);
  }
  expect((await decisions()).slice(1)).toEqual(rejected.map((href) => ({ href, prevented: true })));
  await expect(page.getByRole("status")).toHaveCount(rejected.length);
  expect(
    await page.evaluate(() => (window as unknown as { nativeOpens: string[] }).nativeOpens),
  ).toEqual([]);

  const allowed = [
    "https://maps.apple.com/?daddr=45.4%2C9.1",
    "https://www.openstreetmap.org/?mlat=45.4&mlon=9.1",
    "https://www.dovebevo.com/bar/n1?c=u0nd9",
  ];
  for (const href of allowed) {
    await page.evaluate((value) => {
      const link = document.createElement("a");
      link.href = value;
      document.body.append(link);
      link.click();
    }, href);
  }
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { nativeOpens: string[] }).nativeOpens))
    .toEqual(allowed);
  expect((await decisions()).slice(1 + rejected.length)).toEqual(
    allowed.map((href) => ({ href, prevented: true })),
  );
});

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
