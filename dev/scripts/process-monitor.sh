#!/bin/bash

# Process Monitor for AmiExpress BBS
# Detects zombie/stuck processes and optionally cleans them up
# Usage: ./dev/scripts/process-monitor.sh [--fix]

FIX_MODE=false
if [ "$1" = "--fix" ]; then
  FIX_MODE=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RESET='\033[0m'

echo "========================================"
echo "AmiExpress BBS Process Monitor"
echo "========================================"
echo ""

ISSUES_FOUND=0

# Check for multiple start-servers instances
START_SERVERS=$(pgrep -f "start-servers.sh" | wc -l | tr -d ' ')
if [ "$START_SERVERS" -gt 1 ]; then
  printf "%b\n" "${YELLOW}[WARNING]${RESET} Found $START_SERVERS start-servers.sh instances (expected: 0-1)"
  pgrep -f "start-servers.sh" | xargs ps -p 2>/dev/null | tail -n +2
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
  if [ "$FIX_MODE" = true ]; then
    echo "  -> Killing extra instances..."
    pkill -9 -f "start-servers.sh"
  fi
fi

# Check for orphaned watch-doors processes
WATCH_DOORS=$(pgrep -f "watch-doors.ts" | wc -l | tr -d ' ')
if [ "$WATCH_DOORS" -gt 1 ]; then
  printf "%b\n" "${YELLOW}[WARNING]${RESET} Found $WATCH_DOORS watch-doors processes (expected: 0-1)"
  pgrep -f "watch-doors.ts" | xargs ps -p 2>/dev/null | tail -n +2
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
  if [ "$FIX_MODE" = true ]; then
    echo "  -> Killing extra instances..."
    pkill -9 -f "watch-doors.ts"
  fi
fi

# Check for multiple backend instances
BACKENDS=$(pgrep -f "tsx.*src/index.ts" | wc -l | tr -d ' ')
if [ "$BACKENDS" -gt 1 ]; then
  printf "%b\n" "${YELLOW}[WARNING]${RESET} Found $BACKENDS backend instances (expected: 0-1)"
  pgrep -f "tsx.*src/index.ts" | xargs ps -p 2>/dev/null | tail -n +2
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
  if [ "$FIX_MODE" = true ]; then
    echo "  -> Killing extra instances..."
    pkill -9 -f "tsx.*src/index.ts"
  fi
fi

# Check for zombie jest workers
JEST_WORKERS=$(pgrep -f "jest-worker" | wc -l | tr -d ' ')
if [ "$JEST_WORKERS" -gt 0 ]; then
  printf "%b\n" "${YELLOW}[WARNING]${RESET} Found $JEST_WORKERS zombie jest workers"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
  if [ "$FIX_MODE" = true ]; then
    echo "  -> Killing jest workers..."
    pkill -9 -f "jest-worker"
  fi
fi

# Check for high CPU usage by Node processes
HIGH_CPU=$(ps aux | grep -E "(node|tsx)" | grep -v grep | awk '$3 > 50.0 {print $2, $3, $11, $12, $13}')
if [ -n "$HIGH_CPU" ]; then
  printf "%b\n" "${YELLOW}[WARNING]${RESET} Found Node processes using >50% CPU:"
  echo "$HIGH_CPU"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for stale lockfile
if [ -f "/tmp/amiexpress-servers.lock" ]; then
  LOCK_PID=$(cat /tmp/amiexpress-servers.lock 2>/dev/null)
  if ! kill -0 "$LOCK_PID" 2>/dev/null; then
    printf "%b\n" "${YELLOW}[WARNING]${RESET} Stale lockfile found (process $LOCK_PID is dead)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    if [ "$FIX_MODE" = true ]; then
      echo "  -> Removing stale lockfile..."
      rm -f /tmp/amiexpress-servers.lock
    fi
  fi
fi

# Check if ports are in use
PORT_3001=$(lsof -ti:3001 | wc -l | tr -d ' ')
PORT_8080=$(lsof -ti:8080 | wc -l | tr -d ' ')

echo ""
echo "========================================"
echo "Port Status:"
echo "========================================"
if [ "$PORT_3001" -gt 0 ]; then
  printf "%b\n" "${GREEN}[OK]${RESET} Port 3001 (backend) in use"
else
  printf "%b\n" "Port 3001 (backend) free"
fi

if [ "$PORT_8080" -gt 0 ]; then
  printf "%b\n" "${GREEN}[OK]${RESET} Port 8080 (SDK preview) in use"
else
  printf "%b\n" "Port 8080 (SDK preview) free"
fi

echo ""
echo "========================================"
echo "Summary"
echo "========================================"
if [ "$ISSUES_FOUND" -eq 0 ]; then
  printf "%b\n" "${GREEN}[OK] No issues found${RESET}"
  exit 0
else
  printf "%b\n" "${YELLOW}[WARNING] Found $ISSUES_FOUND potential issue(s)${RESET}"
  if [ "$FIX_MODE" = false ]; then
    echo ""
    echo "Run with --fix to automatically fix issues:"
    echo "  ./dev/scripts/process-monitor.sh --fix"
  fi
  exit 1
fi
