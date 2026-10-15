#!/bin/bash

# AmiExpress BBS - Bash Wrapper for CLI Client
# Usage: ./bbs-login.sh [server-url] [username] [password]

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Default values
SERVER_URL="${1:-http://localhost:3001}"
USERNAME="${2}"
PASSWORD="${3}"

echo -e "${CYAN}╔════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    AmiExpress BBS - Login Script          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check if socket.io-client is installed
if ! node -e "require('socket.io-client')" 2>/dev/null; then
    echo -e "${RED}Error: socket.io-client is not installed${NC}"
    echo -e "${YELLOW}Installing socket.io-client...${NC}"
    npm install socket.io-client
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install socket.io-client${NC}"
        echo -e "${YELLOW}Please run: npm install socket.io-client${NC}"
        exit 1
    fi
fi

# Check if bbs-cli.js exists
if [ ! -f "$SCRIPT_DIR/bbs-cli.js" ]; then
    echo -e "${RED}Error: bbs-cli.js not found in $SCRIPT_DIR${NC}"
    exit 1
fi

# Make bbs-cli.js executable if it isn't
chmod +x "$SCRIPT_DIR/bbs-cli.js"

# Display usage if help requested
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    node "$SCRIPT_DIR/bbs-cli.js" --help
    exit 0
fi

# Run the CLI client
echo -e "${GREEN}Connecting to: ${SERVER_URL}${NC}"
if [ -n "$USERNAME" ]; then
    echo -e "${GREEN}Username: ${USERNAME}${NC}"
fi
echo ""

node "$SCRIPT_DIR/bbs-cli.js" "$SERVER_URL" "$USERNAME" "$PASSWORD"