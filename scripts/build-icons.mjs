// Renders the app icons from docs/brand/assets/Logo/dovebevo-icona-app.svg (MB-16, ADR 0023).
// Output (committed): public/brand/icon-192.png, icon-512.png, icon-maskable-512.png, favicon.svg.
// Usage: node scripts/build-icons.mjs
import { copyFileSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const logo = "docs/brand/assets/Logo";
const icon = readFileSync(`${logo}/dovebevo-icona-app.svg`, "utf8");
// Maskable: full-bleed square and the symbol shrunk into the safe zone (20% margin each side).
const maskable = icon
  .replace(' rx="112"', "")
  .replace("<g ", '<g transform-origin="256 256" style="transform:scale(.6)" ')
  .replace(
    /<g transform-origin="256 256" style="transform:scale\(\.6\)" transform="([^"]*)"/,
    (_m, t) => `<g transform="translate(256,256) scale(.6) translate(-256,-256) ${t}"`,
  );

const browser = await chromium.launch();
const render = async (svg, size, out) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`)}</div></body>`,
  );
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
};
await render(icon, 192, "public/brand/icon-192.png");
await render(icon, 512, "public/brand/icon-512.png");
await render(maskable, 512, "public/brand/icon-maskable-512.png");
await browser.close();
copyFileSync(`${logo}/dovebevo-simbolo.svg`, "public/brand/favicon.svg");
console.log("icons written to public/brand/");
