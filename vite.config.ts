import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { it } from "./src/app/i18n/it.ts";
import { APP_NAME } from "./src/shared/config.ts";
import { mapWarmupMeta, mapWarmupPaths } from "./scripts/map-warmup.ts";
import { renderSw } from "./scripts/sw.ts";
import type { BrandTokens } from "./scripts/tokens.ts";

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const tokens = JSON.parse(readFileSync("docs/brand/tokens.json", "utf8")) as BrandTokens;
const THEME_COLOR = tokens.color.tokens.find((t) => t.name === "spritz")?.value.light ?? "";

/** Files of the shell the service worker keeps: the page, the entry chunk with its static imports and CSS, fonts, icons. */
const PUBLIC_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/theme.js",
  "/map-italia-light.webp",
  "/map-italia-dark.webp",
  "/brand/favicon.svg",
  "/brand/simbolo.svg",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  ...readdirSync("public/fonts")
    .filter((f) => f.endsWith(".woff2"))
    .map((f) => `/fonts/${f}`),
];

export default defineConfig({
  plugins: [
    preact(),
    cloudflare(),
    // Name and description come from their single sources (SPEC 1, it.ts) also in the static HTML.
    {
      name: "html-texts",
      transformIndexHtml: (html) =>
        html
          .replaceAll("%APP_NAME%", escapeHtml(APP_NAME))
          .replaceAll("%APP_DESCRIPTION%", escapeHtml(it.meta.description))
          .replaceAll("%THEME_COLOR%", THEME_COLOR),
    },
    // Nothing blocks the first paint: the theme script and the stylesheet travel inside the page.
    {
      name: "inline-first-paint",
      transformIndexHtml: {
        order: "post",
        handler(html, ctx) {
          if (!ctx.bundle) return html;
          const theme = readFileSync("public/theme.js", "utf8");
          let out = html.replace(
            '<script src="/theme.js"></script>',
            () => `<script>${theme}</script>`,
          );
          out = out.replace(
            /<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/,
            (tag, file: string) => {
              const asset = ctx.bundle?.[file];
              if (asset?.type !== "asset") return tag;
              const css = String(asset.source);
              // Inside the page now. The file stays, empty: the lazy chunks list it among their dependencies and
              // a missing file would reject their import() ("Unable to preload CSS"); empty, it costs a few bytes once.
              asset.source = "";
              return `<style>${css}</style>`;
            },
          );
          return out;
        },
      },
    },
    // SPEC 1.12: tells the page which hashed files make the map, so it can fetch them ahead
    // of time. Build only: under the dev server there is no meta tag and nothing is fetched ahead.
    {
      name: "map-warmup",
      transformIndexHtml: {
        order: "post",
        handler(html, ctx) {
          if (!ctx.bundle) return html;
          const meta = mapWarmupMeta(mapWarmupPaths(Object.keys(ctx.bundle)));
          return meta ? html.replace("</head>", `${meta}</head>`) : html;
        },
      },
    },
    // SPEC 7.7: a hand-written service worker with the list of shell files of this build.
    {
      name: "service-worker",
      generateBundle(_options, bundle) {
        if (this.environment.name !== "client") return;
        const urls = new Set(PUBLIC_SHELL);
        const entry = Object.values(bundle).find((o) => o.type === "chunk" && o.isEntry);
        // The stylesheet of the entry travels inside index.html (plugin inline-first-paint): no file to keep.
        const inlined = new Set(
          entry?.type === "chunk" ? (entry.viteMetadata?.importedCss ?? []) : [],
        );
        const walk = (name: string) => {
          const chunk = bundle[name];
          if (chunk?.type !== "chunk" || urls.has(`/${name}`)) return;
          urls.add(`/${name}`);
          for (const css of chunk.viteMetadata?.importedCss ?? [])
            if (!inlined.has(css)) urls.add(`/${css}`);
          for (const next of chunk.imports) walk(next);
        };
        if (entry) walk(entry.fileName);
        const list = [...urls].sort();
        const version = createHash("sha256").update(list.join(",")).digest("hex").slice(0, 10);
        this.emitFile({ type: "asset", fileName: "sw.js", source: renderSw(list, version) });
      },
    },
  ],
});
