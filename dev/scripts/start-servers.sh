#!/bin/bash

# Kill any existing servers first
./dev/scripts/kill-servers.sh || exit 1

echo "→ Starting backend..."
(cd ~/Code/amiexpress-web/web/backend && npx tsx src/index.ts > /tmp/backend.log 2>&1) &
BACKEND_PID=$!

# Wait for backend to start listening
echo "  Waiting for backend to bind to port 3001..."
for i in {1..15}; do
  if lsof -ti:3001 > /dev/null 2>&1; then
    echo "✓ Backend started (PID: $BACKEND_PID)"
    break
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    echo "✗ Backend failed to start after 15 seconds"
    tail -30 /tmp/backend.log
    exit 1
  fi
done

echo "→ Starting frontend..."
(cd ~/Code/amiexpress-web/web/frontend && npm run dev > /tmp/frontend.log 2>&1) &
FRONTEND_PID=$!

# Wait for frontend to start listening
echo "  Waiting for frontend to bind to port 5173..."
for i in {1..15}; do
  if lsof -ti:5173 > /dev/null 2>&1; then
    echo "✓ Frontend started (PID: $FRONTEND_PID)"
    break
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    echo "✗ Frontend failed to start after 15 seconds"
    tail -30 /tmp/frontend.log
    exit 1
  fi
done

echo ""
echo "✓ Both servers running:"
echo "  Backend:  http://localhost:3001 (PID: $BACKEND_PID)"
echo "  Frontend: http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "Logs:"
echo "  tail -f /tmp/backend.log"
echo "  tail -f /tmp/frontend.log"
