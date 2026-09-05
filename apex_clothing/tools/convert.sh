#!/usr/bin/env bash
# Apex Clothing Studio - convert all your .ydd clothes to .glb (Linux/macOS).
# Run:  bash convert.sh        (needs Node.js; uses the public gtax API)
# Works headless over SSH — no GUI needed.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not on PATH."
    echo "Install it:  https://nodejs.org  (or 'apt install nodejs' / 'nvm install --lts')"
    exit 1
fi

node convert.js "$@"
