#!/bin/bash

# AmiExpress Complete Startup Script
# Starts both backend and frontend with proper cleanup

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════╗"
echo "║   AmiExpress BBS - Development Start   ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Start backend
if "$SCRIPT_DIR/start-backend.sh"; then
    echo ""
else
    echo ""
    echo "✗ Backend failed to start - aborting"
    exit 1
fi

# Start frontend
if "$SCRIPT_DIR/start-frontend.sh"; then
    echo ""
else
    echo ""
    echo "✗ Frontend failed to start - backend is still running"
    echo "  Run ./dev/scripts/stop-all.sh to clean up"
    exit 1
fi

echo "╔════════════════════════════════════════╗"
echo "║           All Servers Ready            ║"
echo "║                                        ║"
echo "║  Backend:  http://localhost:3001       ║"
echo "║  Frontend: http://localhost:5173       ║"
echo "║                                        ║"
echo "║  Login: sysop / sysop                  ║"
echo "╚════════════════════════════════════════╝"