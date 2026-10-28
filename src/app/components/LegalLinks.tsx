import { it } from "../i18n/lang";

/** Privacy and rules: the footer of the bar receipt and of the search sheet (SPEC 7.8). */
export function LegalLinks() {
  return (
    <nav class="legal-links" aria-label={it.legal.linksLabel}>
      <a class="btn btn--ghost" href="/privacy">
        {it.legal.privacyLink}
      </a>
      <a class="btn btn--ghost" href="/regole">
        {it.legal.rulesLink}
      </a>
    </nav>
  );
}
