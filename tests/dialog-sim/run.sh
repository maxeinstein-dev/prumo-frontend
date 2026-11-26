#!/bin/bash
# Bundles the REAL dialog (esbuild, from the frontend's node_modules) and drives it under jsdom with a fake server.
# usage: ./run.sh [scenarioNameFilter]      env: JSDOM_FROM=<path to a package.json whose node_modules has jsdom>
#   FRONTEND_DIR=<absolute path of a frontend checkout/worktree> (default: this repository)
#   SIM_VARIANT=<name of the bundle in out/> (default: real; use another name to not clash with a parallel run)
set -e
cd "$(dirname "$0")"
if [ -n "$FRONTEND_DIR" ]; then
  SRC="$(cd "$FRONTEND_DIR/src" && (pwd -W 2>/dev/null || pwd))"
else
  SRC="$(cd ../../src && (pwd -W 2>/dev/null || pwd))"
fi
VARIANT="${SIM_VARIANT:-real}"
node build.mjs "$VARIANT" "$SRC"
node scenarios.mjs "$VARIANT" "$@"
