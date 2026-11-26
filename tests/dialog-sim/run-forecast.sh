#!/bin/bash
# Bundles the REAL ForecastStrategyField and ConfirmReceiptDialog and drives them under jsdom.
# usage: ./run-forecast.sh [nameFilter]   env: FRONTEND_DIR=<absolute path of the frontend checkout>, JSDOM_FROM=<package.json whose node_modules has jsdom>
set -e
cd "$(dirname "$0")"
if [ -n "$FRONTEND_DIR" ]; then SRC="$(cd "$FRONTEND_DIR/src" && (pwd -W 2>/dev/null || pwd))"; else SRC="$(cd ../../src && (pwd -W 2>/dev/null || pwd))"; fi
node build-forecast.mjs "$SRC"
node forecast-scenarios.mjs "$@"
