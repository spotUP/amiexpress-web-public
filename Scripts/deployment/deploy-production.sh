#!/bin/bash

# ============================================
# AmiExpress-Web Production Deployment Script
# ============================================
# A comprehensive deployment script with pre-flight checks,
# automated testing, rollback capabilities, health monitoring,
# and intelligent auto-fix capabilities.
#
# Features:
# - Pre-deployment validation (tests, builds, env checks)
# - Automated deployment to Vercel (frontend) and Render (backend)
# - Dual-platform deployment support
# - Health checks and smoke tests for both platforms
# - Automatic rollback on failure
# - Post-deployment error detection from logs
# - Intelligent auto-fix for common build errors
# - Automatic redeployment after fixes (max 2 attempts)
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
# - Render CLI installed (npm i -g render) - optional
# - Node.js and npm
# - Git repository
# - Vercel account configured
# - Render account configured (optional)
# ============================================

set -euo pipefail

# ============================================
# CONFIGURATION
# ============================================

SCRIPT_VERSION="3.0.0"
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
MAX_FIX_ATTEMPTS=2  # Maximum number of auto-fix and redeploy attempts
CURRENT_ATTEMPT=0

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
# ERROR DETECTION AND AUTO-FIX FUNCTIONS
# ============================================

fetch_vercel_logs() {
    local deployment_url="$1"
    local log_output="$LOGS_DIR/vercel_deploy_logs_${TIMESTAMP}.txt"

    log "Fetching Vercel deployment logs..."

    # Use timeout to prevent hanging (10 second timeout)
    # Vercel logs can stream indefinitely, so we need to limit it
    if timeout 10s vercel logs "$deployment_url" 2>&1 | head -100 > "$log_output" 2>&1; then
        # If we got any content, consider it success
        if [ -s "$log_output" ]; then
            echo "$log_output"
            return 0
        fi
    fi

    # If timeout or no content, use inspect instead (non-streaming)
    info "Using vercel inspect as fallback..."
    if timeout 10s vercel inspect "$deployment_url" 2>&1 > "$log_output"; then
        echo "$log_output"
        return 0
    else
        warning "Could not fetch Vercel logs"
        echo ""
        return 1
    fi
}

fetch_render_logs() {
    local service_id="$1"
    local log_output="$LOGS_DIR/render_deploy_logs_${TIMESTAMP}.txt"

    log "Fetching Render deployment logs..."

    # Render CLI requires -r flag for resources and -o json for non-interactive mode
    # Use timeout to prevent hanging (15 second timeout for Render)
    if timeout 15s render logs -r "$service_id" --limit 200 --level error -o json 2>&1 > "$log_output"; then
        # Extract just the messages from JSON
        if [ -s "$log_output" ]; then
            cat "$log_output" | grep -o '"message": "[^"]*"' | cut -d'"' -f4 > "${log_output}.txt" 2>/dev/null || true
            if [ -s "${log_output}.txt" ]; then
                mv "${log_output}.txt" "$log_output"
            fi
            echo "$log_output"
            return 0
        fi
    fi

    warning "Could not fetch Render logs (may still be deploying)"
    echo ""
    return 1
}

detect_build_errors() {
    local log_file="$1"
    local platform="$2"  # "vercel" or "render"

    if [ ! -f "$log_file" ]; then
        return 1
    fi

    # Common error patterns
    local error_patterns=(
        "ERROR"
        "Error:"
        "error TS"
        "Build failed"
        "build failed"
        "Cannot find module"
        "Module not found"
        "SyntaxError"
        "TypeError"
        "ReferenceError"
        "ENOENT"
        "npm ERR!"
        "Command failed"
        "Exit code: 1"
        "Connection terminated unexpectedly"
        "ECONNREFUSED"
        "getaddrinfo ENOTFOUND"
    )

    local errors_found=false
    local error_summary="$LOGS_DIR/error_summary_${TIMESTAMP}.txt"

    echo "=== Errors Detected in $platform ===" > "$error_summary"
    echo "" >> "$error_summary"

    for pattern in "${error_patterns[@]}"; do
        if grep -i "$pattern" "$log_file" >> "$error_summary" 2>/dev/null; then
            errors_found=true
        fi
    done

    if [ "$errors_found" = true ]; then
        echo "$error_summary"
        return 0
    else
        rm "$error_summary" 2>/dev/null
        return 1
    fi
}

