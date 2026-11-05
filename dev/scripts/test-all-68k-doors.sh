#!/bin/bash
# Comprehensive 68K Door Test Script
# Tests all available 68K doors to verify emulation completeness

# Don't use set -e so we can test all doors even after failures
# set -e

PROJECT_ROOT="~/Code/AmiExpress/amiexpress-web/board"
cd "$PROJECT_ROOT"

echo "[TEST] Comprehensive 68K Door Emulation Test"
echo "[TEST] =================================="
echo ""

# Test configuration
export BBS_DATA_DIR="$PROJECT_ROOT"
export AEDOOR_ROM=kickstart
export AEDOOR_LOOP_LIMIT=100000

# Results tracking
TOTAL_DOORS=0
PASSED_DOORS=0
FAILED_DOORS=0
SKIPPED_DOORS=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function with configurable timeout
test_door_with_timeout() {
    local timeout_secs=$1
    local door_name=$2
    local door_path=$3
    shift 3
    local args=("$@")

    TOTAL_DOORS=$((TOTAL_DOORS + 1))

    echo ""
    echo "[TEST] Testing: $door_name (timeout: ${timeout_secs}s)"
    echo "[TEST] Path: $door_path"
    echo "[TEST] Args: ${args[*]}"

    local output_file="/tmp/door_test_${door_name}.out"
    export AEDOOR_STDOUT="$output_file"

    # Run door with timeout
    if timeout "$timeout_secs" npx tsx scripts/run-amiga-door.ts "$door_path" 1 "${args[@]}" > "/tmp/door_test_${door_name}.log" 2>&1; then
        # Check if output was generated or door exited cleanly
        if [ -f "$output_file" ] || grep -q "Total iterations" "/tmp/door_test_${door_name}.log" 2>/dev/null; then
            echo -e "${GREEN}[OK]${NC} $door_name completed successfully"
            PASSED_DOORS=$((PASSED_DOORS + 1))

            # Show iteration count
            local iterations=$(grep "Total iterations" "/tmp/door_test_${door_name}.log" 2>/dev/null | tail -1 || echo "unknown")
            echo "[INFO] $iterations"
            return 0
        else
            echo -e "${RED}[FAIL]${NC} $door_name - no output generated"
            FAILED_DOORS=$((FAILED_DOORS + 1))
            return 1
        fi
    else
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            echo -e "${RED}[TIMEOUT]${NC} $door_name - exceeded ${timeout_secs} second limit"
        else
            echo -e "${RED}[ERROR]${NC} $door_name - exit code $exit_code"
        fi
        FAILED_DOORS=$((FAILED_DOORS + 1))

        # Show last few lines of log
        echo "[LOG] Last 5 lines:"
        tail -5 "/tmp/door_test_${door_name}.log" 2>/dev/null || echo "(no log)"
        return 1
    fi
}

# Standard 10-second test function
test_door() {
    local door_name=$1
    local door_path=$2
    shift 2
    local args=("$@")

    TOTAL_DOORS=$((TOTAL_DOORS + 1))

    echo ""
    echo "[TEST] Testing: $door_name"
    echo "[TEST] Path: $door_path"
    echo "[TEST] Args: ${args[*]}"

    local output_file="/tmp/door_test_${door_name}.out"
    export AEDOOR_STDOUT="$output_file"

    # Run door with timeout
    if timeout 10 npx tsx scripts/run-amiga-door.ts "$door_path" 1 "${args[@]}" > "/tmp/door_test_${door_name}.log" 2>&1; then
        # Check if output was generated or door exited cleanly
        if [ -f "$output_file" ] || grep -q "Total iterations" "/tmp/door_test_${door_name}.log" 2>/dev/null; then
            echo -e "${GREEN}[OK]${NC} $door_name completed successfully"
            PASSED_DOORS=$((PASSED_DOORS + 1))

            # Show iteration count
            local iterations=$(grep "Total iterations" "/tmp/door_test_${door_name}.log" 2>/dev/null | tail -1 || echo "unknown")
            echo "[INFO] $iterations"
            return 0
        else
            echo -e "${RED}[FAIL]${NC} $door_name - no output generated"
            FAILED_DOORS=$((FAILED_DOORS + 1))
            return 1
        fi
    else
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            echo -e "${RED}[TIMEOUT]${NC} $door_name - exceeded 10 second limit"
        else
            echo -e "${RED}[ERROR]${NC} $door_name - exit code $exit_code"
        fi
        FAILED_DOORS=$((FAILED_DOORS + 1))

        # Show last few lines of log
        echo "[LOG] Last 5 lines:"
        tail -5 "/tmp/door_test_${door_name}.log" 2>/dev/null || echo "(no log)"
        return 1
    fi
}

