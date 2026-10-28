import { expect, type Locator, type Page } from "@playwright/test";
import { en } from "../../src/app/i18n/en";
import { it as italian } from "../../src/app/i18n/it";

// Shared by the English specs (english.spec.ts, english-views.spec.ts): the language menu and the check
// that no Italian is left on the page.

export const langButton = (page: Page) => page.getByRole("button", { name: /^(Lingua|Language)/ });
export const langList = (page: Page) => page.getByRole("group", { name: /^(Lingua|Language)$/ });

export async function chooseEnglish(page: Page) {
  await langButton(page).click();
  await langList(page).getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(langList(page)).toBeHidden();
}

// ---- no Italian left -------------------------------------------------------------------------

const strings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
};
const publicItalian = Object.fromEntries(Object.entries(italian).filter(([k]) => k !== "admin"));
const englishText = strings(en).join("\n");
// The Italian texts a person must not read in English (short ones and the names that are the same in
// both languages, like Spritz or Negroni, are left out).
export const ITALIAN_ONLY = [...new Set(strings(publicItalian))].filter(
  (t) => t.length >= 5 && !englishText.includes(t),
);

/** Everything the person reads or hears on the page: visible text and the accessible names. */
export async function pageText(page: Page): Promise<string> {
  const visible = await page.locator("body").innerText();
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-label],[title],[placeholder],img[alt]")].flatMap((e) =>
      ["aria-label", "title", "placeholder", "alt"].map((a) => e.getAttribute(a) ?? ""),
    ),
  );
  return `${visible}\n${names.join("\n")}`;
}
export async function expectNoItalian(page: Page) {
  const text = await pageText(page);
  expect(ITALIAN_ONLY.filter((t) => text.includes(t))).toEqual([]);
}

export const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible");
  return b;
};
