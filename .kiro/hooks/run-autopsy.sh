#!/bin/sh
# Runs the autopsy for the PostFileSave hook. The hook shell has a short PATH
# and HOME may be unset or wrong, so find node (version managers, Homebrew,
# the login shell) before running. POSIX sh only.
mkdir -p .autopsy
L=.autopsy/hook.log
printf '%s fired %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(head -c 200 | tr '\r\n' '  ')" >> "$L"
HC=; MISE=
if ! command -v node >/dev/null 2>&1; then
  for d in /usr/local/bin /opt/homebrew/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
  # Candidates in priority order: HOME, passwd home, /home/<user>. Each home's
  # directories are collected in PATH order (a glob expands ascending, so
  # prepending each match puts the newest first), the homes are appended in
  # priority order, and the result is prepended to PATH once.
  ADD=
  for h in "${HOME:-}" "$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)" "/home/$(id -un 2>/dev/null)"; do
    case "$h" in ""|/home/) continue ;; esac
    case ":$HC:" in *":$h:"*) continue ;; esac
    HC="$HC:$h"
    if [ -d "$h/.local/share/mise" ]; then MISE="$MISE $h=yes"; else MISE="$MISE $h=no"; fi
    P=
    for d in "$h"/.local/share/fnm/node-versions/*/installation/bin "$h"/.nvm/versions/node/*/bin \
      "$h"/.volta/bin "$h"/.local/share/mise/shims "$h"/.local/share/mise/installs/node/*/bin; do
      [ -d "$d" ] && P="$d:$P"
    done
    ADD="$ADD$P"
  done
  PATH="$ADD$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1; then
  T=; command -v timeout >/dev/null 2>&1 && T="timeout 10"
  p=$($T "${SHELL:-/bin/sh}" -lc 'command -v node' 2>/dev/null </dev/null)
  case "$p" in /*) [ -x "$p" ] && PATH="${p%/*}:$PATH" && export PATH ;; esac
fi
if ! command -v node >/dev/null 2>&1; then
  printf 'node not found; HOME=%s id=%s SHELL=%s homes=%s mise=%s PATH tried: %s\nexit=127\n' \
    "${HOME-<unset>}" "$(id -un 2>/dev/null)" "${SHELL-<unset>}" "${HC#:}" "${MISE# }" "$PATH" >> "$L"
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
