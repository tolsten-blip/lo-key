#!/usr/bin/env bash
# One-time setup: installs everything the app needs. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

# Basic Pitch (the transcription model) only supports Python 3.10 and 3.11.
PYTHON=""
for candidate in python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys; sys.exit(sys.version_info[:2] not in ((3, 10), (3, 11)))'; then
    PYTHON=$candidate
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "Python 3.10 or 3.11 is required (Basic Pitch doesn't support newer versions yet)." >&2
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

echo "Installing Python packages (this takes a few minutes the first time)…"
[ -d .venv ] || "$PYTHON" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r backend/requirements.txt

echo "Installing web app packages…"
(cd frontend && npm ci --no-audit --no-fund)

echo "Setup complete. Run: bash scripts/start.sh"
