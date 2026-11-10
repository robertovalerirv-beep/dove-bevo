/* global URL, location, document, window, __DOVE_BEVO_SAVE_TARGET__ */
(() => {
  "use strict";
  const target = __DOVE_BEVO_SAVE_TARGET__;
  const current = new URL(location.href);
  if (
    window.top !== window ||
    current.origin !== "https://www.dovebevo.com" ||
    current.pathname !== "/mobile/" ||
    document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1"
  )
    return { status: "unavailable" };
  const sheets = document.querySelectorAll("dialog.sheet.sheet--bare[open]");
  if (sheets.length !== 1 || !sheets[0].matches(":modal")) return { status: "unavailable" };
  const heading = sheets[0].querySelector(".scontrino__name");
  const venueName = heading?.textContent?.trim();
  if (!venueName || venueName.length > 120 || !heading.getClientRects().length)
    return { status: "unavailable" };
  const links = [...sheets[0].querySelectorAll("a.mobile-menu-v2__save")].filter(
    (link) => link.href === target && link.getClientRects().length > 0,
  );
  if (links.length !== 1) return { status: "unavailable" };
  const label = links[0].getAttribute("aria-label") || "";
  const suffixes = [` da ${venueName} nei preferiti`, ` at ${venueName} to favourites`];
  const prefix = label.startsWith("Salva ") ? "Salva " : label.startsWith("Save ") ? "Save " : null;
  const suffix = suffixes.find((value) => label.endsWith(value));
  if (!prefix || !suffix) return { status: "unavailable" };
  const drinkName = label.slice(prefix.length, -suffix.length).trim();
  if (
    !drinkName ||
    drinkName.length > 120 ||
    [...drinkName].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return { status: "unavailable" };
  return { status: "ready", href: location.href, target, venueName, drinkName };
})();
