#!/bin/bash

# AmiExpress Complete Startup Script
# Starts both backend and frontend with proper cleanup

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔════════════════════════════════════════╗"
echo "║   AmiExpress BBS - Development Start   ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Start backend
"$SCRIPT_DIR/start-backend.sh"

echo ""

# Start frontend
"$SCRIPT_DIR/start-frontend.sh"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║           All Servers Ready            ║"
echo "║                                        ║"
echo "║  Backend:  http://localhost:3001       ║"
echo "║  Frontend: http://localhost:5173       ║"
echo "║                                        ║"
echo "║  Login: sysop / sysop                  ║"
echo "╚════════════════════════════════════════╝"
