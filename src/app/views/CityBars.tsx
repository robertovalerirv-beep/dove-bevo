import { useEffect, useRef, useState } from "preact/hooks";
import { searchKey } from "../../shared/venue";
import { it } from "../i18n/it";
import { invalidateCell, loadCell, type Venue } from "../lib/data";
import { formatDate, formatPrice, formatSize } from "../lib/format";

// The bars of one city that have a public price, for the admin (ADR 0022). Which bars come from the
// coverage calculation; names, addresses and prices from the map data the public app reads.

interface Props {
  name: string;
  /** Where to open the map for this city; null when the city is not on the map data. */
  at: [lat: number, lon: number] | null;
  members: [key: string, cell: string][];
  onBack: () => void;
}

interface Item {
  key: string;
  cell: string;
  venue: Venue | null;
}

const CELLS_AT_ONCE = 6;

export function CityBars({ name, at, members, onBack }: Props) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
  }, []);

  useEffect(() => {
    let current = true;
    setItems(null);
    setFailed(false);
    // Only the cells that hold these bars, read afresh (the visit cache would show old prices after
    // an "Aggiorna") and a few at a time: the public cell read is rate limited.
    const cells = [...new Set(members.map((m) => m[1]))];
    cells.forEach(invalidateCell);
    void (async () => {
      const lists: Venue[][] = [];
      for (let i = 0; i < cells.length; i += CELLS_AT_ONCE)
        lists.push(...(await Promise.all(cells.slice(i, i + CELLS_AT_ONCE).map(loadCell))));
      return lists;
    })()
      .then((lists) => {
        if (!current) return;
        const byKey = new Map(lists.flat().map((v) => [v.key, v]));
        const found = members.map(([key, cell]): Item => ({
          key,
          cell,
          venue: byKey.get(key) ?? null,
        }));
        const label = (i: Item) => searchKey(i.venue?.name ?? i.key);
        setItems(found.sort((a, b) => label(a).localeCompare(label(b))));
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [members, attempt]);

  return (
    <section class="cov__city-bars" aria-labelledby="cov-city-title">
      <button type="button" class="btn btn--secondary" onClick={onBack}>
        {it.admin.coverage.back}
      </button>
      <h3 id="cov-city-title" tabIndex={-1} ref={title}>
        {name}
      </h3>
      <p class="hint" aria-live="polite">
        {failed
          ? ""
          : items
            ? it.admin.coverage.barsCount(members.length)
            : it.admin.coverage.loadingBars}
      </p>
      {at && (
        <a class="btn btn--secondary" href={`/?at=${String(at[0])},${String(at[1])}`}>
          {it.admin.coverage.showMap}
        </a>
      )}
      {failed && (
        <>
          <p class="error" role="alert">
            {it.admin.coverage.barsFailed}
          </p>
          <button
            type="button"
            class="btn btn--secondary"
            onClick={() => {
              setAttempt((n) => n + 1);
              title.current?.focus(); // the button is about to unmount: keep the focus in the list
            }}
          >
            {it.admin.coverage.retry}
          </button>
        </>
      )}
      {items && (
        <ul class="cov__bars" data-testid="coverage-bars">
          {items.map(({ key, cell, venue }) => (
            <li key={key}>
              <strong>{venue?.name ?? key}</strong>
              <span class="cov__sub cov__sub--always">
                {venue
                  ? venue.addr || (key.startsWith("u") ? it.admin.coverage.addedByUser : "")
                  : it.admin.coverage.notInMap}
              </span>
              {(venue?.prices ?? [])
                .filter((p) => p[7] === 0)
                .sort((a, b) => a[1].localeCompare(b[1]) || a[2] - b[2] || a[3] - b[3])
                .map((p) => (
                  <p class="cov__price" key={`${p[1]}-${String(p[2])}-${String(p[3])}`}>
                    {[
                      [it.drinks[p[1]] ?? p[1], formatSize(p[2])].join(" ").trim(),
                      p[3] ? it.bar.happyHour : "",
                      formatPrice(p[4]),
                      formatDate(p[5]),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ))}
              <a class="btn btn--secondary" href={`/bar/${key}?c=${cell}`}>
                {it.admin.coverage.openBar}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
