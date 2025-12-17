#!/bin/bash
# Build and install all test doors for AmiExpress BBS
# Uses vbcc cross-compiler for authentic 68K Amiga binaries

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  AmiExpress Test Doors Builder (vbcc)"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "Makefile" ] || [ ! -d "doors" ]; then
    echo -e "${RED}[ERROR]${NC} Must run from sdk/68k directory"
    echo "Usage: cd ~/Code/amiexpress-web/sdk/68k && ./build-all-test-doors.sh"
    exit 1
fi

# Check for required tools
echo "[1/7] Checking build tools..."

# Check VBCC environment variable
if [ -z "$VBCC" ]; then
    echo -e "${YELLOW}[WARN]${NC} VBCC environment variable not set"
    echo "Setting: export VBCC=/opt/homebrew/opt/vbcc"
    export VBCC=/opt/homebrew/opt/vbcc
fi

# Check for vbcc compiler
if ! command -v vc &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} vbcc (vc) not found"
    echo ""
    echo "Install with:"
    echo "  brew tap tditlu/amiga"
    echo "  brew install vbcc"
    echo ""
    exit 1
fi

# Check for vasm assembler
if ! command -v vasmm68k_mot &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} vasm not found"
    echo ""
    echo "Install with:"
    echo "  brew tap tditlu/amiga"
    echo "  brew install vbcc"
    echo ""
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Build tools found (vbcc, vasm)"
echo ""

# Define test doors (door_name:command_name pairs)
DOORS=(
    "diagnostic:DIAGNOSTIC"
    "comprehensive-test:COMPTEST"
    "file-ops-test:FILETEST"
    "advanced-test:ADVTEST"
    "interactive-demo:CDEMO"
)

# Build counters
TOTAL=${#DOORS[@]}
BUILT=0
FAILED=0

echo "[2/7] Building $TOTAL test doors..."
echo ""

# Build each door
for door_pair in "${DOORS[@]}"; do
    door_name="${door_pair%%:*}"
    command_name="${door_pair##*:}"

    echo "-----------------------------------"
    echo "Building: $door_name -> $command_name"
    echo "-----------------------------------"

    # Check if source exists
    if [ ! -f "doors/$door_name/$door_name.c" ]; then
        echo -e "${RED}[ERROR]${NC} Source not found: doors/$door_name/$door_name.c"
        FAILED=$((FAILED + 1))
        continue
    fi

    # Build the door
    if make door NAME="$door_name" 2>&1; then
        echo -e "${GREEN}[OK]${NC} Built: $door_name"
        BUILT=$((BUILT + 1))
    else
        echo -e "${RED}[FAIL]${NC} Failed to build: $door_name"
        FAILED=$((FAILED + 1))
        continue
    fi

    echo ""
done

echo "========================================"
echo "[3/7] Build Summary"
echo "========================================"
echo "Total:  $TOTAL"
echo -e "Built:  ${GREEN}$BUILT${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "Failed: ${RED}$FAILED${NC}"
else
    echo "Failed: 0"
fi
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}[ERROR]${NC} Some doors failed to build"
    exit 1
fi

# Install doors to BBS
echo "[4/7] Installing doors to BBS..."
echo ""

INSTALLED=0
INSTALL_FAILED=0

for door_pair in "${DOORS[@]}"; do
    door_name="${door_pair%%:*}"
    command_name="${door_pair##*:}"

    if make install-door NAME="$door_name" 2>&1; then
        echo -e "${GREEN}[OK]${NC} Installed: $command_name"
        INSTALLED=$((INSTALLED + 1))
    else
        echo -e "${RED}[FAIL]${NC} Failed to install: $command_name"
        INSTALL_FAILED=$((INSTALL_FAILED + 1))
    fi
done

echo ""

# Verify command files exist
echo "[5/7] Verifying command files..."
echo ""

CMD_DIR="~/Code/amiexpress-web/Commands/BBSCmd"
CMD_OK=0
CMD_MISSING=0

