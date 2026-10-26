import type { WeekHours } from "../../shared/hours";
import { rangeText } from "../../shared/hours";
import { it } from "../i18n/it";
import { Icon } from "./Icon";

/**
 * «Gestore verificato» and «Sponsorizzato» together (SPEC 1.9, D-34): the check is never shown alone,
 * and its colour is never the only sign (the words are always written).
 */
export function VerifiedBadge() {
  return (
    <span class="verified">
      <span class="verified__check">
        <Icon name="verified" />
        {it.verified.badge}
      </span>
      <span class="verified__sponsored">{it.verified.sponsored}</span>
    </span>
  );
}

/** The opening hours as written by the admin: a day per line, nothing computed from the clock. */
export function HoursList({ hours }: { hours: WeekHours }) {
  return (
    <section class="hours" aria-labelledby="hours-title">
      <h3 class="section-title" id="hours-title">
        {it.verified.hoursTitle}
      </h3>
      <dl class="hours__list">
        {hours.map((day, i) => (
          <div class="hours__day" key={i}>
            <dt>{it.verified.days[i]}</dt>
            <dd>
              {day.length === 0
                ? it.verified.closed
                : day.map((range, j) => (
                    // A range never breaks in the middle: the line wraps between two ranges.
                    <span class="hours__range" key={j}>
                      {j > 0 && it.verified.rangeJoin}
                      {rangeText(range)}
                    </span>
                  ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
