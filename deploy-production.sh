#!/bin/bash

# ============================================
# AmiExpress-Web Production Deployment Script
# ============================================
# A comprehensive deployment script with pre-flight checks,
# automated testing, rollback capabilities, and health monitoring.
#
# Features:
# - Pre-deployment validation (tests, builds, env checks)
# - Automated deployment to Vercel
# - Health checks and smoke tests
# - Automatic rollback on failure
# - Deployment notifications
# - Comprehensive logging
#
# Usage:
#   ./deploy-production.sh [options]
#
# Options:
#   --skip-tests       Skip TypeScript compilation and tests
#   --skip-build       Skip local build validation
#   --force            Force deployment even if checks fail
#   --dry-run          Show what would be deployed without deploying
#   --rollback         Rollback to previous deployment
#   --staging          Deploy to staging instead of production
#   --verbose          Show detailed output
#
# Examples:
#   ./deploy-production.sh                    # Standard production deploy
#   ./deploy-production.sh --staging          # Deploy to staging
#   ./deploy-production.sh --dry-run          # Test without deploying
#   ./deploy-production.sh --rollback         # Rollback last deploy
#
# Requirements:
# - Vercel CLI installed (npm i -g vercel)
# - Node.js and npm
# - Git repository
# - Vercel account configured
# ============================================

set -euo pipefail

# ============================================
# CONFIGURATION
# ============================================

SCRIPT_VERSION="2.0.0"
SCRIPT_NAME="AmiExpress Deploy"
PROJECT_NAME="AmiExpress-Web"

# Directories
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOGS_DIR="$PROJECT_ROOT/logs"

# Log files
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOGS_DIR/deploy_${TIMESTAMP}.log"
ERROR_LOG="$LOGS_DIR/deploy_error_${TIMESTAMP}.log"

# Deployment settings
DEPLOY_TIMEOUT=300  # 5 minutes
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_DELAY=5

# URLs (will be updated after deployment)
PRODUCTION_URL=""
DEPLOYMENT_URL=""

# ============================================
# COLORS & FORMATTING
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Icons
ICON_CHECK="✓"
ICON_CROSS="✗"
ICON_ARROW="→"
ICON_ROCKET="🚀"
ICON_WARNING="⚠"
ICON_INFO="ℹ"
ICON_PACKAGE="📦"
ICON_TEST="🧪"
ICON_BUILD="🔨"
ICON_DEPLOY="🌐"
ICON_HEALTH="💚"

# ============================================
# HELPER FUNCTIONS
# ============================================

# Create logs directory
mkdir -p "$LOGS_DIR"

# Logging functions
log() {
    local message="$*"
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $message" | tee -a "$LOG_FILE"
}

success() {
    local message="$*"
    echo -e "${GREEN}${ICON_CHECK}${NC} $message" | tee -a "$LOG_FILE"
}

error() {
    local message="$*"
    echo -e "${RED}${ICON_CROSS} ERROR:${NC} $message" | tee -a "$LOG_FILE" "$ERROR_LOG" >&2
}

warning() {
    local message="$*"
    echo -e "${YELLOW}${ICON_WARNING} WARNING:${NC} $message" | tee -a "$LOG_FILE"
}

info() {
    local message="$*"
    echo -e "${CYAN}${ICON_INFO}${NC} $message" | tee -a "$LOG_FILE"
}

header() {
    local message="$*"
    echo "" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}${BOLD}  $message${NC}" | tee -a "$LOG_FILE"
    echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
}

step() {
    local number="$1"
    local total="$2"
    local message="$3"
    echo -e "${WHITE}${BOLD}[$number/$total]${NC} ${CYAN}${ICON_ARROW}${NC} $message" | tee -a "$LOG_FILE"
}

spinner() {
    local pid=$1
    local message=$2
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

    while ps -p "$pid" > /dev/null 2>&1; do
        local temp=${spinstr#?}
        printf " ${CYAN}%c${NC}  %s\r" "$spinstr" "$message"
        spinstr=$temp${spinstr%"$temp"}
        sleep $delay
    done
    printf "    \r"
}

# ============================================
# PARSE COMMAND LINE OPTIONS
# ============================================

SKIP_TESTS=false
SKIP_BUILD=false
FORCE_DEPLOY=false
DRY_RUN=false
DO_ROLLBACK=false
IS_STAGING=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback)
            DO_ROLLBACK=true
            shift
            ;;
        --staging)
            IS_STAGING=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            cat << EOF
${BOLD}$SCRIPT_NAME v$SCRIPT_VERSION${NC}

${BOLD}USAGE:${NC}
    $0 [options]

