import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { it } from "./src/app/i18n/it.ts";
import { APP_NAME } from "./src/shared/config.ts";

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

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
          .replaceAll("%APP_DESCRIPTION%", escapeHtml(it.meta.description)),
    },
  ],
});
