#!/bin/sh
# Give every TypeScript door its dependencies and its SDK link.
#
# Usage: setup-ts-doors.sh DOORS_DIR SDK_DIR [dev]
#
# ONE implementation for both entry points:
#   - docker-entrypoint.sh  (DOORS_DIR=$BBS_DATA_DIR/Doors, SDK_DIR=/app/sdk)
#   - dev/scripts/start-servers.sh  (DOORS_DIR=<repo>/Doors, SDK_DIR=<repo>/sdk, dev)
#
# node_modules is excluded from the Docker build and absent in a fresh clone, so
# for each door that has a package.json:
#   1. install its dependencies when door-needs-deps.sh says so
#   2. (re)create node_modules/@amiexpress/bbs-door-sdk -> SDK_DIR. npm turns
#      the file:../../sdk spec into a wrong relative symlink, so it is forced
#      after every install.
#
# "dev" additionally installs devDependencies (the door's own `tsc` build needs
# them); without it the install is production-only, as in the image.
#
# Output lines start with $SETUP_TS_DOORS_TAG (default "[Doors]"); the
# entrypoint sets "[Entrypoint]" so its log is unchanged.

DOORS_DIR="$1"
SDK_DIR="$2"
MODE="$3"
TAG="${SETUP_TS_DOORS_TAG:-[Doors]}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$DOORS_DIR" ] || [ -z "$SDK_DIR" ]; then
    echo "usage: $0 DOORS_DIR SDK_DIR [dev]" >&2
    exit 2
fi

if [ "$MODE" = "dev" ]; then
    NPM_FLAGS="--include=dev"
else
    NPM_FLAGS="--omit=dev"
fi

TS_DOORS_COUNT=0
NATIVE_INSTALL_COUNT=0
if [ -d "$DOORS_DIR" ]; then
    for door_dir in "$DOORS_DIR"/*; do
        if [ -d "$door_dir" ] && [ -f "$door_dir/package.json" ]; then
            door_name=$(basename "$door_dir")
            sdk_link_dir="$door_dir/node_modules/@amiexpress"
            sdk_link="$sdk_link_dir/bbs-door-sdk"

            # Does this door need its dependencies installed?
            #
            # This used to ask only whether package.json mentioned
            # better-sqlite3, so every OTHER door got the SDK symlink and no
            # node_modules at all. WHIP declares xml2js and died with
            # "Cannot find module 'xml2js'" the first time somebody opened it.
            #
            # The decision lives in a script so it can be tested - see
            # web/backend/tests/scripts/door-needs-deps.test.ts.
            if sh "$HERE/door-needs-deps.sh" "$door_dir" $MODE; then
                echo "$TAG   Installing dependencies for $door_name..."
                (cd "$door_dir" && rm -rf node_modules && npm install $NPM_FLAGS 2>&1 | tail -5) || echo "$TAG   Warning: npm install failed for $door_name"
                NATIVE_INSTALL_COUNT=$((NATIVE_INSTALL_COUNT + 1))
                # Force recreate SDK symlink after npm install (npm creates wrong relative symlink from file:../../sdk)
                mkdir -p "$sdk_link_dir"
                rm -f "$sdk_link"
                ln -s "$SDK_DIR" "$sdk_link"
                echo "$TAG   Recreated SDK symlink for $door_name (after npm install)"
            fi

            # Create SDK symlink if missing (for doors without native modules)
            if [ ! -L "$sdk_link" ]; then
                mkdir -p "$sdk_link_dir"
                ln -s "$SDK_DIR" "$sdk_link"
                echo "$TAG   Created SDK symlink for $door_name"
                TS_DOORS_COUNT=$((TS_DOORS_COUNT + 1))
            fi
        fi
    done
fi
echo "$TAG SDK symlinks created for $TS_DOORS_COUNT TypeScript doors"
echo "$TAG Native dependencies installed for $NATIVE_INSTALL_COUNT doors"
