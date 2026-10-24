// Renders the Instagram post slides to PNG (1080×1350) with the project Playwright (as scripts/build-icons.mjs).
// Usage: node docs/brand/social/instagram/render.mjs [post folder, default post-01]
import { chromium } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), process.argv[2] ?? "post-01");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto(pathToFileURL(join(dir, "slide.html")).href);
await page.evaluate("document.fonts.ready");
const slides = await page.locator("section.slide").all();
for (const [i, slide] of slides.entries()) {
  await slide.screenshot({ path: join(dir, `${i + 1}.png`) });
}
await browser.close();
console.log(`${slides.length} slide in ${dir}`);
