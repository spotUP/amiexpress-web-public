#!/usr/bin/env bash
#
# Install the deploy timer on the board's host. Idempotent; run as root.
#
#     /app/amiexpress/deploy/install-deploy-timer.sh
#
# What it sets up: a timer that ticks every two minutes, asks whether
# origin/main has moved and whether anybody is on the board, and runs
# deploy/deploy.sh when the answer is yes and nobody. Everything it runs lives
# in the repository, so an update arrives with the next deploy.
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/app/amiexpress}"
[ -x "$ROOT/deploy/watch-main.sh" ] || { echo "no $ROOT/deploy/watch-main.sh - pull first" >&2; exit 1; }

install -m 0644 "$ROOT/deploy/systemd/amiexpress-deploy.service" /etc/systemd/system/
install -m 0644 "$ROOT/deploy/systemd/amiexpress-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now amiexpress-deploy.timer

echo "== installed =="
systemctl --no-pager status amiexpress-deploy.timer | head -5 || true
systemctl list-timers amiexpress-deploy.timer --no-pager | head -3 || true
