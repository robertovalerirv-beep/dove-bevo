import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkNativeOutput,
  nativeBuildSettings,
  validateNativeConfig,
  NATIVE_CSP,
} from "../../native/build-policy.ts";

describe("isolated native build policy", () => {
  it("requires an explicit preview and data version, including fixture", () => {
    expect(() => nativeBuildSettings({})).toThrow(/preview/);
    expect(() => nativeBuildSettings({ NATIVE_CHANNEL: "preview" })).toThrow(/DATA_VERSION/);
    expect(
      nativeBuildSettings({ NATIVE_CHANNEL: "preview", VITE_DATA_VERSION: "fixture" }).dataVersion,
    ).toBe("fixture");
  });

  it("refuses release identities and fixture or missing release data", () => {
    for (const version of [undefined, "fixture", "20261024"]) {
      expect(() =>
        nativeBuildSettings({ NATIVE_CHANNEL: "release", VITE_DATA_VERSION: version }),
      ).toThrow(/release/);
    }
    expect(() =>
      nativeBuildSettings({ NATIVE_CHANNEL: "preview", VITE_DATA_VERSION: "../fixture" }),
    ).toThrow(/DATA_VERSION/);
  });

  it("accepts only the reviewed exact HTTPS preview origin", () => {
    for (const origin of [
      "https://www.dovebevo.com",
      "https://evil.example",
      "http://mobile-preview.dovebevo.com",
      "https://mobile-preview.dovebevo.com.evil.example",
      "https://mobile-preview.dovebevo.com/path",
    ]) {
      expect(() =>
        nativeBuildSettings({
          NATIVE_CHANNEL: "preview",
          VITE_DATA_VERSION: "fixture",
          VITE_NATIVE_API_ORIGIN: origin,
        }),
      ).toThrow(/origin/);
    }
  });

  it("rejects remote shells, navigation allowlists and unsafe bridge patching", () => {
    const config = {
      appId: "com.dovebevo.app.preview",
      appName: "Dove bevo Preview",
      webDir: "dist/native",
      server: {
        hostname: "localhost",
        androidScheme: "https",
        iosScheme: "capacitor",
        cleartext: false,
      },
      plugins: { CapacitorHttp: { enabled: false }, CapacitorCookies: { enabled: false } },
    };
    expect(() => {
      validateNativeConfig(config);
    }).not.toThrow();
    expect(() => {
      validateNativeConfig({
        ...config,
        server: { ...config.server, url: "https://www.dovebevo.com" },
      });
    }).toThrow(/server.url/);
    expect(() => {
      validateNativeConfig({ ...config, server: { ...config.server, allowNavigation: ["*"] } });
    }).toThrow(/allowNavigation/);
    expect(() => {
      validateNativeConfig({ ...config, plugins: { CapacitorHttp: { enabled: true } } });
    }).toThrow(/patch/);
  });

  it("inspects real output files and rejects admin, service workers and fixture release data", () => {
    const dir = mkdtempSync(join(tmpdir(), "dovebevo-native-"));
    try {
      writeFileSync(
        join(dir, "index.html"),
        `<title>Dove bevo Preview</title><meta http-equiv="Content-Security-Policy" content="${NATIVE_CSP}">`,
      );
      writeFileSync(
        join(dir, "native-build.json"),
        JSON.stringify({ channel: "preview", dataVersion: "fixture" }),
      );
      expect(() => checkNativeOutput(dir)).not.toThrow();
      writeFileSync(
        join(dir, "native-build.json"),
        JSON.stringify({
          channel: "preview",
          dataVersion: "fixture",
          apiOrigin: "https://evil.example",
        }),
      );
      expect(() => checkNativeOutput(dir)).toThrow(/origin/);
      writeFileSync(
        join(dir, "native-build.json"),
        JSON.stringify({ channel: "preview", dataVersion: "fixture" }),
      );
      mkdirSync(join(dir, "assets"));
      writeFileSync(join(dir, "assets", "AdminPage-test.js"), "export {};");
      expect(() => checkNativeOutput(dir)).toThrow(/admin/i);
      rmSync(join(dir, "assets"), { recursive: true });
      writeFileSync(join(dir, "sw.js"), "self.addEventListener('fetch',()=>{});");
      expect(() => checkNativeOutput(dir)).toThrow(/sw.js/);
      rmSync(join(dir, "sw.js"));
      writeFileSync(join(dir, "main.js"), 'navigator.serviceWorker.register("/sw.js")');
      expect(() => checkNativeOutput(dir)).toThrow(/serviceWorker/);
      rmSync(join(dir, "main.js"));
      writeFileSync(
        join(dir, "native-build.json"),
        JSON.stringify({ channel: "release", dataVersion: "fixture" }),
      );
      expect(() => checkNativeOutput(dir)).toThrow(/release/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
