#!/usr/bin/env bash
# ============================================================
#  Apex Vehicle Studio - PNG to .ytd  (Linux / macOS)
#  Run after exporting from the studio:
#     bash make_ytd.sh
#  or make it executable once:  chmod +x make_ytd.sh
#  It reads every PNG in tools/ytd_in/ and writes a real .ytd
#  (using the matching original as a template) into tools/ytd_out/.
#  No OpenIV / CodeWalker / GUI needed — works headless over SSH.
# ============================================================
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not on PATH."
    echo "Install it:  https://nodejs.org  (or 'apt install nodejs' / 'nvm install --lts')"
    exit 1
fi

node make_ytd.js --auto
