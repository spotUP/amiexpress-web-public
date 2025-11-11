#!/bin/bash

# Simplified SDK Door Preview
# Runs doors in real BBS environment instead of simulated preview mode

set -e

DOOR_PATH="$1"
DOOR_NAME="$2"
QUICK_LOGIN="${SDK_QUICK_LOGIN:-false}"
LOGIN_USER="${SDK_LOGIN_USER:-sysop}"
LOGIN_PASS="${SDK_LOGIN_PASS:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         AmiExpress SDK Door Preview                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for .sdk-preview.env in current directory
if [ -f ".sdk-preview.env" ]; then
    echo -e "${CYAN}📝 Loading configuration from .sdk-preview.env${NC}"
    source .sdk-preview.env
    QUICK_LOGIN="${SDK_QUICK_LOGIN:-false}"
    LOGIN_USER="${SDK_LOGIN_USER:-sysop}"
    LOGIN_PASS="${SDK_LOGIN_PASS:-}"
fi

# Check if door path provided
if [ -z "$DOOR_PATH" ]; then
    echo -e "${RED}❌ Error: Door path required${NC}"
    echo ""
    echo "Usage: npm run preview <door-path> [door-name]"
    echo ""
    echo "Examples:"
    echo "  npm run preview examples/hello-world"
    echo "  npm run preview examples/2048-game \"2048 Game\""
    echo ""
    echo "Quick Login:"
    echo "  Create .sdk-preview.env with:"
    echo "    SDK_QUICK_LOGIN=true"
    echo "    SDK_LOGIN_USER=sysop"
    echo "    SDK_LOGIN_PASS=password"
    echo ""
    echo "  Or set environment variables:"
    echo "    SDK_QUICK_LOGIN=true SDK_LOGIN_USER=sysop SDK_LOGIN_PASS=password npm run preview examples/hello-world"
    echo ""
    exit 1
fi

# Get full path to door
FULL_DOOR_PATH=$(cd "$(dirname "$DOOR_PATH")" && pwd)/$(basename "$DOOR_PATH")

# Check if door exists
if [ ! -d "$FULL_DOOR_PATH" ]; then
    echo -e "${RED}❌ Error: Door not found: $DOOR_PATH${NC}"
    exit 1
fi

# Get door name from package.json or use provided name
if [ -z "$DOOR_NAME" ]; then
    if [ -f "$FULL_DOOR_PATH/package.json" ]; then
        DOOR_NAME=$(node -p "require('$FULL_DOOR_PATH/package.json').name" 2>/dev/null || echo "")
    fi

    # Fallback to directory name
    if [ -z "$DOOR_NAME" ]; then
        DOOR_NAME=$(basename "$DOOR_PATH")
    fi
fi

# Convert name to command (uppercase, remove special chars)
COMMAND_NAME=$(echo "$DOOR_NAME" | tr '[:lower:]' '[:upper:]' | sed 's/[^A-Z0-9]//g')

echo -e "${YELLOW}📦 Door:${NC} $DOOR_NAME"
echo -e "${YELLOW}📂 Path:${NC} $DOOR_PATH"
echo -e "${YELLOW}🔖 Command:${NC} /$COMMAND_NAME"
echo ""

# Step 1: Build SDK
echo -e "${CYAN}🔨 Building SDK...${NC}"
cd "$(dirname "$0")/../.."
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ SDK build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ SDK built${NC}"

# Step 2: Build Door
echo -e "${CYAN}🔨 Building door...${NC}"
cd "$FULL_DOOR_PATH"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}   Installing dependencies...${NC}"
    npm install > /dev/null 2>&1
fi

# Build door
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Door build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Door built${NC}"

# Step 3: Create .info file
PROJECT_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INFO_FILE="$PROJECT_ROOT/Commands/$COMMAND_NAME.info"

echo -e "${CYAN}📝 Creating command registration...${NC}"

# Get relative path from project root
REL_DOOR_PATH=$(realpath --relative-to="$PROJECT_ROOT" "$FULL_DOOR_PATH" 2>/dev/null || \
                python3 -c "import os.path; print(os.path.relpath('$FULL_DOOR_PATH', '$PROJECT_ROOT'))" 2>/dev/null || \
                echo "$DOOR_PATH")

cat > "$INFO_FILE" << EOF
COMMAND=$COMMAND_NAME
NAME=$DOOR_NAME
TYPE=SDK
PATH=$REL_DOOR_PATH
ACCESS=0
HOT=
PRIVATE=N
OVERLOAD=N
HIDDEN=N
EOF

echo -e "${GREEN}✅ Command registered: $INFO_FILE${NC}"

# Step 4: Start BBS
echo ""
echo -e "${CYAN}🚀 Starting BBS servers...${NC}"

# Export quick login variables if configured
if [ "$QUICK_LOGIN" = "true" ]; then
    export SDK_QUICK_LOGIN=true
    export SDK_LOGIN_USER="$LOGIN_USER"
    export SDK_LOGIN_PASS="$LOGIN_PASS"
    export SDK_DOOR_COMMAND="/$COMMAND_NAME"
    echo -e "${YELLOW}   Quick login enabled: $LOGIN_USER${NC}"
fi

echo ""

cd "$PROJECT_ROOT"
./dev/scripts/start-servers.sh &
BBS_PID=$!

# Give servers time to start
sleep 3

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Preview Ready!                                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}To test your door:${NC}"
echo ""

if [ "$QUICK_LOGIN" = "true" ]; then
    echo -e "  1. Open browser to: ${YELLOW}http://localhost:5173${NC}"
    echo -e "  2. ${GREEN}Quick login will auto-login as $LOGIN_USER and run /$COMMAND_NAME${NC}"
    echo ""
    echo -e "${YELLOW}Note: Quick login requires the user '$LOGIN_USER' to exist in the BBS.${NC}"
    echo -e "${YELLOW}If not, create the account first, then restart preview.${NC}"
else
    echo -e "  1. Open browser to: ${YELLOW}http://localhost:5173${NC}"
    echo -e "  2. Create an account or login"
    echo -e "  3. Run command: ${YELLOW}/$COMMAND_NAME${NC}"
    echo ""
    echo -e "${CYAN}Tip: Enable quick login by creating .sdk-preview.env:${NC}"
    echo -e "  SDK_QUICK_LOGIN=true"
    echo -e "  SDK_LOGIN_USER=sysop"
    echo -e "  SDK_LOGIN_PASS=password"
fi

echo ""
echo -e "${CYAN}To stop preview:${NC} Press Ctrl+C"
echo ""
echo -e "${YELLOW}Your door is running in the REAL BBS environment!${NC}"
echo ""

# Wait for user to stop
trap "echo -e '\n${YELLOW}🛑 Stopping servers...${NC}'; ./dev/scripts/kill-servers.sh; exit 0" INT TERM

# Keep script running
wait $BBS_PID