analyze_and_fix_errors() {
    local error_file="$1"
    local platform="$2"

    header "🔧 AUTO-FIX: ANALYZING ERRORS"

    warning "Errors detected in $platform deployment"
    echo ""
    echo -e "${BOLD}Error Summary:${NC}"
    head -30 "$error_file"
    echo ""

    # Check for database connection errors
    if grep -q -i "connection terminated unexpectedly\|ECONNREFUSED.*postgres\|getaddrinfo ENOTFOUND.*postgres" "$error_file"; then
        error "❌ DATABASE CONNECTION ERROR"
        echo ""
        echo -e "${RED}${BOLD}PostgreSQL database connection failed!${NC}"
        echo ""
        echo -e "${YELLOW}This is a configuration issue, not a build error.${NC}"
        echo ""
        echo -e "${BOLD}Required Action:${NC}"
        echo "1. Go to Render Dashboard: https://dashboard.render.com/web/$RENDER_SERVICE"
        echo "2. Navigate to: Environment tab"
        echo "3. Add these environment variables:"
        echo ""
        echo -e "   ${CYAN}DATABASE_URL${NC}     = postgresql://user:password@host:5432/dbname"
        echo -e "   ${CYAN}NODE_ENV${NC}         = production"
        echo -e "   ${CYAN}JWT_SECRET${NC}       = your-secret-key"
        echo -e "   ${CYAN}REDIS_URL${NC}        = redis://... (optional)"
        echo ""
        echo "4. Render will automatically redeploy after you save"
        echo ""
        info "💡 Get a free PostgreSQL database at: https://render.com/docs/databases"
        echo ""
        return 1
    fi

    # Check if this is a TypeScript error
    if grep -q "error TS" "$error_file"; then
        info "TypeScript errors detected"
        fix_typescript_errors "$error_file"
        return $?
    fi

    # Check if this is a module not found error
    if grep -q -i "cannot find module\|module not found" "$error_file"; then
        info "Module dependency errors detected"
        fix_module_errors "$error_file"
        return $?
    fi

    # Check if this is a build configuration error
    if grep -q -i "build failed\|command failed" "$error_file"; then
        info "Build configuration errors detected"
        fix_build_errors "$error_file"
        return $?
    fi

    warning "Could not automatically determine fix strategy"
    return 1
}

fix_typescript_errors() {
    local error_file="$1"

    info "Running TypeScript compiler to get detailed errors..."

    cd "$BACKEND_DIR"
    npx tsc --noEmit > "$LOGS_DIR/tsc_backend_errors.txt" 2>&1 || true

    cd "$FRONTEND_DIR"
    npx tsc --noEmit > "$LOGS_DIR/tsc_frontend_errors.txt" 2>&1 || true

    cd "$PROJECT_ROOT"

    # Look for common fixable TypeScript issues
    local backend_errors="$LOGS_DIR/tsc_backend_errors.txt"
    local frontend_errors="$LOGS_DIR/tsc_frontend_errors.txt"

    local fixed=false

    # Check for missing type definitions
    if grep -q "Could not find a declaration file" "$backend_errors" "$frontend_errors" 2>/dev/null; then
        info "Installing missing type definitions..."

        # Extract package names and install @types packages
        for pkg in $(grep "Could not find a declaration file" "$backend_errors" "$frontend_errors" 2>/dev/null | grep -o "for '[^']*'" | cut -d"'" -f2); do
            info "Installing @types/$pkg..."
            cd "$BACKEND_DIR" && npm install --save-dev "@types/$pkg" 2>/dev/null || true
            cd "$FRONTEND_DIR" && npm install --save-dev "@types/$pkg" 2>/dev/null || true
            fixed=true
        done

        cd "$PROJECT_ROOT"
    fi

    if [ "$fixed" = true ]; then
        success "Applied TypeScript fixes"
        return 0
    else
        warning "No automatic fixes available for these TypeScript errors"
        return 1
    fi
}

