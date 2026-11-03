/* global URL, location, document */
(() => {
  "use strict";
  const url = new URL(location.href);
  const path = url.pathname === "/mobile/" || url.pathname === "/mobile/index.html"
    ? url.searchParams.get("path") : url.pathname;
  const key = /^\/bar\/((?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24}))$/.exec(path || "")?.[1];
  const maps = document.querySelectorAll("section.map[data-selected]");
  const dialogs = document.querySelectorAll("dialog.sheet.sheet--bare[open]");
  if (!key || maps.length !== 1 || maps[0].getAttribute("data-selected") !== key
      || dialogs.length !== 1 || !dialogs[0].matches(":modal"))
    return { status: "no_venue" };
  const heading = dialogs[0].querySelector(":scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name");
  const name = heading?.textContent?.trim();
  if (!name || name.length > 120 || name !== dialogs[0].getAttribute("aria-label")
      || !heading.getClientRects().length)
    return { status: "no_venue" };
  const list = document.querySelector(".mobile-drink-strip, .drink-menu__list");
  const chosen = [...(list?.querySelectorAll("input[type=checkbox]:checked") || [])];
  const drink = chosen.length === 1
    ? chosen[0].closest(".drink-option")?.querySelector(".drink-option__name, span")?.textContent?.trim()
    : null;
  return { status: "ready", href: location.href, key, name,
    drink: drink && drink.length <= 80 ? drink : null };
})()
