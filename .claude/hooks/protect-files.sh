#!/usr/bin/env bash
# PreToolUse hook (Edit|Write): blocks writes to secrets, the lockfile and applied migrations.
# Reads the hook JSON from stdin. Exit 2 = block (stderr is shown to Claude).
# A migration counts as applied once it exists on the `main` branch (SPEC D-20), local or remote:
# a local `main` left behind must not leave the newer migrations unprotected.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

rel="$(node -e '
const path = require("path");
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let p = "";
  try { p = JSON.parse(raw).tool_input?.file_path ?? ""; } catch { process.exit(0); }
  if (!p) process.exit(0);
  const rel = path.relative(process.argv[1], path.resolve(process.argv[1], p)).split(path.sep).join("/");
  process.stdout.write(rel);
});
' "$PROJECT_DIR")"

[[ -z "$rel" ]] && exit 0
base="$(basename "$rel")"

case "$base" in
  .dev.vars|.dev.vars.*|.env|.env.*)
    [[ "$base" == *.example ]] && exit 0
    echo "Blocked: $rel holds secrets. Only .example files may be edited." >&2
    exit 2 ;;
  package-lock.json)
    echo "Blocked: package-lock.json is changed only by npm install/ci, never by hand." >&2
    exit 2 ;;
esac

if [[ "$rel" == migrations/* ]] && {
  git -C "$PROJECT_DIR" cat-file -e "main:$rel" 2>/dev/null ||
    git -C "$PROJECT_DIR" cat-file -e "origin/main:$rel" 2>/dev/null
}; then
  echo "Blocked: $rel is already on main (applied). Add a new migration instead." >&2
  exit 2
fi

exit 0
