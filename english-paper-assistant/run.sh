#!/usr/bin/env bash
# One-command launcher:  ./run.sh
# - picks a new-enough Node.js (20.19+ / 22+), using nvm if your default is too old
# - installs dependencies the first time
# - builds the React app and starts the local server on http://localhost:3001
set -e
cd "$(dirname "$0")"

node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a>20||(a===20&&b>=19))?0:1)'; }

if ! node_ok; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  if command -v nvm >/dev/null; then nvm install 22 >/dev/null 2>&1 || true; nvm use 22 >/dev/null 2>&1 || true; fi
fi
if ! node_ok; then
  echo "Node.js 20.19+ (or 22+) is required. Current: $(node -v 2>/dev/null || echo none)."
  echo "Install it from https://nodejs.org or with nvm, then run ./run.sh again."
  exit 1
fi

# Trust the operating system's certificate store (needed behind corporate proxies when downloading the model once).
if node --use-system-ca -e 0 >/dev/null 2>&1; then export NODE_OPTIONS="${NODE_OPTIONS:-} --use-system-ca"; fi

[ -d node_modules ] || { echo "Installing dependencies (first run only)…"; npm install; }

npm start
