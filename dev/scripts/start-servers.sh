#!/bin/bash

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

echo "→ Starting backend and frontend..."
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5174 (or next available port if occupied)"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Trap to kill both on exit
trap 'echo ""; echo "→ Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait; echo "✓ Servers stopped"; exit' EXIT INT TERM

# Start backend in background (required for concurrent startup)
(cd ~/Code/amiexpress-web/web/backend && NODE_ENV=development npx tsx --no-cache src/index.ts) &
BACKEND_PID=$!

# Start frontend in background (required for concurrent startup)
(cd ~/Code/amiexpress-web/web/frontend && npm run dev) 2>&1 | while IFS= read -r line; do
  echo "$line"
  # Detect Vite's actual port from output
  if [[ "$line" =~ Local:.*localhost:([0-9]+) ]]; then
    VITE_PORT="${BASH_REMATCH[1]}"
    echo ""
    echo "✓ Frontend started on http://localhost:$VITE_PORT"
    echo ""
  fi
done &
FRONTEND_PID=$!

# Wait for both to be ready
echo "Waiting for servers to start..."
sleep 3

# Keep script running and wait for both processes
wait
