import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { CATALOG } from "@site/shared/catalog";
import { currentLang, it } from "@site/app/i18n/lang";

interface Props {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

const menuCopy = {
  it: {
    all: "Tutti",
    choose: "Scegli cosa bere",
    group: "Filtra la mappa per drink",
  },
  en: {
    all: "All",
    choose: "Choose a drink",
    group: "Filter map by drink",
  },
} as const;

/** App-only disclosure. Zero selected categories means Tutti; named categories remain multi-select. */
export function DrinkMenu({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const copy = menuCopy[currentLang()];
  const summary = selected.length
    ? CATALOG.filter((drink) => selected.includes(drink.code))
        .map((drink) => it.drinks[drink.code] ?? drink.code)
        .join(", ")
    : copy.all;

  useLayoutEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  return (
    <div
      class="mobile-drink-menu"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
        if (event.key === "Tab" && open) {
          setTimeout(() => {
            if (!root.current?.contains(document.activeElement)) setOpen(false);
          }, 0);
        }
      }}
    >
      <div class="mobile-drink-quick" role="group" aria-label={copy.group}>
        <button
          type="button"
          ref={toggle}
          class="mobile-drink-menu__button"
          data-selected={selected.length ? "true" : undefined}
          aria-label={`${copy.choose}: ${summary}`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <span class="mobile-drink-menu__label">{copy.choose}</span>
          <span class="mobile-drink-menu__summary" data-testid="drink-summary">
            {summary}
          </span>
          <span class="mobile-drink-menu__chevron" aria-hidden="true">
            ⌄
          </span>
        </button>
      </div>
      <div
        id={id}
        class="mobile-drink-strip"
        role="group"
        aria-label={it.map.drinks}
        hidden={!open}
      >
        {CATALOG.map((drink) => {
          const checked = selected.includes(drink.code);
          const last = checked && selected.length === 1;
          return (
            <label class="drink-option" key={drink.code}>
              <input
                class="sr-only"
                type="checkbox"
                checked={checked}
                aria-disabled={last ? "true" : undefined}
                onClick={(event) => {
                  if (last) event.preventDefault();
                }}
                onChange={() => {
                  if (last) return;
                  onChange(
                    checked
                      ? selected.filter((code) => code !== drink.code)
                      : CATALOG.filter(
                          (item) => item.code === drink.code || selected.includes(item.code),
                        ).map((item) => item.code),
                  );
                }}
              />
              <span>{it.drinks[drink.code] ?? drink.code}</span>
            </label>
          );
        })}
        <button
          type="button"
          class="mobile-drink-all"
          aria-pressed={selected.length === 0}
          onClick={() => {
            onChange([]);
            setOpen(false);
            toggle.current?.focus();
          }}
        >
          {copy.all}
        </button>
      </div>
    </div>
  );
}
