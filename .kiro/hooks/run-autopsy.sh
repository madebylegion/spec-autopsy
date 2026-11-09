#!/bin/sh
# Runs the autopsy for the PostFileSave hook. The hook shell has a short PATH,
# so find node (version managers, Homebrew) before running. POSIX sh only.
mkdir -p .autopsy
L=.autopsy/hook.log
printf '%s fired %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(head -c 200 | tr '\r\n' '  ')" >> "$L"
if ! command -v node >/dev/null 2>&1; then
  H=${HOME:-/nonexistent}
  # Prepended, so list the lowest priority first. A glob expands in ascending
  # order, so prepending each match puts the newest directory first.
  for d in /usr/local/bin /opt/homebrew/bin \
    "$H"/.local/share/fnm/node-versions/*/installation/bin "$H"/.nvm/versions/node/*/bin \
    "$H"/.volta/bin "$H"/.local/share/mise/shims "$H"/.local/share/mise/installs/node/*/bin; do
    [ -d "$d" ] && PATH="$d:$PATH"
  done
  export PATH
fi
if ! command -v node >/dev/null 2>&1; then
  printf 'node not found; PATH tried: %s\nexit=127\n' "$PATH" >> "$L"
  exit 127
fi
if command -v npm >/dev/null 2>&1; then
  npm run --silent autopsy >> "$L" 2>&1
else
  node node_modules/.bin/tsx src/cli/autopsy.ts >> "$L" 2>&1
fi
c=$?
echo "exit=$c" >> "$L"
exit $c
