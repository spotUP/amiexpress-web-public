#!/bin/bash

# AmiExpress Backend Startup Script
# Ensures only ONE backend server runs on port 3001

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting AmiExpress Backend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill all processes on port 3001
echo "→ Killing any existing servers on port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Wait for port to be free
echo "→ Waiting for port to be released..."
sleep 3

# Verify port is free
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "✗ ERROR: Port 3001 is still in use!"
    echo "  Run: lsof -ti:3001 | xargs kill -9"
    exit 1
fi

# Change to backend directory
cd "$(dirname "$0")/backend/backend"

# Set environment variables
export DATABASE_URL="postgresql://localhost/amiexpress"

# Start the server
echo "→ Starting backend server on port 3001..."
npm run dev 2>&1 &

# Wait for server to start
sleep 4

# Verify server is running
if lsof -ti:3001 >/dev/null 2>&1; then
    # Count only node processes (not browser connections)
    NODE_COUNT=$(lsof -ti:3001 | xargs ps -p | grep -c "node" || true)
    if curl -s http://localhost:3001/ | grep -q "AmiExpress"; then
        echo "✓ Backend server started successfully"
        echo "  → Server responding: $(curl -s http://localhost:3001/)"
        echo "  → Node processes on port: $NODE_COUNT"
    else
        echo "⚠ WARNING: Port 3001 occupied but server not responding correctly"
    fi
else
    echo "✗ ERROR: Server failed to start on port 3001"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backend ready at http://localhost:3001"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