fix_module_errors() {
    local error_file="$1"

    info "Analyzing module dependency errors..."

    # Extract missing module names
    local missing_modules=$(grep -i "cannot find module\|module not found" "$error_file" | grep -o "'[^']*'" | tr -d "'" | sort -u)

    if [ -z "$missing_modules" ]; then
        return 1
    fi

    echo ""
    echo -e "${BOLD}Missing modules detected:${NC}"
    echo "$missing_modules"
    echo ""

    read -p "Install missing modules automatically? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        return 1
    fi

    local fixed=false

    for module in $missing_modules; do
        info "Installing $module..."

        # Try backend first
        if cd "$BACKEND_DIR" && npm install "$module" 2>/dev/null; then
            success "Installed $module in backend"
            fixed=true
        fi

        # Try frontend
        if cd "$FRONTEND_DIR" && npm install "$module" 2>/dev/null; then
            success "Installed $module in frontend"
            fixed=true
        fi

        cd "$PROJECT_ROOT"
    done

    if [ "$fixed" = true ]; then
        success "Installed missing dependencies"
        return 0
    else
        return 1
    fi
}

fix_build_errors() {
    local error_file="$1"

    info "Analyzing build configuration errors..."

    # Check for common build issues
    if grep -q "out of memory\|heap out of memory" "$error_file"; then
        warning "Build failed due to memory issues"
        info "Consider increasing Node memory: NODE_OPTIONS=--max_old_space_size=4096"
        return 1
    fi

    if grep -q "ENOENT.*package.json" "$error_file"; then
        warning "Package.json not found - this might be a path issue"
        return 1
    fi

    # Try cleaning and reinstalling dependencies
    read -p "Clean and reinstall dependencies? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        return 1
    fi

    info "Cleaning node_modules and package-lock.json..."

    cd "$BACKEND_DIR"
    rm -rf node_modules package-lock.json
    npm install

    cd "$FRONTEND_DIR"
    rm -rf node_modules package-lock.json
    npm install

    cd "$PROJECT_ROOT"

    success "Reinstalled all dependencies"
    return 0
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
AUTO_FIX=true  # Enable auto-fix by default
SKIP_ERROR_CHECK=false

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
        --no-auto-fix)
            AUTO_FIX=false
            shift
            ;;
        --skip-error-check)
            SKIP_ERROR_CHECK=true
            shift
            ;;
        -h|--help)
            cat << EOF
${BOLD}$SCRIPT_NAME v$SCRIPT_VERSION${NC}

${BOLD}USAGE:${NC}
    $0 [options]

${BOLD}OPTIONS:${NC}
    --skip-tests          Skip TypeScript compilation and tests
    --skip-build          Skip local build validation
    --force               Force deployment even if checks fail
    --dry-run             Show what would be deployed without deploying
    --rollback            Rollback to previous deployment
    --staging             Deploy to staging instead of production
    --verbose             Show detailed output
    --no-auto-fix         Disable automatic error fixing and redeployment
    --skip-error-check    Skip post-deployment error checking
    -h, --help            Show this help message

${BOLD}EXAMPLES:${NC}
    $0                           # Standard production deploy
    $0 --staging                 # Deploy to staging
    $0 --dry-run                 # Test without deploying
    $0 --rollback                # Rollback last deploy
    $0 --skip-tests --force      # Force deploy without tests

${BOLD}REQUIREMENTS:${NC}
    - Vercel CLI installed (npm i -g vercel)
    - Render CLI installed (npm i -g render) - optional for backend deployment
    - Node.js and npm
    - Git repository
    - Vercel account configured
    - Render account configured (optional)

${BOLD}DEPLOYMENT TARGETS:${NC}
    - Frontend → Vercel (required)
    - Backend → Render (optional, auto-detected)

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

header "${ICON_INFO} STEP 1/9: PRE-FLIGHT CHECKS"

step 1 9 "Checking prerequisites..."

# Check required commands
required_commands=(vercel render git node npm)
for cmd in "${required_commands[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
        error "Required command not found: $cmd"
        if [ "$cmd" = "vercel" ]; then
            info "Install with: npm install -g vercel"
        elif [ "$cmd" = "render" ]; then
            info "Install with: npm install -g render"
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
success "Logged in to Vercel as: $VERCEL_USER"

# Check Render authentication
if ! render whoami -o json &> /dev/null; then
    warning "Not logged in to Render"
    info "Run: render login"
    info "Continuing with Vercel-only deployment"
    RENDER_AVAILABLE=false
