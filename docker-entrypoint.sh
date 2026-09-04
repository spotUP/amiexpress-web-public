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
# Don't exit on errors during sync — the server must always start
set +e

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

IMAGE_OWNED_INFO="Doors.info NamesNotAllowed.info Access.info Commands.info Storage.info Private.info HELP.info Utils.info Zoom.info Areas.info AmiXnet.info UUCP.info batch0.info batch1.info batch3.info batch4.info batch5.info batch6.info batch000.info Conf.DB"

# TRACKED: the image is authoritative until the sysop changes it.
#
# These four were IMAGE-OWNED, under a comment saying "there is no
# sysop/admin path that legitimately modifies these". There is - they are
# exactly what the admin's Computers, Drives, Screen Types and Conferences
# pages write - so every save was reverted on the next restart, logged as
# "hash drift". The drift WAS the sysop.
#
# They are not VOLUME-OWNED either: seeding once and never updating means a
# genuine fix in the image never reaches a board, silently. Tracked splits
# the difference by remembering what the last deploy wrote: a file still
# matching that is untouched and may be updated; one that differs was edited
# and is left alone. See sync_tracked.
TRACKED_INFO="ConfConfig.info ComputerList.info Drives.info ScreenTypes.info Languages.info FCheck.info"

# Every node the image seeds a directory for, not just the seven that used to
# have an icon. A node's SCREENS tooltype is what points it at the shared
# Screens/Node/ directory (ACP.e:2666-2673), so a node whose icon never
# reaches the volume reads Node<n>/ - which after the image's collapse step
# holds no screens at all. Names with no file behind them are skipped by
# sync_volume_owned, so listing all 41 costs nothing on a board that has
# fewer.
VOLUME_OWNED_INFO="Node0.info Node1.info Node2.info Node3.info Node4.info Node5.info Node6.info Node7.info Node8.info Node9.info Node10.info Node11.info Node12.info Node13.info Node14.info Node15.info Node16.info Node17.info Node18.info Node19.info Node20.info Node21.info Node22.info Node23.info Node24.info Node25.info Node26.info Node27.info Node28.info Node29.info Node30.info Node31.info Node32.info Node33.info Node34.info Node35.info Node36.info Node37.info Node38.info Node39.info Node40.info Conf1.info Conf2.info Conf3.info Conf4.info Conf5.info Conf6.info Conf7.info Conf8.info Conf9.info Conf10.info Conf11.info Conf12.info Conf13.info Conf14.info SysopStats.info"

# Root data files (not .info - batch scripts, dat files, etc.)
ROOT_DATA_FILES="batch0 batch1 batch2 batch3 batch4 batch5 batch6 batch000 acp.dat acpConnections.dat BBSHelp.txt SystemStats cplistan1000.dat express"

echo "[Entrypoint] Syncing root configuration files..."

# IMAGE-OWNED: always overwrite from image if hashes differ (or if missing).
# Compare with md5sum so we don't churn mtimes on every restart for unchanged
# files. FORCE_REINIT_CONFIG=1 forces unconditional overwrite for both classes.
# Where the last deploy's hashes live, and how they are read.
#
# One `md5sum`-shaped line per tracked path: "<hash> <relative path>".
DEPLOY_MANIFEST="$BBS_DATA_DIR/.deployed-manifest"
DEPLOY_MANIFEST_NEXT="$BBS_DATA_DIR/.deployed-manifest.next"

manifest_hash() {
    [ -f "$DEPLOY_MANIFEST" ] || return 0
    awk -v k="$1" '$2 == k { print $1; exit }' "$DEPLOY_MANIFEST"
}

file_hash() {
    md5sum "$1" 2>/dev/null | awk '{print $1}'
}

