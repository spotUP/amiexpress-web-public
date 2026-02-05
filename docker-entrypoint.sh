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
ROM_DIR="${ROM_DIR:-/app/data/amiga-roms}"
# Set FORCE_REINIT_SCREENS=1 to force re-copy Screens directory (fixes empty placeholders)
FORCE_REINIT_SCREENS="${FORCE_REINIT_SCREENS:-0}"
# Set FORCE_REINIT_ROMS=1 to force re-copy AROS ROM files
FORCE_REINIT_ROMS="${FORCE_REINIT_ROMS:-0}"
# Set FORCE_REINIT_CONFIG=1 to force re-copy .info config files (ConfConfig.info, bbsConfig.info, Conf*.info)
FORCE_REINIT_CONFIG="${FORCE_REINIT_CONFIG:-0}"
# Set FORCE_REINIT_DOORS=1 to force re-copy TypeScript doors (updates old doors on persistent disk)
FORCE_REINIT_DOORS="${FORCE_REINIT_DOORS:-0}"

echo "[Entrypoint] Starting AmiExpress-Web..."
echo "[Entrypoint] BBS_DATA_DIR: $BBS_DATA_DIR"
echo "[Entrypoint] DATABASE_DIR: $DATABASE_DIR"
echo "[Entrypoint] ROM_DIR: $ROM_DIR"
echo "[Entrypoint] FORCE_REINIT_SCREENS: $FORCE_REINIT_SCREENS"
echo "[Entrypoint] FORCE_REINIT_ROMS: $FORCE_REINIT_ROMS"
echo "[Entrypoint] FORCE_REINIT_CONFIG: $FORCE_REINIT_CONFIG"
echo "[Entrypoint] FORCE_REINIT_DOORS: $FORCE_REINIT_DOORS"

# Create data directories if they don't exist
mkdir -p "$BBS_DATA_DIR" "$DATABASE_DIR" "$ROM_DIR"

# Create symlinks for consistent path structure (matches local dev environment)
# This allows code to use /app/Doors instead of /app/data/bbs/Doors
if [ ! -L "/app/Doors" ] && [ ! -d "/app/Doors" ]; then
    ln -s "$BBS_DATA_DIR/Doors" /app/Doors
    echo "[Entrypoint] Created symlink: /app/Doors -> $BBS_DATA_DIR/Doors"
fi
if [ ! -L "/app/Libs" ] && [ ! -d "/app/Libs" ]; then
    ln -s "$BBS_DATA_DIR/Libs" /app/Libs
    echo "[Entrypoint] Created symlink: /app/Libs -> $BBS_DATA_DIR/Libs"
fi

# Ensure AROS ROM files are available (for 68K door emulation)
echo "[Entrypoint] Checking AROS ROM files..."
echo "[Entrypoint]   Source: /app/default-data/amiga-roms/"
ls -la /app/default-data/amiga-roms/ 2>/dev/null || echo "  (not found in image)"
echo "[Entrypoint]   Target: $ROM_DIR/"
ls -la "$ROM_DIR/" 2>/dev/null || echo "  (directory empty)"

# Copy ROM files if missing or force reinit requested
if [ "$FORCE_REINIT_ROMS" = "1" ]; then
    echo "[Entrypoint] FORCE_REINIT_ROMS=1 - Forcing ROM file copy..."
    if [ -f "/app/default-data/amiga-roms/aros-rom.bin" ]; then
        cp -v /app/default-data/amiga-roms/aros-rom.bin "$ROM_DIR/"
        cp -v /app/default-data/amiga-roms/aros-ext.bin "$ROM_DIR/"
        echo "[Entrypoint] AROS ROM files force-copied to $ROM_DIR"
    else
        echo "[Entrypoint] ERROR: AROS ROM files not found in Docker image!"
    fi