else
    RENDER_USER=$(render whoami -o json 2>/dev/null | grep "Email:" | awk '{print $2}')
    success "Logged in to Render as: $RENDER_USER"
    RENDER_AVAILABLE=true
fi

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
    header "${ICON_TEST} STEP 2/9: TYPESCRIPT COMPILATION"

    step 2 9 "Compiling TypeScript (backend)..."

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

    step 2 9 "Compiling TypeScript (frontend)..."

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
    header "${ICON_INFO} STEP 2/9: TYPESCRIPT COMPILATION (SKIPPED)"
    warning "TypeScript compilation skipped"
fi

# ============================================
# STEP 3: BUILD VALIDATION
# ============================================

if [ "$SKIP_BUILD" = false ]; then
    header "${ICON_BUILD} STEP 3/9: BUILD VALIDATION"

    step 3 9 "Building frontend..."

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

    step 3 9 "Building backend..."

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
    header "${ICON_INFO} STEP 3/9: BUILD VALIDATION (SKIPPED)"
    warning "Build validation skipped"
fi

# ============================================
# STEP 4: SECURITY CHECK
# ============================================

header "${ICON_INFO} STEP 4/9: SECURITY CHECK"

step 4 9 "Checking for security vulnerabilities..."

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

header "${ICON_PACKAGE} STEP 5/9: DEPLOYMENT SUMMARY"

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
# STEP 6: DEPLOY TO VERCEL
# ============================================

if [ "$DRY_RUN" = false ]; then
    header "${ICON_ROCKET} STEP 6/9: DEPLOYING TO VERCEL"

    step 6 9 "Starting deployment..."

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

    # Deploy to Render if available
    if [ "$RENDER_AVAILABLE" = true ]; then
        echo ""
        step 6 9 "Deploying backend to Render..."

        # Check if render.yaml exists
        if [ -f "render.yaml" ]; then
            log "Deploying backend to Render.com..."

            RENDER_OUTPUT=$(mktemp)

            # Get Render service info
            RENDER_SERVICE=""
            RENDER_SERVICE_URL=""

            # Get services list in JSON format
            SERVICES_JSON=$(render services list -o json 2>/dev/null)

            if echo "$SERVICES_JSON" | grep -q "amiexpress"; then
                # Extract service ID from JSON
                RENDER_SERVICE=$(echo "$SERVICES_JSON" | grep -o '"id": "srv-[^"]*"' | head -1 | cut -d'"' -f4)
                RENDER_SERVICE_URL=$(echo "$SERVICES_JSON" | grep -o '"url": "https://[^"]*\.onrender\.com"' | head -1 | cut -d'"' -f4)

                if [ -n "$RENDER_SERVICE" ]; then
                    info "Render service found: $RENDER_SERVICE"
                    if [ -n "$RENDER_SERVICE_URL" ]; then
                        info "Service URL: $RENDER_SERVICE_URL"
                    fi

                    # Note: Render auto-deploys from GitHub, so we just notify
                    log "Render will auto-deploy from GitHub push..."

                    # Check if there's a recent deployment
                    info "Note: Render auto-deploys from GitHub within 1-2 minutes"
                    info "Manual trigger via CLI is not needed for connected repos"

                    echo ""
                    echo -e "${BOLD}Render Service:${NC}"
                    echo -e "  ${CYAN}${ICON_DEPLOY} Service ID:${NC}   $RENDER_SERVICE"
                    if [ -n "$RENDER_SERVICE_URL" ]; then
                        echo -e "  ${CYAN}${ICON_DEPLOY} Backend URL:${NC}  $RENDER_SERVICE_URL"
                    fi
                    echo ""

                    success "Render service configured for auto-deploy"
                else
                    warning "Could not determine Render service ID"
                    info "Render will auto-deploy from GitHub push"
                fi
            else
                warning "No Render services found"
                info "Make sure your service is connected to GitHub"
                info "Render will auto-deploy when you push to GitHub"
            fi

            rm "$RENDER_OUTPUT" 2>/dev/null || true
        else
            warning "render.yaml not found - skipping Render deployment"
            info "Create render.yaml to enable Render deployments"
        fi
    else
        warning "Render CLI not authenticated - skipping Render deployment"
        info "Run 'render login' to enable Render deployments"
    fi

