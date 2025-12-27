#!/bin/bash

# Debug build script for MOIRA with strict checking enabled
# This enables all safety and accuracy features at compile time

# Ensure Emscripten is available
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please install emscripten."
    exit 1
fi

# Source directory
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOIRA_DIR="$SRC_DIR/moira-source/Moira"
CONFIG_FILE="$MOIRA_DIR/MoiraConfig.h"

# Output directory
OUT_DIR="$SRC_DIR/build"
mkdir -p "$OUT_DIR"

echo "[DEBUG BUILD] Building Moira WASM with strict checking..."
echo "Source: $MOIRA_DIR"
echo "Output: $OUT_DIR"

# Backup original config
cp "$CONFIG_FILE" "$CONFIG_FILE.bak"

# Temporarily modify MoiraConfig.h for debug build
echo "[DEBUG] Enabling strict compile-time checks..."
sed -i '' 's/#define MOIRA_PRECISE_TIMING false/#define MOIRA_PRECISE_TIMING true/' "$CONFIG_FILE"
sed -i '' 's/#define MOIRA_EMULATE_ADDRESS_ERROR false/#define MOIRA_EMULATE_ADDRESS_ERROR true/' "$CONFIG_FILE"
sed -i '' 's/#define MOIRA_EMULATE_FC false/#define MOIRA_EMULATE_FC true/' "$CONFIG_FILE"

# Show what's enabled
echo "[DEBUG] Config overrides:"
echo "  - MOIRA_PRECISE_TIMING: true"
echo "  - MOIRA_EMULATE_ADDRESS_ERROR: true"
echo "  - MOIRA_EMULATE_FC: true"

# Compile to WebAssembly with debug symbols
emcc \
    -std=c++20 \
    -g \
    -O0 \
    -s ASSERTIONS=2 \
    -s SAFE_HEAP=1 \
    -s STACK_OVERFLOW_CHECK=2 \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME='createMoiraModule' \
    -s EXPORTED_FUNCTIONS='["_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    --bind \
    -I"$MOIRA_DIR" \
    "$SRC_DIR/moira-wrapper.cpp" \
    "$MOIRA_DIR/Moira.cpp" \
    "$MOIRA_DIR/MoiraDebugger.cpp" \
    -o "$OUT_DIR/moira-debug.js"

# Restore original config
mv "$CONFIG_FILE.bak" "$CONFIG_FILE"

if [ $? -eq 0 ]; then
    echo "[OK] Debug build successful!"
    echo "Output files:"
    echo "  - $OUT_DIR/moira-debug.js"
    echo "  - $OUT_DIR/moira-debug.wasm"
    echo ""
    echo "To use debug build:"
    echo "  1. Rename moira-debug.js to moira.js"
    echo "  2. Rename moira-debug.wasm to moira.wasm"
    echo "  3. Restart backend server"
else
    echo "[ERROR] Debug build failed!"
    # Restore config even on failure
    if [ -f "$CONFIG_FILE.bak" ]; then
        mv "$CONFIG_FILE.bak" "$CONFIG_FILE"
    fi
    exit 1
fi
