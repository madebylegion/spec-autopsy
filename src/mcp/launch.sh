#!/bin/sh
# Starts the MCP server. kiro-cli gives it a short PATH and a private HOME, so
# node must be found first. The find-node steps mirror .kiro/hooks/run-autopsy.sh.
# stdout is the MCP channel: print nothing to it; diagnostics go to stderr.
cd "$(dirname "$0")/../.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  for d in /usr/local/bin /opt/homebrew/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
  HC=; ADD=
  for h in "${HOME:-}" "$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)" "/home/$(id -un 2>/dev/null)"; do
    case "$h" in ""|/home/) continue ;; esac
    case ":$HC:" in *":$h:"*) continue ;; esac
    HC="$HC:$h"; P=
    for d in "$h"/.local/share/fnm/node-versions/*/installation/bin "$h"/.nvm/versions/node/*/bin \
      "$h"/.volta/bin "$h"/.local/share/mise/shims "$h"/.local/share/mise/installs/node/*/bin; do
      [ -d "$d" ] && P="$d:$P"
    done
    ADD="$ADD$P"
  done
  PATH="$ADD$PATH"; export PATH
fi
if ! command -v node >/dev/null 2>&1; then
  T=; command -v timeout >/dev/null 2>&1 && T="timeout 10"
  p=$($T "${SHELL:-/bin/sh}" -lc 'command -v node' 2>/dev/null </dev/null)
  case "$p" in /*) [ -x "$p" ] && PATH="${p%/*}:$PATH" && export PATH ;; esac
fi
if ! command -v node >/dev/null 2>&1; then
  echo "spec-autopsy: node not found (HOME=${HOME-<unset>} PATH=$PATH)" >&2
  exit 127
fi
exec node node_modules/.bin/tsx src/mcp/server.ts "$@"
