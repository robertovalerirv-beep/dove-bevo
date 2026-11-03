import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { CATALOG } from "@site/shared/catalog";
import { it } from "@site/app/i18n/lang";

interface Props {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/** App-only disclosure. Zero selected categories means Tutti; named categories remain multi-select. */
export function DrinkMenu({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const summary = selected.length
    ? CATALOG.filter((drink) => selected.includes(drink.code))
        .map((drink) => it.drinks[drink.code] ?? drink.code)
        .join(", ")
    : "Tutti";

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
      <button
        type="button"
        ref={toggle}
        class="mobile-drink-menu__button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span class="mobile-drink-menu__copy">
          <span class="mobile-drink-menu__title">{it.map.pickDrinks}</span>
          <span class="mobile-drink-menu__summary" data-testid="drink-summary">{summary}</span>
        </span>
        <span class="mobile-drink-menu__chevron" aria-hidden="true">⌄</span>
      </button>
      <div id={id} class="mobile-drink-strip" role="group" aria-label={it.map.drinks} hidden={!open}>
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
          Tutti
        </button>
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
      </div>
    </div>
  );
}
