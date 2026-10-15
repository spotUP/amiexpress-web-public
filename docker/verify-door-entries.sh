#!/bin/sh
# Every TypeScript door must ship the file the board launches.
#
# `dist/` is what runs: the image copies Doors/ as it stands in git and the
# entrypoint syncs that onto the volume. Only door-manager is compiled during
# the image build, so every other door arrives with whatever dist/ was
# committed - and until 2026-09-02 nothing checked that there was one. Three
# doors were on the board unable to start: whip (its own .gitignore hid
# dist/), Gwall (no outDir, so tsc wrote index.js beside index.ts) and
# prompt-complete (built, never committed).
#
# This runs inside the image build (Dockerfile, doors-builder stage) so a
# door that cannot start fails the BUILD rather than the sysop's evening. It
# lives in a file, not in an escaped RUN one-liner: the first attempt was
# inlined and busybox sh rejected the collapsed `case` with "syntax error:
# unexpected \"(\"", which failed the deploy.
#
# Usage: verify-door-entries.sh [doors-directory]
set -eu

DOORS_DIR="${1:-/app/Doors}"
missing=''
checked=0

for door in "$DOORS_DIR"/*/; do
    [ -f "$door/package.json" ] || continue

    main=$(node -p "(require('$door/package.json').main || '')" 2>/dev/null || echo '')

    case "$main" in
        dist/*)
            checked=$((checked + 1))
            if [ ! -f "$door$main" ]; then
                missing="$missing $(basename "$door")"
            fi
            ;;
    esac
done

if [ -n "$missing" ]; then
    echo "ERROR: these doors ship no entry point:$missing" >&2
    echo "Build the door and commit its dist/ - see web/backend/tests/doors/door-dist-is-shipped.test.ts" >&2
    exit 1
fi

# A check that silently checks nothing is worse than no check.
if [ "$checked" -lt 20 ]; then
    echo "ERROR: only $checked doors examined in $DOORS_DIR - expected 20+" >&2
    exit 1
fi

echo "[doors] $checked TypeScript doors, every one with the entry point its manifest names"
