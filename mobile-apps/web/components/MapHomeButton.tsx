import { currentLang } from "@site/app/i18n/lang";

/** Return to the selected city's starting viewport without asking for device location. */
export function MapHomeButton({ className, onClick }: { className: string; onClick: () => void }) {
  const label = currentLang() === "en" ? "Initial city map view" : "Vista iniziale della città";
  return (
    <button
      type="button"
      class={className}
      data-testid="mobile-map-home"
      aria-label={label}
      onClick={onClick}
    >
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
        <path d="M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3z" />
      </svg>
    </button>
  );
}
