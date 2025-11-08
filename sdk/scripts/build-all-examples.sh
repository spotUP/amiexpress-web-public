#!/bin/bash
#
# Build All Examples - Simpler Version with Debug Output
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLES_DIR="$SDK_DIR/examples"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AmiExpress SDK - Build All Examples & Preview${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get examples
examples=$(find "$EXAMPLES_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | grep -v '^\.' | sort)

total=$(echo "$examples" | wc -l | tr -d ' ')
echo -e "Found ${GREEN}$total${NC} examples to build"
echo ""

current=0
success=0
failed=0

for example in $examples; do
    current=$((current + 1))
    example_path="$EXAMPLES_DIR/$example"

    echo -e "${BLUE}[$current/$total]${NC} ${YELLOW}📦 $example${NC}"

    # Skip if no package.json
    if [ ! -f "$example_path/package.json" ]; then
        echo -e "   ${YELLOW}⊘ No package.json, skipping${NC}"
        echo ""
        continue
    fi

    cd "$example_path"

    # Always refresh dependencies to prevent stale SDK references
    echo -e "   └─ Refreshing dependencies..."
    rm -rf node_modules package-lock.json 2>/dev/null || true
    if ! npm install --silent > /dev/null 2>&1; then
        echo -e "   ${RED}✗ Install failed${NC}"
        failed=$((failed + 1))
        echo ""
        continue
    fi

    # Build
    if ! grep -q '"build"' package.json; then
        echo -e "   ${YELLOW}⊘ No build script${NC}"
        echo ""
        continue
    fi

    echo -e "   └─ Compiling..."

    # Run build with timeout, redirect to log
    if timeout 45 npm run build > "/tmp/build-$example.log" 2>&1; then
        echo -e "   ${GREEN}✓ Built successfully${NC}"
        success=$((success + 1))
    else
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            echo -e "   ${RED}✗ Timeout (>45s)${NC}"
        else
            echo -e "   ${RED}✗ Build failed${NC}"

            # Show first 3 errors
            if [ -f "/tmp/build-$example.log" ]; then
                echo ""
                echo -e "   ${YELLOW}First 3 errors:${NC}"
                grep "error TS" "/tmp/build-$example.log" 2>/dev/null | head -3 | sed 's/^/     /' || \
                    tail -5 "/tmp/build-$example.log" | sed 's/^/     /'
            fi
        fi
        failed=$((failed + 1))
    fi

    echo ""
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Build complete: $success successful, $failed failed${NC}"
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
        open http://localhost:8080
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open http://localhost:8080
    elif command -v start >/dev/null 2>&1; then
        start http://localhost:8080
    else
        echo -e "${YELLOW}Could not open browser automatically${NC}"
        echo -e "Please visit: ${GREEN}http://localhost:8080${NC}"
    fi
) &

# Start the preview server
npm run preview
