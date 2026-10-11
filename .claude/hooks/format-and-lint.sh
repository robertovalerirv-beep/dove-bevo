#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): Prettier and ESLint on the changed file only. Never blocks.
# Lint problems are returned to Claude as additionalContext.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
BIN="$PROJECT_DIR/node_modules/.bin"

file="$(node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try { process.stdout.write(JSON.parse(raw).tool_input?.file_path ?? ""); } catch {}
});
')"

[[ -z "$file" || ! -f "$file" ]] && exit 0
[[ -x "$BIN/prettier" || -f "$BIN/prettier.cmd" ]] || exit 0   # tooling not installed yet (before M0)

case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.json|*.jsonc|*.css|*.md|*.html|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac

(cd "$PROJECT_DIR" && "$BIN/prettier" --write --log-level warn "$file") >/dev/null 2>&1 || true

case "$file" in
  *.ts|*.tsx|*.js|*.mjs)
    out="$(cd "$PROJECT_DIR" && "$BIN/eslint" "$file" 2>&1)" || {
      node -e '
        const msg = "ESLint on " + process.argv[1] + ":\n" + process.argv[2].slice(0, 4000);
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: msg } }));
      ' "$file" "$out"
    } ;;
esac

exit 0
