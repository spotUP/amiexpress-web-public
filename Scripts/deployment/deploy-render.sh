#!/bin/bash

# ============================================
# Render.com Deployment Trigger Script
# ============================================
# This script manually triggers a Render deployment
# for the amiexpress-backend service after pushing
# to GitHub.
#
# Usage:
#   ./deploy-render.sh [commit-sha]
#
# If no commit SHA is provided, uses the latest commit.
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Render.com Deployment Trigger${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get commit SHA (use provided or latest)
COMMIT_SHA="${1:-$(git rev-parse HEAD)}"
COMMIT_SHORT=$(echo "$COMMIT_SHA" | cut -c1-7)
COMMIT_MSG=$(git log -1 --pretty=%B "$COMMIT_SHA" | head -1)

echo -e "${BLUE}Commit:${NC} $COMMIT_SHORT - $COMMIT_MSG"
echo ""

# Get backend service ID
echo -e "${YELLOW}→${NC} Finding Render backend service..."
SERVICES_JSON=$(render services list -o json 2>/dev/null)

if [ -z "$SERVICES_JSON" ]; then
    echo -e "${RED}✗ Error: Failed to fetch Render services${NC}"
    echo -e "${YELLOW}  Run 'render login' to authenticate${NC}"
    exit 1
fi

# Extract backend service ID using jq or grep
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
echo -e "${YELLOW}→${NC} Triggering deployment..."
DEPLOY_OUTPUT=$(render deploys create "$SERVICE_ID" --commit "$COMMIT_SHA" --confirm -o json 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -ne 0 ]; then
    echo -e "${RED}✗ Error: Failed to trigger deployment${NC}"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

# Extract deployment ID
DEPLOY_ID=$(echo "$DEPLOY_OUTPUT" | jq -r '.id' 2>/dev/null || echo "unknown")

echo -e "${GREEN}✓${NC} Deployment triggered: ${CYAN}$DEPLOY_ID${NC}"
echo ""

# Monitor deployment
echo -e "${YELLOW}→${NC} Monitoring deployment (max 5 minutes)..."
echo ""

MAX_WAIT=300  # 5 minutes
ELAPSED=0
CHECK_INTERVAL=10

while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check build logs for completion
    LOG_SAMPLE=$(render logs --resources "$SERVICE_ID" --type build --limit 5 -o text 2>/dev/null || echo "")

    if echo "$LOG_SAMPLE" | grep -q "Build successful"; then
        echo -e "\n${GREEN}✓ Build successful!${NC}"
        echo ""

        # Wait a bit for service to restart
        echo -e "${YELLOW}→${NC} Waiting for service to restart..."
        sleep 10

        echo -e "${GREEN}✓ Deployment complete!${NC}"
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}✓ Backend deployed successfully${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo -e "${BLUE}Service URL:${NC} https://amiexpress-backend.onrender.com"
        echo -e "${BLUE}Dashboard:${NC}   https://dashboard.render.com/web/$SERVICE_ID"
        echo ""
        exit 0
    elif echo "$LOG_SAMPLE" | grep -q "Build failed"; then
        echo -e "\n${RED}✗ Build failed!${NC}"
        echo ""
        echo -e "${YELLOW}Check logs:${NC} render logs --resources $SERVICE_ID --type build"
        echo -e "${YELLOW}Dashboard:${NC}  https://dashboard.render.com/web/$SERVICE_ID"
        exit 1
    fi

    echo -ne "  Waiting for build... ${ELAPSED}s / ${MAX_WAIT}s\r"
    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

echo -e "\n${YELLOW}⚠ Deployment timeout after ${MAX_WAIT}s${NC}"
echo ""
echo -e "${YELLOW}Check status:${NC} render logs --resources $SERVICE_ID --type build"
echo -e "${YELLOW}Dashboard:${NC}    https://dashboard.render.com/web/$SERVICE_ID"
exit 2
