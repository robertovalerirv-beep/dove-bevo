import { it as italian } from "./it";

// The language of the public interface (SPEC 7.11, D-36, ADR 0038). Italian is the page as it is
// built; English is a file of its own, downloaded only when someone chooses it. The choice lives in
// memory: nothing is written to the device and nothing is sent (SPEC 14), so every visit starts in
// Italian. The admin pages and the Worker import it.ts directly and never see this module.
// This folder is also in the Worker's TypeScript project (tsconfig.worker.json): no preact and no DOM
// types here; the hook is in lib/use-lang.ts.

export type Lang = "it" | "en";

/** The texts of a language: those of it.ts with the admin group out, and plain `string`s in place of its literals. */
type Wide<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Wide<R>
    : T extends object
      ? { [K in keyof T]: Wide<T[K]> }
      : T;
export type Dict = Wide<Omit<typeof italian, "admin">>;

/**
 * The texts in use. A live binding: a component that reads `it.add.open` while it renders gets the
 * current language, and `subscribeLang` tells the app when to render again.
 */
export let it: Dict = italian;

let current: Lang = "it";
let last = 0; // two quick choices: only the latest one is applied
const listeners = new Set<() => void>();

export const currentLang = (): Lang => current;

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function setLang(next: Lang): Promise<void> {
  const turn = ++last; // also when it changes nothing: it cancels a change still being fetched
  if (next === current) return;
  const dict = next === "it" ? italian : (await import("./en")).en;
  if (turn !== last) return;
  current = next;
  it = dict;
  // The page language, for screen readers and hyphenation (no DOM types in this folder).
  const page = (globalThis as { document?: { documentElement: { lang: string } } }).document;
  if (page) page.documentElement.lang = next;
  listeners.forEach((listener) => {
    listener();
  });
}
