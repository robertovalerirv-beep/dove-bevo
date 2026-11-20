/* global URL, location, document, window, getComputedStyle */
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
  if (![2, 3, 4].includes(parts.length)) return null;
  if (url.searchParams.getAll("path").length !== 1 ||
      url.searchParams.getAll("c").length !== 1 ||
      parts.some(([key]) => !["path", "c", "drink", "hh", "offer"].includes(key)) ||
      !/^[0-9b-hjkmnp-z]{5}$/.test(url.searchParams.get("c") || "")) return null;
  const selected = /^\/bar\/((?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24}))$/.exec(url.searchParams.get("path") || "");
  if (!selected) return null;
  const offerId = url.searchParams.get("offer");
  if (parts.length === 3 && (url.searchParams.getAll("offer").length !== 1 ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(offerId || ""))) return null;
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
  const headings = [...sheets[0].querySelectorAll(
    ":scope > .sheet__body > .scontrino > .scontrino__paper h2.scontrino__name")].filter(visible);
  const markers = [...document.querySelectorAll('[data-dovebevo-share="1"]')].filter(visible);
  if (headings.length !== 1 || headings[0].textContent.trim() !== sheets[0].getAttribute("aria-label")) return null;
  const spotlight = [...sheets[0].querySelectorAll(
    'li.mobile-menu-v2__offer--focused[data-testid="featured-menu-price"]')].filter(visible);
  if (markers.length > 0 && spotlight.length > 0) return null;
  if (offerId !== null || (parts.length === 2 && markers.length === 0 && spotlight.length === 1)) {
    if (markers.length !== 0) return null;
    if (spotlight.length !== 1) return null;
    const row = spotlight[0];
    const names = [...row.querySelectorAll(":scope > .mobile-menu-v2__name")].filter(visible);
    const amounts = [...row.querySelectorAll(":scope > .mobile-menu-v2__amount")].filter(visible);
    const source = [...row.querySelectorAll(":scope > .mobile-menu-v2__source")].filter(visible);
    const notes = [...row.querySelectorAll(":scope > .mobile-menu-v2__meta")].filter(visible);
    const saves = [...row.querySelectorAll(":scope .mobile-menu-v2__quick-actions > .mobile-menu-v2__save")].filter(visible);
    if (names.length !== 1 || amounts.length !== 1 || source.length !== 1 ||
        notes.length !== 2 || saves.length !== 1) return null;
    const name = [...names[0].childNodes].filter((node) => node.nodeType === 3)
      .map((node) => node.textContent).join(" ").trim();
    if (!name || name.length > 512 || !/^Menu verificato il [0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(source[0].textContent.trim()) ||
        notes[1].textContent.trim() !== "Prezzo del drink da menu, non totale pagato. Supplementi separati.") return null;
    const save = saves[0];
    let selectedOffer = offerId || "";
    if (save.tagName === "A") {
      const target = new URL(save.getAttribute("href") || "", location.href);
      if (target.origin !== url.origin || target.pathname !== "/mobile/" || target.hash ||
          [...target.searchParams].length !== 3 ||
          target.searchParams.getAll("path").length !== 1 || target.searchParams.get("path") !== `/bar/${selected[1]}` ||
          target.searchParams.getAll("c").length !== 1 || target.searchParams.get("c") !== url.searchParams.get("c") ||
          target.searchParams.getAll("save_offer").length !== 1) return null;
      selectedOffer = target.searchParams.get("save_offer") || "";
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(selectedOffer) ||
          (offerId !== null && selectedOffer !== offerId)) return null;
    } else if (save.tagName !== "SPAN" || save.getAttribute("data-saved") !== "true" ||
        save.getAttribute("aria-label") !== `${name} da ${headings[0].textContent.trim()}: nei preferiti`) return null;
    const place = sheets[0].querySelector(".scontrino__paper .bar__kind");
    return {
      kind: "offer", href: url.href, venue: selected[1],
      venueName: headings[0].textContent.trim(), offer: selectedOffer, drinkName: name,
      amountLabel: amounts[0].textContent.trim(), serving: notes[0].textContent.trim(),
      provenance: `${notes[1].textContent.trim()} ${source[0].textContent.trim()}`,
      location: visible(place) ? place.textContent.trim() : "",
    };
  }
  if (markers.length !== 1 || !sheets[0].contains(markers[0])) return null;
  const marker = markers[0];
  if (marker.dataset.venue !== selected[1] ||
      marker.dataset.venueName !== headings[0].textContent.trim() ||
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