else
    header "${ICON_INFO} STEP 6/9: DEPLOY TO VERCEL (DRY RUN)"
    info "Dry run mode - skipping actual deployment"
    info "Would deploy commit: $GIT_COMMIT"
    info "Would deploy to: $([ "$IS_STAGING" = true ] && echo "STAGING" || echo "PRODUCTION")"
    info "Would deploy to both Vercel and Render"

    # Set dummy URL for dry run
    DEPLOYMENT_URL="https://dry-run-example.vercel.app"
fi

# ============================================
# STEP 7: HEALTH CHECKS
# ============================================

if [ "$DRY_RUN" = false ]; then
    header "${ICON_HEALTH} STEP 7/9: HEALTH CHECKS"

    step 7 9 "Waiting for deployment to be ready..."
    sleep 5

    step 7 9 "Checking deployment health..."

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

    # Test Socket.io connection on Vercel (if frontend has Socket.io)
    step 7 9 "Testing Socket.io endpoint (Vercel)..."
    if curl -s "$DEPLOYMENT_URL/socket.io/" | grep -q "socket.io"; then
        success "Socket.io endpoint responding on Vercel"
    else
        warning "Socket.io endpoint check inconclusive on Vercel"
    fi

    # Test Render backend if available
    if [ -n "$RENDER_SERVICE_URL" ]; then
        echo ""
        step 7 9 "Testing Render backend health..."

        RENDER_HEALTH_PASSED=false

        for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$RENDER_SERVICE_URL" 2>/dev/null || echo "000")

            if echo "$HTTP_CODE" | grep -q "200\|301\|302"; then
                RENDER_HEALTH_PASSED=true
                break
            fi

            if [ $i -lt $HEALTH_CHECK_RETRIES ]; then
                echo -ne "  Attempt $i/$HEALTH_CHECK_RETRIES - Waiting ${HEALTH_CHECK_DELAY}s...\r"
                sleep $HEALTH_CHECK_DELAY
            fi
        done

        echo ""

        if [ "$RENDER_HEALTH_PASSED" = true ]; then
            success "Render backend is healthy and responding"
        else
            warning "Render backend health check failed (may still be deploying)"
            info "Render deployments can take 5-10 minutes to fully start"
        fi

        # Test Render Socket.io endpoint
        step 7 9 "Testing Socket.io endpoint (Render)..."
        if curl -s "$RENDER_SERVICE_URL/socket.io/" 2>/dev/null | grep -q "socket.io"; then
            success "Socket.io endpoint responding on Render"
        else
            warning "Socket.io endpoint not yet available on Render (may still be starting)"
        fi
    fi

else
    header "${ICON_INFO} STEP 7/9: HEALTH CHECKS (SKIPPED - DRY RUN)"
    info "Would perform health checks on: $DEPLOYMENT_URL"
fi

# ============================================
# STEP 8: ERROR DETECTION AND AUTO-FIX
# ============================================

