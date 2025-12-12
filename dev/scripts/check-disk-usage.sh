#!/bin/bash
# Check project disk usage and warn about bloat

set -e

echo "[INFO] Checking project disk usage..."
echo ""

# Total size
TOTAL=$(du -sh . 2>/dev/null | cut -f1)
echo "Total project size: $TOTAL"
echo ""

# Top 10 largest directories
echo "[INFO] Top 10 largest directories:"
du -sh * .* 2>/dev/null | sort -hr | head -10
echo ""

# Check for large door node_modules
echo "[INFO] Checking door node_modules..."
if find Doors -name "node_modules" -type d -maxdepth 2 2>/dev/null | grep -q .; then
  echo "[WARNING] Found node_modules in Doors (should be cleaned):"
  find Doors -name "node_modules" -type d -maxdepth 2 2>/dev/null | while read dir; do
    SIZE=$(du -sh "$dir" 2>/dev/null | cut -f1)
    echo "  $dir - $SIZE"
  done
  echo ""
  echo "[ACTION] Run: ./dev/scripts/clean-door-dependencies.sh"
else
  echo "[OK] No door node_modules found"
fi
echo ""

# Check log files
echo "[INFO] Checking large log files..."
find logs -type f -size +10M 2>/dev/null | while read file; do
  SIZE=$(du -sh "$file" 2>/dev/null | cut -f1)
  echo "[WARNING] Large log: $file - $SIZE"
done

# Check backup logs
if [ -f "Node1/CLogBackup" ]; then
  SIZE=$(du -sh Node1/CLogBackup 2>/dev/null | cut -f1)
  echo "[WARNING] CLogBackup exists - $SIZE"
  echo "[ACTION] Consider removing: rm Node1/CLogBackup"
fi

echo ""
echo "[INFO] Disk usage check complete"
