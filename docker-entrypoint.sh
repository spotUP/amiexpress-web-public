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

# Root-level .info / binary configuration files.
#
# These split into TWO ownership classes — the bug that froze live volume
# for months ("J: Command requires higher access" on sysop) came from
# treating them all as VOLUME-owned (cp only-if-missing). Any image update
# to ACS.255.info, Conf.DB, etc. then never propagated to live.
#
# IMAGE-OWNED files: pure code/config that ships with the BBS. The image
# is authoritative — always overwrite the volume on every restart. There
# is no sysop/admin path that legitimately modifies these. Includes the
# whole `Access/` directory (ACS permission tables, area presets) and the
# core configuration .info files that define the BBS's command catalog,
# protocols, etc.
#
# VOLUME-OWNED files: admin TUI / web admin UI writes to them at runtime.
# Initialize from image if missing; never overwrite. Includes per-node
# Node*.info (telnet/FTP/chat-color toggles per node), per-conference
# Conf*.info (sysop-tunable area config), and the SysopStats counter.
#
# When in doubt, default to VOLUME-OWNED. False positives in IMAGE-OWNED
# silently nuke sysop edits.

IMAGE_OWNED_INFO="ConfConfig.info Doors.info NamesNotAllowed.info Access.info Commands.info ComputerList.info Drives.info ScreenTypes.info Protocols.info Storage.info Private.info HELP.info Languages.info Utils.info FCheck.info Zoom.info Areas.info AmiXnet.info UUCP.info batch0.info batch1.info batch2.info batch3.info batch4.info batch5.info batch6.info batch000.info Conf.DB"

VOLUME_OWNED_INFO="Node0.info Node1.info Node2.info Node3.info Node4.info Node5.info Node6.info Conf1.info Conf2.info Conf3.info Conf4.info Conf5.info Conf6.info Conf7.info Conf8.info Conf9.info Conf10.info Conf11.info Conf12.info Conf13.info Conf14.info SysopStats.info"

# Root data files (not .info - batch scripts, dat files, etc.)
ROOT_DATA_FILES="batch0 batch1 batch2 batch3 batch4 batch5 batch6 batch000 acp.dat acpConnections.dat BBSHelp.txt SystemStats cplistan1000.dat express"

echo "[Entrypoint] Syncing root configuration files..."

# IMAGE-OWNED: always overwrite from image if hashes differ (or if missing).
# Compare with md5sum so we don't churn mtimes on every restart for unchanged
# files. FORCE_REINIT_CONFIG=1 forces unconditional overwrite for both classes.
sync_image_owned() {
    local file="$1"
    local src="$DEFAULT_DATA_DIR/$file"
    local dst="$BBS_DATA_DIR/$file"
    [ -f "$src" ] || { echo "[Entrypoint]   WARNING: $file not found in image"; return; }
    if [ ! -f "$dst" ]; then
        cp "$src" "$dst"
        echo "[Entrypoint]   [IMAGE-OWNED] $file: initialized from image"
        return
    fi
    if [ "$FORCE_REINIT_CONFIG" = "1" ]; then
        cp "$src" "$dst"
        echo "[Entrypoint]   [IMAGE-OWNED] $file: force-overwritten (FORCE_REINIT_CONFIG=1)"
        return
    fi
    local sh dh
    sh=$(md5sum "$src" | awk '{print $1}')
    dh=$(md5sum "$dst" | awk '{print $1}')
    if [ "$sh" != "$dh" ]; then
        cp "$src" "$dst"
        echo "[Entrypoint]   [IMAGE-OWNED] $file: updated from image (hash drift)"
    fi
}

# VOLUME-OWNED: copy only if missing; image is just the seed.
sync_volume_owned() {
    local file="$1"
    local src="$DEFAULT_DATA_DIR/$file"
    local dst="$BBS_DATA_DIR/$file"
    [ -f "$src" ] || return
    if [ ! -f "$dst" ]; then
        cp "$src" "$dst"
        echo "[Entrypoint]   [VOLUME-OWNED] $file: seeded from image (first run)"
    fi
}

for f in $IMAGE_OWNED_INFO; do sync_image_owned "$f"; done
for f in $VOLUME_OWNED_INFO; do sync_volume_owned "$f"; done

