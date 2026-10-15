#!/bin/sh
# bbs-backup-check.sh -- the watchdog for the failure an exit code cannot report.
#
# Installed as /usr/local/sbin/bbs-backup-check.sh (0750, root:root), run hourly
# by bbs-backup-check.timer.
#
# bbs-backup.service failing is loud. bbs-backup.service never RUNNING is silent:
# a disabled timer, a host that stayed down, a masked unit, a full disk that
# stopped the run before it could log. This check notices that instead, by
# looking only at what is on the disk: is there a snapshot from the last
# MAX_AGE_HOURS, and does it contain the things a board cannot regenerate.

set -eu

DEST=${BBS_BACKUP_DEST:-/var/backups/bbs}
MAX_AGE_HOURS=${BBS_BACKUP_MAX_AGE_HOURS:-36}
MIN_BYTES=${BBS_BACKUP_MIN_BYTES:-20000000}
ALERT_SCRIPT=${BBS_BACKUP_ALERT_SCRIPT:-/usr/local/sbin/bbs-backup-alert.sh}

problem=""

latest=$(ls -1d "$DEST"/20*/ 2>/dev/null | sort | tail -1 || true)
if [ -z "$latest" ]; then
    problem="no snapshot exists in $DEST at all"
else
    age_s=$(( $(date -u +%s) - $(stat -c %Y "$latest") ))
    age_h=$(( age_s / 3600 ))
    if [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then
        problem="newest snapshot $(basename "$latest") is ${age_h}h old (limit ${MAX_AGE_HOURS}h)"
    else
        for f in amiexpress.db.gz achievements.db.gz doors.db.gz bbs-files.tar.gz MANIFEST SHA256SUMS; do
            if [ ! -s "$latest/$f" ]; then
                problem="$(basename "$latest") is missing or empty: $f"
                break
            fi
        done
        if [ -z "$problem" ]; then
            size=$(du -sb "$latest" | cut -f1)
            [ "$size" -lt "$MIN_BYTES" ] && problem="$(basename "$latest") is only $size bytes, expected at least $MIN_BYTES"
        fi
    fi
fi

if [ -n "$problem" ]; then
    [ -x "$ALERT_SCRIPT" ] && "$ALERT_SCRIPT" raise "$problem" || true
    echo "[ERROR] $problem" >&2
    exit 1
fi

echo "[OK] $(basename "$latest") $(du -sh "$latest" | cut -f1), $(( age_s / 3600 ))h old"
exit 0
