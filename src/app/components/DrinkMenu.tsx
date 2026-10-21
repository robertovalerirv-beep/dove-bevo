import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { CATALOG } from "../../shared/catalog";
import { it } from "../i18n/it";
import { drinkIcon, Icon } from "./Icon";

interface Props {
  /** Codes of the drinks the map is filtered on; never empty. */
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/**
 * «Scegli cosa bere»: one button that opens a list of check boxes, one per drink of the catalog.
 * The map shows the bars that have at least one of the chosen drinks. The last check cannot be
 * removed: the map always has a drink to show a price for.
 */
export function DrinkMenu({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // A tap outside closes the list; Escape closes it and gives the focus back to the button. A layout
  // effect, so the listener is there in the same frame the list appears.
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

  const names = CATALOG.filter((d) => selected.includes(d.code)).map(
    (d) => it.drinks[d.code] ?? d.code,
  );

  return (
    <div
      class="drink-menu"
      ref={root}
      onKeyDown={(event) => {
        // Tabbing out of the list leaves it open over the map: close it once the focus is gone.
        if (event.key === "Tab" && open) {
          setTimeout(() => {
            if (!root.current?.contains(document.activeElement)) setOpen(false);
          }, 0);
        }
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        type="button"
        class="chip drink-menu__button"
        ref={button}
        aria-expanded={open}
        aria-controls="drink-menu-list"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Icon name={drinkIcon(selected[0] ?? "")} />
        <span class="drink-menu__text">
          <span class="drink-menu__title">{it.map.pickDrinks}</span>
          <span class="drink-menu__summary" data-testid="drink-summary">
            {names.join(", ")}
          </span>
        </span>
        <span class="drink-menu__chevron" aria-hidden="true" />
      </button>
      <div
        id="drink-menu-list"
        class="drink-menu__list"
        role="group"
        aria-label={it.map.drinks}
        hidden={!open}
      >
        {CATALOG.map((d) => {
          const checked = selected.includes(d.code);
          const last = checked && selected.length === 1;
          return (
            <label key={d.code} class="drink-option">
              <input
                type="checkbox"
                class="sr-only"
                checked={checked}
                // aria-disabled keeps the focus on the box (WCAG 2.4.3); the tap is cancelled, so the
                // box stays checked.
                aria-disabled={last ? "true" : undefined}
                onClick={(event) => {
                  if (last) event.preventDefault();
                }}
                onChange={() => {
                  if (last) return;
                  onChange(
                    checked
                      ? selected.filter((code) => code !== d.code)
                      : CATALOG.filter((o) => o.code === d.code || selected.includes(o.code)).map(
                          (o) => o.code,
                        ),
                  );
                }}
              />
              <Icon name={drinkIcon(d.code)} />
              <span class="drink-option__name">{it.drinks[d.code] ?? d.code}</span>
              <span class="drink-option__box" aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </div>
  );
}
