#!/bin/bash
cd ~/Code/amiexpress-web/sdk/doors
for dir in */; do
  if [ -f "$dir/tsconfig.json" ]; then
    name=$(basename "$dir")
    echo "=== Checking $name ==="
    cd "$dir"
    error_count=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d ' ')
    if [ "$error_count" -gt 0 ]; then
      echo "[ERROR] $error_count errors found"
      npx tsc --noEmit 2>&1 | grep "error TS" | head -5
    else
      echo "[OK] No errors"
    fi
    cd ..
    echo ""
  fi
done
