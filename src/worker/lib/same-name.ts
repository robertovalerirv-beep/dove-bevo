// Duplicate check for bar names: only the Worker compares names this way, so it stays out of the app bundle.
import { searchKey } from "../../shared/venue";

/**
 * Cyrillic and Greek letters that look like Latin ones, as "code point:Latin letter" (capitals and small).
 * Written as code points on purpose: a table of look-alikes must not hide look-alikes in the source.
 */
const LOOKALIKES = new Map(
  (
    "0410:A 0430:a 0412:B 0415:E 0435:e 041A:K 041C:M 041D:H 041E:O 043E:o 0420:P 0440:p 0421:C 0441:c " +
    "0422:T 0443:y 0425:X 0445:x 0406:I 0456:i 0408:J 0458:j 0405:S 0455:s " +
    "0391:A 03B1:a 0392:B 0395:E 0396:Z 0397:H 0399:I 03B9:i 039A:K 039C:M 039D:N 039F:O 03BF:o " +
    "03A1:P 03C1:p 03A4:T 03A5:Y 03C5:u 03A7:X 03BD:v"
  )
    .split(" ")
    .map((pair): [string, string] => {
      const [code = "", latin = ""] = pair.split(":");
      return [String.fromCodePoint(parseInt(code, 16)), latin];
    }),
);
const LOOKALIKE_LETTER = new RegExp(`[${[...LOOKALIKES.keys()].join("")}]`, "gu");

/** The text with look-alike letters turned into the Latin ones they imitate (before the case is lowered). */
export const foldLookalikes = (text: string): string =>
  text.replace(LOOKALIKE_LETTER, (ch) => LOOKALIKES.get(ch) ?? ch);

/**
 * Same name once accents, case, spaces and punctuation are ignored, and look-alike Cyrillic or Greek letters
 * count as the Latin ones: "Bistrоt" with a Cyrillic о is "Bistrot" (audit 28/10/2026).
 */
export const sameName = (a: string, b: string) => {
  const flat = (s: string) => searchKey(foldLookalikes(s)).replace(/[^\p{L}\p{N}]/gu, "");
  return flat(a) === flat(b);
};
