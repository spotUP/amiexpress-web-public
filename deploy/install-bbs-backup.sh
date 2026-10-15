#!/bin/sh
# install-bbs-backup.sh -- install the nightly snapshot on the live host.
#
# Run as root on the BBS host. Idempotent; safe to re-run after a host rebuild.
#
#   ssh root@bbs.uprough.net
#   /app/amiexpress/deploy/install-bbs-backup.sh
#
# Or, from a checkout that is not on the host:
#   scp -r deploy root@bbs.uprough.net:/root/bbs-backup-install
#   ssh root@bbs.uprough.net /root/bbs-backup-install/install-bbs-backup.sh /root/bbs-backup-install

set -eu
SRC=${1:-$(cd "$(dirname "$0")" && pwd)}

[ "$(id -u)" = "0" ] || { echo "[ERROR] run as root" >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "[ERROR] sqlite3 is not installed" >&2; exit 1; }

install -d -m 0700 /var/backups/bbs

install -m 0750 -o root -g root "$SRC/bbs-backup.sh"       /usr/local/sbin/bbs-backup.sh
install -m 0750 -o root -g root "$SRC/bbs-backup-alert.sh" /usr/local/sbin/bbs-backup-alert.sh
install -m 0750 -o root -g root "$SRC/bbs-backup-check.sh" /usr/local/sbin/bbs-backup-check.sh

for u in bbs-backup.service bbs-backup.timer bbs-backup-alert.service \
         bbs-backup-check.service bbs-backup-check.timer; do
    install -m 0644 -o root -g root "$SRC/systemd/$u" "/etc/systemd/system/$u"
done
install -m 0755 -o root -g root "$SRC/systemd/98-bbs-backup" /etc/update-motd.d/98-bbs-backup

systemctl daemon-reload
systemctl enable --now bbs-backup.timer
systemctl enable --now bbs-backup-check.timer

echo "[OK] installed. Timers:"
systemctl list-timers --no-pager bbs-backup.timer bbs-backup-check.timer
echo
echo "[INFO] first run:  /usr/local/sbin/bbs-backup.sh; echo exit=\$?"
echo "[INFO] log:        /var/backups/bbs/bbs-backup.log"
