#!/bin/bash

# Test all SDK example doors for build errors
# Reports which doors build successfully and which fail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "[INFO] Testing all SDK example doors..."
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
FAILED_DOORS=()

for dir in examples/*/; do
    door_name=$(basename "$dir")

    # Skip README
    if [ "$door_name" == "README.md" ]; then
        continue
    fi

    echo "[INFO] Testing: $door_name"

    cd "$dir"

    # Install dependencies
    npm install > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "[ERROR] $door_name - npm install failed"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAILED_DOORS+=("$door_name (install)")
        cd "$SCRIPT_DIR"
        continue
    fi

    # Build
    npm run build > /tmp/build_${door_name}.log 2>&1
    if [ $? -ne 0 ]; then
        echo "[ERROR] $door_name - build failed"
        echo "  Last 10 lines of build output:"
        tail -10 /tmp/build_${door_name}.log | sed 's/^/    /'
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAILED_DOORS+=("$door_name (build)")
    else
        echo "[OK] $door_name - build successful"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi

    cd "$SCRIPT_DIR"
    echo ""
done

echo "========================================="
echo "SUMMARY:"
echo "  Successful: $SUCCESS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
    echo "Failed doors:"
    for failed in "${FAILED_DOORS[@]}"; do
        echo "  - $failed"
    done
    echo ""
    exit 1
else
    echo "All doors built successfully!"
    exit 0
fi
