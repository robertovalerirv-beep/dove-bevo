/* global Buffer, Image, document, btoa */
// Converts the start-view pictures of the map (docs/brand/assets/map/*.jpg, captured from our own OpenFreeMap
// styles, ADR 0014) to WebP for the page: ~65 % lighter, same size, supported by every browser we serve (ADR 0045).
// No new dependency: the canvas of the Chromium that Playwright already installs does the encoding.
// Output (committed): public/map-italia-light.webp, public/map-italia-dark.webp.
// Usage: node scripts/build-map-images.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const QUALITY = 0.65;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const theme of ["light", "dark"]) {
  const jpg = readFileSync(`docs/brand/assets/map/map-italia-${theme}.jpg`).toString("base64");
  const webp = await page.evaluate(
    async ([data, quality]) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/webp", quality));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(text);
    },
    [jpg, QUALITY],
  );
  const out = `public/map-italia-${theme}.webp`;
  writeFileSync(out, Buffer.from(webp, "base64"));
  console.log(`${out}: ${Buffer.from(webp, "base64").length} bytes`);
}
await browser.close();