# Sync one file the sysop is allowed to own.
#
#   missing on the volume          -> copy it, and remember what we wrote
#   volume matches the manifest    -> untouched since the last deploy, so the
#                                     image may update it
#   volume differs from manifest   -> the sysop edited it; keep theirs, and
#                                     keep the old baseline so we can still
#                                     tell next time
#   no manifest entry yet          -> ADOPT what is on the volume and change
#                                     nothing. First run after this landed
#                                     must not overwrite edits it has no
#                                     baseline for.
#
# A second argument names the file's path ON THE VOLUME when it differs from
# the image's only by case. The board's own filesystem is case-insensitive and
# the volume's is not, so copying the image's `n.info` beside the volume's
# `N.info` would give this board two icons for one command. The manifest still
# keys on the IMAGE's path, which is the stable name across deploys.
sync_tracked() {
    local rel="$1"
    local dst_rel="${2:-$1}"
    local src="$DEFAULT_DATA_DIR/$rel"
    local dst="$BBS_DATA_DIR/$dst_rel"
    [ -f "$src" ] || return 0

    local ih vh mh
    ih=$(file_hash "$src")

    if [ ! -f "$dst" ]; then
        # Absent from the volume means one of two different things, and the
        # manifest is what tells them apart.
        #
        # With a manifest entry, a previous deploy PLACED this file and it is
        # gone now - the sysop deleted it. Re-creating it silently undoes
        # that. Observed on the live board 2026-08-31: DOORMAN deleted a
        # door, and Commands/BBSCmd/vsys.info was back after the next push,
        # so the door reappeared in the listing. Every door deletion reverted
        # on the next deploy.
        #
        # The entry is still written, so the deletion outlasts later deploys
        # AND a later image that changes the file: without it the next run
        # would find no baseline, treat the file as new, and copy it back.
        mh=$(manifest_hash "$rel")
        if [ -n "$mh" ]; then
            echo "$ih $rel" >> "$DEPLOY_MANIFEST_NEXT"
            TRACKED_KEPT=$((TRACKED_KEPT + 1))
            return 0
        fi

        # No entry: the image ships it and this board has never had it. That
        # is a genuinely new file and must arrive.
        #
        # A failed copy must not be recorded as written. This file has no
        # `set -e`, so an unchecked cp fails silently - and the manifest would
        # then claim a baseline for a file that is not there, which is worse
        # than not copying it: the next deploy would read the absence as an
        # edit and never try again.
        mkdir -p "$(dirname "$dst")"
        if ! cp "$src" "$dst"; then
            echo "[Entrypoint]   ERROR: could not create $rel" >&2
            TRACKED_FAILED=$((TRACKED_FAILED + 1))
            return 0
        fi
        echo "$ih $rel" >> "$DEPLOY_MANIFEST_NEXT"
        TRACKED_CREATED=$((TRACKED_CREATED + 1))
        return 0
    fi

    vh=$(file_hash "$dst")
    mh=$(manifest_hash "$rel")

    if [ -z "$mh" ]; then
        # First run with no baseline. Record the IMAGE's hash, not the
        # volume's: the manifest means "what the image last put here", so a
        # file that already differs is recognised as edited on the very next
        # deploy. Recording the volume's hash instead would declare the
        # sysop's own edit to be the baseline, and the next deploy would
        # overwrite it as untouched - which a test of this function caught it
        # doing.
        echo "$ih $rel" >> "$DEPLOY_MANIFEST_NEXT"
        TRACKED_ADOPTED=$((TRACKED_ADOPTED + 1))
        return 0
    fi

    if [ "$vh" = "$mh" ]; then
        if [ "$vh" != "$ih" ]; then
            if ! cp "$src" "$dst"; then
                echo "[Entrypoint]   ERROR: could not update $rel" >&2
                TRACKED_FAILED=$((TRACKED_FAILED + 1))
                # Keep the OLD baseline: the volume still holds the old file,
                # and claiming otherwise would strand it.
                echo "$mh $rel" >> "$DEPLOY_MANIFEST_NEXT"
                return 0
            fi
            TRACKED_UPDATED=$((TRACKED_UPDATED + 1))
        fi
        echo "$ih $rel" >> "$DEPLOY_MANIFEST_NEXT"
        return 0
    fi

    if [ "$vh" = "$ih" ]; then
        # The board and the image agree again - the sysop reverted, or the
        # image caught up with them. The divergence is over, so tracking
        # resumes; without this a file stayed sysop-owned for ever and never
        # took another update.
        echo "$ih $rel" >> "$DEPLOY_MANIFEST_NEXT"
        return 0
    fi

    # Edited on the board. Keep it, and keep the baseline it diverged from.
    echo "$mh $rel" >> "$DEPLOY_MANIFEST_NEXT"
    TRACKED_KEPT=$((TRACKED_KEPT + 1))
}

