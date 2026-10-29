/* global document */
// Theme by time of day, before the first paint (SPEC D-27, ADR 0025). Same rule as src/shared/theme.ts:
// dark from 21:30 to 06:00 on the device clock, light otherwise. The build puts this text inside
// index.html (vite.config.ts, plugin inline-first-paint) and the Worker stamps it with the page nonce: no request
// blocks the first paint (ADR 0045). The file stays here for `npm run dev`; the app takes over the changes
// while it is open.
(function () {
  var now = new Date();
  var minutes = now.getHours() * 60 + now.getMinutes();
  var dark = minutes >= 21 * 60 + 30 || minutes < 6 * 60;
  var root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  // The first image of the app is chosen by the theme too, so it is fetched while the page is parsed. No fetchpriority:
  // high, it would compete with the script that draws the image (ADR 0045).
  var preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "image";
  preload.href = "/map-italia-" + (dark ? "dark" : "light") + ".webp";
  document.head.appendChild(preload);
})();
