#!/bin/bash
#
# Validate 68K door emulation against vamos reference implementation
# Usage: ./dev/scripts/validate-door-against-vamos.sh [door_path]
#
# This script compares our emulator output against vamos to catch
# memory layout and behavior differences.

set -e

DOOR_PATH="${1:-Doors/who/who}"
DOOR_NAME=$(basename "$DOOR_PATH")

echo "[VALIDATE] Comparing $DOOR_NAME against vamos reference"
echo "========================================================="

# Check vamos is available
if ! command -v vamos &> /dev/null; then
    echo "[ERROR] vamos not found. Install with: pip3 install amitools"
    exit 1
fi

# Run vamos with proc/mem logging
echo ""
echo "[VAMOS] Running $DOOR_NAME..."
VAMOS_OUT=$(mktemp)
timeout 5 vamos -l proc:info "$DOOR_PATH" 2>&1 | cat > "$VAMOS_OUT" || true

# Extract key info from vamos
VAMOS_STACK=$(grep "Stack(" "$VAMOS_OUT" | sed 's/.*Stack(lower=\([^,]*\), upper=\([^,)]*\).*/lower=0x\1 upper=0x\2/' || echo "unknown")

echo "[VAMOS] Segment info:"
grep -a "Segment" "$VAMOS_OUT" | head -5 || echo "  (no segment info)"
echo "[VAMOS] Stack: $VAMOS_STACK"

# Run our emulator
echo ""
echo "[EMULATOR] Running $DOOR_NAME..."
EMU_OUT=$(mktemp)
cd ~/Code/AmiExpress/amiexpress-web
BBS_DATA_DIR=~/Code/AmiExpress/amiexpress-web/board AEDOOR_ROM=kickstart timeout 10 npx tsx scripts/run-amiga-door.ts "$DOOR_PATH" 1 2>&1 | cat > "$EMU_OUT" || true

# Extract key info from emulator (use -a for text mode)
EMU_CODE=$(grep -a "Segment 0: CODE at" "$EMU_OUT" | head -1 | sed 's/.*CODE at \(0x[0-9a-f]*\).*/\1/' || echo "unknown")
EMU_DATA=$(grep -a "Segment 1: DATA at" "$EMU_OUT" | head -1 | sed 's/.*DATA at \(0x[0-9a-f]*\).*/\1/' || echo "unknown")
EMU_STACK=$(grep -a "Stack: lower=" "$EMU_OUT" | head -1 | sed 's/.*Stack: \(lower=[^ ]* upper=[^ ]*\).*/\1/' || echo "unknown")
EMU_EXIT=$(grep -a "Return code" "$EMU_OUT" | head -1 | sed 's/.*Return code.*: //' || echo "unknown")
EMU_ITERS=$(grep -a "Total iterations" "$EMU_OUT" | head -1 | sed 's/.*: //' || echo "unknown")

echo "[EMULATOR] CODE: $EMU_CODE"
echo "[EMULATOR] DATA: $EMU_DATA"
echo "[EMULATOR] Stack: $EMU_STACK"
echo "[EMULATOR] Exit code: $EMU_EXIT (iterations: $EMU_ITERS)"

# Compare
echo ""
echo "[COMPARE] Results:"
echo "--------------------------------------------------------"

PASS=0
FAIL=0

# Check if door exited cleanly
if grep -qa "DOOR EXITED CLEANLY" "$EMU_OUT"; then
    echo "[OK] Door exited cleanly"
    ((PASS++))
else
    echo "[FAIL] Door did not exit cleanly"
    echo "  Last 5 lines of emulator output:"
    tail -5 "$EMU_OUT" | sed 's/^/    /'
    ((FAIL++))
fi

# Check stack is after DATA (like vamos)
if grep -qa "after DATA end" "$EMU_OUT"; then
    echo "[OK] Stack placed after DATA segment (vamos-style)"
    ((PASS++))
else
    echo "[WARN] Stack placement may not match vamos"
    ((FAIL++))
fi

# Cleanup
rm -f "$VAMOS_OUT" "$EMU_OUT"

echo ""
echo "[VALIDATE] Summary: $PASS passed, $FAIL failed"
exit $FAIL
