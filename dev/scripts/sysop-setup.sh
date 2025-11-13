#!/bin/bash

# ============================================
# AmiExpress BBS - Sysop Setup Wizard
# ============================================
# Interactive setup wizard for first-time BBS deployment
#
# This script will:
# - Collect BBS configuration information
# - Generate secure credentials
# - Create .env.local configuration
# - Initialize database
# - Create first admin account
# - Test system health
# - Optionally import Amiga BBS data
# ============================================

set -e

# ANSI Color Codes (ASCII-safe)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
RESET='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration variables
BBS_NAME=""
SYSOP_NAME=""
BBS_LOCATION=""
ADMIN_USERNAME=""
ADMIN_PASSWORD=""
ADMIN_EMAIL=""
JWT_SECRET=""
DATABASE_DIR=""
IMPORT_ARCHIVE=""
TELNET_PORT=2323
SSH_PORT=2222
BACKEND_PORT=3001
FRONTEND_PORT=5173

# ============================================
# Helper Functions
# ============================================

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                   ║"
    echo "║              AmiExpress BBS - Sysop Setup Wizard                 ║"
    echo "║                                                                   ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${CYAN}${BOLD}  $1${RESET}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
}

print_success() {
    echo -e "${GREEN}[OK]${RESET} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${RESET} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${RESET} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${RESET} $1"
}

# Prompt for input with default value
prompt_input() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local is_password="$4"

    if [ -n "$default" ]; then
        echo -ne "${WHITE}${prompt} ${CYAN}[${default}]${RESET}: "
    else
        echo -ne "${WHITE}${prompt}${RESET}: "
    fi

    if [ "$is_password" = "true" ]; then
        read -s user_input
        echo ""  # New line after password
    else
        read user_input
    fi

    if [ -z "$user_input" ]; then
        eval "$var_name=\"$default\""
    else
        eval "$var_name=\"$user_input\""
    fi
}

# Confirm yes/no
confirm() {
    local prompt="$1"
    local default="${2:-n}"

    if [ "$default" = "y" ]; then
        echo -ne "${WHITE}${prompt} ${CYAN}[Y/n]${RESET}: "
    else
        echo -ne "${WHITE}${prompt} ${CYAN}[y/N]${RESET}: "
    fi

    read response

    if [ -z "$response" ]; then
        response="$default"
    fi

    case "$response" in
        [Yy]* ) return 0 ;;
        * ) return 1 ;;
    esac
}

# Generate random JWT secret
generate_jwt_secret() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 32
    else
        # Fallback if openssl not available
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_section "Checking Prerequisites"

    local all_good=true

    # Check for Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        print_success "Node.js installed: $node_version"
    else
        print_error "Node.js not found. Please install Node.js 18+ first."
        all_good=false
    fi

    # Check for npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        print_success "npm installed: $npm_version"
    else
        print_error "npm not found. Please install npm first."
        all_good=false
    fi

    # Check for git
    if command -v git &> /dev/null; then
        local git_version=$(git --version)
        print_success "Git installed: $git_version"
    else
        print_warning "Git not found. Version control features will be limited."
    fi

    if [ "$all_good" = false ]; then
        echo ""
        print_error "Missing required dependencies. Please install them and try again."
        exit 1
    fi

    echo ""
    print_success "All prerequisites satisfied!"
}

# ============================================
# Main Setup Flow
# ============================================

welcome() {
    print_header

    echo -e "${WHITE}Welcome to the AmiExpress BBS Setup Wizard!${RESET}"
    echo ""
    echo "This wizard will help you configure your BBS for first-time use."
    echo "You'll be able to:"
    echo "  - Configure BBS settings (name, sysop, location)"
    echo "  - Set up secure credentials"
    echo "  - Initialize the database"
    echo "  - Create your admin account"
    echo "  - Optionally import existing Amiga BBS data"
    echo ""
    echo "The process takes about 5 minutes."
    echo ""

    if ! confirm "Ready to begin?" "y"; then
        echo ""
        print_info "Setup cancelled. Run this script again when ready."
        exit 0
    fi
}

configure_bbs() {
    print_section "BBS Configuration"

    echo "Let's configure your BBS settings."
    echo ""

    prompt_input "BBS Name" "AmiExpress BBS" "BBS_NAME"
    prompt_input "Sysop Name" "$(whoami)" "SYSOP_NAME"
    prompt_input "BBS Location (City, State/Country)" "Cyberspace" "BBS_LOCATION"

    echo ""
    print_info "BBS will be named: $BBS_NAME"
    print_info "Sysop: $SYSOP_NAME from $BBS_LOCATION"
}

