import { cpSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { checkNativeOutput, nativeBuildSettings, NATIVE_CSP } from "./native/build-policy.ts";

export default defineConfig(() => {
  const settings = nativeBuildSettings(process.env);
  const outDir = resolve("dist/native");
  return {
    // Deliberately no Cloudflare plugin, publicDir, env files, PWA or admin entry.
    envDir: false,
    publicDir: false,
    define: {
      "import.meta.env.VITE_NATIVE": JSON.stringify("true"),
      "import.meta.env.VITE_NATIVE_API_ORIGIN": JSON.stringify(settings.apiOrigin),
      "import.meta.env.VITE_DATA_VERSION": JSON.stringify(settings.dataVersion),
    },
    plugins: [
      preact(),
      {
        name: "native-csp",
        transformIndexHtml: (html) =>
          html.replace("%NATIVE_CSP%", NATIVE_CSP.replaceAll('"', "&quot;")),
      },
      {
        name: "native-reviewed-assets",
        closeBundle() {
          renameSync(resolve(outDir, "native/index.html"), resolve(outDir, "index.html"));
          // Copy only app assets. public/ may contain admin, deployment or fixture artifacts.
          for (const path of [
            "brand",
            "fonts",
            "map",
            "theme.js",
            "map-italia-light.jpg",
            "map-italia-dark.jpg",
          ]) {
            cpSync(resolve("public", path), resolve(outDir, path), { recursive: true });
          }
          if (settings.dataVersion === "fixture") {
            mkdirSync(resolve(outDir, "data"), { recursive: true });
            cpSync("tests/fixtures/data", resolve(outDir, "data/fixture"), { recursive: true });
          }
          writeFileSync(
            resolve(outDir, "native-build.json"),
            JSON.stringify({ ...settings, prototype: true, backendProvisioned: false }) + "\n",
          );
          // Assert output after all copies, so newly added public files cannot silently enter the shell.
          checkNativeOutput(outDir);
        },
      },
    ],
    build: {
      // Preview runtime baseline: iOS 16.4 WKWebView and updated Android System WebView.
      target: ["safari16.4", "chrome111"],
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      rolldownOptions: { input: resolve("native/index.html") },
    },
  };
});
