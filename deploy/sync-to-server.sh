#!/bin/bash
# =============================================================================
# AmiExpress BBS - Sync BBS Data to Live Server
# =============================================================================
# Copies gitignored BBS config/data files to the Docker container on the
# Hetzner VPS.  Files that already exist on the server are NOT overwritten
# unless --force is given.
#
# Usage:
#   ./deploy/sync-to-server.sh              # sync missing files only
#   ./deploy/sync-to-server.sh --force      # overwrite existing files
#   ./deploy/sync-to-server.sh --dry-run    # show what would be copied
#   ./deploy/sync-to-server.sh --restart    # restart container after sync
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_IP="203.0.113.10"
SERVER_USER="root"
CONTAINER="amiexpress-bbs"
BBS_DATA="/app/data/bbs"
FORCE=0
DRY_RUN=0
RESTART=0

for arg in "$@"; do
  case "$arg" in
    --force)   FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --restart) RESTART=1 ;;
    --help)
      echo "Usage: $0 [--force] [--dry-run] [--restart]"
      echo "  --force    Overwrite existing files on server"
      echo "  --dry-run  Show what would be copied without doing it"
      echo "  --restart  Restart the Docker container after sync"
      exit 0 ;;
  esac
done

cd "$PROJECT_DIR"

echo "=============================================="
echo "AmiExpress BBS - Sync to Server"
echo "=============================================="
echo "Server: ${SERVER_USER}@${SERVER_IP}"
echo "Container: ${CONTAINER}"
echo "Force: ${FORCE}"
echo ""

# Verify SSH connectivity
if ! ssh -o ConnectTimeout=5 -q "${SERVER_USER}@${SERVER_IP}" "true" 2>/dev/null; then
  echo "[ERROR] Cannot connect to ${SERVER_USER}@${SERVER_IP}"
  exit 1
fi

COPIED=0
SKIPPED=0
FAILED=0

# Function to sync a file to the container
sync_file() {
  local src="$1"
  local dst="$2"  # path inside container

  if [ ! -f "$src" ]; then
    return
  fi

  local fname=$(basename "$src")

  # Check if file exists on server
  if [ "$FORCE" = "0" ]; then
    if ssh -q "${SERVER_USER}@${SERVER_IP}" "docker exec ${CONTAINER} test -f '${dst}'" 2>/dev/null; then
      SKIPPED=$((SKIPPED + 1))
      return
    fi
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "  [WOULD COPY] $src -> $dst"
    COPIED=$((COPIED + 1))
    return
  fi

  # Copy via scp + docker cp
  local tmpfile="/tmp/bbs-sync-$(echo "$dst" | tr '/' '_')"
  scp -q "$src" "${SERVER_USER}@${SERVER_IP}:${tmpfile}" 2>/dev/null
  if ssh -q "${SERVER_USER}@${SERVER_IP}" "docker cp '${tmpfile}' '${CONTAINER}:${dst}' && rm -f '${tmpfile}'" 2>/dev/null; then
    echo "  [OK] $src -> $dst"
    COPIED=$((COPIED + 1))
  else
    echo "  [FAIL] $src -> $dst"
    FAILED=$((FAILED + 1))
  fi
}

# Function to sync a directory's files (non-recursive for specific patterns)
sync_dir_files() {
  local src_dir="$1"
  local dst_dir="$2"
  local pattern="$3"  # e.g. "*.info" or "*"

  if [ ! -d "$src_dir" ]; then
    return
  fi

  # Ensure target dir exists
  if [ "$DRY_RUN" = "0" ]; then
    ssh -q "${SERVER_USER}@${SERVER_IP}" "docker exec ${CONTAINER} mkdir -p '${dst_dir}'" 2>/dev/null
  fi

  for f in ${src_dir}/${pattern}; do
    if [ -f "$f" ]; then
      local fname=$(basename "$f")
      sync_file "$f" "${dst_dir}/${fname}"
    fi
  done
}