configure_admin_account() {
    print_section "Admin Account"

    echo "Create your sysop/admin account."
    echo ""

    prompt_input "Admin Username" "sysop" "ADMIN_USERNAME"

    while true; do
        prompt_input "Admin Password (min 8 characters)" "" "ADMIN_PASSWORD" "true"

        if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
            print_error "Password must be at least 8 characters long."
            continue
        fi

        prompt_input "Confirm Password" "" "ADMIN_PASSWORD_CONFIRM" "true"

        if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]; then
            break
        else
            print_error "Passwords do not match. Please try again."
            echo ""
        fi
    done

    prompt_input "Admin Email (optional)" "" "ADMIN_EMAIL"

    echo ""
    print_success "Admin account configured: $ADMIN_USERNAME"
}

configure_ports() {
    print_section "Network Configuration"

    echo "Configure network ports for your BBS."
    echo ""
    echo "Default ports:"
    echo "  - Backend API: 3001"
    echo "  - Frontend (Web): 5173"
    echo "  - Telnet: 2323"
    echo "  - SSH: 2222"
    echo ""

    if confirm "Use default ports?" "y"; then
        BACKEND_PORT=3001
        FRONTEND_PORT=5173
        TELNET_PORT=2323
        SSH_PORT=2222
    else
        prompt_input "Backend Port" "3001" "BACKEND_PORT"
        prompt_input "Frontend Port" "5173" "FRONTEND_PORT"
        prompt_input "Telnet Port" "2323" "TELNET_PORT"
        prompt_input "SSH Port" "2222" "SSH_PORT"
    fi

    echo ""
    print_success "Ports configured"
}

configure_database() {
    print_section "Database Configuration"

    echo "AmiExpress uses SQLite for data storage."
    echo ""

    prompt_input "Database directory" "./data" "DATABASE_DIR"

    # Create database directory if it doesn't exist
    mkdir -p "$REPO_ROOT/$DATABASE_DIR"

    echo ""
    print_success "Database directory: $REPO_ROOT/$DATABASE_DIR"
}

generate_secrets() {
    print_section "Generating Security Credentials"

    echo "Generating secure JWT secret..."
    JWT_SECRET=$(generate_jwt_secret)

    print_success "JWT secret generated"
    echo ""
}

create_env_file() {
    print_section "Creating Configuration File"

    local env_file="$REPO_ROOT/.env.local"

    if [ -f "$env_file" ]; then
        echo -e "${YELLOW}[WARNING]${RESET} .env.local already exists"
        if ! confirm "Overwrite existing .env.local?" "n"; then
            print_info "Keeping existing .env.local"
            return
        fi
        cp "$env_file" "$env_file.backup.$(date +%s)"
        print_info "Backed up existing .env.local"
    fi

    cat > "$env_file" <<EOF
# AmiExpress BBS Configuration
# Generated by sysop-setup.sh on $(date)

# ============================================
# BBS CONFIGURATION
# ============================================
BBS_NAME=$BBS_NAME
SYSOP_NAME=$SYSOP_NAME
BBS_LOCATION=$BBS_LOCATION

# ============================================
# SECURITY
# ============================================
JWT_SECRET=$JWT_SECRET

# ============================================
# DATABASE
# ============================================
DATABASE_DIR=$DATABASE_DIR
DATABASE_FILE=amiexpress.db

# ============================================
# DEVELOPMENT PORTS
# ============================================
BACKEND_PORT=$BACKEND_PORT
FRONTEND_PORT=$FRONTEND_PORT
TELNET_PORT=$TELNET_PORT
SSH_PORT=$SSH_PORT

# ============================================
# NODE ENVIRONMENT
# ============================================
NODE_ENV=development

# ============================================
# OPTIONAL: DEPLOYMENT (Configure later)
# ============================================
# VERCEL_TOKEN=
# RENDER_API_KEY=
# DEPLOY_WEBHOOK_URL=

# ============================================
# OPTIONAL: SSH SERVER
# ============================================
# SSH_HOST_KEY_PATH=./ssh_host_rsa_key

# ============================================
# OPTIONAL: SMTP (For email features)
# ============================================
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=

EOF

    print_success "Created .env.local"
    echo ""
}

