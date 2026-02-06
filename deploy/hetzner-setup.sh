#!/bin/bash
# =============================================================================
# AmiExpress BBS - Hetzner VPS Initial Setup Script
# =============================================================================
# Run this ONCE on a fresh Ubuntu 24.04 VPS to set up the BBS
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/amiexpress-web/main/deploy/hetzner-setup.sh | bash
#   # OR
#   wget -qO- https://raw.githubusercontent.com/YOUR_USER/amiexpress-web/main/deploy/hetzner-setup.sh | bash
#
# After running this script:
#   1. Edit /app/amiexpress/.env with your secrets
#   2. Run: cd /app/amiexpress && docker compose up -d
# =============================================================================

set -e

echo "=============================================="
echo "AmiExpress BBS - Hetzner VPS Setup"
echo "=============================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "[ERROR] Please run as root: sudo bash hetzner-setup.sh"
  exit 1
fi

# Update system
echo "[1/6] Updating system packages..."
apt update && apt upgrade -y

# Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker already installed"
fi

# Install Docker Compose plugin
echo "[3/6] Installing Docker Compose..."
apt install -y docker-compose-plugin

# Install useful tools
echo "[4/6] Installing utilities..."
apt install -y git curl htop

# Create app directory
echo "[5/6] Setting up application directory..."
mkdir -p /app/amiexpress
cd /app/amiexpress

# Clone repository (if not already cloned)
if [ ! -f "docker-compose.yml" ]; then
  echo "  Cloning repository..."
  echo ""
  echo "  Enter your repository URL (e.g., https://github.com/username/amiexpress-web.git):"
  read -r REPO_URL
  git clone "$REPO_URL" .
else
  echo "  Repository already exists, pulling latest..."
  git pull
fi

# Generate secrets
echo "[6/6] Generating .env file..."
if [ ! -f ".env" ]; then
  cat > .env << EOF
# AmiExpress BBS Configuration
# Generated on $(date)

# Security secrets (auto-generated)
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)

# RAM settings (Hetzner CX22 = 4GB, plenty of headroom)
EMULATOR_MEMORY_MB=8
AMIGA_FILE_CACHE_MB=4
FILE_CACHE_MB=8

# Your domain (for CORS)
# CORS_ORIGINS=https://bbs.yourdomain.com

# Debug (set to true for troubleshooting)
DEBUG=false
XIM_DEBUG=0
EOF
  echo "  Created .env with generated secrets"
else
  echo "  .env already exists, skipping"
fi

# Configure firewall (ufw)
echo ""
echo "=============================================="
echo "Configuring firewall..."
echo "=============================================="
if command -v ufw &> /dev/null; then
  ufw allow 22/tcp    # SSH (server admin)
  ufw allow 3001/tcp  # HTTP/WebSocket
  ufw allow 2323/tcp  # Telnet
  ufw allow 2222/tcp  # SSH (BBS)
  ufw --force enable
  echo "  Firewall configured"
else
  echo "  [WARN] ufw not installed, configure Hetzner firewall manually"
fi

echo ""
echo "=============================================="
echo "Setup Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Review and edit .env if needed:"
echo "     nano /app/amiexpress/.env"
echo ""
echo "  2. Start the BBS:"
echo "     cd /app/amiexpress"
echo "     docker compose up -d"
echo ""
echo "  3. View logs:"
echo "     docker compose logs -f"
echo ""
echo "  4. Access your BBS:"
echo "     Web:    http://YOUR_SERVER_IP:3001"
echo "     Telnet: telnet YOUR_SERVER_IP 2323"
echo ""
echo "  5. (Optional) Set up SSL with Caddy or nginx"
echo ""
