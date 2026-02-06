#!/bin/bash
# =============================================================================
# AmiExpress BBS - Update Script
# =============================================================================
# Run this to pull latest changes and rebuild the BBS
#
# Usage:
#   cd /app/amiexpress && ./deploy/update.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

cd "$APP_DIR"

echo "=============================================="
echo "AmiExpress BBS - Update"
echo "=============================================="
echo ""

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "[WARN] You have local changes. Stashing..."
  git stash
  STASHED=1
fi

# Pull latest
echo "[1/4] Pulling latest changes..."
git pull origin main

# Restore stashed changes
if [ "$STASHED" = "1" ]; then
  echo "  Restoring local changes..."
  git stash pop || echo "  [WARN] Could not restore stash, may have conflicts"
fi

# Rebuild container
echo "[2/4] Rebuilding Docker image..."
docker compose build --no-cache

# Restart with new image
echo "[3/4] Restarting BBS..."
docker compose down
docker compose up -d

# Show status
echo "[4/4] Checking status..."
sleep 5
docker compose ps

echo ""
echo "=============================================="
echo "Update complete!"
echo "=============================================="
echo ""
echo "View logs: docker compose logs -f"
echo ""
