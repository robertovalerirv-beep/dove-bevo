import spritzProduct from "./assets/drinks/spritz.jpg?url";
import spritz from "./assets/drinks/spritz-scene.jpg?url";
import beer from "./assets/drinks/beer-scene.jpg?url";
import gin from "./assets/drinks/gin-tonic-scene.jpg?url";
import negroni from "./assets/drinks/negroni-scene.jpg?url";
import sbagliato from "./assets/drinks/sbagliato-scene.jpg?url";
import wine from "./assets/drinks/wine-scene.jpg?url";
import alcoholFree from "./assets/drinks/alcohol-free-scene.jpg?url";
import water from "./assets/drinks/water-scene.jpg?url";

const photos: Readonly<Record<string, string>> = {
  spritz,
  beer_draft: beer,
  gin_tonic: gin,
  gin_lemon: gin,
  negroni,
  sbagliato,
  wine_glass: wine,
  alcohol_free: alcoholFree,
  water,
};

/** Generic category illustration; never a claim about a venue's actual serving. */
export function drinkImage(
  code: string,
  presentation: "scene" | "product" = "scene",
): string | undefined {
  return presentation === "product" && code === "spritz" ? spritzProduct : photos[code];
}
