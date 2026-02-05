#!/bin/bash
# AmiExpress-Web Docker Entrypoint
#
# This script runs on container startup to:
# 1. Initialize BBS data on first run (if persistent disk is empty)
# 2. Never overwrite existing data on subsequent deployments
# 3. Start the BBS server
#
# Data locations:
# - /app/data/bbs     - BBS configuration and user data (persistent)
# - /app/data/db      - SQLite database (persistent)
# - /app/default-data - Default data template (read-only, from image)

set -e

BBS_DATA_DIR="${BBS_DATA_DIR:-/app/data/bbs}"
DATABASE_DIR="${DATABASE_DIR:-/app/data/db}"
DEFAULT_DATA_DIR="/app/default-data"
# Set FORCE_REINIT_SCREENS=1 to force re-copy Screens directory (fixes empty placeholders)
FORCE_REINIT_SCREENS="${FORCE_REINIT_SCREENS:-0}"

echo "[Entrypoint] Starting AmiExpress-Web..."
echo "[Entrypoint] BBS_DATA_DIR: $BBS_DATA_DIR"
echo "[Entrypoint] DATABASE_DIR: $DATABASE_DIR"
echo "[Entrypoint] FORCE_REINIT_SCREENS: $FORCE_REINIT_SCREENS"

# Create data directories if they don't exist
mkdir -p "$BBS_DATA_DIR" "$DATABASE_DIR"

# Ensure AROS ROM files are available (for 68K door emulation)
ROM_DIR="${ROM_DIR:-/app/data/amiga-roms}"
mkdir -p "$ROM_DIR"
if [ -f "/app/default-data/amiga-roms/aros-rom.bin" ] && [ ! -f "$ROM_DIR/aros-rom.bin" ]; then
    echo "[Entrypoint] Copying AROS ROM files to $ROM_DIR..."
    cp /app/default-data/amiga-roms/aros-rom.bin "$ROM_DIR/"
    cp /app/default-data/amiga-roms/aros-ext.bin "$ROM_DIR/"
fi

# Initialize BBS data ONLY if the directory is empty (first run)
if [ ! -f "$BBS_DATA_DIR/.initialized" ]; then
    echo "[Entrypoint] First run detected - initializing BBS data..."

    # Copy default data to persistent storage
    if [ -d "$DEFAULT_DATA_DIR" ]; then
        echo "[Entrypoint] Copying default BBS data..."

        # Copy each directory only if it doesn't exist in persistent storage
        # Doors and Libs are included because BBS expects them at $BBS_DATA_DIR/Doors/ and $BBS_DATA_DIR/Libs/
        # Node0-Node40 (41 nodes), Conf1-Conf13 (13 conferences)
        for dir in Screens Bulletins Commands Node0 Node1 Node2 Node3 Node4 Node5 Node6 Node7 Node8 Node9 Node10 Node11 Node12 Node13 Node14 Node15 Node16 Node17 Node18 Node19 Node20 Node21 Node22 Node23 Node24 Node25 Node26 Node27 Node28 Node29 Node30 Node31 Node32 Node33 Node34 Node35 Node36 Node37 Node38 Node39 Node40 Conf1 Conf2 Conf3 Conf4 Conf5 Conf6 Conf7 Conf8 Conf9 Conf10 Conf11 Conf12 Conf13 Conf14 Doors Libs; do
            if [ -d "$DEFAULT_DATA_DIR/$dir" ] && [ ! -d "$BBS_DATA_DIR/$dir" ]; then
                echo "[Entrypoint]   Copying $dir..."
                cp -r "$DEFAULT_DATA_DIR/$dir" "$BBS_DATA_DIR/$dir"
            else
                echo "[Entrypoint]   Skipping $dir (already exists or not in template)"
            fi
        done

        # Mark as initialized
        date > "$BBS_DATA_DIR/.initialized"
        echo "[Entrypoint] BBS data initialized successfully"
    else
        echo "[Entrypoint] WARNING: Default data directory not found at $DEFAULT_DATA_DIR"
    fi
else
    echo "[Entrypoint] BBS data already initialized (found .initialized marker)"
    echo "[Entrypoint] Checking for missing directories (repair mode)..."

    # Repair mode: copy any missing directories without overwriting existing ones
    for dir in Screens Bulletins Commands Node0 Node1 Node2 Node3 Node4 Node5 Node6 Node7 Node8 Node9 Node10 Node11 Node12 Node13 Node14 Node15 Node16 Node17 Node18 Node19 Node20 Node21 Node22 Node23 Node24 Node25 Node26 Node27 Node28 Node29 Node30 Node31 Node32 Node33 Node34 Node35 Node36 Node37 Node38 Node39 Node40 Conf1 Conf2 Conf3 Conf4 Conf5 Conf6 Conf7 Conf8 Conf9 Conf10 Conf11 Conf12 Conf13 Conf14 Doors Libs; do
        if [ -d "$DEFAULT_DATA_DIR/$dir" ] && [ ! -d "$BBS_DATA_DIR/$dir" ]; then
            echo "[Entrypoint]   REPAIR: Copying missing $dir..."
            cp -r "$DEFAULT_DATA_DIR/$dir" "$BBS_DATA_DIR/$dir"
        fi
    done

    # Force re-initialize Screens if requested (fixes empty placeholder files)
    if [ "$FORCE_REINIT_SCREENS" = "1" ]; then
        echo "[Entrypoint] FORCE_REINIT_SCREENS=1 - Re-copying Screens directory..."
        if [ -d "$DEFAULT_DATA_DIR/Screens" ]; then
            rm -rf "$BBS_DATA_DIR/Screens"
            cp -r "$DEFAULT_DATA_DIR/Screens" "$BBS_DATA_DIR/Screens"
            echo "[Entrypoint] Screens directory re-initialized from default-data"
        fi
    fi
fi

# Show what data exists
echo "[Entrypoint] Current BBS data:"
ls -la "$BBS_DATA_DIR" 2>/dev/null | head -20 || echo "  (empty)"

# Create/reset default sysop user
echo "[Entrypoint] Setting up default sysop user..."
cd /app/web/backend
export DATABASE_DIR="$DATABASE_DIR"
export DATABASE_FILE="${DATABASE_FILE:-amiexpress.db}"
npx tsx scripts/create-default-sysop.ts || echo "[Entrypoint] WARNING: Failed to create sysop user"

# Execute the main command (typically: npx tsx src/index.ts)
echo "[Entrypoint] Starting BBS server..."
exec "$@"
