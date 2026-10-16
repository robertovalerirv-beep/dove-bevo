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
  beer_bottle:
    "M10 2.5h4M10.5 2.5v4.2c0 .9-.5 1.6-1.2 2.2A3.5 3.5 0 0 0 8 11.6V20a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20v-8.4a3.5 3.5 0 0 0-1.3-2.7c-.7-.6-1.2-1.3-1.2-2.2V2.5M8 14h8",
  spritz:
    "M4.5 4.5h11c0 5.5-2.5 8.5-5.5 8.5s-5.5-3-5.5-8.5ZM10 13v6.5M6.5 20.5h7M14.5 4.5a3.75 3.75 0 0 0 7.5 0ZM18.25 4.5v3.2",
  gin_tonic:
    "M6 3h11l-1.3 17.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8ZM6.6 9h9.8M9.46 11.63l3.91.83-.83 3.91-3.91-.83ZM14.5 3a3.5 3.5 0 0 1 6 1.5l-4.5 1",
  negroni:
    "M5 9h14l-1.2 10.8a1.5 1.5 0 0 1-1.5 1.2H7.7a1.5 1.5 0 0 1-1.5-1.2ZM5.6 13h12.8M15 9a3 3 0 0 1 5.5-1.7",
  wine_glass: "M7 3h10c0 5.5-2.2 8.5-5 8.5S7 8.5 7 3ZM7.4 6.5h9.2M12 11.5v8.5M8 20.5h8",
  prosecco: "M9.5 2.5h5l-.4 7.5a2.1 2.1 0 0 1-4.2 0ZM12 12v8.5M8.5 21h7M11.5 6v.01M12.8 8v.01",
  alcohol_free:
    "M6 8h12l-1.4 12.2a1 1 0 0 1-1 .8H8.4a1 1 0 0 1-1-.8ZM13.5 13 16.5 3h3M10 16h.01M11 12.2h.01",
  soft_drink:
    "M7 5.5h10M7.5 3.5h9l.5 2-.6 1.5v11.5l.6 1.5-.5 1.5h-9l-.5-1.5.6-1.5V7L7 5.5ZM8.5 11h7",
} as const;

export type IconName = keyof typeof PATHS;

/** A drink code of the catalog has an icon; anything else falls back to the glass of the soft drink. */
export const drinkIcon = (code: string): IconName =>
  code in PATHS ? (code as IconName) : "soft_drink";

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
