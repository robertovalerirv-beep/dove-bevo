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
  const chosen = [...document.querySelectorAll(".drink-menu__list input[type=checkbox]:checked")];
  if (chosen.length !== 1) return { status: "choose_one" };
  const drink = chosen[0].closest(".drink-option")?.querySelector(".drink-option__name")?.textContent?.trim();
  if (!drink || drink.length > 80) return { status: "choose_one" };
  return { status: "ready", href: location.href, key, name, drink };
})()
