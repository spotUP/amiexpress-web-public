#!/bin/bash
# Migrate critical BBS files to use amigafs instead of fs
# This handles case-insensitive file operations for AmigaOS compatibility

set -e

echo "[INFO] Starting amigafs migration..."

# Priority 1: Door loading and management
FILES_P1=(
  "web/backend/src/doors/amigaDoorManager.ts"
  "web/backend/src/amiga-emulation/api/PathManager.ts"
  "web/backend/src/amiga-emulation/api/DosLibrary.ts"
  "web/backend/src/amiga-emulation/DoorLoader.ts"
)

# Priority 2: Command handlers
FILES_P2=(
  "web/backend/src/handlers/door.handler.ts"
  "web/backend/src/handlers/command-execution.handler.ts"
  "web/backend/src/handlers/file-listing.handler.ts"
)

# Function to migrate a file
migrate_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "[SKIP] File not found: $file"
    return
  fi

  echo "[MIGRATE] $file"

  # Check if already has amigafs import
  if grep -q "import.*amigafs" "$file"; then
    echo "  [OK] Already has amigafs import"
  else
    # Add amigafs import after fs import
    if grep -q "import \* as fs from 'fs'" "$file"; then
      sed -i.bak "s|import \* as fs from 'fs';|import * as fs from 'fs';\nimport * as amigafs from '../utils/amigafs';|" "$file"
      echo "  [OK] Added amigafs import"
    else
      echo "  [WARN] No fs import found, skipping"
    fi
  fi

  # Replace fs calls with amigafs calls for BBS file operations
  # We only replace calls that operate on BBS paths
  # Keep fs. for system operations like fs.mkdirSync with recursive option

  # Pattern: fs.existsSync that checks BBS paths
  # Replace: fs.existsSync → amigafs.existsSync
  sed -i.bak 's/\bfs\.existsSync(/amigafs.existsSync(/g' "$file"

  # Pattern: fs.readFileSync for BBS files
  sed -i.bak 's/\bfs\.readFileSync(/amigafs.readFileSync(/g' "$file"

  # Pattern: fs.readdirSync for BBS directories
  sed -i.bak 's/\bfs\.readdirSync(/amigafs.readdirSync(/g' "$file"

  # Pattern: fs.statSync for BBS files
  sed -i.bak 's/\bfs\.statSync(/amigafs.statSync(/g' "$file"

  # Pattern: fs.lstatSync for BBS files
  sed -i.bak 's/\bfs\.lstatSync(/amigafs.lstatSync(/g' "$file"

  echo "  [OK] Replaced fs calls with amigafs"

  # Remove backup file
  rm -f "${file}.bak"
}

echo ""
echo "[PRIORITY 1] Migrating door loading files..."
for file in "${FILES_P1[@]}"; do
  migrate_file "$file"
done

echo ""
echo "[PRIORITY 2] Migrating command handler files..."
for file in "${FILES_P2[@]}"; do
  migrate_file "$file"
done

echo ""
echo "[OK] Migration complete!"
echo ""
echo "[NEXT STEPS]"
echo "1. Run: npx tsc --noEmit  (check for TypeScript errors)"
echo "2. Test door loading with different case variations"
echo "3. Check logs for any file not found errors"
echo ""