install_dependencies() {
    print_section "Installing Dependencies"

    echo "This may take 2-3 minutes on first run..."
    echo ""

    # Backend dependencies
    echo -e "${CYAN}[INFO]${RESET} Installing backend dependencies..."
    cd "$REPO_ROOT/web/backend"
    if npm install --quiet > /dev/null 2>&1; then
        print_success "Backend dependencies installed"
    else
        print_error "Failed to install backend dependencies"
        return 1
    fi

    # Frontend dependencies
    echo -e "${CYAN}[INFO]${RESET} Installing frontend dependencies..."
    cd "$REPO_ROOT/web/frontend"
    if npm install --quiet > /dev/null 2>&1; then
        print_success "Frontend dependencies installed"
    else
        print_error "Failed to install frontend dependencies"
        return 1
    fi

    # Config app dependencies
    echo -e "${CYAN}[INFO]${RESET} Installing config app dependencies..."
    cd "$REPO_ROOT/web/config-app"
    if npm install --quiet > /dev/null 2>&1; then
        print_success "Config app dependencies installed"
    else
        print_warning "Failed to install config app dependencies (optional)"
    fi

    # SDK dependencies
    echo -e "${CYAN}[INFO]${RESET} Installing SDK dependencies..."
    cd "$REPO_ROOT/sdk"
    if npm install --quiet > /dev/null 2>&1; then
        print_success "SDK dependencies installed"
    else
        print_warning "Failed to install SDK dependencies (optional)"
    fi

    cd "$REPO_ROOT"
    echo ""
}

initialize_database() {
    print_section "Initializing Database"

    echo "Creating database and admin account..."
    echo ""

    # Create a temporary script to initialize database and create admin
    cat > "$REPO_ROOT/temp-init-db.js" <<EOF
const path = require('path');
const Database = require('./web/backend/src/database').Database;

async function init() {
    try {
        const dbPath = path.join('$DATABASE_DIR', 'amiexpress.db');
        console.log('[INFO] Initializing database at:', dbPath);

        const db = new Database(dbPath);
        await db.init();

        console.log('[OK] Database initialized');

        // Create admin user
        console.log('[INFO] Creating admin account...');
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('$ADMIN_PASSWORD', 10);

        const userId = db.createUser({
            username: '$ADMIN_USERNAME',
            password_hash: hashedPassword,
            real_name: '$SYSOP_NAME',
            email: '$ADMIN_EMAIL',
            security_level: 255,  // Full sysop access
            location: '$BBS_LOCATION',
            user_flags: 0,
            expert: 1,
            ansi: 1,
            lines_per_screen: 24
        });

        console.log('[OK] Admin account created: $ADMIN_USERNAME (ID:', userId, ')');
        console.log('[OK] Setup complete!');

        process.exit(0);
    } catch (error) {
        console.error('[ERROR] Database initialization failed:', error.message);
        process.exit(1);
    }
}

init();
EOF

    cd "$REPO_ROOT"
    if node temp-init-db.js 2>&1; then
        print_success "Database initialized successfully"
        print_success "Admin account created: $ADMIN_USERNAME"
    else
        print_error "Database initialization failed"
        rm -f temp-init-db.js
        return 1
    fi

    rm -f temp-init-db.js
    echo ""
}

offer_import() {
    print_section "Import Existing BBS Data (Optional)"

    echo "Do you have an existing Amiga BBS archive to import?"
    echo "Supported formats: .lha, .lzx, .zip, .tar, .tar.gz"
    echo ""

    if confirm "Import Amiga BBS data now?" "n"; then
        prompt_input "Path to archive file" "" "IMPORT_ARCHIVE"

        if [ -f "$IMPORT_ARCHIVE" ]; then
            print_info "Archive found: $IMPORT_ARCHIVE"
            echo ""
            print_info "To import this archive, use the Admin UI after starting your BBS:"
            print_info "  1. Start your BBS: ./dev/scripts/start-servers.sh"
            print_info "  2. Login as: $ADMIN_USERNAME"
            print_info "  3. Navigate to: Admin > Import/Export"
            print_info "  4. Upload: $IMPORT_ARCHIVE"
            echo ""
            print_warning "Import during initial setup is not yet implemented."
            print_warning "Use the web UI method described above."
        else
            print_error "Archive file not found: $IMPORT_ARCHIVE"
        fi
    else
        print_info "Skipping import. You can import later from the Admin UI."
    fi

    echo ""
}

