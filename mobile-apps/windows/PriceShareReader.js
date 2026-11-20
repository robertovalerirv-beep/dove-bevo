/* Read only the single visible featured public price in the selected venue. */
(() => {
  "use strict";
  if (window.top !== window || document.visibilityState !== "visible" ||
      document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1") return null;
  const url = new URL(location.href);
  if (url.protocol !== "https:" || !["www.dovebevo.com", "dovebevo.com"].includes(url.hostname) ||
      url.username || url.password || url.port || url.hash ||
      !["/mobile/", "/mobile/index.html"].includes(url.pathname)) return null;
  const parts = [...url.searchParams];
  if (parts.length !== 2 && parts.length !== 4) return null;
  if (url.searchParams.getAll("path").length !== 1 ||
      url.searchParams.getAll("c").length !== 1 ||
      parts.some(([key]) => !["path", "c", "drink", "hh"].includes(key)) ||
      !/^[0-9b-hjkmnp-z]{5}$/.test(url.searchParams.get("c") || "")) return null;
  const selected = /^\/bar\/((?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24}))$/.exec(url.searchParams.get("path") || "");
  if (!selected) return null;
  if (parts.length === 4 && (url.searchParams.getAll("drink").length !== 1 ||
      url.searchParams.getAll("hh").length !== 1 ||
      !/^[01]$/.test(url.searchParams.get("hh") || ""))) return null;
  const maps = document.querySelectorAll("section.map[data-selected]");
  if (maps.length !== 1 || maps[0].getAttribute("data-selected") !== selected[1]) return null;
  const visible = (node) => {
    if (!node || !node.isConnected) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.inert || parent.getAttribute("aria-hidden") === "true" ||
          style.display === "none" || style.visibility !== "visible" ||
          style.contentVisibility === "hidden" || Number(style.opacity) <= 0) return false;
    }
    const box = node.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport ? viewport.offsetLeft : 0, top = viewport ? viewport.offsetTop : 0;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;
    return node.getClientRects().length > 0 &&
      [box.x, box.y, box.width, box.height, left, top, width, height].every(Number.isFinite) &&
      box.width > 0 && box.height > 0 && box.right > left && box.left < left + width &&
      box.bottom > top && box.top < top + height;
  };
  const sheets = document.querySelectorAll("dialog.sheet.sheet--bare[open]");
  if (document.querySelectorAll("dialog[open]").length !== 1 || sheets.length !== 1 ||
      !sheets[0].matches(":modal") || !visible(sheets[0])) return null;
  const heading = sheets[0].querySelector(":scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name");
  const markers = [...document.querySelectorAll('[data-dovebevo-share="1"]')].filter(visible);
  if (!visible(heading) || markers.length !== 1 ||
      !sheets[0].contains(markers[0])) return null;
  const marker = markers[0];
  if (marker.dataset.venue !== selected[1] ||
      marker.dataset.venueName !== heading.textContent.trim() ||
      marker.dataset.venueName !== sheets[0].getAttribute("aria-label")) return null;
  const fields = ["version", "venue", "venueName", "drink", "drinkName", "hh",
    "amountMinor", "currency", "serving", "provenance", "confirmations", "tier", "location"];
  const result = { href: location.href };
  for (const field of fields) {
    const value = marker.dataset[field];
    if (typeof value !== "string" || value.length > 1024) return null;
    result[field] = value;
  }
  return result;
})();
