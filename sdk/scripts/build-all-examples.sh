#!/bin/bash
#
# Build All Examples and Start Preview
#
# This script:
# 1. Compiles all example doors
# 2. Starts the preview server
# 3. Opens browser to view the examples

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLES_DIR="$SDK_DIR/examples"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AmiExpress SDK - Build All Examples & Preview${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to build an example
build_example() {
    local example_name=$1
    local example_path="$EXAMPLES_DIR/$example_name"

    echo -e "${YELLOW}📦 Building: $example_name${NC}"

    # Skip if no package.json
    if [ ! -f "$example_path/package.json" ]; then
        echo -e "${YELLOW}   ⊘ No package.json, skipping${NC}"
        return
    fi

    cd "$example_path"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "   └─ Installing dependencies..."
        npm install --silent > /dev/null 2>&1 || {
            echo -e "${RED}   ✗ Install failed${NC}"
            return
        }
    fi

    # Build
    if grep -q '"build"' package.json; then
        echo -e "   └─ Compiling TypeScript..."
        npm run build > /tmp/build-$example_name.log 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}   ✓ Built successfully${NC}"
        else
            echo -e "${RED}   ✗ Build failed - first 3 errors:${NC}"
            grep "error TS" /tmp/build-$example_name.log | head -3
            return
        fi
    else
        echo -e "${YELLOW}   ⊘ No build script${NC}"
    fi
}

# Get list of examples (exclude hidden files, only directories)
examples=$(find "$EXAMPLES_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | grep -v '^\.' | sort || true)

if [ -z "$examples" ]; then
    echo -e "${RED}No examples found in $EXAMPLES_DIR${NC}"
    exit 1
fi

# Count examples
total=$(echo "$examples" | wc -l | tr -d ' ')
echo -e "Found ${GREEN}$total${NC} examples to build"
echo ""

# Build each example
current=0
for example in $examples; do
    current=$((current + 1))
    echo -e "${BLUE}[$current/$total]${NC}"
    build_example "$example"
    echo ""
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""

# Return to SDK directory
cd "$SDK_DIR"

# Start preview server
echo -e "${BLUE}🚀 Starting preview server...${NC}"
echo ""

# Kill existing server if running
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Port 8080 in use, killing existing process...${NC}"
    lsof -ti:8080 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Open browser after a delay (background task)
(
    sleep 2
    if command -v open >/dev/null 2>&1; then
        # macOS
        open http://localhost:8080
    elif command -v xdg-open >/dev/null 2>&1; then
        # Linux
        xdg-open http://localhost:8080
    elif command -v start >/dev/null 2>&1; then
        # Windows
        start http://localhost:8080
    else
        echo -e "${YELLOW}Could not open browser automatically${NC}"
        echo -e "Please visit: ${GREEN}http://localhost:8080${NC}"
    fi
) &

# Start the preview server
npm run preview
