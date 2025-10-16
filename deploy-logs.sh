#!/bin/bash

# ============================================
# Deployment Logs Viewer
# ============================================
# View and analyze deployment logs
#
# Usage:
#   ./deploy-logs.sh              # View latest deployment logs
#   ./deploy-logs.sh local        # View local deployment logs
#   ./deploy-logs.sh list         # List all log files
#   ./deploy-logs.sh follow       # Follow live logs
# ============================================

set -euo pipefail

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

MODE="${1:-remote}"

echo -e "${CYAN}${BOLD}AmiExpress Deployment Logs${NC}"
echo ""

case $MODE in
    local)
        # Show local log files
        if [ -d "logs" ] && [ "$(ls -A logs/*.log 2>/dev/null)" ]; then
            echo -e "${BOLD}Local Deployment Logs:${NC}"
            echo ""

            # Find most recent log
            LATEST_LOG=$(ls -t logs/deploy_*.log 2>/dev/null | head -1)

            if [ -n "$LATEST_LOG" ]; then
                echo "Showing: $LATEST_LOG"
                echo ""
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                tail -50 "$LATEST_LOG"
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo ""
                echo -e "${CYAN}To view full log:${NC} cat $LATEST_LOG"
            else
                echo "No deployment logs found"
            fi
        else
            echo "No local logs found in ./logs/"
        fi
        ;;

    list)
        # List all log files
        if [ -d "logs" ]; then
            echo -e "${BOLD}All Deployment Logs:${NC}"
            echo ""
            ls -lh logs/ | grep -E "\.log$|\.json$" || echo "No logs found"
        else
            echo "Logs directory not found"
        fi
        ;;

    follow)
        # Follow live Vercel logs
        echo -e "${BOLD}Following Live Deployment Logs...${NC}"
        echo ""
        LATEST_URL=$(vercel ls --yes 2>/dev/null | grep -o 'https://[^[:space:]]*' | head -1)

        if [ -n "$LATEST_URL" ]; then
            echo "Deployment: $LATEST_URL"
            echo ""
            vercel logs "$LATEST_URL" --follow
        else
            echo "No deployment found"
        fi
        ;;

    *)
        # Show remote logs from Vercel
        echo -e "${BOLD}Fetching Latest Deployment Logs...${NC}"
        echo ""

        LATEST_URL=$(vercel ls --yes 2>/dev/null | grep -o 'https://[^[:space:]]*' | head -1)

        if [ -n "$LATEST_URL" ]; then
            echo "Deployment: $LATEST_URL"
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            vercel logs "$LATEST_URL" --output=raw 2>/dev/null | tail -50 || echo "Could not fetch logs"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo -e "${CYAN}Options:${NC}"
            echo "  ./deploy-logs.sh local     - View local logs"
            echo "  ./deploy-logs.sh follow    - Follow live logs"
            echo "  ./deploy-logs.sh list      - List all logs"
        else
            echo "No deployment found"
            echo "Run ./deploy-production.sh first"
        fi
        ;;
esac

echo ""