# ============================================================
# 1. Root-level config files
# ============================================================
echo "[1/5] Root-level configuration files..."
sync_file "bbsConfig.info" "${BBS_DATA}/bbsConfig.info"
sync_file "Doors.info" "${BBS_DATA}/Doors.info"
sync_file "NamesNotAllowed.info" "${BBS_DATA}/NamesNotAllowed.info"
sync_file "ConfConfig.info" "${BBS_DATA}/ConfConfig.info"
sync_file "Conf.DB" "${BBS_DATA}/Conf.DB"

# ============================================================
# 2. Node .info files (root level: Node0.info .. Node6.info)
# ============================================================
echo "[2/5] Node .info files..."
for n in $(seq 0 6); do
  sync_file "Node${n}.info" "${BBS_DATA}/Node${n}.info"
done

# ============================================================
# 3. Per-node config .info files and subdirectories
#    (Modem.info, Serial.info, etc. - use Node0 as template
#    for any node missing them)
# ============================================================
echo "[3/5] Per-node config files (Node0-40)..."
TEMPLATE_NODE="Node0"
for n in $(seq 0 40); do
  nodeDir="Node${n}"
  if [ -d "$nodeDir" ]; then
    # Copy .info files from this node
    sync_dir_files "$nodeDir" "${BBS_DATA}/${nodeDir}" "*.info"
    # Copy Modem/ and Serial/ subdirectory .info files
    if [ -d "$nodeDir/Modem" ]; then
      sync_dir_files "$nodeDir/Modem" "${BBS_DATA}/${nodeDir}/Modem" "*.info"
    fi
    if [ -d "$nodeDir/Serial" ]; then
      sync_dir_files "$nodeDir/Serial" "${BBS_DATA}/${nodeDir}/Serial" "*.info"
    fi
  elif [ -d "$TEMPLATE_NODE" ]; then
    # Node doesn't exist locally, use Node0 as template
    sync_dir_files "$TEMPLATE_NODE" "${BBS_DATA}/${nodeDir}" "*.info"
    if [ -d "$TEMPLATE_NODE/Modem" ]; then
      sync_dir_files "$TEMPLATE_NODE/Modem" "${BBS_DATA}/${nodeDir}/Modem" "*.info"
    fi
    if [ -d "$TEMPLATE_NODE/Serial" ]; then
      sync_dir_files "$TEMPLATE_NODE/Serial" "${BBS_DATA}/${nodeDir}/Serial" "*.info"
    fi
  fi
done

# ============================================================
# 4. Conf .info files (already in Dockerfile but verify)
# ============================================================
echo "[4/5] Conference .info files..."
for n in $(seq 1 14); do
  sync_file "Conf${n}.info" "${BBS_DATA}/Conf${n}.info"
done

# ============================================================
# 5. Upload files (LHA archives in Conf*/Upload/)
# ============================================================
echo "[5/5] Conference upload files..."
for n in $(seq 1 14); do
  if [ -d "Conf${n}/Upload" ]; then
    sync_dir_files "Conf${n}/Upload" "${BBS_DATA}/Conf${n}/Upload" "*.LHA"
    sync_dir_files "Conf${n}/Upload" "${BBS_DATA}/Conf${n}/Upload" "*.lha"
    sync_file "Conf${n}/Upload/FILES.BBS" "${BBS_DATA}/Conf${n}/Upload/FILES.BBS"
  fi
done

echo ""
echo "=============================================="
echo "Sync complete!"
echo "  Copied:  ${COPIED}"
echo "  Skipped: ${SKIPPED} (already exist)"
echo "  Failed:  ${FAILED}"
echo "=============================================="

if [ "$RESTART" = "1" ] && [ "$DRY_RUN" = "0" ]; then
  echo ""
  echo "Restarting container..."
  ssh "${SERVER_USER}@${SERVER_IP}" "docker restart ${CONTAINER}"
  echo "Container restarted."
fi
