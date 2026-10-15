#!/bin/sh
# bbs-backup-alert.sh -- make a failed or missing backup impossible to miss.
#
# Installed as /usr/local/sbin/bbs-backup-alert.sh (0750, root:root).
#
# A backup that fails quietly is worse than no backup, because it is believed.
# There is no mail transport and no notification credential on this host, so the
# alarm uses the four channels that exist:
#
#   1. /var/backups/bbs/ALERT          - the marker every other check reads
#   2. logger -p daemon.crit           - journal / syslog
#   3. /etc/update-motd.d/98-bbs-backup - printed on EVERY ssh login to the host
#   4. systemd                          - the unit is left failed, so it shows in
#                                         `systemctl --failed`
#
# Optional: export BBS_BACKUP_ALERT_URL in bbs-backup.service and the alert is
# also POSTed there as JSON (Discord/Slack-shaped {"content": "..."}).
#
# Usage: bbs-backup-alert.sh raise "<reason>"
#        bbs-backup-alert.sh clear

set -eu

DEST=${BBS_BACKUP_DEST:-/var/backups/bbs}
ALERT="$DEST/ALERT"
LOG="$DEST/bbs-backup.log"
action=${1:-raise}
reason=${2:-"bbs-backup failed"}

case "$action" in
clear)
    if [ -f "$ALERT" ]; then
        rm -f "$ALERT"
        logger -t bbs-backup -p daemon.notice "backup alert cleared: a snapshot succeeded"
    fi
    ;;
raise)
    install -d -m 0700 "$DEST"
    {
        echo "BBS BACKUP ALERT"
        echo "raised: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "reason: $reason"
        echo
        echo "last snapshots:"
        ls -1d "$DEST"/20*/ 2>/dev/null | tail -5 || echo "  (none)"
        echo
        echo "tail of $LOG:"
        tail -n 30 "$LOG" 2>/dev/null || echo "  (no log)"
    } > "$ALERT"
    chmod 0600 "$ALERT"
    logger -t bbs-backup -p daemon.crit "BACKUP ALERT: $reason (see $ALERT)"
    if [ -n "${BBS_BACKUP_ALERT_URL:-}" ]; then
        curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
            --data "$(printf '{"content":"BBS BACKUP ALERT on %s: %s"}' "$(hostname)" "$reason")" \
            "$BBS_BACKUP_ALERT_URL" >/dev/null 2>&1 \
            && logger -t bbs-backup -p daemon.notice "alert posted to BBS_BACKUP_ALERT_URL" \
            || logger -t bbs-backup -p daemon.err "alert POST to BBS_BACKUP_ALERT_URL failed"
    fi
    ;;
*)
    echo "usage: $0 raise <reason> | clear" >&2
    exit 2
    ;;
esac