# Test doors
echo "[TEST] Starting door tests..."
echo ""

# QuickNew - File listing door
# Uses TestConfig (minimal test file) with relative path from door's cwd
if [ -f "Doors/QuickNew/QuickNew" ]; then
    test_door "QuickNew" "Doors/QuickNew/QuickNew" \
        "QuickNew.TestConfig" "1"
else
    echo -e "${YELLOW}[SKIP]${NC} QuickNew - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# MultiTop - Top users door
# Usage: MULTITOP <designfile> <outputfile> [<userdata>]
# Uses test-users.data (small 10-user file) for fast testing
if [ -f "Doors/MultiTop/mtop" ]; then
    # Use relative paths from door's cwd, output to screen (*)
    # Uses small test user file for reliable fast testing
    test_door "MultiTop" "Doors/MultiTop/mtop" \
        "Designs/MTopULBytes1.dsg" "*" "test-users.data"
else
    echo -e "${YELLOW}[SKIP]${NC} MultiTop - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# WHO - User listing door
if [ -f "Doors/who/who" ]; then
    test_door "WHO" "Doors/who/who"
else
    echo -e "${YELLOW}[SKIP]${NC} WHO - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# GetAnswer - Input testing door
if [ -f "Doors/GetAnswer/GetAnswer" ]; then
    test_door "GetAnswer" "Doors/GetAnswer/GetAnswer"
else
    echo -e "${YELLOW}[SKIP]${NC} GetAnswer - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# RTW - Read The Wall door
if [ -f "Doors/RTW/rtw" ]; then
    test_door "RTW" "Doors/RTW/rtw"
else
    echo -e "${YELLOW}[SKIP]${NC} RTW - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# ByteKiller - File decompressor
if [ -f "Doors/ByteKiller/ByteKillHandler" ]; then
    test_door "ByteKiller" "Doors/ByteKiller/ByteKillHandler" \
        "$PROJECT_ROOT/Node1/CallersLog"
else
    echo -e "${YELLOW}[SKIP]${NC} ByteKiller - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# SlickTop - Top downloaders door
if [ -f "Doors/slicktop/slicktop" ]; then
    test_door "SlickTop" "Doors/slicktop/slicktop" \
        "/tmp/slicktop_test.txt" \
        "$PROJECT_ROOT/Conf1/conf.db" \
        "20" "3" "Top Files"
else
    echo -e "${YELLOW}[SKIP]${NC} SlickTop - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# NTR-LastCallers - Last callers bulletin
if [ -f "Doors/ntr-lastcallers/ntr-lastcallers" ]; then
    test_door "NTR-LastCallers" "Doors/ntr-lastcallers/ntr-lastcallers"
else
    echo -e "${YELLOW}[SKIP]${NC} NTR-LastCallers - binary not found"
    SKIPPED_DOORS=$((SKIPPED_DOORS + 1))
fi

# Summary
echo ""
echo "========================================"
echo "[RESULTS] 68K Door Emulation Test Results"
echo "========================================"
echo ""
echo -e "Total doors tested:    $TOTAL_DOORS"
echo -e "${GREEN}Passed:${NC}                $PASSED_DOORS"
echo -e "${RED}Failed:${NC}                $FAILED_DOORS"
echo -e "${YELLOW}Skipped:${NC}               $SKIPPED_DOORS"
echo ""

if [ $FAILED_DOORS -eq 0 ] && [ $PASSED_DOORS -gt 0 ]; then
    echo -e "${GREEN}[SUCCESS]${NC} All tested doors passed!"
    exit 0
elif [ $PASSED_DOORS -eq 0 ]; then
    echo -e "${RED}[FAILURE]${NC} No doors passed tests"
    exit 1
else
    echo -e "${YELLOW}[PARTIAL]${NC} Some doors passed, some failed"
    exit 1
fi
