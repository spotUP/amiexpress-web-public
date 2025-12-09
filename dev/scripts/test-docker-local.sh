#!/bin/bash
# Test Docker deployment locally
# Usage: ./dev/scripts/test-docker-local.sh

set -e

echo "[INFO] Testing Docker deployment locally..."
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "[ERROR] Docker is not running"
  echo "Please start Docker Desktop and try again"
  exit 1
fi

echo "[OK] Docker daemon is running"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "[WARNING] .env.local not found, creating with test values..."
  cat > .env.local << 'EOF'
# Test environment variables for Docker
JWT_SECRET=test-jwt-secret-change-in-production
JWT_REFRESH_SECRET=test-refresh-secret-change-in-production
SESSION_SECRET=test-session-secret-change-in-production
DATABASE_DIR=/app/db
BBS_DATA_DIR=/app/data/bbs
NODE_ENV=development
DEBUG=false
EOF
  echo "[OK] Created .env.local with test values"
  echo ""
fi

# Build Docker image
echo "[INFO] Building Docker image (this may take 3-5 minutes on first build)..."
docker-compose build

echo ""
echo "[OK] Docker image built successfully"
echo ""

# Start containers
echo "[INFO] Starting containers..."
docker-compose up -d

echo ""
echo "[OK] Containers started"
echo ""

# Wait for server to start
echo "[INFO] Waiting for server to start (10 seconds)..."
sleep 10

# Health check
echo "[INFO] Running health check..."
if curl -f http://localhost:3001/ > /dev/null 2>&1; then
  echo "[OK] Health check passed"
  echo ""
  echo "[SUCCESS] Docker deployment is working!"
  echo ""
  echo "Access the BBS at:"
  echo "  Web:    http://localhost:3001/"
  echo "  Telnet: telnet localhost 2323"
  echo "  SSH:    ssh -p 2222 localhost"
  echo ""
  echo "View logs:"
  echo "  docker-compose logs -f"
  echo ""
  echo "Stop containers:"
  echo "  docker-compose down"
else
  echo "[ERROR] Health check failed"
  echo ""
  echo "Check logs:"
  echo "  docker-compose logs"
  exit 1
fi
