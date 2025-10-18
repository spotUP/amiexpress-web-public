#!/bin/bash

# ============================================
# Push to GitHub and Deploy to Render
# ============================================
# This script pushes to GitHub and automatically
# triggers a Render deployment for the backend.
#
# Usage:
#   ./push-and-deploy.sh [git push arguments]
#
# Examples:
#   ./push-and-deploy.sh
#   ./push-and-deploy.sh origin main
#   ./push-and-deploy.sh --force
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Push to GitHub + Deploy to Render${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Git Push
echo -e "${YELLOW}→${NC} Pushing to GitHub..."
echo ""

if git push "$@"; then
    echo ""
    echo -e "${GREEN}✓${NC} Successfully pushed to GitHub"
    echo ""
else
    echo ""
    echo -e "${RED}✗ Error: Git push failed${NC}"
    exit 1
fi

# Step 2: Check if on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}ℹ Not on main branch, skipping Render deployment${NC}"
    echo ""
    exit 0
fi

# Step 3: Trigger Render deployment
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Triggering Render Deployment${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

./Scripts/deployment/deploy-render.sh

exit $?
