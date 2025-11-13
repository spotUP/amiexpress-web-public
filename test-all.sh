#!/bin/bash

# AmiExpress BBS - Fully Automated Test Suite Runner
# This script handles EVERYTHING: dependencies, server startup, and testing
# Just run: ./test-all.sh

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Configuration
SERVER_URL="${1:-http://localhost:3001}"
USERNAME="${2:-sysop}"
PASSWORD="${3:-sysop}"
RUN_TYPE="${4:-both}"  # basic, deep, or both
KEEP_SERVER_RUNNING="${KEEP_SERVER_RUNNING:-false}"
SERVER_PID=""
WE_STARTED_SERVER=false

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    AmiExpress BBS - Fully Automated Test Suite            ║${NC}"
echo -e "${CYAN}║    Handles dependencies + server + testing                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show help
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: ./test-all.sh [server-url] [username] [password] [test-type]"
    echo ""
    echo "This script automatically:"
    echo "  • Installs dependencies (socket.io-client)"
    echo "  • Starts BBS server (if not running)"
    echo "  • Runs test suite"
    echo "  • Stops server (optional)"
    echo ""
    echo "Arguments:"
    echo "  server-url  Server URL (default: http://localhost:3001)"
    echo "  username    Test username (default: testuser)"
    echo "  password    Test password (default: testpass)"
    echo "  test-type   Which tests: basic|deep|both (default: both)"
    echo ""
    echo "Environment Variables:"
    echo "  KEEP_SERVER_RUNNING=true  Don't stop server after tests"
    echo "  VERBOSE=1                 Show all output"
    echo ""
    echo "Examples:"
    echo "  ./test-all.sh                                    # Run everything automatically"
    echo "  ./test-all.sh http://localhost:3001 sysop pass  # Custom credentials"
    echo "  KEEP_SERVER_RUNNING=true ./test-all.sh          # Leave server running"
    echo "  ./test-all.sh localhost:3001 user pass deep     # Only deep tests"
    exit 0
fi

# Cleanup function
cleanup() {
    if [ "$WE_STARTED_SERVER" = true ] && [ "$KEEP_SERVER_RUNNING" != "true" ]; then
        if [ -n "$SERVER_PID" ]; then
            echo ""
            echo -e "${YELLOW}[CLEANUP] Stopping server (PID: $SERVER_PID)...${NC}"
            kill $SERVER_PID 2>/dev/null
            sleep 2
            echo -e "${GREEN}[CLEANUP] Server stopped${NC}"
        fi
    elif [ "$WE_STARTED_SERVER" = true ] && [ "$KEEP_SERVER_RUNNING" = "true" ]; then
        echo ""
        echo -e "${MAGENTA}[INFO] Server left running (PID: $SERVER_PID)${NC}"
        echo -e "${MAGENTA}[INFO] To stop: kill $SERVER_PID${NC}"
    fi
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

echo -e "${BLUE}[1/5] Checking project structure...${NC}"
if [ ! -f "$SCRIPT_DIR/web/backend/src/index.ts" ] && [ ! -f "$SCRIPT_DIR/web/backend/src/index.js" ]; then
    echo -e "${RED}      [ERROR] Backend source not found${NC}"
    echo -e "${YELLOW}      Make sure you're in the project root directory${NC}"
    exit 1
fi
echo -e "${GREEN}      [OK] Project structure OK${NC}"
echo ""

echo -e "${BLUE}[2/5] Installing dependencies...${NC}"

# Install main project dependencies
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}      Installing project dependencies...${NC}"
    npm install --silent
fi

# Install socket.io-client for tests
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

echo -e "${BLUE}[3/5] Checking/starting BBS server...${NC}"

# Check if server is already running
if curl -s -f "$SERVER_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}      [OK] Server already running at $SERVER_URL${NC}"
    WE_STARTED_SERVER=false