elif [ -f "/app/default-data/amiga-roms/aros-rom.bin" ] && [ ! -f "$ROM_DIR/aros-rom.bin" ]; then
    echo "[Entrypoint] Copying AROS ROM files to $ROM_DIR..."
    cp -v /app/default-data/amiga-roms/aros-rom.bin "$ROM_DIR/"
    cp -v /app/default-data/amiga-roms/aros-ext.bin "$ROM_DIR/"
    echo "[Entrypoint] AROS ROM files copied successfully"
elif [ -f "$ROM_DIR/aros-rom.bin" ]; then
    echo "[Entrypoint] AROS ROM files already exist at $ROM_DIR"
else
    echo "[Entrypoint] WARNING: AROS ROM files not found in Docker image at /app/default-data/amiga-roms/"
fi

# Final ROM status check
echo "[Entrypoint] Final ROM status:"
if [ -f "$ROM_DIR/aros-rom.bin" ] && [ -f "$ROM_DIR/aros-ext.bin" ]; then
    echo "[Entrypoint]   [OK] aros-rom.bin: $(ls -la "$ROM_DIR/aros-rom.bin" | awk '{print $5}') bytes"
    echo "[Entrypoint]   [OK] aros-ext.bin: $(ls -la "$ROM_DIR/aros-ext.bin" | awk '{print $5}') bytes"
else
    echo "[Entrypoint]   [ERROR] AROS ROM files missing - 68K doors will NOT work!"
    echo "[Entrypoint]   Set FORCE_REINIT_ROMS=1 in render.yaml to attempt re-copy"
fi

# Copy root-level .info configuration files (critical for conferences and file areas)
# These are binary Amiga icon files containing tooltypes (key=value pairs)
# Note: bbsConfig.info is gitignored (user-specific) - backend uses defaults
INFO_FILES="ConfConfig.info Conf1.info Conf2.info Conf3.info Conf4.info Conf5.info Conf6.info Conf7.info Conf8.info Conf9.info Conf10.info Conf11.info Conf12.info Conf13.info Conf14.info"

echo "[Entrypoint] Checking root .info configuration files..."

# Force re-copy if requested
if [ "$FORCE_REINIT_CONFIG" = "1" ]; then
    echo "[Entrypoint] FORCE_REINIT_CONFIG=1 - Forcing re-copy of all .info config files..."
    for infofile in $INFO_FILES; do
        if [ -f "$DEFAULT_DATA_DIR/$infofile" ]; then
            cp -v "$DEFAULT_DATA_DIR/$infofile" "$BBS_DATA_DIR/$infofile"
        else
            echo "[Entrypoint]   WARNING: $infofile not found in Docker image"
        fi
    done
else
    # Copy only if missing
    for infofile in $INFO_FILES; do
        if [ -f "$DEFAULT_DATA_DIR/$infofile" ] && [ ! -f "$BBS_DATA_DIR/$infofile" ]; then
            cp -v "$DEFAULT_DATA_DIR/$infofile" "$BBS_DATA_DIR/$infofile"
            echo "[Entrypoint]   Copied $infofile"
        fi
    done
fi

# Final config status check
echo "[Entrypoint] Configuration file status:"
if [ -f "$BBS_DATA_DIR/ConfConfig.info" ]; then
    echo "[Entrypoint]   [OK] ConfConfig.info: $(ls -la "$BBS_DATA_DIR/ConfConfig.info" | awk '{print $5}') bytes"
else
    echo "[Entrypoint]   [MISSING] ConfConfig.info - BBS will use fallback defaults"
