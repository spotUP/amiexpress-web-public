#!/bin/bash

# ============================================
# AmiExpress Full-Stack Deployment Script
# ============================================
# This script deploys BOTH backend and frontend:
# - Backend: Render.com (WebSocket server)
# - Frontend: Vercel (Static site)
#
# Usage:
#   ./deploy.sh [commit-sha]
#
# If no commit SHA is provided, uses the latest commit.
#
# Prerequisites:
#   - Render CLI: npm install -g @render/cli
#   - Vercel CLI: npm install -g vercel
#   - Must be logged in: render login && vercel login
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  AmiExpress Full-Stack Deployment${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get commit SHA (use provided or latest)
COMMIT_SHA="${1:-$(git rev-parse HEAD)}"
COMMIT_SHORT=$(echo "$COMMIT_SHA" | cut -c1-7)
COMMIT_MSG=$(git log -1 --pretty=%B "$COMMIT_SHA" | head -1)

echo -e "${BLUE}Commit:${NC} $COMMIT_SHORT - $COMMIT_MSG"
echo ""

# Check prerequisites
echo -e "${YELLOW}→${NC} Checking prerequisites..."

if ! command -v render &> /dev/null; then
    echo -e "${RED}✗ Error: Render CLI not installed${NC}"
    echo -e "${YELLOW}  Install: npm install -g @render/cli${NC}"
    exit 1
fi

if ! command -v vercel &> /dev/null; then
    echo -e "${RED}✗ Error: Vercel CLI not installed${NC}"
    echo -e "${YELLOW}  Install: npm install -g vercel${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Prerequisites satisfied"
echo ""

# ============================================
# PART 1: Deploy Backend to Render.com
# ============================================

echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  [1/2] Deploying Backend to Render${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get backend service ID
echo -e "${YELLOW}→${NC} Finding Render backend service..."
SERVICES_JSON=$(render services list -o json 2>/dev/null)

if [ -z "$SERVICES_JSON" ]; then
    echo -e "${RED}✗ Error: Failed to fetch Render services${NC}"
    echo -e "${YELLOW}  Run 'render login' to authenticate${NC}"
    exit 1
fi

# Extract backend service ID
if command -v jq &> /dev/null; then
    SERVICE_ID=$(echo "$SERVICES_JSON" | jq -r '.[] | select(.service.name == "amiexpress-backend") | .service.id' 2>/dev/null | head -1)
else
    SERVICE_ID=$(echo "$SERVICES_JSON" | grep -A 20 '"name": "amiexpress-backend"' | grep -o '"id": "srv-[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$SERVICE_ID" ]; then
    echo -e "${RED}✗ Error: Could not find amiexpress-backend service${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found service: ${CYAN}$SERVICE_ID${NC}"
echo ""

# Trigger deployment
echo -e "${YELLOW}→${NC} Triggering backend deployment..."
DEPLOY_OUTPUT=$(render deploys create "$SERVICE_ID" --commit "$COMMIT_SHA" --confirm -o json 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -ne 0 ]; then
    echo -e "${RED}✗ Error: Failed to trigger deployment${NC}"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

# Extract deployment ID
DEPLOY_ID=$(echo "$DEPLOY_OUTPUT" | jq -r '.id' 2>/dev/null || echo "unknown")

echo -e "${GREEN}✓${NC} Backend deployment triggered: ${CYAN}$DEPLOY_ID${NC}"
echo ""

# Monitor backend deployment
echo -e "${YELLOW}→${NC} Monitoring backend build (max 5 minutes)..."

MAX_WAIT=300  # 5 minutes
ELAPSED=0
CHECK_INTERVAL=10

while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check build logs for completion
    LOG_SAMPLE=$(render logs --resources "$SERVICE_ID" --type build --limit 5 -o text 2>/dev/null || echo "")

    if echo "$LOG_SAMPLE" | grep -q "Build successful"; then
        echo -e "\n${GREEN}✓ Backend build successful!${NC}"
        echo ""

        # Wait for service to restart
        echo -e "${YELLOW}→${NC} Waiting for backend service to restart..."
        sleep 10

        echo -e "${GREEN}✓ Backend deployment complete!${NC}"
        echo ""
        break
    elif echo "$LOG_SAMPLE" | grep -q "Build failed"; then
        echo -e "\n${RED}✗ Backend build failed!${NC}"
        echo ""
        echo -e "${YELLOW}Check logs:${NC} render logs --resources $SERVICE_ID --type build"
        echo -e "${YELLOW}Dashboard:${NC}  https://dashboard.render.com/web/$SERVICE_ID"
        exit 1
    fi

    echo -ne "  Waiting for build... ${ELAPSED}s / ${MAX_WAIT}s\r"
    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo -e "\n${YELLOW}⚠ Backend deployment timeout after ${MAX_WAIT}s${NC}"
    echo -e "${YELLOW}  Continuing with frontend deployment...${NC}"
    echo ""
fi

# ============================================
# PART 2: Deploy Frontend to Vercel
# ============================================

echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  [2/2] Deploying Frontend to Vercel${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if we're in the right directory
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}→${NC} Deploying frontend to production..."

# Deploy to Vercel production
# --prod: Deploy to production
# --yes: Skip confirmation prompts
VERCEL_OUTPUT=$(vercel --prod --yes 2>&1)
VERCEL_EXIT=$?

if [ $VERCEL_EXIT -ne 0 ]; then
    echo -e "${RED}✗ Error: Vercel deployment failed${NC}"
    echo "$VERCEL_OUTPUT"
    exit 1
fi

# Extract deployment URL
DEPLOYMENT_URL=$(echo "$VERCEL_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1)
PRODUCTION_URL=$(echo "$VERCEL_OUTPUT" | grep -oE 'https://bbs\.uprough\.net' || echo "https://bbs.uprough.net")

echo -e "${GREEN}✓${NC} Frontend deployment complete!"
echo ""

# ============================================
# Deployment Summary
# ============================================

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Full-Stack Deployment Successful${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Backend (Render):${NC}"
echo -e "  Service URL: https://amiexpress-backend.onrender.com"
echo -e "  Dashboard:   https://dashboard.render.com/web/$SERVICE_ID"
echo ""
echo -e "${BLUE}Frontend (Vercel):${NC}"
echo -e "  Production:  $PRODUCTION_URL"
if [ -n "$DEPLOYMENT_URL" ]; then
    echo -e "  Preview:     $DEPLOYMENT_URL"
fi
echo ""
echo -e "${BLUE}Commit:${NC} $COMMIT_SHORT - $COMMIT_MSG"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit 0
