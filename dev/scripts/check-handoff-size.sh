#!/bin/bash
# check-handoff-size.sh
# Validates handoff.md size to prevent context bloat
# Per CLAUDE.md: handoff.md MUST be under 5KB

HANDOFF_FILE="handoff.md"
MAX_SIZE=5000  # 5KB limit
WARN_SIZE=4000 # Warning at 4KB

if [ ! -f "$HANDOFF_FILE" ]; then
  echo "[ERROR] handoff.md not found"
  exit 1
fi

SIZE=$(wc -c < "$HANDOFF_FILE" | tr -d ' ')

if [ "$SIZE" -gt "$MAX_SIZE" ]; then
  echo "[ERROR] handoff.md is TOO LARGE: ${SIZE} bytes (max: ${MAX_SIZE})"
  echo "[ERROR] This will cause 40-50K token conversation summaries in continued sessions"
  echo "[ERROR] CRITICAL: Trim handoff.md to essentials only (current state, recent work, next steps)"
  echo "[ERROR] Move detailed analysis to Documentation/ files"
  exit 1
elif [ "$SIZE" -gt "$WARN_SIZE" ]; then
  echo "[WARNING] handoff.md is getting large: ${SIZE} bytes (warning at ${WARN_SIZE}, max: ${MAX_SIZE})"
  echo "[WARNING] Consider trimming to prevent context bloat"
else
  echo "[OK] handoff.md size: ${SIZE} bytes (under ${MAX_SIZE} limit)"
fi

# Show line count for reference
LINES=$(wc -l < "$HANDOFF_FILE" | tr -d ' ')
echo "[INFO] Lines: ${LINES} (recommend under 60)"