fi
# Count Conf*.info files
CONF_INFO_COUNT=$(ls -1 "$BBS_DATA_DIR"/Conf*.info 2>/dev/null | wc -l | tr -d ' ')
echo "[Entrypoint]   [INFO] $CONF_INFO_COUNT conference .info files present"

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
        echo "[Entrypoint] FORCE_REINIT_SCREENS=1 - Re-copying all Screens directories..."
        # Re-copy root Screens
        if [ -d "$DEFAULT_DATA_DIR/Screens" ]; then
            rm -rf "$BBS_DATA_DIR/Screens"
            cp -r "$DEFAULT_DATA_DIR/Screens" "$BBS_DATA_DIR/Screens"
            echo "[Entrypoint] Root Screens directory re-initialized"
        fi
        # Re-copy conference Screens (Conf1-Conf14)
        # ALWAYS delete old Screens to remove any placeholder files, then copy if source exists
        for conf in Conf1 Conf2 Conf3 Conf4 Conf5 Conf6 Conf7 Conf8 Conf9 Conf10 Conf11 Conf12 Conf13 Conf14; do
            # Always delete old screens (removes placeholders from persistent disk)
            if [ -d "$BBS_DATA_DIR/$conf/Screens" ]; then
                rm -rf "$BBS_DATA_DIR/$conf/Screens"
                echo "[Entrypoint] Deleted old $conf/Screens"
            fi
            # Copy new screens if they exist in default-data
            if [ -d "$DEFAULT_DATA_DIR/$conf/Screens" ]; then
                cp -r "$DEFAULT_DATA_DIR/$conf/Screens" "$BBS_DATA_DIR/$conf/Screens"
                echo "[Entrypoint] $conf/Screens re-initialized from default-data"
            fi
        done
        echo "[Entrypoint] All Screens directories re-initialized"
    fi

    # Force re-initialize Doors if requested (updates TypeScript doors to latest versions)
    if [ "$FORCE_REINIT_DOORS" = "1" ]; then
        echo "[Entrypoint] FORCE_REINIT_DOORS=1 - Re-copying all Doors..."
        if [ -d "$DEFAULT_DATA_DIR/Doors" ]; then
            rm -rf "$BBS_DATA_DIR/Doors"
            cp -r "$DEFAULT_DATA_DIR/Doors" "$BBS_DATA_DIR/Doors"
            echo "[Entrypoint] Doors directory re-initialized from default-data"
        fi
    fi
fi

# Show what data exists
echo "[Entrypoint] Current BBS data:"
ls -la "$BBS_DATA_DIR" 2>/dev/null | head -20 || echo "  (empty)"

# Create SDK symlinks for TypeScript doors
# node_modules is excluded from Docker build, so we need to create the @amiexpress/bbs-door-sdk symlink
# that points to /app/sdk for each TypeScript door that has a package.json
echo "[Entrypoint] Setting up SDK symlinks for TypeScript doors..."
TS_DOORS_COUNT=0
if [ -d "$BBS_DATA_DIR/Doors" ]; then
    for door_dir in "$BBS_DATA_DIR/Doors"/*; do
        if [ -d "$door_dir" ] && [ -f "$door_dir/package.json" ]; then
            # This is a TypeScript door - create SDK symlink
            door_name=$(basename "$door_dir")
            sdk_link_dir="$door_dir/node_modules/@amiexpress"
            sdk_link="$sdk_link_dir/bbs-door-sdk"

            if [ ! -L "$sdk_link" ]; then
                mkdir -p "$sdk_link_dir"
                # Create symlink to SDK - use absolute path
                ln -sf /app/sdk "$sdk_link"
                echo "[Entrypoint]   Created SDK symlink for $door_name"
                TS_DOORS_COUNT=$((TS_DOORS_COUNT + 1))
            fi
        fi
    done
fi
echo "[Entrypoint] SDK symlinks created for $TS_DOORS_COUNT TypeScript doors"

# Create/reset default sysop user
echo "[Entrypoint] Setting up default sysop user..."
cd /app/web/backend
export DATABASE_DIR="$DATABASE_DIR"
export DATABASE_FILE="${DATABASE_FILE:-amiexpress.db}"
npx tsx scripts/create-default-sysop.ts || echo "[Entrypoint] WARNING: Failed to create sysop user"

# Execute the main command (typically: npx tsx src/index.ts)
echo "[Entrypoint] Starting BBS server..."
exec "$@"