# Also mirror the entire Access/ directory (ACS.*.info, AREA.*.info,
# PRESET.*.info) — these are pure permission tables, never edited by the
# sysop, and stale copies break login access checks. Treat each file as
# IMAGE-OWNED with the same hash-drift logic.
if [ -d "$DEFAULT_DATA_DIR/Access" ]; then
    mkdir -p "$BBS_DATA_DIR/Access"
    for src in "$DEFAULT_DATA_DIR/Access"/*.info; do
        [ -f "$src" ] || continue
        bn=$(basename "$src")
        dst="$BBS_DATA_DIR/Access/$bn"
        if [ ! -f "$dst" ]; then
            cp "$src" "$dst"
            echo "[Entrypoint]   [IMAGE-OWNED] Access/$bn: initialized"
        elif [ "$FORCE_REINIT_CONFIG" = "1" ] || [ "$(md5sum "$src" | awk '{print $1}')" != "$(md5sum "$dst" | awk '{print $1}')" ]; then
            cp "$src" "$dst"
            echo "[Entrypoint]   [IMAGE-OWNED] Access/$bn: updated from image"
        fi
    done
fi

# Root data files (batch scripts, .dat files, express binary) are
# treated as VOLUME-OWNED. The `express` binary is a sysop-built/managed
# artifact; .dat files accumulate runtime state.
for datafile in $ROOT_DATA_FILES; do
    sync_volume_owned "$datafile"
done

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
        for dir in Screens Bulletins Commands Node0 Node1 Node2 Node3 Node4 Node5 Node6 Node7 Node8 Node9 Node10 Node11 Node12 Node13 Node14 Node15 Node16 Node17 Node18 Node19 Node20 Node21 Node22 Node23 Node24 Node25 Node26 Node27 Node28 Node29 Node30 Node31 Node32 Node33 Node34 Node35 Node36 Node37 Node38 Node39 Node40 Conf1 Conf2 Conf3 Conf4 Conf5 Conf6 Conf7 Conf8 Conf9 Conf10 Conf11 Conf12 Conf13 Conf14 Doors Libs Access Languages Protocols FCheck Storage SysopStats Zoom HELP Utils C Devs L S Scripts System AmiXnet RIPgraphics Partdownload; do
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
    for dir in Screens Bulletins Commands Node0 Node1 Node2 Node3 Node4 Node5 Node6 Node7 Node8 Node9 Node10 Node11 Node12 Node13 Node14 Node15 Node16 Node17 Node18 Node19 Node20 Node21 Node22 Node23 Node24 Node25 Node26 Node27 Node28 Node29 Node30 Node31 Node32 Node33 Node34 Node35 Node36 Node37 Node38 Node39 Node40 Conf1 Conf2 Conf3 Conf4 Conf5 Conf6 Conf7 Conf8 Conf9 Conf10 Conf11 Conf12 Conf13 Conf14 Doors Libs Access Languages Protocols FCheck Storage SysopStats Zoom HELP Utils C Devs L S Scripts System AmiXnet RIPgraphics Partdownload; do
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

    # Always repair Node Screens: if a Node dir exists but has no/empty Screens,
    # copy screen files from Node0 as template (handles dynamically-created nodes)
    NODE0_SCREENS="$BBS_DATA_DIR/Node0/Screens"
    if [ -d "$NODE0_SCREENS" ]; then
        SCREEN_COUNT=$(ls "$NODE0_SCREENS" 2>/dev/null | wc -l)
        if [ "$SCREEN_COUNT" -gt 0 ]; then
            for n in $(seq 1 40); do
                NODE_SCREENS="$BBS_DATA_DIR/Node${n}/Screens"
                if [ -d "$BBS_DATA_DIR/Node${n}" ]; then
                    if [ ! -d "$NODE_SCREENS" ] || [ "$(ls "$NODE_SCREENS" 2>/dev/null | wc -l)" -eq 0 ]; then
                        mkdir -p "$NODE_SCREENS"
                        cp "$NODE0_SCREENS"/* "$NODE_SCREENS/" 2>/dev/null
                        echo "[Entrypoint]   REPAIR: Copied screen files to Node${n}/Screens/"
                    fi
                fi
            done
        fi
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

    # ALWAYS sync Doors, Commands, Screens, Libs, C from image on every startup
    # so a deploy updates code and assets while preserving user data.
    #
    # This used to be a single `cp -r ... 2>/dev/null || true`, which had two
    # faults. It swallowed every error, so a failed sync looked exactly like a
    # successful one - and live was found serving door code from an earlier
    # deploy while claiming to be up to date (2026-08-26: the video aspect fix
    # was in the image and not in the running door). And it overwrote
    # EVERYTHING, including the committed .db files, so a deploy could drop a
    # blank chat history over the live one.
    #
    # Now: copy file by file, skip runtime data, report what changed, and let
    # a real failure be loud.
    echo "[Entrypoint] Syncing code directories from image..."
    for sync_dir in Doors Commands Screens Libs C; do
        [ -d "$DEFAULT_DATA_DIR/$sync_dir" ] || continue

        # One tar stream, not a file-by-file loop.
        #
        # The loop this replaces reported "143 file(s) updated, 0 failed"
        # while leaving 94 of the image's TypeScript files absent from the
        # volume entirely - it stopped part way through and said nothing,
        # which is the same class of silent failure the loop was written to
        # prevent. tar copies the whole tree in one operation and returns one
        # exit code for it.
        #
        # Extraction only writes paths the archive contains, so runtime data
        # the volume has and the image does not - door databases, logs - is
        # left alone. The excludes keep the image's copies of those from
        # landing on top of live data.
        if ! (cd "$DEFAULT_DATA_DIR/$sync_dir" && tar cf - \
                --exclude='*.db' --exclude='*.db-journal' \
                --exclude='*.db-wal' --exclude='*.db-shm' \
                --exclude='*.sqlite' --exclude='*.sqlite3' \
                --exclude='*.log' .) \
             | (cd "$BBS_DATA_DIR/$sync_dir" && tar xf -); then
            echo "[Entrypoint] ERROR: failed to sync $sync_dir from image" >&2
            exit 1
        fi

        echo "[Entrypoint]   Synced $sync_dir from image"
    done

    # Say, on the volume itself, that the sync finished.
    #
    # The deploy verifies that the doors on the volume match the image, and
    # it used to start checking as soon as /health answered - which happens
    # while this sync is still running. It compared a half-copied volume and
    # failed a deploy that was about to be correct (2026-08-26: the check
    # reported missing files at 19:01:42, and the directory's mtime was
    # 19:02). A marker the checker can wait for is the difference between
    # asking "is it up?" and "is it done?".
    rm -f "$BBS_DATA_DIR/.sync-complete"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$BBS_DATA_DIR/.sync-complete"
    echo "[Entrypoint] Code sync complete"

    # The rest of the BBS tree gets ADDITIVE repair: a file the image has and
    # the volume does not is copied across; a file that already exists is left
    # exactly as it is.
    #
    # These directories were only ever copied when the whole directory was
    # missing, so anything ADDED to them after a board's first run never
    # arrived - the same class of gap that left the door voices missing on
    # live. They are not synced outright because a sysop edits them: access
    # levels, protocols, help text and the conference tree carry local changes
    # and message bases, and overwriting those would undo real work.
    echo "[Entrypoint] Repairing content directories (adding missing files only)..."
    for add_dir in Access Languages Protocols FCheck Zoom HELP Utils Devs L S Scripts System AmiXnet RIPgraphics; do
        [ -d "$DEFAULT_DATA_DIR/$add_dir" ] || continue
        [ -d "$BBS_DATA_DIR/$add_dir" ] || continue

        added=0
        while IFS= read -r rel; do
            [ -n "$rel" ] || continue
            src="$DEFAULT_DATA_DIR/$add_dir/$rel"
            dst="$BBS_DATA_DIR/$add_dir/$rel"
            [ -e "$dst" ] && continue
            mkdir -p "$(dirname "$dst")"
            cp -p "$src" "$dst" && added=$((added + 1))
        done <<EOF
$(cd "$DEFAULT_DATA_DIR/$add_dir" && find . -type f ! -name '*.db' ! -name '*.log' | sed 's|^\./||')
EOF

        [ "$added" -gt 0 ] && echo "[Entrypoint]   $add_dir: added $added missing file(s)"
    done
    echo "[Entrypoint] Content repair complete"
    # Remove .ts source files from Doors - production uses compiled dist/
    find "$BBS_DATA_DIR/Doors" -maxdepth 2 -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete 2>/dev/null || true
    echo "[Entrypoint]   Cleaned .ts source files from Doors"

    # Orphan cleanup: `cp -r src/. dst/` is additive — files removed from
    # the image are NOT removed from the volume. Anything that needs to
    # disappear at deploy time has to be deleted explicitly here.
    # If you delete or rename a file in Doors/Commands/Screens/Libs/C in
    # git, add the OLD path to this list so live volumes converge.
    echo "[Entrypoint] Removing orphaned files from previous deploys..."
    ORPHANS=(
        # U.info was renamed to U.info.disabled-ulgoff in commit 5356bf66a
        # so the U command uses the internal upload handler instead of the
        # slow UL-Logoff door wrapper.
        "$BBS_DATA_DIR/Commands/BBSCmd/U.info"
    )
    for orphan in "${ORPHANS[@]}"; do
        if [ -e "$orphan" ]; then
            rm -f "$orphan"
            echo "[Entrypoint]   Removed orphan: $orphan"
        fi
    done
fi

# Show what data exists
echo "[Entrypoint] Current BBS data:"
ls -la "$BBS_DATA_DIR" 2>/dev/null | head -20 || echo "  (empty)"

# Create SDK symlinks for TypeScript doors
# node_modules is excluded from Docker build, so we need to:
# 1. Create @amiexpress/bbs-door-sdk symlink pointing to /app/sdk
# 2. Install dependencies for doors that have native modules (e.g., better-sqlite3)
echo "[Entrypoint] Setting up TypeScript doors..."
TS_DOORS_COUNT=0
NATIVE_INSTALL_COUNT=0
if [ -d "$BBS_DATA_DIR/Doors" ]; then
    for door_dir in "$BBS_DATA_DIR/Doors"/*; do
        if [ -d "$door_dir" ] && [ -f "$door_dir/package.json" ]; then
            door_name=$(basename "$door_dir")
            sdk_link_dir="$door_dir/node_modules/@amiexpress"
            sdk_link="$sdk_link_dir/bbs-door-sdk"

            # Check if door has native dependencies that need installing
            # These can't be pre-built because macOS binaries don't work on Linux
            # Check for actual .node binary, not just directory (FORCE_REINIT_DOORS may copy incompatible node_modules)
            if grep -q '"better-sqlite3"' "$door_dir/package.json" 2>/dev/null; then
                if [ ! -f "$door_dir/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
                    echo "[Entrypoint]   Installing dependencies for $door_name (has native modules)..."
                    (cd "$door_dir" && rm -rf node_modules && npm install --omit=dev 2>&1 | tail -5) || echo "[Entrypoint]   Warning: npm install failed for $door_name"
                    NATIVE_INSTALL_COUNT=$((NATIVE_INSTALL_COUNT + 1))
                    # Force recreate SDK symlink after npm install (npm creates wrong relative symlink from file:../../sdk)
                    mkdir -p "$sdk_link_dir"
                    rm -f "$sdk_link"
                    ln -s /app/sdk "$sdk_link"
                    echo "[Entrypoint]   Recreated SDK symlink for $door_name (after npm install)"
                fi
            fi

            # Create SDK symlink if missing (for doors without native modules)
            if [ ! -L "$sdk_link" ]; then
                mkdir -p "$sdk_link_dir"
                ln -s /app/sdk "$sdk_link"
                echo "[Entrypoint]   Created SDK symlink for $door_name"
                TS_DOORS_COUNT=$((TS_DOORS_COUNT + 1))
            fi
        fi
    done
fi
echo "[Entrypoint] SDK symlinks created for $TS_DOORS_COUNT TypeScript doors"
echo "[Entrypoint] Native dependencies installed for $NATIVE_INSTALL_COUNT doors"

# NOTE: Default sysop creation removed - first user to register becomes sysop (level 255)
# The main application handles this automatically via new-user.handler.ts

# Execute the main command (typically: npx tsx src/index.ts)
echo "[Entrypoint] Starting BBS server..."
exec "$@"
