#!/bin/bash
# Clean stale .js files that have matching .ts sources
# These are from in-place compilation that shouldn't exist

echo "Scanning for stale .js files (compiled next to .ts sources)..."

count=0
while IFS= read -r jsfile; do
  tsfile="${jsfile%.js}.ts"
  if [ -f "$tsfile" ]; then
    rm "$jsfile"
    ((count++))
  fi
done < <(find . -type f -name "*.js" ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.next/*" ! -path "*/build/*" 2>/dev/null)

# Also clean .d.ts and .map files outside dist/
# IMPORTANT: Exclude sdk/types/ which contains intentional type declarations (chiptune3.d.ts, etc.)
find . -type f \( -name "*.d.ts" -o -name "*.js.map" -o -name "*.d.ts.map" \) \
  ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.next/*" ! -path "*/build/*" \
  ! -path "*/sdk/types/*" ! -path "*/web/backend/src/types/*" \
  -delete 2>/dev/null

echo "Cleaned $count stale .js files and associated .d.ts/.map files"
