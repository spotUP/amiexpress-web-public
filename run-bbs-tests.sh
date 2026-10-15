#!/bin/bash

# AmiExpress BBS - Automated Test Runner
# Fully automated: installs deps, starts server, runs tests

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Configuration
SERVER_URL="${1:-http://localhost:3001}"
USERNAME="${2:-sysop}"
PASSWORD="${3:-sysop}"
SERVER_PID=""
WE_STARTED_SERVER=false

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    AmiExpress BBS - Automated Test Runner                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Cleanup function
cleanup() {
    if [ "$WE_STARTED_SERVER" = true ] && [ -n "$SERVER_PID" ]; then
        echo ""
        echo -e "${YELLOW}[CLEANUP] Stopping server (PID: $SERVER_PID)...${NC}"
        kill $SERVER_PID 2>/dev/null
        sleep 1
        echo -e "${GREEN}[CLEANUP] Server stopped${NC}"
    fi
}

trap cleanup EXIT INT TERM

# Show usage if help requested
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: ./run-bbs-tests.sh [server-url] [username] [password]"
    echo ""
    echo "This script automatically handles:"
    echo "  • Dependency installation"
    echo "  • Server startup (if needed)"
    echo "  • Test execution"
    echo "  • Server cleanup"
    echo ""
    echo "Arguments:"
    echo "  server-url  Server URL (default: http://localhost:3001)"
    echo "  username    Test username (default: testuser)"
    echo "  password    Test password (default: testpass)"
    echo ""
    echo "Options:"
    echo "  -v, --verbose   Show verbose output"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./run-bbs-tests.sh"
    echo "  ./run-bbs-tests.sh http://localhost:3001 sysop secret"
    echo "  ./run-bbs-tests.sh --verbose"
    exit 0
fi

# Check for verbose flag
VERBOSE=""
if [ "$1" == "-v" ] || [ "$1" == "--verbose" ] || [ "$2" == "-v" ] || [ "$2" == "--verbose" ]; then
    VERBOSE="VERBOSE=1"
    echo -e "${YELLOW}Verbose mode enabled${NC}"
    echo ""
fi

echo -e "${BLUE}[1/4] Installing dependencies...${NC}"
if ! node -e "require('socket.io-client')" 2>/dev/null; then
    echo -e "${YELLOW}      Installing socket.io-client...${NC}"
    npm install socket.io-client --silent
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}      [OK] socket.io-client installed${NC}"
    else
        echo -e "${RED}      [ERROR] Failed to install socket.io-client${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}      [OK] socket.io-client already installed${NC}"
fi
echo ""

echo -e "${BLUE}[2/4] Checking server connectivity...${NC}"
if curl -s -f "${SERVER_URL}" > /dev/null 2>&1; then
    echo -e "${GREEN}      [OK] Server is reachable at ${SERVER_URL}${NC}"
else
    echo -e "${YELLOW}      Server not running, starting it...${NC}"
    
    # Start backend from web/backend directory
    if [ ! -d "$SCRIPT_DIR/web/backend" ]; then
        echo -e "${RED}      [ERROR] web/backend directory not found${NC}"
        exit 1
    fi
    
    echo -e "${CYAN}      Starting backend from web/backend...${NC}"
    cd "$SCRIPT_DIR/web/backend"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}      Installing backend dependencies...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}      [ERROR] Failed to install backend dependencies${NC}"
            cd "$SCRIPT_DIR"
            exit 1
        fi
    fi
    
    # Start the backend (uses npx tsx src/index.ts)
    npm start > /tmp/bbs-server.log 2>&1 &
    SERVER_PID=$!
    cd "$SCRIPT_DIR"
    
    WE_STARTED_SERVER=true
    echo -e "${YELLOW}      Waiting for server (PID: $SERVER_PID)...${NC}"
    
    # Wait for server
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt 60 ]; do
        if curl -s -f "${SERVER_URL}" > /dev/null 2>&1; then
            echo -e "${GREEN}      [OK] Server ready at ${SERVER_URL}${NC}"
            break
        fi
        sleep 0.5
        WAIT_COUNT=$((WAIT_COUNT + 1))
        
        if ! kill -0 $SERVER_PID 2>/dev/null; then
            echo ""
            echo -e "${RED}      [ERROR] Server process died${NC}"
            exit 1
        fi
    done
    
    if [ $WAIT_COUNT -ge 60 ]; then
        echo -e "${RED}      [ERROR] Server timeout${NC}"
        exit 1
    fi
fi
echo ""

echo -e "${BLUE}[3/4] Checking test scripts...${NC}"
if [ ! -f "$SCRIPT_DIR/test-bbs-commands.js" ]; then
    echo -e "${RED}      [ERROR] test-bbs-commands.js not found${NC}"
    exit 1
fi
chmod +x "$SCRIPT_DIR/test-bbs-commands.js"
echo -e "${GREEN}      [OK] Test script found and ready${NC}"
echo ""

echo -e "${BLUE}[4/4] Running BBS command tests...${NC}"
echo ""
echo -e "${CYAN}─────────────────────────────────────────────────────────────${NC}"
echo ""

# Execute tests
if [ -n "$VERBOSE" ]; then
    VERBOSE=1 node "$SCRIPT_DIR/test-bbs-commands.js" "$SERVER_URL" "$USERNAME" "$PASSWORD"
else
    node "$SCRIPT_DIR/test-bbs-commands.js" "$SERVER_URL" "$USERNAME" "$PASSWORD"
fi

TEST_EXIT_CODE=$?

echo ""
echo -e "${CYAN}─────────────────────────────────────────────────────────────${NC}"
echo ""

# Report final result
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              [OK] ALL TESTS PASSED                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              [ERROR] SOME TESTS FAILED                           ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Run with --verbose flag to see detailed output:${NC}"
    echo -e "${YELLOW}  ./run-bbs-tests.sh --verbose${NC}"
    exit 1
fi