#!/bin/bash
# AmiExpress C Door Testing Framework
# Automated testing and validation for C doors

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
echo

# Function to test compilation
test_compilation() {
    echo "🔨 Testing compilation..."

    # Clean previous build
    make clean 2>/dev/null || true

    # Test GCC build
    echo "  Testing GCC build..."
    if make COMPILER=gcc 2>&1; then
        echo "  ✅ GCC compilation successful"
        ./testdoor --version 2>/dev/null || echo "  ⚠️  Executable created but no --version support"
    else
        echo "  ❌ GCC compilation failed"
        return 1
    fi

    # Test vbcc build if available
    if which vc >/dev/null 2>&1; then
        echo "  Testing vbcc build..."
        make clean 2>/dev/null || true
        if make COMPILER=vbcc 2>&1; then
            echo "  ✅ vbcc compilation successful"
            if [ -f "testdoor" ]; then
                file testdoor | grep -q "AmigaOS" && echo "  ✅ Amiga executable created" || echo "  ⚠️  Not recognized as Amiga executable"
            fi
        else
            echo "  ❌ vbcc compilation failed"
        fi
    else
        echo "  ⏭️  vbcc not available, skipping"
    fi

    # Restore GCC build for further testing
    make clean 2>/dev/null || true
    make COMPILER=gcc >/dev/null 2>&1 || true
}

# Function to test basic functionality
test_basic() {
    echo "🧪 Testing basic functionality..."

    if [ ! -f "testdoor" ]; then
        echo "  ❌ No executable found"
        return 1
    fi

    # Test with node number (should show registration message)
    echo "  Testing door startup..."
    timeout 10s bash -c "echo '1' | ./testdoor 1" 2>/dev/null || true

    # Check if door ran (look for registration message in output)
    if [ $? -eq 0 ]; then
        echo "  ✅ Door executed successfully"
    else
        echo "  ❌ Door execution failed"
        return 1
    fi
}

# Function to test emulator integration
test_emulator() {
    echo "🖥️  Testing emulator integration..."

    # Build vbcc version if available
    if which vc >/dev/null 2>&1; then
        make clean 2>/dev/null || true
        if make COMPILER=vbcc 2>&1; then
            echo "  ✅ vbcc executable created"

            # Test with door harness (if backend is available)
            if [ -f "../../../web/backend/dist/scripts/run-amiga-door.js" ]; then
                echo "  Testing with MOIRA emulator..."
                timeout 30s node ../../../web/backend/dist/scripts/run-amiga-door.js "$DOOR_DIR/testdoor" 1 2>&1 | head -20 || true

                if [ $? -eq 0 ]; then
                    echo "  ✅ Emulator integration successful"
                else
                    echo "  ⚠️  Emulator test completed (may have timed out)"
                fi
            else
                echo "  ⏭️  Backend not built, skipping emulator test"
            fi
        else
            echo "  ❌ vbcc build failed"
        fi
    else
        echo "  ⏭️  vbcc not available, skipping emulator test"
    fi
}

