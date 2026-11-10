/* global URL, location, document */
(() => {
  "use strict";
  const url = new URL(location.href);
  const path =
    url.pathname === "/mobile/" || url.pathname === "/mobile/index.html"
      ? url.searchParams.get("path")
      : url.pathname;
  const key = /^\/bar\/((?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24}))$/.exec(path || "")?.[1];
  const maps = document.querySelectorAll("section.map[data-selected]");
  const dialogs = document.querySelectorAll("dialog.sheet.sheet--bare[open]");
  if (
    !key ||
    maps.length !== 1 ||
    maps[0].getAttribute("data-selected") !== key ||
    dialogs.length !== 1 ||
    !dialogs[0].matches(":modal")
  )
    return { status: "no_venue" };
  const heading = dialogs[0].querySelector(
    ":scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name",
  );
  const name = heading?.textContent?.trim();
  if (
    !name ||
    name.length > 120 ||
    name !== dialogs[0].getAttribute("aria-label") ||
    !heading.getClientRects().length
  )
    return { status: "no_venue" };
  const list = document.querySelector(".mobile-drink-strip, .drink-menu__list");
  const chosen = [...(list?.querySelectorAll("input[type=checkbox]:checked") || [])];
  const legacyDrink =
    chosen.length === 1
      ? chosen[0]
          .closest(".drink-option")
          ?.querySelector(".drink-option__name, span")
          ?.textContent?.trim()
      : null;
  const legacyCodes = {
    "Birra media": "beer_draft",
    "Medium beer": "beer_draft",
    Spritz: "spritz",
    Negroni: "negroni",
    Sbagliato: "sbagliato",
    "Gin tonic": "gin_tonic",
    "Gin and tonic": "gin_tonic",
    "Gin lemon": "gin_lemon",
    Americano: "gin_lemon",
    "Calice di vino": "wine_glass",
    "Glass of wine": "wine_glass",
    Analcolico: "alcohol_free",
    "Non-alcoholic": "alcohol_free",
    Acqua: "water",
    Water: "water",
  };
  const europeSelects = document.querySelectorAll(".europe-app .europe-drinks select");
  const europeSelect = europeSelects.length === 1 ? europeSelects[0] : null;
  const europeOption =
    europeSelect?.selectedOptions?.length === 1 ? europeSelect.selectedOptions[0] : null;
  const europeCode =
    europeSelect?.getClientRects().length && europeOption?.value === europeSelect.value
      ? europeOption.value
      : null;
  const drinkCode = list
    ? legacyDrink && Object.hasOwn(legacyCodes, legacyDrink)
      ? legacyCodes[legacyDrink]
      : null
    : /^(?:beer_draft|spritz|negroni|sbagliato|gin_tonic|gin_lemon|wine_glass|alcohol_free|water)$/.test(
          europeCode || "",
        )
      ? europeCode
      : null;
  const drink = list ? legacyDrink : europeOption?.textContent?.trim();
  const band = document.querySelectorAll(".europe-app .europe-band input[type=checkbox]");
  const hh =
    band.length === 1 ? (band[0].checked ? 1 : 0) : url.searchParams.get("hh") === "1" ? 1 : 0;
  return {
    status: "ready",
    href: location.href,
    key,
    name,
    drink: drink && drink.length <= 80 ? drink : null,
    drinkCode,
    hh,
  };
})();
