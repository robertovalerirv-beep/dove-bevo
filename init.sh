#!/usr/bin/env bash
# Dove bevo — install, start the local dev server, run a smoke test.
# Usage: ./init.sh [--stop]
# Works in Git Bash on Windows and on Linux/macOS.
set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-5173}"
PID_FILE=".dev-server.pid"
LOG_FILE=".dev-server.log"

stop_server() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Dev server stopped."
  fi
}

if [[ "${1:-}" == "--stop" ]]; then
  stop_server
  exit 0
fi

echo "== Toolchain"
node -v
npm -v

if [[ ! -f package.json ]]; then
  echo "No package.json yet: the project is before M0. Nothing to install or start."
  echo "Docs check:"
  for f in docs/SPEC.md docs/feature_list.json docs/PROGRESS.md CLAUDE.md; do
    [[ -f "$f" ]] && echo "  ok  $f" || { echo "  MISSING $f"; exit 1; }
  done
  node -e 'const f=require("./docs/feature_list.json");const p=f.filter(x=>x.passes).length;console.log(`  features: ${p}/${f.length} passing`)'
  exit 0
fi

echo "== Git hooks (pre-push = npm run verify)"
git config core.hooksPath .githooks

echo "== Install"
npm ci

echo "== Local data (fixture)"
if [[ -d tests/fixtures/data ]]; then
  node -e 'require("fs").cpSync("tests/fixtures/data","public/data/fixture",{recursive:true})'
fi

if [[ -d migrations ]]; then
  echo "== Local D1 migrations"
  npx wrangler d1 migrations apply DB --local
fi

echo "== Start dev server"
stop_server
node node_modules/vite/bin/vite.js --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "== Smoke test"
curl -fsS "http://localhost:$PORT/api/health" && echo
curl -fsS -o /dev/null -w "shell: HTTP %{http_code}\n" "http://localhost:$PORT/"
if [[ -d migrations ]]; then # the cell route needs D1 (M1-08)
  curl -fsS -o /dev/null -w "cell:  HTTP %{http_code}\n" "http://localhost:$PORT/api/prices/u0nd9"
fi

echo "Dev server running on http://localhost:$PORT (log: $LOG_FILE, stop: ./init.sh --stop)"
