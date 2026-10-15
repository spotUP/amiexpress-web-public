#!/usr/bin/env sh
set -eu

BASEDIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$BASEDIR"

echo "[restore-npm-access] Running npm install for the backend."
npm install --prefix web/backend

echo "[restore-npm-access] npm install complete."
