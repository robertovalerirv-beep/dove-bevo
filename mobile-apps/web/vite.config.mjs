import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { transformApp, transformMap, mobileMapStyle } from "./build-contract.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = path.resolve(here, "../..");
const appFile = path.join(repo, "src/app/app.tsx").replaceAll("\\", "/");
const mapFile = path.join(repo, "src/app/lib/maplibre-map.ts").replaceAll("\\", "/");
let mapStyle;

export default defineConfig({
  root: here,
  base: "/",
  publicDir: false,
  cacheDir: path.join(here, ".build/vite-cache"),
  resolve: { alias: { "@site": path.join(repo, "src"), "@mobile": here } },
  plugins: [
    {
      name: "app-only-reviewed-presentation",
      enforce: "pre",
      buildStart() {
        const generated = readFileSync(
          path.join(repo, "src/app/lib/map-styles.generated.ts"),
          "utf8",
        );
        const sourcePath = generated.match(/light:\s*"([^"]+)"/)?.[1];
        if (!sourcePath?.startsWith("/map/") || sourcePath.includes(".."))
          throw new Error("Map style source changed");
        const original = JSON.parse(
          readFileSync(path.join(repo, "public", sourcePath.slice(1)), "utf8"),
        );
        mapStyle = this.emitFile({
          type: "asset",
          name: "mobile-map.json",
          source: JSON.stringify(mobileMapStyle(original)),
        });
      },
      resolveId(source, importer) {
        if (importer?.replaceAll("\\", "/").split("?")[0] !== appFile) return null;
        if (source === "./components/BarSheet") return path.join(here, "components/BarSheet.tsx");
        if (source === "./components/AddPriceSheet")
          return path.join(here, "components/AddPriceSheet.tsx");
        if (source === "./components/DrinkMenu")
          return path.join(here, "components/DrinkStrip.tsx");
        return null;
      },
      transform(code, id) {
        const file = id.replaceAll("\\", "/").split("?")[0];
        if (file === appFile) return { code: transformApp(code), map: null };
        if (file === mapFile)
          return { code: transformMap(code, `import.meta.ROLLUP_FILE_URL_${mapStyle}`), map: null };
        return null;
      },
    },
    preact(),
  ],
  build: {
    outDir: path.join(here, ".build/client"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/mobile/[name]-[hash].js",
        chunkFileNames: "assets/mobile/[name]-[hash].js",
        assetFileNames: "assets/mobile/[name]-[hash][extname]",
      },
    },
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        entryFileNames: "assets/mobile/[name]-[hash].js",
        chunkFileNames: "assets/mobile/[name]-[hash].js",
        assetFileNames: "assets/mobile/[name]-[hash][extname]",
      },
    },
  },
});
