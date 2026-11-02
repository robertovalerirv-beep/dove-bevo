import { currentLang } from "@site/app/i18n/lang";
import { drinkImage } from "@mobile/drink-images";

/** Category art supplies the visual header without claiming a venue photograph. */
export function DrinkHero({ drink }: { drink: string }) {
  const image = drinkImage(drink);
  if (!image) return null;
  return (
    <figure class="mobile-venue__hero">
      <img src={image} width="1536" height="1024" alt="" decoding="async" />
      <figcaption>
        {currentLang() === "en" ? "Illustrative drink image" : "Immagine illustrativa del drink"}
      </figcaption>
    </figure>
  );
}
