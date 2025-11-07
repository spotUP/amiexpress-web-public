#!/bin/bash

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

echo "→ Starting backend and frontend..."
echo ""

# Trap to kill both on exit
trap 'echo ""; echo "→ Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait; echo "✓ Servers stopped"; exit' EXIT INT TERM

# Start backend in background (suppress door scan spam)
(cd ~/Code/amiexpress-web/web/backend && NODE_ENV=development npx tsx --no-cache src/index.ts 2>&1 | grep -v "^\[.*Door.*\]") &
BACKEND_PID=$!

# Start frontend in background - suppress output
(cd ~/Code/amiexpress-web/web/frontend && npm run dev > /dev/null 2>&1) &
FRONTEND_PID=$!

# Wait for servers to be ready (backend prints its messages first)
sleep 4

# Detect actual frontend port by checking common Vite ports
for port in 5174 5175 5176 5177 5178; do
  if lsof -ti:$port > /dev/null 2>&1; then
    FRONTEND_PORT=$port
    break
  fi
done

# Fallback to 5174 if detection fails
if [ -z "$FRONTEND_PORT" ]; then
  FRONTEND_PORT="5174"
fi

# Print frontend URL after backend messages
echo "🌐 Frontend accessible at http://localhost:$FRONTEND_PORT/"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Keep script running and wait for both processes
wait
