import type { Venue } from "@site/app/lib/data";
import { it } from "@site/app/i18n/lang";
import { Icon } from "@site/app/components/Icon";

/** Show the actual leading town in the loaded map area, never infer a GPS location. */
export function MapSearchButton({
  venues,
  onOpen,
}: {
  venues: readonly Venue[];
  onOpen: () => void;
}) {
  const counts = new Map<string, number>();
  for (const venue of venues)
    if (venue.city) counts.set(venue.city, (counts.get(venue.city) ?? 0) + 1);
  const city = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return (
    <button
      type="button"
      class="btn search-field"
      data-dovebevo-search="1"
      aria-label={city ? `${city} · ${it.search.open}` : it.search.open}
      aria-description={city}
      onClick={onOpen}
    >
      <span class="mobile-map-city">{city ?? it.search.open}</span>
      <Icon name="search" />
    </button>
  );
}
