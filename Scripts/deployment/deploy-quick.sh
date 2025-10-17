#!/bin/bash

# ============================================
# Quick Deploy - Fast Production Deployment
# ============================================
# A streamlined version for quick deployments
# when you're confident everything works.
#
# This script:
# - Skips interactive prompts
# - Runs essential checks only
# - Deploys immediately
#
# Usage: ./deploy-quick.sh [staging|production]
# ============================================

set -euo pipefail

ENVIRONMENT="${1:-production}"

echo "🚀 Quick Deploy to ${ENVIRONMENT^^}"
echo ""

# Run the main deploy script with optimal flags
if [ "$ENVIRONMENT" = "staging" ]; then
    ./deploy-production.sh --staging --skip-build --force
else
    ./deploy-production.sh --skip-build --force
fi
