#!/usr/bin/env bash
# Start the song analyzer and the web app together. Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

# Codespaces runs this on every reconnect; don't start a second copy.
if curl -fs -o /dev/null http://localhost:5173/; then
  echo "Piano Lo-Key is already running: open http://localhost:5173"
  exit 0
fi

if [ ! -x .venv/bin/uvicorn ] || [ ! -d frontend/node_modules ]; then
  bash scripts/setup.sh
fi

.venv/bin/uvicorn lokey.app:app --app-dir backend --port 8000 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT

echo
echo "  Piano Lo-Key is starting: open http://localhost:5173"
echo

cd frontend
npm run dev -- --port 5173 --strictPort