# sync_tracked, with the volume's own spelling of the name.
#
# The Amiga's filesystem is case-insensitive and Linux's is not, and this
# board's volume holds `N.info` and `GL.info` where the image ships `n.info`
# and `gl.info`. Syncing those by the image's name writes a SECOND file beside
# the one already there, and the board then has two icons for one command -
# with `findCaseInsensitive` picking whichever it meets first. The live
# manifest already carries both `Commands/BBSCmd/N.info` and
# `Commands/BBSCmd/n.info`, so this has happened.
#
# Written as a wrapper rather than folded into sync_tracked because the case
# question belongs to directories a sysop's tools write into, and the manifest
# must keep keying on the IMAGE's name - that is the name that is stable
# across deploys.
sync_tracked_case_aware() {
    local rel="$1"
    local dir=${rel%/*}
    local bn=${rel##*/}
    local dst_dir="$BBS_DATA_DIR/$dir"
    local lower cand cb existing=""

    if [ "$dir" = "$rel" ] || [ ! -d "$dst_dir" ]; then
        sync_tracked "$rel"
        return 0
    fi

    lower=$(printf '%s' "$bn" | tr 'A-Z' 'a-z')
    for cand in "$dst_dir"/*; do
        [ -f "$cand" ] || continue
        cb=${cand##*/}
        [ "$cb" = "$bn" ] && { existing=""; break; }
        if [ "$(printf '%s' "$cb" | tr 'A-Z' 'a-z')" = "$lower" ]; then
            existing=$cb
            break
        fi
    done

    if [ -n "$existing" ]; then
        echo "[Entrypoint]   $dir: volume has $existing where the image ships $bn - updating that one, not adding a second"
        sync_tracked "$rel" "$dir/$existing"
    else
        sync_tracked "$rel"
    fi
}

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
# A conference the board no longer has must not come back.
#
# The admin's conference delete does the right thing: it shifts NAME.n and
# LOCATION.n down, drops the icon, and (when asked) removes the directory. Then
# the next container start put all of it back, because the seeding below copies
# any Conf<n> directory the volume is "missing" and seeds any Conf<n>.info that
# is absent. A board with five conferences was carrying fourteen directories and
# fourteen icons, and the screen manager listed all fourteen.
#
# So the rule is the board's own: a conference is what ConfConfig.info declares
# (express.e:31849 walks NAME.i and LOCATION.i for i:=1 TO NCONFS), and its
# directory is whatever LOCATION.n names - never derived from the number. With
# no ConfConfig.info at all, this is a genuine first run and the image's list is
# the only truth there is.

# Tooltypes are NUL-separated strings inside the icon, so splitting on NUL
# gives roughly one per line - but each string is stored with a LENGTH BYTE
# immediately in front of it, and that byte survives the split. A real
# ConfConfig.info reads `\026LOCATION.1=BBS:Conf2/` and `\tNCONFS=5`, so a
# pattern anchored with ^ matches nothing at all. It matched a hand-built
# fixture, shipped, and read zero conferences on the live board. Everything
# here matches the KEY wherever it sits in the line.
conf_tooltype_lines() {
    # LC_ALL=C because the input is BINARY: a UTF-8 locale makes tr refuse the
    # file outright ("Illegal byte sequence" on the macOS dev host), and a
    # function that reads nothing answers "no conferences" without saying so.
    LC_ALL=C tr '\000' '\n' < "$BBS_DATA_DIR/ConfConfig.info" 2>/dev/null
}

# Both readers run in a C locale for the same reason tr does: sed refuses a
# binary line outright in UTF-8 ("RE error: illegal byte sequence"), and a
# reader that returns nothing looks exactly like a board with no conferences.
# The subshell keeps the locale from leaking into the rest of the entrypoint.
conf_declared_count() {
    ( LC_ALL=C; export LC_ALL
      conf_tooltype_lines | sed -n 's/.*NCONFS=\([0-9][0-9]*\).*/\1/p' | head -1 )
}

