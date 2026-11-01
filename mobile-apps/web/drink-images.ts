import spritz from "./assets/drinks/spritz.jpg?url";

/** Generic category illustration; never a claim about a venue's actual serving. */
export function drinkImage(code: string): string | undefined {
  return code === "spritz" ? spritz : undefined;
}
