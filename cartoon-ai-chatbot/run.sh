#!/usr/bin/env bash
# One-command launcher:  ./run.sh
# - picks a new-enough Node.js (18.11+), using nvm if your default is too old
# - installs dependencies the first time
# - builds the React app and serves everything on http://localhost:3001
# Add your key to server/.env first for real Claude answers (otherwise it runs in demo mode).
set -e
cd "$(dirname "$0")"

node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a>18||(a===18&&b>=11))?0:1)'; }

if ! node_ok; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  if command -v nvm >/dev/null; then nvm install 20 >/dev/null 2>&1 || true; nvm use 20 >/dev/null 2>&1 || true; fi
fi
if ! node_ok; then
  echo "Node.js 18.11+ (20 recommended) is required. Current: $(node -v 2>/dev/null || echo none)."
  echo "Install it from https://nodejs.org or with nvm, then run ./run.sh again."
  exit 1
fi

if [ ! -d node_modules ] || [ ! -d server/node_modules ] || [ ! -d client/node_modules ]; then
  echo "Installing dependencies (first run only)…"
  npm run setup
fi

[ -f server/.env ] || echo "ℹ️  No server/.env found - starting in DEMO mode. (cp server/.env.example server/.env and add your key for real answers)"

npm start
