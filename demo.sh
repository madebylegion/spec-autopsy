#!/usr/bin/env bash
# One-command demo: SpecAutopsy runs on its own .kiro folder.
# No network, no LLM. Writes only to .autopsy/ (git-ignored).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -x node_modules/.bin/tsx ]; then
  echo 'demo.sh: run "npm ci" first' >&2
  exit 2
fi

# Forget the previous run so "new ghosts" always lists every ghost.
rm -f .autopsy/last.json

echo "SpecAutopsy self-autopsy"
NODE_NO_WARNINGS=1 node_modules/.bin/tsx src/cli/autopsy.ts . --json .autopsy/demo-report.json
echo "done in ${SECONDS}s"
