#!/bin/bash
# check-context-usage.sh
# Identifies files that consume excessive context tokens
# Per CLAUDE.md: Files over 2,000 lines should be modularized

echo "=== Context Usage Analysis ==="
echo ""

# Check handoff.md size (CRITICAL)
echo "[1] Handoff File Check"
HANDOFF_SIZE=$(wc -c < handoff.md 2>/dev/null | tr -d ' ')
HANDOFF_LINES=$(wc -l < handoff.md 2>/dev/null | tr -d ' ')
if [ "$HANDOFF_SIZE" -gt 5000 ]; then
  echo "[ERROR] handoff.md: ${HANDOFF_SIZE} bytes, ${HANDOFF_LINES} lines (MAX: 5KB)"
  echo "        Causes 40-50K token conversation summaries!"
elif [ "$HANDOFF_SIZE" -gt 4000 ]; then
  echo "[WARNING] handoff.md: ${HANDOFF_SIZE} bytes, ${HANDOFF_LINES} lines (approaching 5KB limit)"
else
  echo "[OK] handoff.md: ${HANDOFF_SIZE} bytes, ${HANDOFF_LINES} lines"
fi
echo ""

# Check for oversized source files (over 2,000 lines per CLAUDE.md)
echo "[2] Oversized Source Files (>2000 lines)"
FOUND_LARGE=0
while IFS= read -r file; do
  LINES=$(wc -l < "$file" 2>/dev/null | tr -d ' ')
  SIZE=$(wc -c < "$file" 2>/dev/null | tr -d ' ')
  TOKENS=$((SIZE / 4))
  if [ "$LINES" -gt 2000 ]; then
    echo "[WARNING] $file"
    echo "          Lines: ${LINES} (over 2000 limit)"
    echo "          Size: ${SIZE} bytes (~${TOKENS} tokens if read)"
    FOUND_LARGE=1
  fi
done < <(find web/backend/src -type f -name "*.ts" -size +30k 2>/dev/null | grep -v node_modules | grep -v ".git")

if [ "$FOUND_LARGE" -eq 0 ]; then
  echo "[OK] No oversized source files found"
fi
echo ""

# Check for very large documentation files (>50KB)
echo "[3] Large Documentation Files (>50KB)"
FOUND_DOCS=0
while IFS= read -r file; do
  SIZE=$(wc -c < "$file" 2>/dev/null | tr -d ' ')
  TOKENS=$((SIZE / 4))
  echo "[INFO] $file"
  echo "       Size: ${SIZE} bytes (~${TOKENS} tokens if read)"
  FOUND_DOCS=1
done < <(find Documentation -type f -name "*.md" -size +50k 2>/dev/null)

if [ "$FOUND_DOCS" -eq 0 ]; then
  echo "[OK] No very large documentation files found"
fi
echo ""

# Estimate zombie process impact
echo "[4] Active Background Processes"
ZOMBIE_COUNT=$(ps aux | grep -E "run-amiga-door|start-servers|build-wasm" | grep -v grep | wc -l | tr -d ' ')
if [ "$ZOMBIE_COUNT" -gt 0 ]; then
  ZOMBIE_COST=$((ZOMBIE_COUNT * 150))
  echo "[WARNING] ${ZOMBIE_COUNT} background processes detected"
  echo "          Impact: ~${ZOMBIE_COST} tokens per message"
  ps aux | grep -E "run-amiga-door|start-servers|build-wasm" | grep -v grep
else
  echo "[OK] No zombie background processes"
fi
echo ""

# Summary
echo "=== Summary ==="
echo "High-impact items:"
echo "- Verbose handoff.md (16KB) -> 40-50K token summary"
echo "- Reading database.ts (84KB) -> ~21K tokens"
echo "- Reading index.ts (83KB) -> ~20K tokens"
echo "- Each zombie process -> ~150 tokens/message"
echo ""
echo "Recommendations:"
echo "1. Keep handoff.md under 5KB (currently: ${HANDOFF_SIZE} bytes)"
echo "2. Avoid reading large source files - use grep/search instead"
echo "3. Modularize files over 2,000 lines"
echo "4. Never use background bash processes"