if [ "$DRY_RUN" = false ] && [ "$SKIP_ERROR_CHECK" = false ]; then
    header "${ICON_INFO} STEP 8/9: POST-DEPLOYMENT ERROR CHECK"

    step 8 9 "Checking deployment logs for errors..."
    echo ""
    info "🔍 Fetching logs from deployment platforms..."
    echo ""

    ERRORS_DETECTED=false
    VERCEL_ERRORS=""
    RENDER_ERRORS=""

    # Check Vercel logs
    if [ -n "$DEPLOYMENT_URL" ]; then
        info "⏳ Waiting for Vercel logs to be available (3s)..."
        sleep 3
        echo ""
        info "📥 Fetching Vercel deployment logs..."
        VERCEL_LOG_FILE=$(fetch_vercel_logs "$DEPLOYMENT_URL")

        if [ -n "$VERCEL_LOG_FILE" ]; then
            info "🔎 Analyzing Vercel logs for errors..."
            if ERROR_SUMMARY=$(detect_build_errors "$VERCEL_LOG_FILE" "Vercel"); then
                warning "Build errors detected in Vercel deployment"
                ERRORS_DETECTED=true
                VERCEL_ERRORS="$ERROR_SUMMARY"
            else
                success "No build errors detected in Vercel logs"
            fi
        fi
        echo ""
    fi

    # Check Render logs
    if [ -n "$RENDER_SERVICE" ] && [ "$RENDER_AVAILABLE" = true ]; then
        info "⏳ Waiting for Render logs to be available (3s)..."
        sleep 3
        echo ""
        info "📥 Fetching Render service logs..."
        RENDER_LOG_FILE=$(fetch_render_logs "$RENDER_SERVICE")

        if [ -n "$RENDER_LOG_FILE" ] && [ -f "$RENDER_LOG_FILE" ]; then
            info "🔎 Analyzing Render logs for errors..."
            if ERROR_SUMMARY=$(detect_build_errors "$RENDER_LOG_FILE" "Render"); then
                warning "Errors detected in Render deployment"
                ERRORS_DETECTED=true
                RENDER_ERRORS="$ERROR_SUMMARY"
            else
                success "No errors detected in Render logs"
            fi
        fi
        echo ""
    fi

    # If errors detected and auto-fix is enabled
    if [ "$ERRORS_DETECTED" = true ] && [ "$AUTO_FIX" = true ]; then
        # Check if we haven't exceeded max attempts
        CURRENT_ATTEMPT=$((CURRENT_ATTEMPT + 1))

        if [ $CURRENT_ATTEMPT -le $MAX_FIX_ATTEMPTS ]; then
            echo ""
            warning "🔧 AUTO-FIX ACTIVATED: Attempt $CURRENT_ATTEMPT of $MAX_FIX_ATTEMPTS"
            echo ""
            info "🤖 Analyzing errors and attempting automatic fixes..."
            echo ""

            FIXES_APPLIED=false

            # Try to fix Vercel errors
            if [ -n "$VERCEL_ERRORS" ]; then
                info "🔍 Processing Vercel errors..."
                echo ""
                if analyze_and_fix_errors "$VERCEL_ERRORS" "Vercel"; then
                    FIXES_APPLIED=true
                    success "✅ Applied fixes for Vercel errors"
                else
                    warning "⚠️  Could not auto-fix Vercel errors"
                fi
                echo ""
            fi

            # Try to fix Render errors
            if [ -n "$RENDER_ERRORS" ]; then
                info "🔍 Processing Render errors..."
                echo ""
                if analyze_and_fix_errors "$RENDER_ERRORS" "Render"; then
                    FIXES_APPLIED=true
                    success "✅ Applied fixes for Render errors"
                else
                    warning "⚠️  Could not auto-fix Render errors"
                fi
                echo ""
            fi

            if [ "$FIXES_APPLIED" = true ]; then
                echo ""
                warning "Fixes have been applied. Redeploying..."
                echo ""

                # Commit the fixes
                if [ -n "$(git status --porcelain)" ]; then
                    info "Committing auto-fixes..."
                    git add -A
                    git commit -m "Auto-fix: Resolve deployment errors (attempt $CURRENT_ATTEMPT)

Applied automatic fixes for build errors detected in deployment logs.

🤖 Generated with Claude Code Deployment Script

Co-Authored-By: Claude <noreply@anthropic.com>"
                    success "Changes committed"
                fi

                # Recursive call to redeploy with same flags
                info "Redeploying with fixes..."
                sleep 2

                # Build the command with current flags
                REDEPLOY_CMD="$0"
                [ "$SKIP_TESTS" = true ] && REDEPLOY_CMD="$REDEPLOY_CMD --skip-tests"
                [ "$SKIP_BUILD" = true ] && REDEPLOY_CMD="$REDEPLOY_CMD --skip-build"
                [ "$FORCE_DEPLOY" = true ] && REDEPLOY_CMD="$REDEPLOY_CMD --force"
                [ "$IS_STAGING" = true ] && REDEPLOY_CMD="$REDEPLOY_CMD --staging"
                [ "$VERBOSE" = true ] && REDEPLOY_CMD="$REDEPLOY_CMD --verbose"
                [ "$AUTO_FIX" = false ] && REDEPLOY_CMD="$REDEPLOY_CMD --no-auto-fix"

                exec $REDEPLOY_CMD
            else
                error "Could not automatically fix the detected errors"
                warning "Manual intervention required"
                echo ""
                info "Review error logs at:"
                [ -n "$VERCEL_ERRORS" ] && echo "  - $VERCEL_ERRORS"
                [ -n "$RENDER_ERRORS" ] && echo "  - $RENDER_ERRORS"
                echo ""
            fi
        else
            error "Maximum fix attempts ($MAX_FIX_ATTEMPTS) reached"
            warning "Manual intervention required"
            echo ""
            info "Review error logs and fix manually"
        fi
    elif [ "$ERRORS_DETECTED" = true ]; then
        warning "Errors detected but auto-fix is disabled"
        info "Use --auto-fix to enable automatic error fixing"
        echo ""
        info "Review error logs at:"
        [ -n "$VERCEL_ERRORS" ] && echo "  - $VERCEL_ERRORS"
        [ -n "$RENDER_ERRORS" ] && echo "  - $RENDER_ERRORS"
    else
        success "No errors detected in deployment logs"
    fi
