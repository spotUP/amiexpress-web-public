#!/bin/bash

# AmiExpress-Web Development Server Stop Script

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}Stopping AmiExpress-Web development servers...${NC}"
echo ""

# Kill by PID files
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✓${NC} Stopped backend (PID: $BACKEND_PID)"
    else
        echo -e "${CYAN}ℹ${NC} Backend process not running"
    fi
    rm .backend.pid
fi

if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${GREEN}✓${NC} Stopped frontend (PID: $FRONTEND_PID)"
    else
        echo -e "${CYAN}ℹ${NC} Frontend process not running"
    fi
    rm .frontend.pid
fi

# Kill by port as backup
BACKEND_PIDS=$(lsof -ti:3001 2>/dev/null || true)
if [ -n "$BACKEND_PIDS" ]; then
    echo "$BACKEND_PIDS" | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Cleaned up remaining backend processes on port 3001"
fi

FRONTEND_PIDS=$(lsof -ti:5173,5174 2>/dev/null || true)
if [ -n "$FRONTEND_PIDS" ]; then
    echo "$FRONTEND_PIDS" | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Cleaned up remaining frontend processes on ports 5173/5174"
fi

echo ""
echo -e "${GREEN}✓ All development servers stopped${NC}"
