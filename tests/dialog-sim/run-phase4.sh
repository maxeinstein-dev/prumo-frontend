#!/bin/bash
# Phase 4 lane runner: the pure suites (run.mts without the unified-import suite) and the dialog simulation, built with a
# private copy of build.mjs that leaves out the unified-import block (that block needs files only its own branch has).
# usage: ./run-phase4.sh [scenarioNameFilter]      (the pure suites run only without a filter)
set -e
cd "$(dirname "$0")"
FE_TESTS="$(cd .. && pwd)"
if [ -z "$1" ]; then
  grep -v "tu_unified" ../run.mts > ../_run_phase4.mts
  ../../node_modules/.bin/tsx ../_run_phase4.mts | tail -3 || { rm -f ../_run_phase4.mts; exit 1; }
  rm -f ../_run_phase4.mts
fi
python3 - <<'PY'
s = open('build.mjs', encoding='utf8').read()
a, b = s.find('// Unified import'), s.find('const stubPlugin')
open('_build_phase4.mjs', 'w', encoding='utf8').write(s[:a] + s[b:] if a != -1 and 0 <= a < b else s)
PY
SRC="$(cd ../../src && (pwd -W 2>/dev/null || pwd))"
node _build_phase4.mjs phase4 "$SRC"
rm -f _build_phase4.mjs
node scenarios.mjs phase4 "$@"
