import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { APP_NAME } from "./src/shared/config.ts";

export default defineConfig({
  plugins: [
    preact(),
    cloudflare(),
    // The app name lives in one constant (SPEC 1), also for the static <title>.
    { name: "app-name", transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME) },
  ],
});
