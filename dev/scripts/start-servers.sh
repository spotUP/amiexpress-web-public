#!/bin/bash

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

echo "→ Starting backend and frontend..."
echo ""

# Trap to kill both on exit
trap 'echo ""; echo "→ Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait; echo "✓ Servers stopped"; exit' EXIT INT TERM

# Start backend in background (required for concurrent startup)
(cd ~/Code/amiexpress-web/web/backend && NODE_ENV=development npx tsx --no-cache src/index.ts) &
BACKEND_PID=$!

# Start frontend in background - suppress output until we're ready
(cd ~/Code/amiexpress-web/web/frontend && npm run dev > /dev/null 2>&1) &
FRONTEND_PID=$!

# Wait for servers to be ready (backend prints its messages first)
sleep 4

# Detect actual frontend port
FRONTEND_PORT=$(lsof -ti:5174,5175,5176,5177,5178 | head -1 | xargs -I {} lsof -Pan -p {} -i TCP | grep LISTEN | grep -o ':\([0-9]*\)' | grep -o '[0-9]*' | head -1)

if [ -z "$FRONTEND_PORT" ]; then
  FRONTEND_PORT="5174"
fi

echo "🌐 Frontend accessible at http://localhost:$FRONTEND_PORT/"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Keep script running and wait for both processes
wait