else
    echo -e "${YELLOW}      Server not running, starting it...${NC}"
    
    # Start backend from web/backend directory
    if [ ! -d "$SCRIPT_DIR/web/backend" ]; then
        echo -e "${RED}      [ERROR] web/backend directory not found${NC}"
        exit 1
    fi
    
    echo -e "${CYAN}      Starting backend from web/backend...${NC}"
    cd "$SCRIPT_DIR/web/backend"
    
    # Install backend dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}      Installing backend dependencies...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}      [ERROR] Failed to install backend dependencies${NC}"
            cd "$SCRIPT_DIR"
            exit 1
        fi
    fi
    
    # Start the backend server (uses npx tsx src/index.ts from package.json)
    npm start > /tmp/bbs-server.log 2>&1 &
    SERVER_PID=$!
    cd "$SCRIPT_DIR"
    
    WE_STARTED_SERVER=true
    echo -e "${YELLOW}      Server PID: $SERVER_PID${NC}"
    echo -e "${YELLOW}      Waiting for server to be ready...${NC}"
    
    # Wait for server to start (up to 30 seconds)
    WAIT_COUNT=0
    MAX_WAIT=60  # 60 attempts = 30 seconds
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if curl -s -f "$SERVER_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}      [OK] Server is ready at $SERVER_URL${NC}"
            break
        fi
        sleep 0.5
        WAIT_COUNT=$((WAIT_COUNT + 1))
        
        # Show progress dots
        if [ $((WAIT_COUNT % 4)) -eq 0 ]; then
            echo -n "."
        fi
        
        # Check if process is still running
        if ! kill -0 $SERVER_PID 2>/dev/null; then
            echo ""
            echo -e "${RED}      [ERROR] Server process died${NC}"
            echo -e "${YELLOW}      Check logs: tail /tmp/bbs-server.log${NC}"
            exit 1
        fi
    done
    
    if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
        echo ""
        echo -e "${RED}      [ERROR] Server failed to start within 30 seconds${NC}"
        echo -e "${YELLOW}      Check logs: tail /tmp/bbs-server.log${NC}"
        exit 1
    fi
fi
echo ""

echo -e "${BLUE}[4/5] Verifying server connectivity...${NC}"
SERVER_RESPONSE=$(curl -s "$SERVER_URL")
if echo "$SERVER_RESPONSE" | grep -q "AmiExpress\|BBS"; then
    echo -e "${GREEN}      [OK] Server responding correctly${NC}"
else
    echo -e "${YELLOW}      [WARNING] Server response unexpected: $SERVER_RESPONSE${NC}"
fi
echo ""

echo -e "${BLUE}[5/5] Running test suite...${NC}"
echo -e "${CYAN}─────────────────────────────────────────────────────────────${NC}"
echo ""

BASIC_EXIT=0
DEEP_EXIT=0

# Run basic tests
if [ "$RUN_TYPE" == "basic" ] || [ "$RUN_TYPE" == "both" ]; then
    echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║     Running Basic Command Tests (50+ tests)              ║${NC}"
    echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    node "$SCRIPT_DIR/test-bbs-commands.js" "$SERVER_URL" "$USERNAME" "$PASSWORD"
    BASIC_EXIT=$?
    
    echo ""
    if [ $BASIC_EXIT -eq 0 ]; then
        echo -e "${GREEN}[OK] Basic tests PASSED${NC}"
    else
        echo -e "${RED}[ERROR] Basic tests FAILED${NC}"
    fi
    echo ""
fi

# Run deep tests
if [ "$RUN_TYPE" == "deep" ] || [ "$RUN_TYPE" == "both" ]; then
    echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║     Running Deep Integration Tests (60+ tests)           ║${NC}"
    echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    node "$SCRIPT_DIR/test-bbs-deep.js" "$SERVER_URL" "$USERNAME" "$PASSWORD"
    DEEP_EXIT=$?
    
    echo ""
    if [ $DEEP_EXIT -eq 0 ]; then
        echo -e "${GREEN}[OK] Deep tests PASSED${NC}"
    else
        echo -e "${RED}[ERROR] Deep tests FAILED${NC}"
    fi
    echo ""
fi

# Final summary
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    Final Summary                           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$RUN_TYPE" == "basic" ]; then
    if [ $BASIC_EXIT -eq 0 ]; then
        echo -e "${GREEN}${CYAN}║${NC}  ${GREEN}[OK] All basic tests passed!${NC}"
        echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
        exit 0
    else
        echo -e "${RED}[ERROR] Basic tests failed${NC}"
        exit 1
    fi
elif [ "$RUN_TYPE" == "deep" ]; then
    if [ $DEEP_EXIT -eq 0 ]; then
        echo -e "${GREEN}[OK] All deep tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}[ERROR] Deep tests failed${NC}"
        exit 1
    fi
else
    # Both tests
    if [ $BASIC_EXIT -eq 0 ] && [ $DEEP_EXIT -eq 0 ]; then
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║        [OK][OK][OK] ALL TESTS PASSED (110+ tests) [OK][OK][OK]             ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${GREEN}Basic Tests:  [OK] PASSED${NC}"
        echo -e "${GREEN}Deep Tests:   [OK] PASSED${NC}"
        echo -e "${GREEN}Total:        110+ tests successful${NC}"
        exit 0
    else
        echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║        [ERROR] SOME TESTS FAILED                                 ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        if [ $BASIC_EXIT -ne 0 ]; then
            echo -e "${RED}Basic Tests:  [ERROR] FAILED${NC}"
        else
            echo -e "${GREEN}Basic Tests:  [OK] PASSED${NC}"
        fi
        if [ $DEEP_EXIT -ne 0 ]; then
            echo -e "${RED}Deep Tests:   [ERROR] FAILED${NC}"
        else
            echo -e "${GREEN}Deep Tests:   [OK] PASSED${NC}"
        fi
        exit 1
    fi
fi