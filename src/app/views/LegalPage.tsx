import { useEffect } from "preact/hooks";
import { APP_NAME, CONTACT_EMAIL } from "../../shared/config";
import { it } from "../i18n/it";

// /privacy and /regole (SPEC 7.8): plain text from it.ts, its own chunk, never loaded by the map.

export type LegalKind = "privacy" | "rules";

export function LegalPage({ kind }: { kind: LegalKind }) {
  const page = it.legal[kind];
  const other =
    kind === "privacy"
      ? { href: "/regole", label: it.legal.rulesLink }
      : { href: "/privacy", label: it.legal.privacyLink };
  useEffect(() => {
    document.title = `${page.title} · ${APP_NAME}`;
  }, [page.title]);

  return (
    <main class="legal">
      <header class="legal__head">
        <a href="/" class="legal__logo" aria-label={it.legal.backToMap}>
          <img
            class="legal__logo-light"
            src="/brand/logo-orizzontale.svg"
            alt={it.legal.logoAlt}
            width="176"
            height="40"
          />
          <img
            class="legal__logo-dark"
            src="/brand/logo-orizzontale-negativo.svg"
            alt={it.legal.logoAlt}
            width="176"
            height="40"
          />
        </a>
        <a class="btn btn--secondary" href="/">
          {it.legal.backToMap}
        </a>
      </header>
      <h1>{page.title}</h1>
      <p class="hint">{page.updated}</p>
      <p>{page.intro}</p>
      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2 class="section-title">{section.heading}</h2>
          {section.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </section>
      ))}
      <p>
        {it.legal.contactLabel}: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
      <nav class="legal-links" aria-label={it.legal.linksLabel}>
        <a class="btn btn--ghost" href={other.href}>
          {other.label}
        </a>
        <a class="btn btn--ghost" href="/">
          {it.legal.backToMap}
        </a>
      </nav>
    </main>
  );
}
