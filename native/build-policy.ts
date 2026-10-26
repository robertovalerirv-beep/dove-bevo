import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const PREVIEW_ORIGIN = "https://mobile-preview.dovebevo.com";
export const NATIVE_CSP = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' ${PREVIEW_ORIGIN} https://tiles.openfreemap.org; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;

/** Only the isolated preview is approved. Production needs verified HTTPS app links first. */
export function nativeBuildSettings(env: Record<string, string | undefined>) {
  if (env.NATIVE_CHANNEL === "release") {
    throw new Error(
      "Native release is disabled: preview identity, callback and resources are not release-ready",
    );
  }
  if (env.NATIVE_CHANNEL !== "preview") throw new Error("An explicit preview channel is required");
  const dataVersion = env.VITE_DATA_VERSION;
  if (!dataVersion || (dataVersion !== "fixture" && !/^\d{8}$/.test(dataVersion))) {
    throw new Error(
      "Explicit VITE_DATA_VERSION required: fixture for preview, or retained YYYYMMDD data",
    );
  }
  const apiOrigin = env.VITE_NATIVE_API_ORIGIN ?? PREVIEW_ORIGIN;
  if (apiOrigin !== PREVIEW_ORIGIN) throw new Error("Unreviewed native API origin");
  return { channel: "preview" as const, dataVersion, apiOrigin };
}

export function validateNativeConfig(config: {
  appId?: string;
  appName?: string;
  webDir?: string;
  server?: {
    url?: string;
    allowNavigation?: string[];
    cleartext?: boolean;
    hostname?: string;
    androidScheme?: string;
    iosScheme?: string;
  };
  plugins?: { CapacitorHttp?: { enabled?: boolean }; CapacitorCookies?: { enabled?: boolean } };
}) {
  if (config.server?.url !== undefined) throw new Error("server.url remote shell is forbidden");
  if (config.server?.allowNavigation !== undefined) throw new Error("allowNavigation is forbidden");
  if (
    config.appId !== "com.dovebevo.app.preview" ||
    config.appName !== "Dove bevo Preview" ||
    config.webDir !== "dist/native"
  ) {
    throw new Error("Native identity and output must be explicitly preview");
  }
  if (
    config.server?.cleartext !== false ||
    config.server.hostname !== "localhost" ||
    config.server.androidScheme !== "https" ||
    config.server.iosScheme !== "capacitor"
  ) {
    throw new Error("Only fixed local secure native origins are allowed");
  }
  if (
    config.plugins?.CapacitorHttp?.enabled !== false ||
    config.plugins.CapacitorCookies?.enabled !== false
  ) {
    throw new Error("Global HTTP/cookie patch is forbidden");
  }
}

export function checkNativeOutput(dir: string) {
  const metadata = JSON.parse(readFileSync(join(dir, "native-build.json"), "utf8")) as {
    channel?: string;
    dataVersion?: string;
    apiOrigin?: string;
  };
  nativeBuildSettings({
    NATIVE_CHANNEL: metadata.channel,
    VITE_DATA_VERSION: metadata.dataVersion,
    VITE_NATIVE_API_ORIGIN: metadata.apiOrigin,
  });
  const html = readFileSync(join(dir, "index.html"), "utf8");
  if (!html.includes(`http-equiv="Content-Security-Policy" content="${NATIVE_CSP}"`))
    throw new Error("Missing or unreviewed native HTML CSP");
  if (!html.includes("<title>Dove bevo Preview</title>"))
    throw new Error("Missing visible native preview marking");
  const walk = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isFile() ? [path] : walk(path);
    });
  const files = walk(dir);
  for (const path of files) {
    if (
      /admin|verifiedpage|coverage-|wrangler|(^|[\\/])sw\.js$|manifest\.webmanifest|mobile-auth\.html|\.env|\.dev\.vars|\.map$/i.test(
        path,
      )
    ) {
      throw new Error(`Forbidden native output: ${path}`);
    }
    if (/\.(?:js|mjs|html)$/.test(path)) {
      const content = readFileSync(path, "utf8");
      for (const forbidden of [
        "serviceWorker",
        "beforeinstallprompt",
        "/api/admin/",
        "TURNSTILE_SECRET",
        "SESSION_HMAC_KEY",
        "HASH_KEY",
        "BEGIN PRIVATE KEY",
      ]) {
        if (content.includes(forbidden))
          throw new Error(`Forbidden native output content: ${forbidden}`);
      }
    }
  }
  return files.length;
}
