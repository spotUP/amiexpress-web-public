#!/bin/bash

# AmiExpress Stop Script
# Kills all backend and frontend servers

echo "Stopping AmiExpress servers..."

# Kill backend
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "→ Stopping backend (port 3001)..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    echo "  ✓ Backend stopped"
else
    echo "  • Backend not running"
fi

# Kill frontend
if lsof -ti:5173 >/dev/null 2>&1; then
    echo "→ Stopping frontend (port 5173)..."
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo "  ✓ Frontend stopped"
else
    echo "  • Frontend not running"
fi

echo "✓ All servers stopped"
