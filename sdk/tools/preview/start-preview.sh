#!/bin/bash

# Enhanced SDK Preview Server
# - Kills old servers on port 8080
# - Builds SDK and frontend
# - Compiles TypeScript examples (shows errors)
# - Starts preview server

echo "🔍 Checking for existing servers on port 8080..."

# Kill any process using port 8080
OLD_PIDS=$(lsof -ti:8080 2>/dev/null || true)
if [ -n "$OLD_PIDS" ]; then
    echo "⚠️  Killing old servers: $OLD_PIDS"
    kill -9 $OLD_PIDS 2>/dev/null || true
    sleep 1
    echo "✅ Old servers killed"
else
    echo "✅ No old servers found"
fi

echo ""
echo "🔨 Building SDK..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ SDK build failed!"
    exit 1
fi

echo ""
echo "📦 Preparing React frontend..."

# Ensure public directory exists and has latest client files
if [ -d "tools/preview/client" ]; then
    cp -r tools/preview/client/* tools/preview/public/ 2>/dev/null || true
    echo "✅ Frontend files updated"
else
    echo "⚠️  Client directory not found, using existing public files"
fi

echo ""
echo "✨ Compiling example games..."
echo ""

COMPILE_ERRORS=0

# Compile all TypeScript examples to JavaScript
for example_dir in examples/*/; do
    example_name=$(basename "$example_dir")

    # Skip if no TypeScript files exist
    if ! ls "$example_dir"*.ts 1> /dev/null 2>&1; then
        continue
    fi

    echo "  📦 Compiling $example_name..."

    # Create compiled directory if it doesn't exist
    mkdir -p "$example_dir/compiled"

    # Compile TypeScript to JavaScript - SHOW ALL ERRORS
    npx tsc \
        --target ES2020 \
        --module commonjs \
        --outDir "$example_dir/compiled" \
        --rootDir "$example_dir" \
        --esModuleInterop \
        --skipLibCheck \
        --pretty \
        "$example_dir"*.ts 2>&1

    if [ $? -eq 0 ]; then
        echo "  ✅ $example_name compiled successfully"
    else
        echo "  ❌ $example_name has compilation errors (see above)"
        COMPILE_ERRORS=$((COMPILE_ERRORS + 1))
    fi
    echo ""
done

if [ $COMPILE_ERRORS -gt 0 ]; then
    echo "⚠️  Warning: $COMPILE_ERRORS game(s) have TypeScript errors"
    echo "   The preview server will start, but these games may not work correctly"
    echo ""
fi

echo "🚀 Starting preview server..."
echo "📦 Serving React frontend from public/"
echo ""

node tools/preview/server.js