# `\026LOCATION.5=BBS:Conf12/` -> `Conf12`
conf_referenced_dirs() {
    ( LC_ALL=C; export LC_ALL
      conf_tooltype_lines \
        | sed -n 's/.*LOCATION\.[0-9][0-9]*=//p' \
        | sed 's/[[:space:]]*$//' \
        | sed 's|[/\\]*$||' \
        | sed 's/^.*://' \
        | sed 's|.*/||' )
}

# 0 (true) when this Conf<n> directory or Conf<n>.info icon still belongs to
# the board.
conference_still_exists() {
    entry="$1"

    # Only Conf<n> and Conf<n>.info answer to this rule. Everything else in the
    # seeding lists - Screens, Node<n>, Doors, Access - is structure the image
    # owns, and blocking it here would empty a board.
    case "$entry" in
        Conf[0-9]*) : ;;
        *) return 0 ;;
    esac

    [ -f "$BBS_DATA_DIR/ConfConfig.info" ] || return 0

    case "$entry" in
        *.info)
            n="${entry#Conf}"
            n="${n%.info}"
            nconfs="$(conf_declared_count)"
            [ -n "$nconfs" ] || return 0
            [ "$n" -le "$nconfs" ]
            ;;
        *)
            conf_referenced_dirs | grep -qx "$entry"
            ;;
    esac
}

sync_volume_owned() {
    local file="$1"
    local src="$DEFAULT_DATA_DIR/$file"
    local dst="$BBS_DATA_DIR/$file"
    [ -f "$src" ] || return
    case "$file" in
        Conf[0-9]*.info)
            if ! conference_still_exists "$file"; then
                echo "[Entrypoint]   [VOLUME-OWNED] $file: skipped - the board has no conference $file"
                return
            fi
            ;;
    esac
    if [ ! -f "$dst" ]; then
        cp "$src" "$dst"
        echo "[Entrypoint]   [VOLUME-OWNED] $file: seeded from image (first run)"
    fi
}

for f in $IMAGE_OWNED_INFO; do sync_image_owned "$f"; done
for f in $VOLUME_OWNED_INFO; do sync_volume_owned "$f"; done

