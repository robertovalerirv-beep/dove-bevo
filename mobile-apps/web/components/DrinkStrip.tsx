import { CATALOG } from "@site/shared/catalog";
import { it } from "@site/app/i18n/lang";

interface Props {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/** Original multi-select rules, presented as permanently visible app chips. */
export function DrinkMenu({ selected, onChange }: Props) {
  return (
    <div class="mobile-drink-strip" role="group" aria-label={it.map.drinks}>
      <button
        type="button"
        class="mobile-drink-all"
        aria-pressed={selected.length === 0}
        onClick={() => onChange([])}
      >
        Tutti
      </button>
      {CATALOG.map((drink) => {
        const checked = selected.includes(drink.code),
          last = checked && selected.length === 1;
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
  );
}
