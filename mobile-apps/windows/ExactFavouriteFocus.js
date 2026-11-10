/* global URL, location, document, window, __DOVE_BEVO_EXACT_TARGET__ */
(() => {
  "use strict";
  const target = __DOVE_BEVO_EXACT_TARGET__;
  const current = new URL(location.href);
  const saved = new URL(target);
  if (
    window.top !== window ||
    current.origin !== "https://www.dovebevo.com" ||
    current.pathname !== "/mobile/" ||
    saved.origin !== current.origin ||
    saved.pathname !== "/mobile/" ||
    !saved.searchParams.has("save_europe") ||
    current.searchParams.get("path") !== saved.searchParams.get("path") ||
    current.searchParams.get("c") !== saved.searchParams.get("c") ||
    document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1"
  )
    return false;
  const sheets = document.querySelectorAll("dialog.sheet.sheet--bare[open]");
  if (sheets.length !== 1 || !sheets[0].matches(":modal")) return false;
  const links = [...sheets[0].querySelectorAll("a.europe-price__save")].filter(
    (link) => link.href === target && link.getClientRects().length > 0,
  );
  if (links.length !== 1) return false;
  const row = links[0].closest("li.price.mobile-price");
  if (!row || !row.getClientRects().length || !sheets[0].contains(row)) return false;
  row.setAttribute("data-dovebevo-exact-favourite", "1");
  row.style.outline = "3px solid #ff5a1f";
  row.style.outlineOffset = "2px";
  row.scrollIntoView({ block: "center", behavior: "auto" });
  return true;
})();
