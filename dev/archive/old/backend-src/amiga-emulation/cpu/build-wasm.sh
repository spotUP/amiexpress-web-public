#!/bin/bash

# Ensure Emscripten is available
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please install emscripten."
    exit 1
fi

# Source directory
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOIRA_DIR="$SRC_DIR/moira-source/Moira"

# Output directory
OUT_DIR="$SRC_DIR/build"
mkdir -p "$OUT_DIR"

echo "Building Moira WASM..."
echo "Source: $MOIRA_DIR"
echo "Output: $OUT_DIR"

# Compile to WebAssembly
emcc \
    -std=c++20 \
    -O3 \
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
    -o "$OUT_DIR/moira.js"

if [ $? -eq 0 ]; then
    echo "✓ Build successful!"
    echo "Output files:"
    echo "  - $OUT_DIR/moira.js"
    echo "  - $OUT_DIR/moira.wasm"
else
    echo "✗ Build failed!"
    exit 1
fi
