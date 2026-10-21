// Inline SVG icons, 24 px grid, 2 px stroke, currentColor, decorative (labels are always visible text).
// The drink icons come from docs/brand/assets/Icone (MB-05), one per catalog code (SPEC 6).
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 6l-6 6 6 6",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16 16l5 5",
  locate: "M12 3v3M12 18v3M3 12h3M18 12h3M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  directions: "M12 2l9 9-9 9-9-9 9-9zM9 13v-2h5V9l3 3-3 3v-2h-3",
  beer_draft:
    "M5 8h10v11.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 19.5ZM15 10.5h2a2.5 2.5 0 0 1 2.5 2.5v1.5A2.5 2.5 0 0 1 17 17h-2M4.5 8c0-2 1.6-3.2 3.2-2.6.9-1.7 3.7-1.7 4.6 0 1.6-.6 3.2.6 3.2 2.6M8.5 12v5M11.5 12v5",
  spritz:
    "M4.5 4.5h11c0 5.5-2.5 8.5-5.5 8.5s-5.5-3-5.5-8.5ZM10 13v6.5M6.5 20.5h7M14.5 4.5a3.75 3.75 0 0 0 7.5 0ZM18.25 4.5v3.2",
  gin_tonic:
    "M6 3h11l-1.3 17.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8ZM6.6 9h9.8M9.46 11.63l3.91.83-.83 3.91-3.91-.83ZM14.5 3a3.5 3.5 0 0 1 6 1.5l-4.5 1",
  negroni:
    "M5 9h14l-1.2 10.8a1.5 1.5 0 0 1-1.5 1.2H7.7a1.5 1.5 0 0 1-1.5-1.2ZM5.6 13h12.8M15 9a3 3 0 0 1 5.5-1.7",
  wine_glass: "M7 3h10c0 5.5-2.2 8.5-5 8.5S7 8.5 7 3ZM7.4 6.5h9.2M12 11.5v8.5M8 20.5h8",
  alcohol_free:
    "M6 8h12l-1.4 12.2a1 1 0 0 1-1 .8H8.4a1 1 0 0 1-1-.8ZM13.5 13 16.5 3h3M10 16h.01M11 12.2h.01",
  sbagliato:
    "M5 9h14l-1.2 10.8a1.5 1.5 0 0 1-1.5 1.2H7.7a1.5 1.5 0 0 1-1.5-1.2ZM5.6 13h12.8M9.5 5.5v.01M12.5 3.5v.01M15.5 5.5v.01",
  gin_lemon:
    "M6 3h8.5l-1.3 17.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8ZM6.6 9h7.4M14.5 6.5a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM17.5 3.5v6M14.5 6.5h6",
  water: "M7 4h10l-1.4 15.7a1.5 1.5 0 0 1-1.5 1.3H9.9a1.5 1.5 0 0 1-1.5-1.3ZM7.6 11h8.8",
} as const;

export type IconName = keyof typeof PATHS;

/** A drink code of the catalog has an icon; anything else falls back to the glass of water. */
export const drinkIcon = (code: string): IconName => (code in PATHS ? (code as IconName) : "water");

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
