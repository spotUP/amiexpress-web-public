#!/bin/bash
# XIM Critical Requirements Verification Script
# Prevents regressions of critical XIM protocol implementations
# See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "=== XIM Critical Requirements Verification ==="
echo ""

FAILED=0

# Check #1: INIT/STAT messages are sent
echo "[1/2] Verifying sendStartupMessage() calls sendInitAndStatusMessages()..."
if grep -q "this.sendInitAndStatusMessages()" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts; then
  echo "      [OK] sendInitAndStatusMessages() is called"
else
  echo "      [ERROR] sendStartupMessage() does not call sendInitAndStatusMessages()"
  echo "      This will cause AquaScan, JoinCnf, and other old-style XIM doors to hang!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #1"
  FAILED=1
fi

# Check that it's NOT skipping
if grep -q "Skipping startup messages" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts; then
  echo "      [ERROR] sendStartupMessage() is skipping INIT/STAT messages"
  echo "      This will cause doors to hang in polling loops!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #1"
  FAILED=1
fi

echo ""

# Check #2: EXPRESS_VERSION uses fullCommandLine
echo "[2/2] Verifying doorParams uses fullCommandLine (command + params)..."
if grep -q "fullCommandLine.*door.command" web/backend/src/handlers/door.handler.ts; then
  echo "      [OK] fullCommandLine is constructed from door.command"
else
  echo "      [ERROR] fullCommandLine is not constructed from door.command"
  echo "      EXPRESS_VERSION will return wrong value!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  FAILED=1
fi

if grep -q "doorParams.*fullCommandLine" web/backend/src/handlers/door.handler.ts; then
  echo "      [OK] doorParams is set to fullCommandLine"
else
  echo "      [ERROR] doorParams is not set to fullCommandLine"
  echo "      EXPRESS_VERSION will return wrong value (params only, missing command)!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  FAILED=1
fi

# Check that it's NOT using paramString directly
if grep -q "doorParams = paramString" web/backend/src/handlers/door.handler.ts; then
  echo "      [ERROR] doorParams is set to paramString instead of fullCommandLine"
  echo "      This returns only parameters ('S U') not full command line ('N S U')!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  FAILED=1
fi

echo ""
echo "=== Verification Complete ==="

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "[FAILED] XIM critical requirements verification failed!"
  echo "Review errors above and see Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md"
  exit 1
else
  echo ""
  echo "[SUCCESS] All XIM critical requirements verified!"
  exit 0
fi