# Tracked files and the whole Commands tree: the image leads until the sysop
# takes over a file. Counters are reported after the directory pass below.
TRACKED_CREATED=0; TRACKED_UPDATED=0; TRACKED_KEPT=0; TRACKED_ADOPTED=0; TRACKED_FAILED=0
rm -f "$DEPLOY_MANIFEST_NEXT"
for f in $TRACKED_INFO; do sync_tracked "$f"; done

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
            if [ -d "$DEFAULT_DATA_DIR/$dir" ] && [ ! -d "$BBS_DATA_DIR/$dir" ] && conference_still_exists "$dir"; then
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
        if [ -d "$DEFAULT_DATA_DIR/$dir" ] && [ ! -d "$BBS_DATA_DIR/$dir" ] && conference_still_exists "$dir"; then
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
            # Same rule as the seeding above: a conference the board no longer
            # has is not re-created here either, forced or not.
            conference_still_exists "$conf" || continue
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
    # Commands is NOT in this list. It holds the door definitions the admin
    # edits - Commands/BBSCmd/<CMD>.info - and a blanket overwrite reverted
    # every door edit on the next restart. It goes through sync_tracked
    # below, which lets the image lead until the sysop takes a file over.
    for sync_dir in Doors Screens Libs C; do
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

    # Commands/: every door's definition, and the one directory in this list
    # a sysop edits through the admin.
    echo "[Entrypoint] Syncing Commands (tracked)..."
    if [ -d "$DEFAULT_DATA_DIR/Commands" ]; then
        COMMANDS_LIST=$(mktemp)
        (cd "$DEFAULT_DATA_DIR" && find Commands -type f -print) > "$COMMANDS_LIST"
        while IFS= read -r rel; do
            [ -n "$rel" ] || continue
            sync_tracked_case_aware "$rel"
        done < "$COMMANDS_LIST"
        rm -f "$COMMANDS_LIST"
    fi

    # Anything the manifest still names that the image no longer ships stays
    # on the volume untouched; it simply stops being tracked.
    if [ -f "$DEPLOY_MANIFEST_NEXT" ]; then
        mv "$DEPLOY_MANIFEST_NEXT" "$DEPLOY_MANIFEST"
    fi
    echo "[Entrypoint]   Tracked: $TRACKED_CREATED created, $TRACKED_UPDATED updated, $TRACKED_KEPT kept (edited on this board), $TRACKED_ADOPTED adopted, $TRACKED_FAILED failed"
    if [ "$TRACKED_FAILED" -gt 0 ]; then
        # The blanket sync this replaced exited non-zero on failure, and a
        # startup that cannot place the board's own command definitions should
        # not pretend otherwise.
        echo "[Entrypoint] ERROR: $TRACKED_FAILED tracked file(s) could not be written" >&2
        exit 1
    fi

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

    # A door's dist/ belongs to the IMAGE, so it is mirrored, not merged.
    #
    # The sync above extracts a tar stream, and extraction only ever WRITES:
    # a file the image stopped shipping stays on the volume for ever. For
    # compiled door output that is not a stale file, it is a live one - the
    # door loads what is in dist/, so a renamed or deleted module keeps
    # running next to its replacement. Eight such orphans were removed by
    # hand from Doors/sprite-editor/dist on 2026-09-02.
    #
    # The scope is deliberate and narrow:
    #
    #   * only doors the IMAGE ships. A door DOORREPO installed at runtime
    #     exists on the volume alone; the image is not its source and
    #     mirroring would delete the whole door.
    #   * only dist/. The rest of a door directory holds runtime state -
    #     databases, logs, node_modules, whatever the door writes - which
    #     the image has no opinion about.
    #   * only COMPILED OUTPUT inside dist/, by extension. dist/ is not
    #     purely image-owned on this board: a dry run against the live
    #     volume on 2026-09-02 found frogger/dist/highscores.json and
    #     super-qix/dist/highscores.json, which are the players' scores and
    #     exist nowhere in the image. A whitelist is the only safe
    #     direction - an unrecognised file is left alone, and the worst case
    #     is an orphan nobody loads.
    #   * never when the image's dist/ is empty. That is a broken build or a
    #     half-copied image, and the answer to "the source looks empty" is
    #     never "delete the board's working copy".
    #
    # What a TypeScript build emits inside dist/, and nothing else. `ts`
    # covers the .d.ts declarations; a door's own sources never live here.
    PRUNABLE_DIST_EXTS="js mjs cjs ts map css html"
    prune_image_door_dists() {
        pruned=0
        for image_door in "$DEFAULT_DATA_DIR/Doors"/*; do
            [ -d "$image_door/dist" ] || continue

            door_name=$(basename "$image_door")
            volume_dist="$BBS_DATA_DIR/Doors/$door_name/dist"
            [ -d "$volume_dist" ] || continue

            # An empty image dist/ means the build failed, not that the door
            # has no files.
            image_files=$(cd "$image_door/dist" && find . \( -type f -o -type l \) | wc -l)
            [ "$image_files" -gt 0 ] || continue

            while IFS= read -r rel; do
                [ -n "$rel" ] || continue
                [ -e "$image_door/dist/$rel" ] && continue

                # Build output only. A file with any other extension - or
                # none - is the door's own, whatever it is doing in dist/.
                ext="${rel##*.}"
                [ "$ext" = "$rel" ] && continue
                prunable=""
                for allowed in $PRUNABLE_DIST_EXTS; do
                    [ "$ext" = "$allowed" ] && prunable=1 && break
                done
                [ -n "$prunable" ] || continue

                rm -f "$volume_dist/$rel" || continue
                pruned=$((pruned + 1))
                echo "[Entrypoint]   Pruned orphan: Doors/$door_name/dist/$rel"
            done <<EOF
$(cd "$volume_dist" && find . \( -type f -o -type l \) | sed 's|^\./||')
EOF

            # Directories the pruning emptied are orphans too; dist/ itself
            # stays whatever happens.
            find "$volume_dist" -mindepth 1 -type d -empty -delete 2>/dev/null || true
        done
        echo "[Entrypoint]   Pruned $pruned orphaned door dist file(s)"
    }
    if [ -d "$DEFAULT_DATA_DIR/Doors" ] && [ -d "$BBS_DATA_DIR/Doors" ]; then
        echo "[Entrypoint] Mirroring image door dist/ directories..."
        prune_image_door_dists
    fi

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

        # An Amiga editor's trailing-underscore saves of logon20.txt: twelve
        # byte-identical copies under Node2..Node13 and one at the board root.
        # Nothing referenced the name - no screen, no .info, no code - and
        # they differ from the live logon20.txt only by a leading ~ and a ~f
        # between screens. Removed from git; named here so the volume, which
        # the sync only ever ADDS to, converges too.
        "$BBS_DATA_DIR/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node2/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node3/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node4/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node5/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node6/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node7/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node8/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node9/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node10/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node11/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node12/logon20.txt_.txt"
        "$BBS_DATA_DIR/Node13/logon20.txt_.txt"

        # 68klog.txt, a 42 MB / 992,731-line 68K emulator trace at the board
        # root that the screen index read as drawable art - it is what froze
        # the admin gallery. The sysop deleted it from the board by hand and
        # it stopped being tracked in git one commit before this one; this
        # line is what stops an older volume from keeping it.
        "$BBS_DATA_DIR/68klog.txt"
    )

    # GWALL is the 68K door again.
    #
    # It was ported to TypeScript, the port did not work out, and the port's
    # files were left in Doors/GWall - the directory Commands/BBSCmd/GWALL.info
    # names for the ORIGINAL door (TYPE=XIM, LOCATION=DOORS:GWall/GWall). The
    # image now ships the AmigaOS binary there; these are the port's remains,
    # and the volume sync only ever adds, so they would sit beside it for ever.
    #
    # Doors/Gwall is the same story with the other casing: two paths on a
    # case-sensitive volume, one directory on the Mac the repo is edited on.
    for leftover in package.json package-lock.json tsconfig.json index.ts dist node_modules; do
        if [ -e "$BBS_DATA_DIR/Doors/GWall/$leftover" ]; then
            rm -rf "$BBS_DATA_DIR/Doors/GWall/$leftover"
            echo "[Entrypoint]   Removed the TypeScript port's $leftover from Doors/GWall"
        fi
    done
    if [ -d "$BBS_DATA_DIR/Doors/Gwall" ]; then
        rm -rf "$BBS_DATA_DIR/Doors/Gwall"
        echo "[Entrypoint]   Removed the duplicate Doors/Gwall (the board runs Doors/GWall)"
    fi
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

            # Does this door need its dependencies installed?
            #
            # This used to ask only whether package.json mentioned
            # better-sqlite3, so every OTHER door got the SDK symlink and no
            # node_modules at all - and node_modules is excluded from the
            # Docker build, so nothing else supplied them. WHIP declares
            # xml2js and died with "Cannot find module 'xml2js'" the first
            # time somebody opened it; any door with a plain npm dependency
            # was in the same state, unnoticed until run.
            #
            # The decision lives in a script so it can be tested - see
            # web/backend/tests/scripts/door-needs-deps.test.ts.
            if sh /app/web/backend/scripts/door-needs-deps.sh "$door_dir"; then
                echo "[Entrypoint]   Installing dependencies for $door_name..."
                (cd "$door_dir" && rm -rf node_modules && npm install --omit=dev 2>&1 | tail -5) || echo "[Entrypoint]   Warning: npm install failed for $door_name"
                NATIVE_INSTALL_COUNT=$((NATIVE_INSTALL_COUNT + 1))
                # Force recreate SDK symlink after npm install (npm creates wrong relative symlink from file:../../sdk)
                mkdir -p "$sdk_link_dir"
                rm -f "$sdk_link"
                ln -s /app/sdk "$sdk_link"
                echo "[Entrypoint]   Recreated SDK symlink for $door_name (after npm install)"
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
