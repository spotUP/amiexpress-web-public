#!/bin/bash
# Clean all door node_modules to prevent disk bloat
# Run this periodically or when doors are updated

set -e

echo "[INFO] Cleaning door node_modules directories..."

# Count before
BEFORE=$(du -sh Doors 2>/dev/null | cut -f1)
echo "[INFO] Doors size before: $BEFORE"

# Remove all node_modules in Doors/
find Doors -name "node_modules" -type d -maxdepth 2 2>/dev/null | while read dir; do
  echo "[INFO] Removing $dir"
  rm -rf "$dir"
done

# Count after
AFTER=$(du -sh Doors 2>/dev/null | cut -f1)
echo "[INFO] Doors size after: $AFTER"

echo "[OK] Cleanup complete"
