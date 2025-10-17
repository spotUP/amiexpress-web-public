#!/bin/bash

# ============================================
# Deployment Status Checker
# ============================================
# Checks the current deployment status and health
#
# Usage: ./deploy-status.sh
# ============================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "═══════════════════════════════════════"
echo "  AmiExpress Deployment Status"
echo "═══════════════════════════════════════"
echo -e "${NC}"
echo ""

# Check if deployed
if ! vercel ls --yes 2>/dev/null | grep -q "https://"; then
    echo -e "${RED}✗ No deployments found${NC}"
    echo "Run ./deploy-production.sh to deploy"
    exit 1
fi

# Get latest deployment
LATEST_DEPLOYMENT=$(vercel ls --yes 2>/dev/null | grep -o 'https://[^[:space:]]*' | head -1)

if [ -z "$LATEST_DEPLOYMENT" ]; then
    echo -e "${RED}✗ Could not fetch deployment info${NC}"
    exit 1
fi

echo -e "${BOLD}Latest Deployment:${NC}"
echo -e "  ${CYAN}URL:${NC} $LATEST_DEPLOYMENT"
echo ""

# Check health
echo -e "${BOLD}Health Check:${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$LATEST_DEPLOYMENT" || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "  ${GREEN}✓ Deployment is responding (HTTP $HTTP_CODE)${NC}"
else
    echo -e "  ${RED}✗ Deployment not responding (HTTP $HTTP_CODE)${NC}"
fi

# Check response time
echo -e "  Testing response time..."
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$LATEST_DEPLOYMENT" || echo "0")
echo -e "  ${CYAN}Response time: ${RESPONSE_TIME}s${NC}"

# Check last deployment info
if [ -f "logs/last_deployment.json" ]; then
    echo ""
    echo -e "${BOLD}Last Deployment Info:${NC}"

    DEPLOY_TIME=$(grep -o '"timestamp": "[^"]*"' logs/last_deployment.json | cut -d'"' -f4 || echo "Unknown")
    DEPLOY_COMMIT=$(grep -o '"commit": "[^"]*"' logs/last_deployment.json | cut -d'"' -f4 || echo "Unknown")
    DEPLOY_BRANCH=$(grep -o '"branch": "[^"]*"' logs/last_deployment.json | cut -d'"' -f4 || echo "Unknown")
    DEPLOY_ENV=$(grep -o '"environment": "[^"]*"' logs/last_deployment.json | cut -d'"' -f4 || echo "Unknown")

    echo -e "  ${CYAN}Time:${NC}        $DEPLOY_TIME"
    echo -e "  ${CYAN}Commit:${NC}      $DEPLOY_COMMIT"
    echo -e "  ${CYAN}Branch:${NC}      $DEPLOY_BRANCH"
    echo -e "  ${CYAN}Environment:${NC} $DEPLOY_ENV"
fi

echo ""
echo -e "${BOLD}Quick Actions:${NC}"
echo -e "  ${CYAN}vercel logs${NC}                    View deployment logs"
echo -e "  ${CYAN}vercel inspect${NC}                 Inspect deployment"
echo -e "  ${CYAN}./deploy-production.sh --rollback${NC}  Rollback deployment"
echo ""

# Show recent logs
echo -e "${BOLD}Recent Deployments:${NC}"
vercel ls --yes 2>/dev/null | head -8 || echo "Could not fetch deployment list"

echo ""
echo -e "${GREEN}✓ Status check complete${NC}"
