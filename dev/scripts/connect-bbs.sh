#!/usr/bin/env bash
set -euo pipefail

# Simple helper to drop you into the AmiExpress-Web terminal via telnet.
# Usage: ./dev/scripts/connect-bbs.sh [host] [port]
# Defaults to localhost:2323, matching the standard telnet port from `start-servers.sh`.

HOST="${1:-localhost}"
PORT="${2:-2323}"

# Wait until the telnet port opens (avoids noisy connection refused when backend is still starting)
echo "Waiting for AmiExpress-Web BBS on ${HOST}:${PORT}..."
until nc -z "$HOST" "$PORT" >/dev/null 2>&1; do
  printf '.'
  sleep 1
done
echo

echo "Connecting to AmiExpress-Web BBS at ${HOST}:${PORT} (press Ctrl+] then 'quit' to escape telnet)..."
exec telnet "$HOST" "$PORT"
