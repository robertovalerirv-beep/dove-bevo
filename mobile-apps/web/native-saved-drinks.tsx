import { useEffect, useState } from "preact/hooks";

type NativeSavedWindow = Window & { DoveBevoNativeSavedDrinkKeys?: unknown };

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) < 32) return true;
  return false;
}

/** The native stores are the sole authority for private favourites. */
function currentKeys(): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set();
  const value = (window as NativeSavedWindow).DoveBevoNativeSavedDrinkKeys;
  if (!Array.isArray(value) || value.length > 2000) return new Set();
  const keys = value.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.length > 0 &&
      item.length <= 512 &&
      !hasControlCharacter(item),
  );
  return new Set(keys);
}

/** Native sends a fresh snapshot before ready and after every successful save or removal. */
export function useNativeSavedDrinks(): ReadonlySet<string> {
  const [keys, setKeys] = useState(currentKeys);
  useEffect(() => {
    const update = () => {
      setKeys(currentKeys());
    };
    window.addEventListener("dovebevo-native-ready", update);
    window.addEventListener("dovebevo-native-favourites-changed", update);
    update();
    return () => {
      window.removeEventListener("dovebevo-native-ready", update);
      window.removeEventListener("dovebevo-native-favourites-changed", update);
    };
  }, []);
  return keys;
}

/** Convert only an app-generated exact save command to the shared native identity. */
export function savedDrinkKey(href: string): string | null {
  const query = href.split("?")[1];
  if (!href.startsWith("/mobile/?") || !query) return null;
  const params = new URLSearchParams(query);
  const path = params.get("path") ?? "";
  const venue = /^\/bar\/([a-zA-Z0-9]+)$/.exec(path)?.[1];
  const cell = params.get("c") ?? "";
  if (!venue || !/^[a-z0-9]{5}$/.test(cell)) return null;
  const kind = ["save_offer", "save_drink", "save_customer", "save_europe"].filter((key) =>
    params.has(key),
  );
  const action = kind.length === 1 ? kind[0] : undefined;
  if (!action) return null;
  const id = params.get(action) ?? "";
  if (!id || id.includes("|")) return null;
  const base = `${venue}|${cell}|`;
  if (action === "save_offer") return `${base}offer|${id}`;
  if (action === "save_customer") return `${base}customer|${id}`;
  const band =
    params.get("band") === "happy_hour" ? "1" : params.get("band") === "normal" ? "0" : null;
  if (band === null) return null;
  if (action === "save_drink") return `${base}legacy|${id}|${band}`;
  const currency = params.get("currency") ?? "";
  const serving = params.get("serving") ?? "";
  if (!/^[A-Z]{3}$/.test(currency) || !serving || serving.includes("|")) return null;
  return `${base}europe|${id}|${band}|${currency}|${serving}`;
}

export function NativeSaveAction({
  href,
  name,
  venue,
  keys,
  className = "",
  english = false,
}: {
  href: string;
  name: string;
  venue: string;
  keys: ReadonlySet<string>;
  className?: string;
  english?: boolean;
}) {
  const key = savedDrinkKey(href);
  const saved = key !== null && keys.has(key);
  const cls = `btn btn--secondary mobile-menu-v2__save${className ? ` ${className}` : ""}`;
  if (saved)
    return (
      <span
        class={`${cls} mobile-menu-v2__save--saved`}
        aria-label={`${name} ${english ? "at" : "da"} ${venue}: ${english ? "saved in favourites" : "nei preferiti"}`}
        data-saved="true"
      >
        ★ {english ? "In favourites" : "Nei preferiti"}
      </span>
    );
  return (
    <a
      class={cls}
      href={href}
      aria-label={`${english ? "Save" : "Salva"} ${name} ${english ? "at" : "da"} ${venue} ${english ? "to favourites" : "nei preferiti"}`}
      data-saved="false"
    >
      ☆ {english ? "Save" : "Salva"}
    </a>
  );
}