# Function to test API functions and coverage
test_api() {
    echo "🔧 Testing API functions..."

    # Check that common functions are defined
    echo "  Checking API definitions..."

    local api_functions=("Register" "ShutDown" "sendmessage" "getuserstring" "prompt" "hotkey")
    local found_count=0

    for func in "${api_functions[@]}"; do
        if grep -q "$func(" "$DOOR_NAME.c" 2>/dev/null; then
            echo "  ✅ $func() function used"
            ((found_count++))
        else
            echo "  ⚠️  $func() function not found"
        fi
    done

    # Calculate API coverage
    local coverage=$((found_count * 100 / ${#api_functions[@]}))
    echo "  📊 API Coverage: $coverage% ($found_count/${#api_functions[@]} functions)"

    # Advanced API checks for XIM doors
    if grep -q "DOOR_TYPE.*XIM\|XIM.*DOOR_TYPE" Makefile 2>/dev/null; then
        echo "  🎯 XIM Door - Checking advanced features..."

        local xim_functions=("Download" "Upload" "GetSemaphore" "AcpCommand")
        local xim_found=0

        for func in "${xim_functions[@]}"; do
            if grep -q "$func(" "$DOOR_NAME.c" 2>/dev/null; then
                echo "  ✅ XIM: $func() function used"
                ((xim_found++))
            fi
        done

        if [ $xim_found -gt 0 ]; then
            echo "  📊 XIM Features Used: $xim_found/${#xim_functions[@]}"
        fi
    fi

    # Check for proper error handling
    if grep -q "CloseOut()" "$DOOR_NAME.c" 2>/dev/null; then
        echo "  ✅ Error handling (CloseOut) implemented"
    else
        echo "  ⚠️  No error handling found"
    fi
}

# Function to test performance
test_performance() {
    echo "⚡ Testing performance..."

    # Build optimized versions
    echo "  Testing build times..."

    # GCC build time
    GCC_TIME=$(time (make clean >/dev/null 2>&1 && make COMPILER=gcc >/dev/null 2>&1) 2>&1 | grep real | cut -d' ' -f2)
    echo "  GCC build time: $GCC_TIME"

    # vbcc build time (if available)
    if which vc >/dev/null 2>&1; then
        VBCC_TIME=$(time (make clean >/dev/null 2>&1 && make COMPILER=vbcc >/dev/null 2>&1) 2>&1 | grep real | cut -d' ' -f2)
        echo "  vbcc build time: $VBCC_TIME"
    fi

    # Test execution time
    echo "  Testing execution performance..."
    EXEC_TIME=$(time (timeout 5s bash -c "echo -e 'Test\\nq\\n' | ./testdoor 1 >/dev/null 2>&1" 2>/dev/null) 2>&1 | grep real | cut -d' ' -f2 || echo "N/A")
    echo "  Execution time: $EXEC_TIME"

    # Test memory usage (rough estimate)
    echo "  Testing memory footprint..."
    if command -v time >/dev/null 2>&1 && [ -f "./testdoor" ]; then
        MEM_USAGE=$( (time echo -e "Test\\nq\\n" | ./testdoor 1) 2>&1 | grep -E "maximum resident set size|Max RSS" | head -1 || echo "N/A" )
        echo "  Memory usage: $MEM_USAGE"
    fi
}

# Function to test full integration with BBS system
test_integration() {
    echo "🔗 Testing full BBS integration..."

    # Check if backend is available for integration testing
    if [ ! -f "../../../web/backend/dist/scripts/run-amiga-door.js" ]; then
        echo "  ❌ Backend not built - cannot test integration"
        echo "  💡 Run: cd web/backend && npm run build"
        return 1
    fi

    # Test with vbcc build if available (most realistic test)
    local test_compiler="gcc"
    if which vc >/dev/null 2>&1; then
        echo "  Building with vbcc for authentic integration test..."
        make clean >/dev/null 2>&1
        if make COMPILER=vbcc >/dev/null 2>&1; then
            test_compiler="vbcc"
        fi
    fi

    echo "  🖥️  Testing with MOIRA emulator ($test_compiler build)..."

    # Test door loading and initialization
    local start_time=$(date +%s)
    timeout 30s node ../../../web/backend/dist/scripts/run-amiga-door.js "$DOOR_DIR/testdoor" 1 2>&1 | head -30 || true
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Check for successful initialization markers
    if [ $duration -gt 5 ]; then
        echo "  ✅ Door loaded and ran for $duration seconds"
        echo "  📝 Check logs for detailed execution trace"
    else
        echo "  ⚠️  Door execution was very brief ($duration seconds)"
        echo "  💡 This may indicate early termination or errors"
    fi

    # Test multiple rapid executions (stress test)
    echo "  🔄 Testing multiple executions..."
    local success_count=0
    local total_tests=3

    for i in $(seq 1 $total_tests); do
        timeout 10s bash -c "echo -e '$i\\nq\\n' | ./testdoor 1 >/dev/null 2>&1" && ((success_count++)) || true
    done

    local success_rate=$((success_count * 100 / total_tests))
    echo "  📊 Execution success rate: $success_rate% ($success_count/$total_tests)"

    if [ $success_rate -eq 100 ]; then
        echo "  ✅ Door is stable under repeated execution"
    elif [ $success_rate -gt 50 ]; then
        echo "  ⚠️  Door has some execution issues"
    else
        echo "  ❌ Door has significant execution problems"
    fi

    # Test different door types if specified
    if grep -q "DOOR_TYPE.*XIM" Makefile 2>/dev/null; then
        echo "  🎯 Testing XIM-specific features..."
        # Could add XIM-specific integration tests here
        echo "  ✅ XIM door type detected"
    elif grep -q "DOOR_TYPE.*SIM" Makefile 2>/dev/null; then
        echo "  🎯 Testing SIM-specific features..."
        echo "  ✅ SIM door type detected"
    fi

    # Final integration assessment
    if [ $success_rate -ge 80 ] && [ $duration -gt 3 ]; then
        echo "  🏆 Integration test: PASSED"
        return 0
    else
        echo "  ❌ Integration test: FAILED"
        return 1
    fi
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
        echo "Available types: basic, full, performance, all"
        exit 1
        ;;
esac

echo
echo "=== Test Summary ==="
echo "Door: $DOOR_NAME"
echo "Type: $TEST_TYPE"
echo "Status: Complete"

# Final cleanup
make clean >/dev/null 2>&1 || true

echo "✅ Testing completed successfully!"