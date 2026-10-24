#!/usr/bin/env bash
#
# Install node_modules for every door the backend test type-check reads.
#
# web/backend/tsconfig.tests.json pulls door sources into its program (the
# door tests import them), and those sources resolve their imports from the
# door's own node_modules. A fresh clone has none, so the pre-push gate's
# "backend test types" step fails with dozens of errors that have nothing to
# do with the commit being pushed.
#
# The door list is not kept by hand: tsc --listFilesOnly reports which files
# the program contains, and every Doors/<name>/ in that list with a
# package.json is a door to install. A door that is already installed is
# left alone.
#
# Usage:
#   dev/scripts/install-door-deps.sh           install the missing doors
#   dev/scripts/install-door-deps.sh --check   only list them (exit 1 if any)
#
# Needs web/backend/node_modules (cd web/backend && npm ci).

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

CHECK_ONLY=
[ "${1:-}" = "--check" ] && CHECK_ONLY=yes

if [ ! -d web/backend/node_modules ]; then
  echo "[ERROR] web/backend/node_modules is missing; run: cd web/backend && npm ci"
  exit 1
fi

DOORS=$(cd web/backend && npx tsc -p tsconfig.tests.json --listFilesOnly 2>/dev/null \
  | grep -v /node_modules/ \
  | sed -n "s:^$REPO_ROOT/\(Doors/[^/]*\)/.*:\1:p" \
  | sort -u)

MISSING=
for door in $DOORS; do
  [ -f "$door/package.json" ] || continue
  [ -d "$door/node_modules" ] && continue
  MISSING="$MISSING $door"
done

if [ -z "$MISSING" ]; then
  echo "[OK] every door the test type-check reads is installed"
  exit 0
fi

if [ -n "$CHECK_ONLY" ]; then
  echo "[INFO] doors without node_modules:$MISSING"
  echo "[INFO] install them with: dev/scripts/install-door-deps.sh"
  exit 1
fi

# --ignore-scripts: the type-check only needs the packages and their types,
# not native builds (better-sqlite3 and friends); a door that runs locally
# installs itself through the door manager.
FAILED=
for door in $MISSING; do
  if [ -f "$door/package-lock.json" ]; then
    echo "[INFO] $door: npm ci"
    (cd "$door" && npm ci --ignore-scripts --no-audit --no-fund) || FAILED="$FAILED $door"
  else
    echo "[INFO] $door: npm install (no lockfile)"
    (cd "$door" && npm install --ignore-scripts --no-package-lock --no-audit --no-fund) || FAILED="$FAILED $door"
  fi
done

if [ -n "$FAILED" ]; then
  echo "[ERROR] install failed for:$FAILED"
  exit 1
fi
echo "[OK] installed:$MISSING"