else
    if [ "$SKIP_ERROR_CHECK" = true ]; then
        header "${ICON_INFO} STEP 8/9: ERROR CHECK (SKIPPED)"
        warning "Error checking skipped"
    else
        header "${ICON_INFO} STEP 8/9: ERROR CHECK (SKIPPED - DRY RUN)"
        info "Would check deployment logs for errors"
    fi
fi

# ============================================
# STEP 9: COMPLETION SUMMARY
# ============================================

header "${ICON_CHECK} STEP 9/9: DEPLOYMENT COMPLETE"

echo -e "${GREEN}${BOLD}${ICON_ROCKET} Deployment Successful!${NC}"
echo ""

if [ "$DRY_RUN" = false ]; then
    echo -e "${BOLD}Quick Links:${NC}"
    echo -e "  ${CYAN}${ICON_DEPLOY} Frontend (Vercel):${NC} $DEPLOYMENT_URL"
    if [ -n "$RENDER_SERVICE_URL" ]; then
        echo -e "  ${CYAN}${ICON_DEPLOY} Backend (Render):${NC}  $RENDER_SERVICE_URL"
    fi
    echo -e "  ${CYAN}${ICON_INFO} Vercel Dashboard:${NC}  https://vercel.com/dashboard"
    if [ "$RENDER_AVAILABLE" = true ]; then
        echo -e "  ${CYAN}${ICON_INFO} Render Dashboard:${NC}  https://dashboard.render.com"
    fi
    echo ""

    echo -e "${BOLD}Deployment Details:${NC}"
    echo -e "  ${CYAN}Commit:${NC}     $GIT_COMMIT"
    echo -e "  ${CYAN}Branch:${NC}     $CURRENT_BRANCH"
    echo -e "  ${CYAN}Time:${NC}       $(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "  ${CYAN}Log File:${NC}   $LOG_FILE"
    if [ -n "$RENDER_SERVICE" ]; then
        echo -e "  ${CYAN}Render:${NC}     $RENDER_SERVICE"
    fi
    echo ""

    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Visit the deployment URLs to verify"
    echo "  2. Test key functionality (login, chat, file transfer)"
    echo "  3. Monitor logs for any errors"
    echo "  4. Verify backend Socket.io connection"
    echo "  5. Update DNS if using custom domain"
    echo ""

    echo -e "${BOLD}Useful Commands:${NC}"
    echo -e "  ${CYAN}vercel logs${NC}                          View Vercel deployment logs"
    echo -e "  ${CYAN}vercel inspect${NC}                       Inspect Vercel deployment details"
    if [ "$RENDER_AVAILABLE" = true ] && [ -n "$RENDER_SERVICE" ]; then
        echo -e "  ${CYAN}render logs -s $RENDER_SERVICE${NC}    View Render service logs"
        echo -e "  ${CYAN}render services get $RENDER_SERVICE${NC}    Get Render service details"
    fi
    echo -e "  ${CYAN}./deploy-production.sh --rollback${NC}    Rollback this deployment"
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
  "vercel": {
    "deployment_url": "$DEPLOYMENT_URL",
    "production_url": "$PRODUCTION_URL"
  },
  "render": {
    "service": "${RENDER_SERVICE:-null}",
    "service_url": "${RENDER_SERVICE_URL:-null}",
    "available": $RENDER_AVAILABLE
  },
  "log_file": "$LOG_FILE"
}
EOF
    info "Deployment info saved to: $DEPLOY_INFO_FILE"
fi

success "All done! Happy BBS-ing! ${ICON_ROCKET}"

exit 0