for door_pair in "${DOORS[@]}"; do
    door_name="${door_pair%%:*}"
    command_name="${door_pair##*:}"
    cmd_file="$CMD_DIR/$command_name.info"

    if [ -f "$cmd_file" ]; then
        echo -e "${GREEN}[OK]${NC} Command file exists: $command_name.info"
        CMD_OK=$((CMD_OK + 1))
    else
        echo -e "${RED}[MISSING]${NC} Command file not found: $cmd_file"
        CMD_MISSING=$((CMD_MISSING + 1))
    fi
done

echo ""

# Verify binaries in BBS doors directory
echo "[6/7] Verifying BBS door binaries..."
echo ""

DOORS_DIR="~/Code/amiexpress-web/Doors"
BIN_OK=0
BIN_MISSING=0

for door_pair in "${DOORS[@]}"; do
    door_name="${door_pair%%:*}"
    command_name="${door_pair##*:}"
    bin_file="$DOORS_DIR/$command_name/$door_name"

    if [ -f "$bin_file" ]; then
        # Check file type
        file_type=$(file "$bin_file" | grep -o "AmigaOS" || echo "unknown")
        if [ "$file_type" = "AmigaOS" ]; then
            echo -e "${GREEN}[OK]${NC} Binary valid: $command_name/$door_name (AmigaOS executable)"
            BIN_OK=$((BIN_OK + 1))
        else
            echo -e "${YELLOW}[WARN]${NC} Binary exists but may not be Amiga format: $bin_file"
            BIN_OK=$((BIN_OK + 1))
        fi
    else
        echo -e "${RED}[MISSING]${NC} Binary not found: $bin_file"
        BIN_MISSING=$((BIN_MISSING + 1))
    fi
done

echo ""

# Final summary
echo "========================================"
echo "[7/7] FINAL SUMMARY"
echo "========================================"
echo ""
echo "Build Results:"
echo "  Built:     $BUILT / $TOTAL"
echo "  Failed:    $FAILED"
echo ""
echo "Installation Results:"
echo "  Installed: $INSTALLED / $TOTAL"
echo "  Failed:    $INSTALL_FAILED"
echo ""
echo "Command Files:"
echo "  Found:     $CMD_OK / $TOTAL"
echo "  Missing:   $CMD_MISSING"
echo ""
echo "BBS Binaries:"
echo "  Valid:     $BIN_OK / $TOTAL"
echo "  Missing:   $BIN_MISSING"
echo ""

if [ $FAILED -eq 0 ] && [ $INSTALL_FAILED -eq 0 ] && [ $CMD_MISSING -eq 0 ] && [ $BIN_MISSING -eq 0 ]; then
    echo -e "${GREEN}[SUCCESS]${NC} All test doors built and installed!"
    echo ""
    echo "Available Commands:"
    echo "  DIAGNOSTIC  - Comprehensive API test (800+ lines)"
    echo "  COMPTEST    - Basic functionality test"
    echo "  FILETEST    - File operations test"
    echo "  ADVTEST     - Advanced functions test"
    echo "  CDEMO       - Interactive demo"
    echo ""
    echo "Next Steps:"
    echo "  1. Start BBS: cd ~/Code/amiexpress-web && ./dev/scripts/start-servers.sh"
    echo "  2. Connect:   telnet localhost 2323"
    echo "  3. Login and run: DIAGNOSTIC"
    echo "  4. Check output for [PASS]/[FAIL] markers"
    echo "  5. Fix any failures in 68K emulation"
    echo ""
    exit 0
else
    echo -e "${RED}[INCOMPLETE]${NC} Some issues found:"
    if [ $FAILED -gt 0 ]; then
        echo "  - $FAILED door(s) failed to build"
    fi
    if [ $INSTALL_FAILED -gt 0 ]; then
        echo "  - $INSTALL_FAILED door(s) failed to install"
    fi
    if [ $CMD_MISSING -gt 0 ]; then
        echo "  - $CMD_MISSING command file(s) missing"
    fi
    if [ $BIN_MISSING -gt 0 ]; then
        echo "  - $BIN_MISSING binary/binaries missing"
    fi
    echo ""
    echo "Review errors above and fix before testing."
    exit 1
fi
