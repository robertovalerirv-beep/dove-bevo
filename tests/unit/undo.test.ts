import { readFileSync } from "node:fs";
import { describe, expect, it as test } from "vitest";
import { it } from "../../src/app/i18n/it";
import { UNDO_MS } from "../../src/shared/config";

// SPEC D-15: the "Annulla" after Salva lasts UNDO_MS. The timer, the progress bar and the texts must
// all say the same thing, whatever the value is.
describe("the undo window", () => {
  test("is five seconds (SPEC 1.5)", () => {
    expect(UNDO_MS).toBe(5_000);
  });

  test("is the duration of the progress bar in the generated tokens", () => {
    const css = readFileSync("src/app/styles/tokens.css", "utf8");
    expect(css).toContain(`--toast-duration: ${String(UNDO_MS / 1000)}s;`);
  });

  test("is the number of seconds the texts promise", () => {
    expect(it.add.seenHelp).toContain(`${String(UNDO_MS / 1000)} secondi`);
  });
});
