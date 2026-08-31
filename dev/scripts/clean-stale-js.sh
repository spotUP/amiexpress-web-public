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

# Also clean .d.ts and .map files outside dist/.
#
# A declaration file that git TRACKS is source, not a build artefact. This
# used to be a hand-maintained list of exclusions, and the list was wrong:
# web/config-app/src/vite-env.d.ts and web/frontend/src/vite-env.d.ts are
# committed - .gitignore even carries an explicit negation for one of them,
# with a comment saying it is source - and this deleted both every time it
# ran. Without them TypeScript does not know import.meta.env, so the
# typecheck fails and the gate every other check depends on quietly drops.
# They were found missing and restored twice in one day before anyone
# noticed what was removing them.
#
# Asking git is self-maintaining: a generated declaration is untracked and
# still goes, and the next committed one does not need anybody to remember
# to add it here.
declcount=0
while IFS= read -r decl; do
  if git ls-files --error-unmatch "$decl" >/dev/null 2>&1; then
    continue
  fi
  rm -f "$decl"
  ((declcount++))
done < <(find . -type f \( -name "*.d.ts" -o -name "*.js.map" -o -name "*.d.ts.map" \) \
  ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.next/*" ! -path "*/build/*" \
  2>/dev/null)

echo "Cleaned $count stale .js files and $declcount generated .d.ts/.map files"
