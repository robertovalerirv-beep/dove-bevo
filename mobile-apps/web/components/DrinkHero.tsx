import { currentLang } from "@site/app/i18n/lang";
import { drinkImage } from "@mobile/drink-images";

/** Category art supplies the visual header without claiming a venue photograph. */
export function DrinkHero({ drink }: { drink: string | null }) {
  const image = drink ? drinkImage(drink) : null;
  if (!image)
    return (
      <div class="mobile-venue__hero mobile-venue__hero--neutral">
        <img src="/brand/simbolo.svg" width="64" height="64" alt="" />
        <div>
          <strong>Dove Bevo</strong>
          <span>
            {currentLang() === "en"
              ? "Know the price before you order."
              : "Prima di ordinare, sai quanto costa."}
          </span>
        </div>
      </div>
    );
  return (
    <figure class="mobile-venue__hero">
      <img src={image} width="1536" height="1024" alt="" decoding="async" />
      <figcaption>
        {currentLang() === "en" ? "Illustrative drink image" : "Immagine illustrativa del drink"}
      </figcaption>
    </figure>
  );
}
