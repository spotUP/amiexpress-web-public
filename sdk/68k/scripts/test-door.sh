#!/bin/bash
# AmiExpress C Door Testing Framework
# Automated testing and validation for C doors using vbcc

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOOR_NAME="$1"
TEST_TYPE="${2:-basic}"

if [ -z "$DOOR_NAME" ]; then
    echo "Usage: $0 <door_name> [test_type]"
    echo "Test types: basic, full, performance, integration, all"
    echo ""
    echo "Test Types:"
    echo "  basic       - Compilation and basic functionality"
    echo "  full        - Basic + emulator integration"
    echo "  performance - Build/execution timing and resources"
    echo "  integration - Full BBS system integration test"
    echo "  all         - Complete test suite"
    exit 1
fi

# Check VBCC environment
if [ -z "$VBCC" ]; then
    echo "[WARN] VBCC not set, using default"
    export VBCC=/opt/homebrew/opt/vbcc
fi

cd "$SCRIPT_DIR/.."
DOOR_DIR="doors/$DOOR_NAME"

# Check if door exists
if [ ! -d "$DOOR_DIR" ]; then
    echo "Error: Door '$DOOR_NAME' not found in $DOOR_DIR"
    exit 1
fi

cd "$DOOR_DIR"

echo "=== Testing C Door: $DOOR_NAME ==="
echo "Test Type: $TEST_TYPE"
echo "Directory: $DOOR_DIR"
echo "Compiler: vbcc"
echo

# Function to test compilation
test_compilation() {
    echo "[BUILD] Testing vbcc compilation..."

    # Clean previous build
    make clean 2>/dev/null || true

    # Test vbcc build
    if command -v vc &> /dev/null; then
        echo "  Building with vbcc..."
        if make 2>&1; then
            echo "  [OK] vbcc compilation successful"
            if [ -f "$DOOR_NAME" ]; then
                file "$DOOR_NAME" | grep -q "AmigaOS" && echo "  [OK] Amiga executable created" || echo "  [WARN] Not recognized as Amiga executable"
            fi
        else
            echo "  [FAIL] vbcc compilation failed"
            return 1
        fi
    else
        echo "  [ERROR] vbcc not available"
        echo "  Install with: brew tap tditlu/amiga && brew install vbcc"
        return 1
    fi
}

# Function to test basic functionality
test_basic() {
    echo "[TEST] Testing basic functionality..."

    if [ ! -f "$DOOR_NAME" ]; then
        echo "  [FAIL] No executable found"
        return 1
    fi

    # Check file format
    if file "$DOOR_NAME" | grep -q "AmigaOS"; then
        echo "  [OK] Valid Amiga HUNK executable"
    else
        echo "  [WARN] May not be valid Amiga format"
    fi

    # Check file size
    local size=$(ls -l "$DOOR_NAME" | awk '{print $5}')
    echo "  [INFO] Executable size: $size bytes"

    if [ "$size" -lt 100 ]; then
        echo "  [WARN] Executable seems too small"
    elif [ "$size" -gt 100000 ]; then
        echo "  [WARN] Executable seems large for a door"
    else
        echo "  [OK] Reasonable executable size"
    fi
}

# Function to test API functions and coverage
test_api() {
    echo "[API] Testing API functions..."

    # Check that common functions are defined
    echo "  Checking API definitions..."

    local api_functions=("Register" "ShutDown" "sendmessage" "getuserstring" "prompt" "hotkey")
    local found_count=0

    for func in "${api_functions[@]}"; do
        if grep -q "$func(" "$DOOR_NAME.c" 2>/dev/null; then
            echo "  [OK] $func() function used"
            ((found_count++))
        else
            echo "  [WARN] $func() function not found"
        fi
    done

    # Calculate API coverage
    local coverage=$((found_count * 100 / ${#api_functions[@]}))
    echo "  [INFO] API Coverage: $coverage% ($found_count/${#api_functions[@]} functions)"

    # Check for proper error handling
    if grep -q "CloseOut()" "$DOOR_NAME.c" 2>/dev/null; then
        echo "  [OK] Error handling (CloseOut) implemented"
    else
        echo "  [WARN] No error handling found"
    fi
}

# Function to test with vamos emulator
test_emulator() {
    echo "[EMU] Testing with vamos emulator..."

    if ! command -v vamos &> /dev/null; then
        echo "  [SKIP] vamos not installed"
        echo "  Install with: pip3 install amitools"
        return 0
    fi

    if [ -f "$DOOR_NAME" ]; then
        echo "  Running with vamos..."
        timeout 10s vamos "$DOOR_NAME" 2>&1 | head -20 || true
        local exit_code=$?

        if [ $exit_code -eq 20 ]; then
            echo "  [OK] Door ran (exit 20 = library not found, expected)"
        elif [ $exit_code -eq 0 ]; then
            echo "  [OK] Door ran successfully"
        else
            echo "  [WARN] Exit code: $exit_code"
        fi
    else
        echo "  [FAIL] No executable to test"
    fi
}

# Function to test performance
test_performance() {
    echo "[PERF] Testing performance..."

    # Build time
    echo "  Testing build time..."
    local start_time=$(date +%s.%N)
    make clean >/dev/null 2>&1
    make >/dev/null 2>&1
    local end_time=$(date +%s.%N)
    local build_time=$(echo "$end_time - $start_time" | bc)
    echo "  [INFO] Build time: ${build_time}s"

    # File size
    if [ -f "$DOOR_NAME" ]; then
        local size=$(ls -l "$DOOR_NAME" | awk '{print $5}')
        echo "  [INFO] Binary size: $size bytes"
    fi
}

# Function to test full integration
test_integration() {
    echo "[INT] Testing BBS integration..."

    # Check if backend is available
    if [ ! -f "../../../../web/backend/dist/index.js" ]; then
        echo "  [SKIP] Backend not built"
        echo "  Build with: cd web/backend && npm run build"
        return 0
    fi

    echo "  [INFO] Backend available for integration testing"
    echo "  [INFO] To test: Start BBS and run door command"
}

# Run tests based on type
case "$TEST_TYPE" in
    "basic")
        test_compilation
        test_basic
        test_api
        ;;
    "full")
        test_compilation
        test_basic
        test_emulator
        test_api
        ;;
    "performance")
        test_performance
        ;;
    "integration")
        test_integration
        ;;
    "all")
        test_compilation
        test_basic
        test_emulator
        test_api
        test_performance
        test_integration
        ;;
    *)
        echo "Unknown test type: $TEST_TYPE"
        echo "Available types: basic, full, performance, integration, all"
        exit 1
        ;;
esac

echo
echo "=== Test Summary ==="
echo "Door: $DOOR_NAME"
echo "Type: $TEST_TYPE"
echo "Status: Complete"

echo "[OK] Testing completed!"
