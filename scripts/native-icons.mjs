import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

// Render the approved original vector at platform dimensions; never ship Capacitor's sample logo.
const original = readFileSync("docs/brand/assets/Logo/dovebevo-icona-app.svg", "utf8");
const fullBleed = original.replace(' rx="112"', "");
const splash = fullBleed.replace('<g transform="', '<g transform="translate(192,192) scale(.25) ');
const tokens = JSON.parse(readFileSync("docs/brand/tokens.json", "utf8"));
const color = (name) => tokens.color.tokens.find((token) => token.name === name).value.light;
writeFileSync(
  "android/app/src/main/res/values/brand-colors.xml",
  `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated from docs/brand/tokens.json by native-icons.mjs. -->\n<resources>\n<color name="colorPrimary">${color("spritz")}</color>\n<color name="colorPrimaryDark">${color("ink")}</color>\n<color name="colorAccent">${color("spritz")}</color>\n<color name="ic_launcher_background">${color("spritz")}</color>\n</resources>\n`,
);
const browser = await chromium.launch({ channel: process.env.NATIVE_ICON_BROWSER });
try {
  async function render(svg, size, path) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`,
    );
    await page.screenshot({ path, omitBackground: false });
    await page.close();
  }
  await render(
    fullBleed,
    1024,
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  );
  for (const file of readdirSync("ios/App/App/Assets.xcassets/Splash.imageset")) {
    if (file.endsWith(".png"))
      await render(splash, 2732, `ios/App/App/Assets.xcassets/Splash.imageset/${file}`);
  }
  for (const [density, size] of [
    ["mdpi", 48],
    ["hdpi", 72],
    ["xhdpi", 96],
    ["xxhdpi", 144],
    ["xxxhdpi", 192],
  ]) {
    const dir = `android/app/src/main/res/mipmap-${density}`;
    for (const file of ["ic_launcher.png", "ic_launcher_round.png"])
      await render(fullBleed, size, join(dir, file));
    const safe = fullBleed.replace('<g transform="', '<g transform="translate(128,128) scale(.5) ');
    await render(safe, size * 3, join(dir, "ic_launcher_foreground.png"));
  }
  // Adaptive icons use the density-specific brand PNG, not the sample Android robot vector.
  for (const file of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const path = `android/app/src/main/res/mipmap-anydpi-v26/${file}`;
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "@drawable/ic_launcher_foreground",
        "@mipmap/ic_launcher_foreground",
      ),
    );
  }
  // Replace default launch images with the brand symbol on its own brand background.
  for (const dir of readdirSync("android/app/src/main/res", { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith("drawable"),
  )) {
    for (const file of readdirSync(join(dir.parentPath, dir.name))) {
      if (file === "splash.png") await render(splash, 512, join(dir.parentPath, dir.name, file));
    }
  }
} finally {
  await browser.close();
}