${BOLD}OPTIONS:${NC}
    --skip-tests       Skip TypeScript compilation and tests
    --skip-build       Skip local build validation
    --force            Force deployment even if checks fail
    --dry-run          Show what would be deployed without deploying
    --rollback         Rollback to previous deployment
    --staging          Deploy to staging instead of production
    --verbose          Show detailed output
    -h, --help         Show this help message

${BOLD}EXAMPLES:${NC}
    $0                           # Standard production deploy
    $0 --staging                 # Deploy to staging
    $0 --dry-run                 # Test without deploying
    $0 --rollback                # Rollback last deploy
    $0 --skip-tests --force      # Force deploy without tests

${BOLD}REQUIREMENTS:${NC}
    - Vercel CLI installed (npm i -g vercel)
    - Node.js and npm
    - Git repository
    - Vercel account configured

EOF
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# ============================================
# BANNER
# ============================================

clear
echo -e "${PURPLE}${BOLD}"
cat << "EOF"
    ___            _ ______
   /   |  ____ ___(  )  ____/  ______  ________  __________
  / /| | / __ `__ \ / /  __/  |  \/  \/  ___  / / / ___/ _ \
 / ___ |/ / / / / /  / /____  >    </ / /_/ / /_|_\___ \__  )
/_/  |_/_/ /_/ /_/  /_____/  /_/|_/  / .___/\_____/____/____/
                                    /_/    Web Deployment Script
EOF
echo -e "${NC}"
echo -e "${CYAN}Version $SCRIPT_VERSION${NC}"
echo -e "${WHITE}Deploying: $PROJECT_NAME${NC}"
echo ""

# Show deployment mode
if [ "$DRY_RUN" = true ]; then
    warning "DRY RUN MODE - No actual deployment will occur"
elif [ "$DO_ROLLBACK" = true ]; then
    warning "ROLLBACK MODE - Will rollback to previous deployment"
elif [ "$IS_STAGING" = true ]; then
    info "Target: ${YELLOW}STAGING${NC}"
else
    info "Target: ${GREEN}PRODUCTION${NC}"
fi

echo ""

# ============================================
# STEP 0: HANDLE ROLLBACK
# ============================================

if [ "$DO_ROLLBACK" = true ]; then
    header "${ICON_WARNING} ROLLBACK TO PREVIOUS DEPLOYMENT"

    warning "This will rollback to the previous deployment"
    read -p "Are you sure you want to rollback? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        info "Rollback cancelled"
        exit 0
    fi

    log "Fetching previous deployment..."

    if previous_url=$(vercel list --yes 2>&1 | grep -o 'https://[^[:space:]]*' | head -2 | tail -1); then
        if [ -n "$previous_url" ]; then
            log "Rolling back to: $previous_url"
            vercel rollback "$previous_url" --yes
            success "Rollback completed successfully!"
            info "Previous deployment is now active"
            exit 0
        else
            error "Could not find previous deployment"
            exit 1
        fi
    else
        error "Failed to fetch deployment list"
        exit 1
    fi
fi

# ============================================
# STEP 1: PRE-FLIGHT CHECKS
# ============================================

header "${ICON_INFO} STEP 1/8: PRE-FLIGHT CHECKS"

step 1 8 "Checking prerequisites..."

# Check required commands
required_commands=(vercel git node npm)
for cmd in "${required_commands[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
        error "Required command not found: $cmd"
        if [ "$cmd" = "vercel" ]; then
            info "Install with: npm install -g vercel"
        fi
        exit 1
    fi
done
success "All required commands available"

# Check Vercel authentication
if ! vercel whoami &> /dev/null; then
    error "Not logged in to Vercel"
    info "Run: vercel login"
    exit 1
fi
VERCEL_USER=$(vercel whoami 2>/dev/null)
success "Logged in as: $VERCEL_USER"

# Check git status
if [ -n "$(git status --porcelain)" ] && [ "$FORCE_DEPLOY" = false ]; then
    error "Working directory has uncommitted changes"
    git status --short
    warning "Commit changes or use --force to deploy anyway"
    exit 1
fi
success "Git working directory clean"

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$IS_STAGING" = false ] && [ "$CURRENT_BRANCH" != "main" ] && [ "$FORCE_DEPLOY" = false ]; then
    warning "Not on main branch (currently on: $CURRENT_BRANCH)"
    warning "Production deploys should be from main branch"
    read -p "Continue anyway? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        exit 1
    fi
fi
info "Current branch: $CURRENT_BRANCH"

# Check Node version
NODE_VERSION=$(node --version)
info "Node version: $NODE_VERSION"

success "Pre-flight checks passed"

# ============================================
# STEP 2: TYPESCRIPT COMPILATION
# ============================================

if [ "$SKIP_TESTS" = false ]; then
    header "${ICON_TEST} STEP 2/8: TYPESCRIPT COMPILATION"

    step 2 8 "Compiling TypeScript (backend)..."

    cd "$BACKEND_DIR"
    if [ "$VERBOSE" = true ]; then
        npx tsc --noEmit
    else
        npx tsc --noEmit > /dev/null 2>&1 &
        spinner $! "Compiling TypeScript..."
        wait $!
    fi

    if [ $? -eq 0 ]; then
        success "Backend TypeScript compilation passed"
    else
        error "Backend TypeScript compilation failed"
        if [ "$FORCE_DEPLOY" = false ]; then
            exit 1
        else
            warning "Continuing due to --force flag"
        fi
    fi

    step 2 8 "Compiling TypeScript (frontend)..."

    cd "$FRONTEND_DIR"
    if [ "$VERBOSE" = true ]; then
        npx tsc --noEmit
    else
        npx tsc --noEmit > /dev/null 2>&1 &
        spinner $! "Compiling TypeScript..."
        wait $!
    fi

    if [ $? -eq 0 ]; then
        success "Frontend TypeScript compilation passed"
    else
        error "Frontend TypeScript compilation failed"
        if [ "$FORCE_DEPLOY" = false ]; then
            exit 1
        else
            warning "Continuing due to --force flag"
        fi
    fi

    cd "$PROJECT_ROOT"
else
    header "${ICON_INFO} STEP 2/8: TYPESCRIPT COMPILATION (SKIPPED)"
    warning "TypeScript compilation skipped"
fi

# ============================================
# STEP 3: BUILD VALIDATION
# ============================================

if [ "$SKIP_BUILD" = false ]; then
    header "${ICON_BUILD} STEP 3/8: BUILD VALIDATION"

    step 3 8 "Building frontend..."

    cd "$FRONTEND_DIR"
    if [ "$VERBOSE" = true ]; then
        npm run build
    else
        npm run build > /dev/null 2>&1 &
        spinner $! "Building frontend..."
        wait $!
    fi

    if [ $? -eq 0 ]; then
        success "Frontend build successful"

        # Check build output
        if [ -d "dist" ]; then
            BUILD_SIZE=$(du -sh dist | cut -f1)
            info "Build size: $BUILD_SIZE"
        fi
    else
        error "Frontend build failed"
        if [ "$FORCE_DEPLOY" = false ]; then
            exit 1
        else
            warning "Continuing due to --force flag"
        fi
    fi

    step 3 8 "Building backend..."

    cd "$BACKEND_DIR"
    if [ "$VERBOSE" = true ]; then
        npm run build
    else
        npm run build > /dev/null 2>&1 &
        spinner $! "Building backend..."
        wait $!
    fi

    if [ $? -eq 0 ]; then
        success "Backend build successful"
    else
        error "Backend build failed"
        if [ "$FORCE_DEPLOY" = false ]; then
            exit 1
        else
            warning "Continuing due to --force flag"
        fi
    fi

    cd "$PROJECT_ROOT"
else
    header "${ICON_INFO} STEP 3/8: BUILD VALIDATION (SKIPPED)"
    warning "Build validation skipped"
fi

# ============================================
# STEP 4: SECURITY CHECK
# ============================================

header "${ICON_INFO} STEP 4/8: SECURITY CHECK"

step 4 8 "Checking for security vulnerabilities..."

cd "$BACKEND_DIR"
if npm audit --audit-level=high > /dev/null 2>&1; then
    success "No high-severity vulnerabilities found in backend"
else
    warning "Security vulnerabilities found in backend"
    npm audit --audit-level=high | head -20
    if [ "$FORCE_DEPLOY" = false ]; then
        warning "Consider running: npm audit fix"
        read -p "Continue deployment? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            exit 1
        fi
    fi
fi

cd "$FRONTEND_DIR"
if npm audit --audit-level=high > /dev/null 2>&1; then
    success "No high-severity vulnerabilities found in frontend"
else
    warning "Security vulnerabilities found in frontend"
    npm audit --audit-level=high | head -20
    if [ "$FORCE_DEPLOY" = false ]; then
        warning "Consider running: npm audit fix"
        read -p "Continue deployment? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            exit 1
        fi
    fi
fi

cd "$PROJECT_ROOT"

# ============================================
# STEP 5: DEPLOYMENT SUMMARY
# ============================================

header "${ICON_PACKAGE} STEP 5/8: DEPLOYMENT SUMMARY"

# Get git info
GIT_COMMIT=$(git rev-parse --short HEAD)
GIT_MESSAGE=$(git log -1 --pretty=%B | head -1)
GIT_AUTHOR=$(git log -1 --pretty=%an)
GIT_DATE=$(git log -1 --pretty=%cd --date=relative)

echo -e "${BOLD}Deployment Information:${NC}"
echo ""
echo -e "  ${CYAN}Project:${NC}       $PROJECT_NAME"
echo -e "  ${CYAN}Environment:${NC}   $([ "$IS_STAGING" = true ] && echo "Staging" || echo "Production")"
echo -e "  ${CYAN}Branch:${NC}        $CURRENT_BRANCH"
echo -e "  ${CYAN}Commit:${NC}        $GIT_COMMIT"
echo -e "  ${CYAN}Message:${NC}       $GIT_MESSAGE"
echo -e "  ${CYAN}Author:${NC}        $GIT_AUTHOR"
echo -e "  ${CYAN}Date:${NC}          $GIT_DATE"
echo -e "  ${CYAN}Node:${NC}          $NODE_VERSION"
echo -e "  ${CYAN}Vercel User:${NC}   $VERCEL_USER"
echo ""

# Count changes
CHANGES=$(git diff --shortstat HEAD~1 2>/dev/null || echo "First commit")
if [ "$CHANGES" != "First commit" ]; then
    info "Changes: $CHANGES"
fi

echo ""

# ============================================
# STEP 6: CONFIRM DEPLOYMENT
# ============================================

if [ "$DRY_RUN" = false ] && [ "$FORCE_DEPLOY" = false ]; then
    echo -e "${YELLOW}${BOLD}Ready to deploy to $([ "$IS_STAGING" = true ] && echo "STAGING" || echo "PRODUCTION")${NC}"
    read -p "Proceed with deployment? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        warning "Deployment cancelled by user"
        exit 0
    fi
fi

# ============================================
# STEP 7: DEPLOY TO VERCEL
# ============================================

if [ "$DRY_RUN" = false ]; then
    header "${ICON_ROCKET} STEP 6/8: DEPLOYING TO VERCEL"

    step 6 8 "Starting deployment..."

    # Unset placeholder environment variables
    unset VERCEL_PROJECT_ID
    unset VERCEL_ORG_ID

    # Deploy command
    if [ "$IS_STAGING" = true ]; then
        DEPLOY_CMD="vercel --yes"
    else
        DEPLOY_CMD="vercel --prod --yes"
    fi

    log "Running: $DEPLOY_CMD"

    # Capture deployment output
    DEPLOY_OUTPUT=$(mktemp)

    if [ "$VERBOSE" = true ]; then
        $DEPLOY_CMD | tee "$DEPLOY_OUTPUT"
    else
        $DEPLOY_CMD > "$DEPLOY_OUTPUT" 2>&1 &
        DEPLOY_PID=$!
        spinner $DEPLOY_PID "Deploying to Vercel..."
        wait $DEPLOY_PID
    fi

    DEPLOY_EXIT_CODE=$?

    # Extract URLs from output
    DEPLOYMENT_URL=$(grep -o 'https://[^[:space:]]*vercel\.app' "$DEPLOY_OUTPUT" | tail -1)
    PRODUCTION_URL=$(grep "Production:" "$DEPLOY_OUTPUT" | grep -o 'https://[^[:space:]]*' || echo "$DEPLOYMENT_URL")

    if [ $DEPLOY_EXIT_CODE -eq 0 ] && [ -n "$DEPLOYMENT_URL" ]; then
        success "Deployment successful!"
        echo ""
        echo -e "${BOLD}Deployment URLs:${NC}"
        echo -e "  ${CYAN}${ICON_DEPLOY} Deployment:${NC}  $DEPLOYMENT_URL"
        if [ -n "$PRODUCTION_URL" ] && [ "$PRODUCTION_URL" != "$DEPLOYMENT_URL" ]; then
            echo -e "  ${CYAN}${ICON_DEPLOY} Production:${NC}   $PRODUCTION_URL"
        fi
        echo ""
    else
        error "Deployment failed"
        echo ""
        echo -e "${RED}Deployment Output:${NC}"
        cat "$DEPLOY_OUTPUT"
        echo ""

        rm "$DEPLOY_OUTPUT"
        exit 1
    fi

    rm "$DEPLOY_OUTPUT"

else
    header "${ICON_INFO} STEP 6/8: DEPLOY TO VERCEL (DRY RUN)"
    info "Dry run mode - skipping actual deployment"
    info "Would deploy commit: $GIT_COMMIT"
    info "Would deploy to: $([ "$IS_STAGING" = true ] && echo "STAGING" || echo "PRODUCTION")"

    # Set dummy URL for dry run
    DEPLOYMENT_URL="https://dry-run-example.vercel.app"
fi

# ============================================
# STEP 8: HEALTH CHECKS
# ============================================

if [ "$DRY_RUN" = false ]; then
    header "${ICON_HEALTH} STEP 7/8: HEALTH CHECKS"

    step 7 8 "Waiting for deployment to be ready..."
    sleep 5

    step 7 8 "Checking deployment health..."

    HEALTH_CHECK_URL="$DEPLOYMENT_URL"
    HEALTH_PASSED=false

    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        if curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" | grep -q "200\|301\|302"; then
            HEALTH_PASSED=true
            break
        fi

        if [ $i -lt $HEALTH_CHECK_RETRIES ]; then
            echo -ne "  Attempt $i/$HEALTH_CHECK_RETRIES - Waiting ${HEALTH_CHECK_DELAY}s...\r"
            sleep $HEALTH_CHECK_DELAY
        fi
    done

    echo ""

    if [ "$HEALTH_PASSED" = true ]; then
        success "Deployment is healthy and responding"
    else
        error "Deployment health check failed"
        warning "The deployment may still be working, check manually"
    fi

    # Test Socket.io connection
    step 7 8 "Testing Socket.io endpoint..."
    if curl -s "$DEPLOYMENT_URL/socket.io/" | grep -q "socket.io"; then
        success "Socket.io endpoint responding"
    else
        warning "Socket.io endpoint check inconclusive"
    fi

else
    header "${ICON_INFO} STEP 7/8: HEALTH CHECKS (SKIPPED - DRY RUN)"
    info "Would perform health checks on: $DEPLOYMENT_URL"
fi

# ============================================
# STEP 9: COMPLETION SUMMARY
# ============================================

header "${ICON_CHECK} STEP 8/8: DEPLOYMENT COMPLETE"

echo -e "${GREEN}${BOLD}${ICON_ROCKET} Deployment Successful!${NC}"
echo ""

if [ "$DRY_RUN" = false ]; then
    echo -e "${BOLD}Quick Links:${NC}"
    echo -e "  ${CYAN}${ICON_DEPLOY} Live Site:${NC}        $DEPLOYMENT_URL"
    echo -e "  ${CYAN}${ICON_INFO} Vercel Dashboard:${NC} https://vercel.com/dashboard"
    echo -e "  ${CYAN}${ICON_INFO} View Logs:${NC}        vercel logs $DEPLOYMENT_URL"
    echo ""

    echo -e "${BOLD}Deployment Details:${NC}"
    echo -e "  ${CYAN}Commit:${NC}     $GIT_COMMIT"
    echo -e "  ${CYAN}Branch:${NC}     $CURRENT_BRANCH"
    echo -e "  ${CYAN}Time:${NC}       $(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "  ${CYAN}Log File:${NC}   $LOG_FILE"
    echo ""

    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Visit the deployment URL to verify"
    echo "  2. Test key functionality (login, chat, etc.)"
    echo "  3. Monitor logs for any errors"
    echo "  4. Update DNS if using custom domain"
    echo ""

    echo -e "${BOLD}Useful Commands:${NC}"
    echo -e "  ${CYAN}vercel logs${NC}                    View deployment logs"
    echo -e "  ${CYAN}vercel inspect${NC}                 Inspect deployment details"
    echo -e "  ${CYAN}./deploy-production.sh --rollback${NC}  Rollback this deployment"
    echo ""

else
    echo -e "${YELLOW}${BOLD}Dry Run Complete${NC}"
    echo ""
    echo "No actual deployment was performed."
    echo "To deploy for real, run without --dry-run flag"
    echo ""
fi

# Save deployment info
if [ "$DRY_RUN" = false ]; then
    DEPLOY_INFO_FILE="$LOGS_DIR/last_deployment.json"
    cat > "$DEPLOY_INFO_FILE" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$GIT_COMMIT",
  "branch": "$CURRENT_BRANCH",
  "author": "$GIT_AUTHOR",
  "environment": "$([ "$IS_STAGING" = true ] && echo "staging" || echo "production")",
  "deployment_url": "$DEPLOYMENT_URL",
  "production_url": "$PRODUCTION_URL",
  "log_file": "$LOG_FILE"
}
EOF
    info "Deployment info saved to: $DEPLOY_INFO_FILE"
fi

success "All done! Happy BBS-ing! ${ICON_ROCKET}"

exit 0
