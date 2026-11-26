#!/bin/bash
# Bundles the REAL ConfirmReceiptDialog and drives it under jsdom against a stateful fake server.
# usage: ./run-confirm.sh [nameFilter]   env: FRONTEND_DIR=<absolute path of the frontend checkout>, JSDOM_FROM=<package.json whose node_modules has jsdom>
set -e
cd "$(dirname "$0")"
if [ -n "$FRONTEND_DIR" ]; then SRC="$(cd "$FRONTEND_DIR/src" && (pwd -W 2>/dev/null || pwd))"; else SRC="$(cd ../../src && (pwd -W 2>/dev/null || pwd))"; fi
node build-confirm.mjs "$SRC"
node confirm-scenarios.mjs "$@"
