#!/bin/bash
# Kill all stuck door processes
# Run this whenever you see high CPU usage from door processes

echo "[KILL] Killing all stuck door processes..."

# Kill by script name
pkill -9 -f "run-amiga-door.ts" 2>/dev/null
pkill -9 -f "mtop" 2>/dev/null
pkill -9 -f "slicktop" 2>/dev/null
pkill -9 -f "QuickNew" 2>/dev/null
pkill -9 -f "aquascan" 2>/dev/null

# Count remaining processes
REMAINING=$(ps aux | grep -E "run-amiga-door|mtop|slicktop|QuickNew|aquascan" | grep -v grep | wc -l)

if [ "$REMAINING" -eq 0 ]; then
  echo "[OK] All stuck door processes killed"
  exit 0
else
  echo "[ERROR] $REMAINING processes still running!"
  ps aux | grep -E "run-amiga-door|mtop|slicktop|QuickNew|aquascan" | grep -v grep
  exit 1
fi