generate_ssh_key() {
    print_section "SSH Server Setup (Optional)"

    echo "AmiExpress supports SSH connections for users."
    echo "This requires an SSH host key."
    echo ""

    if confirm "Generate SSH host key?" "y"; then
        local key_path="$REPO_ROOT/ssh_host_rsa_key"

        if [ -f "$key_path" ]; then
            print_info "SSH key already exists: $key_path"
        else
            if command -v ssh-keygen &> /dev/null; then
                ssh-keygen -t rsa -b 4096 -f "$key_path" -N "" -q
                print_success "SSH host key generated: $key_path"

                # Add to .env.local
                echo "" >> "$REPO_ROOT/.env.local"
                echo "# SSH Server" >> "$REPO_ROOT/.env.local"
                echo "SSH_HOST_KEY_PATH=./ssh_host_rsa_key" >> "$REPO_ROOT/.env.local"

                print_info "Updated .env.local with SSH key path"
            else
                print_warning "ssh-keygen not found. Install OpenSSH to use SSH server."
            fi
        fi
    else
        print_info "Skipping SSH key generation."
        print_info "SSH server will not be available until you generate a key."
    fi

    echo ""
}

print_summary() {
    print_section "Setup Complete!"

    echo -e "${GREEN}${BOLD}Your BBS is ready to launch!${RESET}"
    echo ""
    echo -e "${WHITE}Configuration Summary:${RESET}"
    echo "  BBS Name:      $BBS_NAME"
    echo "  Sysop:         $SYSOP_NAME"
    echo "  Location:      $BBS_LOCATION"
    echo "  Admin User:    $ADMIN_USERNAME"
    echo "  Database:      $DATABASE_DIR/amiexpress.db"
    echo ""
    echo -e "${WHITE}Access URLs:${RESET}"
    echo "  Web Terminal:  http://localhost:$FRONTEND_PORT"
    echo "  Admin Panel:   http://localhost:$FRONTEND_PORT/admin"
    echo "  Telnet:        telnet localhost $TELNET_PORT"
    if [ -f "$REPO_ROOT/ssh_host_rsa_key" ]; then
        echo "  SSH:           ssh -p $SSH_PORT $ADMIN_USERNAME@localhost"
    fi
    echo ""
    echo -e "${WHITE}Next Steps:${RESET}"
    echo "  1. Start your BBS:"
    echo "     ${CYAN}./dev/scripts/start-servers.sh${RESET}"
    echo ""
    echo "  2. Access the web terminal:"
    echo "     ${CYAN}http://localhost:$FRONTEND_PORT${RESET}"
    echo ""
    echo "  3. Login with:"
    echo "     Username: ${CYAN}$ADMIN_USERNAME${RESET}"
    echo "     Password: ${CYAN}[your password]${RESET}"
    echo ""
    echo "  4. Customize your BBS:"
    echo "     - Edit screens in: ${CYAN}data/bbs/BBS/Screens/${RESET}"
    echo "     - Add bulletins in: ${CYAN}data/bbs/BBS/Conf01/Bulletins/${RESET}"
    echo "     - Install doors using SDK"
    echo ""
    echo -e "${WHITE}Documentation:${RESET}"
    echo "  - User Guide:       Documentation/1-Users/USER_GUIDE.md"
    echo "  - Sysop Guide:      Documentation/2-Sysops/SYSOP_GUIDE.md"
    echo "  - Deployment:       Documentation/2-Sysops/DEPLOYMENT.md"
    echo ""
}

offer_start_servers() {
    if confirm "Start your BBS now?" "y"; then
        echo ""
        print_info "Starting servers..."
        echo ""
        exec "$REPO_ROOT/dev/scripts/start-servers.sh"
    else
        echo ""
        print_info "When ready, start your BBS with:"
        echo "  ${CYAN}./dev/scripts/start-servers.sh${RESET}"
        echo ""
    fi
}

# ============================================
# Main Execution
# ============================================

main() {
    cd "$REPO_ROOT"

    welcome
    check_prerequisites
    configure_bbs
    configure_admin_account
    configure_ports
    configure_database
    generate_secrets
    create_env_file
    install_dependencies
    initialize_database
    offer_import
    generate_ssh_key
    print_summary
    offer_start_servers
}

# Run main function
main
