#!/usr/bin/env bash
# One-time setup: installs everything the app needs. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

# Python 3.10+ is needed for the YouTube server.
PYTHON=""
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    PYTHON=$candidate
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "Python 3.10 or newer is required." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null; then
  if command -v apt-get >/dev/null; then
    echo "Installing ffmpeg…"
    sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
  else
    echo "Please install ffmpeg (https://ffmpeg.org/download.html) and re-run." >&2
    exit 1
  fi
fi

echo "Installing Python packages (this takes a minute the first time)…"
[ -d .venv ] || "$PYTHON" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r backend/requirements.txt

echo "Installing web app packages…"
(cd frontend && npm ci --no-audit --no-fund)

echo "Setup complete. Run: bash scripts/start.sh"
