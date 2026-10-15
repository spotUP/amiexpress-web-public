#!/bin/bash
# Script to convert remaining fs calls to amigafs in backend/src
# This completes the amigafs migration for case-insensitive file operations

set -e

cd "$(dirname "$0")/.."

echo "=== AmigaFS Migration Script ==="
echo "Converting remaining fs calls to amigafs for case-insensitive file operations"
echo ""

# Files already converted:
# - database.ts
# - amiga-emulation/xim/io.ts
# - amiga-emulation/api/ExecLibrary.ts
# - amiga-emulation/cpu/MoiraEmulator.ts
# - amiga-emulation/api/LibraryTraps.ts
# - amiga-emulation/xim/system-commands.ts
# - amiga-emulation/PythonDoorSession.ts
# - amiga-emulation/AREXXDoorSession.ts
# - amiga-emulation/doorHandler.ts
# - amiga-emulation/KickstartRom.ts
# - amiga-emulation/loader/LibraryLoader.ts
# - amiga-emulation/DoorLogger.ts
# - amiga-emulation/xim/debug-logger.ts

# Remaining files that need conversion:
REMAINING_FILES=(
  "src/handlers/command-handler/internal-commands.ts"
  "src/handlers/command-handler/command-execution.ts"
  "src/handlers/command-handler/menu.ts"
  "src/handlers/command-handler/core.ts"
  "src/handlers/file/download.handler.ts"
  "src/handlers/user/new-user.handler.ts"
  "src/handlers/commands/utility-commands.handler.ts"
  "src/handlers/commands/user-commands.handler.ts"
  "src/handlers/commands/transfer-misc-commands.handler.ts"
  "src/handlers/file/file-maintenance.handler.ts"
  "src/handlers/transfer/batch-download.handler.ts"
  "src/handlers/content/zippy-search.handler.ts"
  "src/handlers/admin/wizard.handler.ts"
  "src/services/UserFileManager.ts"
  "src/services/conference-setup.service.ts"
  "src/services/config.service.ts"
  "src/services/file-areas-loader.ts"
  "src/services/qwk.service.ts"
  "src/services/ymodem-transfer.service.ts"
  "src/services/xmodem-transfer.service.ts"
  "src/services/punter-transfer.service.ts"
  "src/services/zmodem-transfer.service.ts"
  "src/services/SessionLogManager.ts"
  "src/services/DoorDropFileManager.ts"
  "src/services/bbs-health-check.service.ts"
  "src/services/bbs-config-file.service.ts"
  "src/services/conf-config.service.ts"
  "src/services/ConferenceFileManager.ts"
  "src/services/MessageIndexManager.ts"
  "src/services/MessageFileManager.ts"
  "src/services/FileAreaManager.ts"
  "src/services/SequentialFileManager.ts"
  "src/services/NodeFileManager.ts"
  "src/services/SamiLogService.ts"
  "src/services/SamiLogRunner.ts"
  "src/services/mrc-client.ts"
  "src/services/import-validation.service.ts"
  "src/services/UserDatabaseManager.ts"
  "src/services/CallersLogManager.ts"
  "src/utils/acs.util.ts"
  "src/utils/info-file.util.ts"
  "src/utils/iff-parser.util.ts"
  "src/utils/screen-security.util.ts"
  "src/utils/message-file.util.ts"
  "src/utils/petscii.util.ts"
  "src/utils/door-logging.util.ts"
  "src/utils/lastcallers-generator.ts"
  "src/utils/quicknew-generator.ts"
  "src/utils/max-dirs.util.ts"
  "src/utils/file-flag.util.ts"
  "src/utils/upload-notify.util.ts"
  "src/utils/download-logging.util.ts"
  "src/utils/shortcut.util.ts"
  "src/utils/ssh-key.util.ts"
  "src/utils/lzh-parser.ts"
  "src/utils/extractors/lzx-extractor.ts"
  "src/doors/door-api-routes.ts"
  "src/doors/DoorManagerInfoEditor.ts"
  "src/doors/DoorManager.ts"
  "src/doors/client-door-bundler.ts"
  "src/api/deployment-routes.ts"
  "src/server/routes-setup.ts"
  "src/server/socket-handlers.ts"
  "src/server/initialization.ts"
  "src/server/file-socket-handlers.ts"
  "src/server/app.ts"
  "src/server/file-routes.ts"
  "src/scripts/run-amiga-door.ts"
  "src/scripts/info-editor.ts"
  "src/scripts/test-info-parser.ts"
  "src/scripts/debug-rtw.ts"
)

echo "Found ${#REMAINING_FILES[@]} files that may need conversion"
echo ""

# For each file, check if it uses fs and needs amigafs import
for file in "${REMAINING_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "[SKIP] File not found: $file"
    continue
  fi

  # Check if file uses fs sync operations
  if ! grep -q 'fs\.\(existsSync\|readFileSync\|writeFileSync\|statSync\|readdirSync\|mkdirSync\|unlinkSync\|appendFileSync\|rmdirSync\|renameSync\|copyFileSync\)' "$file"; then
    echo "[SKIP] No fs sync operations: $file"
    continue
  fi

  # Check if already has amigafs import
  if grep -q "import.*amigafs" "$file"; then
    echo "[ALREADY CONVERTED] $file"
    continue
  fi

  echo "[NEEDS CONVERSION] $file"
  echo "  This file needs manual conversion:"
  echo "  1. Add: import * as amigafs from '../utils/amigafs'; (adjust path depth)"
  echo "  2. Replace fs.existsSync -> amigafs.existsSync"
  echo "  3. Replace fs.readFileSync -> amigafs.readFileSync (cast to Buffer/string if needed)"
  echo "  4. Replace fs.writeFileSync -> amigafs.writeFileSync"
  echo "  5. Replace fs.statSync -> amigafs.statSync"
  echo "  6. Replace fs.readdirSync -> amigafs.readdirSync (cast to string[] if needed)"
  echo "  7. Replace fs.mkdirSync -> amigafs.mkdirSync"
  echo "  8. Replace fs.unlinkSync -> amigafs.unlinkSync"
  echo "  9. Replace fs.appendFileSync -> amigafs.appendFileSync"
  echo "  10. Replace fs.rmdirSync -> amigafs.rmdirSync"
  echo "  11. Replace fs.renameSync -> amigafs.renameSync"
  echo "  12. Replace fs.copyFileSync -> amigafs.copyFileSync"
  echo ""
done

echo ""
echo "=== Migration Summary ==="
echo "Completed files:"
echo "  - database.ts"
echo "  - amiga-emulation/* (16 files)"
echo ""
echo "To complete the migration:"
echo "1. Review the files listed above that need conversion"
echo "2. Manually convert each file using the pattern shown"
echo "3. Run: cd ~/Code/amiexpress-web/web/backend && npx tsc --noEmit"
echo "4. Fix any type errors"
echo ""
echo "For reference, see Documentation/3-Developers/AMIGAFS_MIGRATION.md"
