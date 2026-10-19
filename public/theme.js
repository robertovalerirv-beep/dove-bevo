/* global document */
// Theme by time of day, before the first paint (SPEC D-27, ADR 0025). Same rule as src/shared/theme.ts:
// dark from 21:30 to 06:00 on the device clock, light otherwise. A classic script in <head> because
// the CSP allows no inline script; the app takes over the changes while it is open.
(function () {
  var now = new Date();
  var minutes = now.getHours() * 60 + now.getMinutes();
  var dark = minutes >= 21 * 60 + 30 || minutes < 6 * 60;
  var root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  // The first image of the app is chosen by the theme too, so it is fetched while the page is parsed.
  var preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "image";
  preload.href = "/map-italia-" + (dark ? "dark" : "light") + ".jpg";
  preload.setAttribute("fetchpriority", "high");
  document.head.appendChild(preload);
})();
