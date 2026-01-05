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

# Check #1: BBS does NOT send INIT/STAT (door sends JH_REGISTER first)
echo "[1/5] Verifying BBS does NOT send INIT/STAT messages..."
if grep -q "waiting for door to send JH_REGISTER" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts; then
  echo "      [OK] BBS waits for door to initiate (correct XIM protocol)"
else
  echo "      [ERROR] sendStartupMessage() does not wait for door to send JH_REGISTER"
  echo "      BBS must NOT send first - door initiates with JH_REGISTER!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #1"
  FAILED=1
fi

# Check that it's NOT calling sendInitAndStatusMessages
if grep -q "this\.sendInitAndStatusMessages()" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts | grep -v "DO NOT CALL"; then
  echo "      [ERROR] sendStartupMessage() calls sendInitAndStatusMessages()"
  echo "      BBS must NOT send INIT/STAT - door sends JH_REGISTER first!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #1"
  FAILED=1
fi

echo ""

# Check #2a: EXPRESS_VERSION uses fullCommandLine in door.handler.ts
echo "[2/5] Verifying doorParams uses fullCommandLine (command + params)..."
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

# Check #2b: DoorMessageHandler EXPRESS_VERSION fallback returns doorParams, not version
echo "[3/5] Verifying DoorMessageHandler EXPRESS_VERSION returns doorParams..."
if grep -A10 "case XIMCommand.EXPRESS_VERSION" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts | grep -q "doorParams\|commandParams"; then
  echo "      [OK] DoorMessageHandler EXPRESS_VERSION reads doorParams/commandParams"
else
  echo "      [ERROR] DoorMessageHandler EXPRESS_VERSION does not read doorParams"
  echo "      Fallback handler must return command line, not version number!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  FAILED=1
fi

# Check that it's NOT using getExpressMajorVersion
if grep -A10 "case XIMCommand.EXPRESS_VERSION" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts | grep -q "getExpressMajorVersion"; then
  echo "      [ERROR] DoorMessageHandler EXPRESS_VERSION returns getExpressMajorVersion() instead of doorParams"
  echo "      This returns version number instead of command line ('N S U')!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #2"
  FAILED=1
fi

echo ""

# Check #4: AEDoorPort owned by BBS task (not door task)
echo "[4/5] Verifying AEDoorPort is owned by BBS task (not door task)..."
# Check for bbsTask within createAEDoorPort function (multiline call, up to 25 lines)
if grep -A25 "createAEDoorPort" web/backend/src/amiga-emulation/api/ExecLibrary.ts | grep -q "this\.bbsTask"; then
  echo "      [OK] AEDoorPort uses this.bbsTask (BBS Handler Task)"
else
  echo "      [ERROR] AEDoorPort does not use this.bbsTask"
  echo "      Port must be owned by BBS Handler Task to prevent door from signaling itself!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #3"
  FAILED=1
fi

# Check that it's NOT using currentTask
if grep -A25 "createAEDoorPort" web/backend/src/amiga-emulation/api/ExecLibrary.ts | grep -q "this\.currentTask"; then
  echo "      [ERROR] AEDoorPort uses this.currentTask instead of this.bbsTask"
  echo "      This causes signal bit mismatch - door deadlocks in Wait()!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #3"
  FAILED=1
fi

# Check #5: XIM message reply order (verify ReplyMsg is implemented)
echo "[5/5] Verifying XIM message reply is implemented..."
if grep -q "ReplyMsg\|replyMsg" web/backend/src/amiga-emulation/session/DoorMessageHandler.ts; then
  echo "      [OK] ReplyMsg handling is implemented"
else
  echo "      [ERROR] ReplyMsg handling is not implemented"
  echo "      Doors expect synchronous request-reply protocol!"
  echo "      See: Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md #4"
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
