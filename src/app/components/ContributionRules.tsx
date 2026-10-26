import { it } from "../i18n/it";
import { isNative } from "../lib/platform";

/** Every submit action explicitly accepts these rules; no acceptance identifier is stored. */
export function ContributionRules({ id }: { id: string }) {
  return (
    <p id={id} class="hint">
      {it.contribution.beforeRules}{" "}
      <a
        class="btn btn--ghost"
        href={isNative ? "https://www.dovebevo.com/regole" : "/regole"}
        target="_blank"
        rel="noopener noreferrer"
      >
        {it.legal.rulesLink}
      </a>
      {it.contribution.afterRules}
    </p>
  );
}
