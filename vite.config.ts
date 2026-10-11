import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { it } from "./src/app/i18n/it.ts";
import { APP_NAME } from "./src/shared/config.ts";

export default defineConfig({
  plugins: [
    preact(),
    cloudflare(),
    // Name and description come from their single sources (SPEC 1, it.ts) also in the static HTML.
    {
      name: "html-texts",
      transformIndexHtml: (html) =>
        html
          .replaceAll("%APP_NAME%", APP_NAME)
          .replaceAll("%APP_DESCRIPTION%", it.meta.description),
    },
  ],
});
