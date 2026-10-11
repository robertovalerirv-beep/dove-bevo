// Pure check behind scripts/check-feature-list.mjs (SPEC D-21): only `passes` may change.
type Feature = Record<string, unknown>;

export function compareFeatureLists(
  base: readonly unknown[],
  current: readonly unknown[],
): string[] {
  const byId = (list: readonly unknown[]) =>
    new Map(list.map((f) => [String((f as Feature).id), f as Feature]));
  const before = byId(base);
  const after = byId(current);
  const problems: string[] = [];
  const ids = current.map((f) => String((f as Feature).id));
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    problems.push(`${id}: duplicated`);
  }
  for (const [id, old] of before) {
    const now = after.get(id);
    if (!now) {
      problems.push(`${id}: removed`);
      continue;
    }
    if (typeof now.passes !== "boolean") problems.push(`${id}: passes must be true or false`);
    for (const key of new Set([...Object.keys(old), ...Object.keys(now)])) {
      if (key !== "passes" && old[key] !== now[key]) problems.push(`${id}: field ${key} changed`);
    }
  }
  for (const id of after.keys()) if (!before.has(id)) problems.push(`${id}: added`);
  return problems;
}
