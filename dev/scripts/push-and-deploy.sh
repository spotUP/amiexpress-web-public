#!/bin/bash

# ============================================
# Push to GitHub and Deploy to Render
# ============================================
# This script pushes to GitHub and automatically
# triggers a Render deployment for the backend.
#
# Usage:
#   ./Scripts/push-and-deploy.sh [git push arguments]
#
# Examples:
#   ./Scripts/push-and-deploy.sh
#   ./Scripts/push-and-deploy.sh origin main
#   ./Scripts/push-and-deploy.sh --force
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Push to GitHub + Deploy to Render${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Step 1: Git Push
echo -e "${YELLOW}→${NC} Pushing to GitHub..."
echo ""

if git push "$@"; then
    echo ""
    echo -e "${GREEN}[OK]${NC} Successfully pushed to GitHub"
    echo ""
else
    echo ""
    echo -e "${RED}[ERROR] Error: Git push failed${NC}"
    exit 1
fi

# Step 2: Check if on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}[INFO] Not on main branch, skipping Render deployment${NC}"
    echo ""
    exit 0
fi

# Step 3: Trigger Render deployment
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Triggering Render Deployment${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "$SCRIPT_DIR/deployment/deploy-render.sh" ]; then
    "$SCRIPT_DIR/deployment/deploy-render.sh"
    exit $?
else
    echo -e "${YELLOW}[WARNING] Warning: deployment/deploy-render.sh not found${NC}"
    echo -e "${CYAN}[INFO] Skipping Render deployment trigger${NC}"
    exit 0
fi