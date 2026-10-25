#!/usr/bin/env bash
# Stop hook: before Claude hands the turn back, the TypeScript changed on this branch must typecheck
# and the unit/worker tests related to it must pass. On failure the stop is blocked and the errors go
# back to Claude, who fixes the code (CLAUDE.md, «Prima di scrivere codice»). A check that already
# passed on the same changes is not repeated. E2E stay with `npm run verify` on push.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0
[[ -x node_modules/.bin/tsc ]] || exit 0

input="$(cat)"
# Claude is already fixing what this hook reported: let it stop, the next turn checks again.
active="$(node -e 'try { process.stdout.write(String(JSON.parse(process.argv[1]).stop_hook_active === true)); } catch { process.stdout.write("false"); }' "$input")"
[[ "$active" == "true" ]] && exit 0

base="$(git rev-parse --verify -q '@{upstream}' || git rev-parse --verify -q origin/main)" || exit 0
mapfile -t changed < <(
  { git diff --name-only "$base"; git ls-files --others --exclude-standard; } |
    sort -u | grep -E '\.(ts|tsx)$' | while read -r f; do [[ -f "$f" ]] && echo "$f"; done
)
(( ${#changed[@]} == 0 )) && exit 0

# Same changes as the last green check: nothing to run.
stamp_file="$(git rev-parse --git-dir)/claude-stop-check"
stamp="$({ git diff "$base" -- "${changed[@]}"; cat "${changed[@]}"; } | git hash-object --stdin)"
[[ -f "$stamp_file" && "$(cat "$stamp_file")" == "$stamp" ]] && exit 0

fail() {
  node -e '
    const reason = process.argv[1] + "\n" + process.argv[2].split("\n").slice(-60).join("\n");
    process.stdout.write(JSON.stringify({ decision: "block", reason }));
  ' "$1" "$2"
  exit 0
}

out="$(node_modules/.bin/tsc -b 2>&1)" || fail "Typecheck rosso sui file cambiati: correggi il codice prima di chiudere." "$out"
out="$(node_modules/.bin/vitest related --run "${changed[@]}" 2>&1)" ||
  fail "Test unit/worker collegati rossi: correggi il codice (mai il test, se il requisito non è cambiato)." "$out"

echo "$stamp" > "$stamp_file"
exit 0
