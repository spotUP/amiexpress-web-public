#!/bin/bash
# =============================================================================
# AmiExpress BBS - Status Check
# =============================================================================
# Quick health check and status overview
#
# Usage: ./deploy/status.sh
# =============================================================================

echo "=============================================="
echo "AmiExpress BBS - Status"
echo "=============================================="
echo ""

# Container status
echo "[Container]"
docker compose ps 2>/dev/null || echo "  Not running or docker-compose not available"
echo ""

# Health check
echo "[Health Check]"
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "  HTTP:    [OK] http://localhost:3001"
else
  echo "  HTTP:    [FAIL] http://localhost:3001"
fi

if nc -z localhost 2323 2>/dev/null; then
  echo "  Telnet:  [OK] port 2323"
else
  echo "  Telnet:  [FAIL] port 2323"
fi

if nc -z localhost 2222 2>/dev/null; then
  echo "  SSH:     [OK] port 2222"
else
  echo "  SSH:     [--] port 2222 (may not be configured)"
fi
echo ""

# Memory usage
echo "[Memory]"
free -h | head -2
echo ""

# Disk usage
echo "[Disk]"
df -h / | tail -1
echo ""

# Docker volume
echo "[BBS Data Volume]"
docker volume inspect amiexpress-bbs-data 2>/dev/null | grep -E '"Mountpoint"|"Size"' || echo "  Volume not found"
echo ""

# Recent logs
echo "[Recent Logs (last 10 lines)]"
docker compose logs --tail=10 2>/dev/null || echo "  No logs available"
echo ""
