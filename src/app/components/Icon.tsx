// Inline SVG icons, 2 px stroke, decorative (labels are always visible text).
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16 16l5 5",
  locate: "M12 3v3M12 18v3M3 12h3M18 12h3M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  directions: "M12 2l9 9-9 9-9-9 9-9zM9 13v-2h5V9l3 3-3 3v-2h-3",
} as const;

export function Icon({ name }: { name: keyof typeof PATHS }) {
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
