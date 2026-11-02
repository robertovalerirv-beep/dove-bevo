import { it } from "@site/app/i18n/lang";

/** Mobile privacy disclosures accompany the app; community rules retain their existing route. */
export function AppLegalLinks() {
  return (
    <nav class="legal-links" aria-label={it.legal.linksLabel}>
      <a
        class="btn btn--ghost"
        href="https://github.com/robertovalerirv-beep/dove-bevo/blob/main/mobile-apps/privacy.md"
      >
        {it.legal.privacyLink}
      </a>
      <a class="btn btn--ghost" href="/regole">
        {it.legal.rulesLink}
      </a>
    </nav>
  );
}
