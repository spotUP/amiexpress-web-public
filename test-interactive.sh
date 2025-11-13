#!/bin/bash

# AmiExpress BBS - Interactive Test Runner
# Fully automated: starts server, shows all output, prompts for verification

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
SERVER_PID=""
WE_STARTED_SERVER=false

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    AmiExpress BBS - Interactive Test Runner               ║${NC}"
echo -e "${CYAN}║    Shows output + prompts for manual verification         ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show help
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: ./test-interactive.sh [server-url] [username] [password]"
    echo ""
    echo "This script:"
    echo "  • Auto-starts server if needed"
    echo "  • Runs each test one at a time"
    echo "  • Shows ALL BBS output for each test"
    echo "  • Prompts you: 'Did this work? (y/n)'"
    echo "  • Records your responses"
    echo "  • Shows final pass/fail summary"
    echo ""
    echo "Arguments:"
    echo "  server-url  Server URL (default: http://localhost:3001)"
    echo "  username    Username (default: sysop)"
    echo "  password    Password (default: sysop)"
    echo ""
    echo "Examples:"
    echo "  ./test-interactive.sh"
    echo "  ./test-interactive.sh http://localhost:3001 sysop secret"
    exit 0
fi

# Cleanup function
cleanup() {
    if [ "$WE_STARTED_SERVER" = true ] && [ -n "$SERVER_PID" ]; then
        echo ""
        echo -e "${YELLOW}[CLEANUP] Stopping server (PID: $SERVER_PID)...${NC}"
        kill $SERVER_PID 2>/dev/null
        sleep 1
        echo -e "${GREEN}[CLEANUP] Done${NC}"
    fi
}

trap cleanup EXIT INT TERM

echo -e "${BLUE}[1/3] Installing dependencies...${NC}"
if ! node -e "require('socket.io-client')" 2>/dev/null; then
    npm install socket.io-client --silent
    echo -e "${GREEN}      [OK] Installed${NC}"
else
    echo -e "${GREEN}      [OK] Already installed${NC}"
fi
echo ""

echo -e "${BLUE}[2/3] Starting BBS server...${NC}"
if curl -s -f "$SERVER_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}      [OK] Server already running${NC}"
else
    echo -e "${YELLOW}      Starting server from web/backend...${NC}"
    cd "$SCRIPT_DIR/web/backend"
    
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}      Installing backend dependencies...${NC}"
        npm install
    fi
    
    npm start > /tmp/bbs-server.log 2>&1 &
    SERVER_PID=$!
    WE_STARTED_SERVER=true
    cd "$SCRIPT_DIR"
    
    echo -e "${YELLOW}      Waiting for server (PID: $SERVER_PID)...${NC}"
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt 60 ]; do
        if curl -s -f "$SERVER_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}      [OK] Server ready${NC}"
            break
        fi
        sleep 0.5
        WAIT_COUNT=$((WAIT_COUNT + 1))
        
        if ! kill -0 $SERVER_PID 2>/dev/null; then
            echo -e "${RED}      [ERROR] Server died - check /tmp/bbs-server.log${NC}"
            exit 1
        fi
    done
    
    if [ $WAIT_COUNT -ge 60 ]; then
        echo -e "${RED}      [ERROR] Server timeout${NC}"
        exit 1
    fi
fi
echo ""

echo -e "${BLUE}[3/3] Starting interactive tests...${NC}"
echo ""
echo -e "${MAGENTA}You will see all BBS output for each test.${NC}"
echo -e "${MAGENTA}After each test, answer if it worked: y/n${NC}"
echo -e "${MAGENTA}Press Enter at any prompt to continue...${NC}"
echo ""
read -p "Press Enter to start tests..." 

echo ""
node "$SCRIPT_DIR/test-bbs-interactive.js" "$SERVER_URL" "$USERNAME" "$PASSWORD"
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Interactive testing complete!${NC}"
else
    echo -e "${YELLOW}Some tests were marked as failed${NC}"
fi

exit $EXIT_CODE