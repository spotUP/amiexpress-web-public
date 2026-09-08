#!/bin/sh
# bbs-backup.sh -- one snapshot of everything this board cannot regenerate.
#
# Installed on the live host as /usr/local/sbin/bbs-backup.sh (0750, root:root)
# and driven by bbs-backup.timer. See Documentation/2-Sysops/BACKUP_AND_RESTORE.md
# and thoughts/shared/research/2026-09-08_bbs-backup-and-recovery-audit.md.
#
# Design notes, so the next person does not rediscover them:
#
#  * SQLite runs in WAL mode. ".backup" is the ONLY safe way to copy it while the
#    board is up: on 2026-09-08 the main file was 44.6 MB with a 43.6 MB
#    uncheckpointed WAL beside it, so a plain cp would have captured a database
#    hours stale and thrown away everything since.
#  * The BBS database is owned by the container uid (1001). Opening a WAL
#    database as root recreates -wal/-shm as root:root and the board can then no
#    longer write to its own database. sqlite3 cannot simply be dropped to that
#    uid: /var/lib/docker is drwx--x--- root:root and /var/backups/bbs is 0700
#    root, so a dropped-privilege sqlite3 can neither read the source nor write
#    the copy (measured with namei on the host, 2026-09-08). So sqlite3 runs as
#    root and snap_db restores the sidecar files' ownership afterwards, then
#    asserts it - a snapshot that leaves the board unable to write its database
#    is a failed snapshot.
#  * The doorserver is a SECOND volume. achievements.db and doors.db live there
#    and no BBS mechanism has ever touched them.
#  * The file list NAMES what to include. bbs/logs is 7.5 GB and must never join
#    the backup by accident.
#  * tar exits 1 when a file changed while it was read. On a live board that is
#    normal (CallersLog, DoorLog). Only exit >= 2 is a real failure.
#  * Everything is read-only against the live volumes.
#
# Exit status is 0 only if every step succeeded. Anything else is a failure and
# systemd's OnFailure= raises the alert (see bbs-backup-alert.sh).

set -eu

BBS_VOL=${BBS_VOL:-/var/lib/docker/volumes/amiexpress-bbs-data/_data}
DOOR_VOL=${DOOR_VOL:-/var/lib/docker/volumes/doorserver-data/_data}
APP_DIR=${BBS_APP_DIR:-/app/amiexpress}
DEST=${BBS_BACKUP_DEST:-/var/backups/bbs}
MIN_FREE_MB=${BBS_BACKUP_MIN_FREE_MB:-3072}
ALERT_SCRIPT=${BBS_BACKUP_ALERT_SCRIPT:-/usr/local/sbin/bbs-backup-alert.sh}

STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="$DEST/$STAMP"
LOG="$DEST/bbs-backup.log"
STAGE="$OUT/.stage"

install -d -m 0700 -o root -g root "$DEST"
install -d -m 0700 -o root -g root "$OUT"
exec >>"$LOG" 2>&1

fail=0
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT INT TERM

echo "=== $STAMP start on $(hostname) ==="

# --- 0. Do not start a backup onto a disk that cannot hold one. ---------------
free_mb=$(df -Pm "$DEST" | awk 'NR==2 {print $4}')
if [ "${free_mb:-0}" -lt "$MIN_FREE_MB" ]; then
    echo "FAIL preflight: only ${free_mb} MB free on $DEST, need $MIN_FREE_MB"
    echo "=== $STAMP end (fail=1) ==="
    exit 1
fi
echo "INFO ${free_mb} MB free on $(df -P "$DEST" | awk 'NR==2 {print $1}')"

install -d -m 0700 -o root -g root "$STAGE"

# --- 1. The databases, through SQLite's online backup API. -------------------
# $1 source, $2 output name. The source's ownership is captured before the copy
# and restored afterwards, because root touching a WAL database owned by the
# container uid is how you hand the board a database it can no longer write.
snap_db() {
    src=$1
    name=$2
    if [ ! -f "$src" ]; then
        echo "FAIL $name: source missing ($src)"
        fail=1
        return 0
    fi
    owner=$(stat -c '%u:%g' "$src")
    ok=1
    sqlite3 "$src" ".timeout 60000" ".backup '$STAGE/$name'" || ok=0

    # Restore and then ASSERT the ownership of the live database and its
    # sidecars. This runs whether or not the copy succeeded.
    for side in "" "-wal" "-shm"; do
        f="$src$side"
        [ -e "$f" ] || continue
        cur=$(stat -c '%u:%g' "$f")
        if [ "$cur" != "$owner" ]; then
            chown "$owner" "$f" 2>/dev/null || true
            echo "INFO repaired ownership of $(basename "$f") ($cur -> $owner)"
            cur=$(stat -c '%u:%g' "$f")
        fi
        if [ "$cur" != "$owner" ]; then
            echo "FAIL $name: $(basename "$f") is owned $cur, expected $owner - the board may be unable to write this database"
            fail=1
        fi
    done

    if [ "$ok" = 1 ]; then
        chk=$(sqlite3 "$STAGE/$name" 'pragma integrity_check;' 2>&1 | head -1) || chk="integrity_check did not run"
        if [ "$chk" != "ok" ]; then
            echo "FAIL $name: integrity_check=$chk"
            ok=0
        fi
    fi
    if [ "$ok" = 1 ]; then
        mv "$STAGE/$name" "$OUT/$name"
        chown root:root "$OUT/$name"
        gzip -9 "$OUT/$name"
        echo "OK   $name.gz $(du -h "$OUT/$name.gz" | cut -f1) integrity_check=ok"
    else
        rm -f "$STAGE/$name" "$STAGE/$name-wal" "$STAGE/$name-shm"
        echo "FAIL $name"
        fail=1
    fi
}

snap_db "$BBS_VOL/db/amiexpress.db" amiexpress.db
snap_db "$DOOR_VOL/achievements.db" achievements.db
snap_db "$DOOR_VOL/doors.db"        doors.db

# --- 2. The board's files. ---------------------------------------------------
# Conference directories are discovered, never spelled out: a board can grow a
# conference and this list must not be the thing that forgets it.
conf_dirs=$(cd "$BBS_VOL" && find bbs -maxdepth 1 -type d -regextype posix-extended -regex 'bbs/Conf[0-9]+' 2>/dev/null | sort)

filelist() {
    cd "$BBS_VOL" || return 1
    # Caller accounts (user.data / user.keys / user.misc), Conf.DB, bbsConfig.info
    # and every other root-level config or data file the board writes.
    find bbs -maxdepth 1 -type f -print 2>/dev/null
    # Conferences: message bases, DIR listings, uploads, screens, bulletins.
    for d in $conf_dirs; do
        find "$d" -type f -print 2>/dev/null
    done
    # Art, themes, access tables, command definitions, storage, devs, and the
    # door config that lives outside Doors/ (DreamTagWall's tagwall.dat).
    #
    # Bulletins/Env/Prompts/SysopStats were added on 2026-09-08 after the first
    # verified run: bull6, BullHelp and lastc are hand-written, Env holds the
    # board's STATS@n counters and prefs, and SysopStats holds the per-conference
    # upload counters. All four are tiny and none is regenerable.
    find bbs/Screens bbs/Themes bbs/Access bbs/Commands bbs/Storage bbs/Devs \
         bbs/configs bbs/Bulletins bbs/Env bbs/Prompts bbs/SysopStats \
         -type f -print 2>/dev/null
    # Per-node logs, questionnaires and node config. maxdepth 1 on purpose: the
    # subdirectories are playpen scratch and transfer temporaries.
    find bbs/Node* -maxdepth 1 -type f -print 2>/dev/null
    # Conference removal / compaction snapshots.
    find bbs/_conf-backups -type f -print 2>/dev/null
    # Door data. The first eight patterns are the deploy tarball's; the rest are
    # the classes it misses (2026-09-08 audit). '*scores*.json' is unanchored on
    # purpose - eight doors write theirs into dist/. The per-door -path clauses
    # exist because extensionless state files (mrc/mrcstat1, STNG/HISCORES,
    # ustats/stats) match no extension pattern; a new door that keeps state is a
    # new hole until it is named here - see BACKUP_AND_RESTORE.md.
    find bbs/Doors -name node_modules -prune -o -type f \( \
           -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' \
        -o -name '*.sqlite' -o -name '*.sqlite3' \
        -o -name '*scores*.json' -o -iname '*.dat' -o -path '*/data/*' \
        -o -name 'door.settings.json' -o -name 'settings.json' \
        -o -name 'HISCORES' -o -name 'KB.LChamp' -o -name '*.cfg' \
        -o -path '*/Kickboxing/*' -o -path '*/ustats/*' \
        -o -path '*/DreamStats/*' -o -path '*/zOOtILITY/*' \
        -o -path '*/mrc/*' -o -path '*/5DPAGER/*' \
        -o -path '*/ACCV105/Account/*' -o -path '*/DoorRepo/*' \
        -o -path '*/dRE!WAll/*' \) -print 2>/dev/null
}

if filelist | sort -u > "$STAGE/filelist.txt"; then
    :
else
    echo "FAIL bbs-files: could not build the file list"
    fail=1
fi
nfiles=$(wc -l < "$STAGE/filelist.txt" 2>/dev/null || echo 0)
if [ "$nfiles" -lt 1000 ]; then
    echo "FAIL bbs-files: file list has only $nfiles entries, expected thousands"
    fail=1
else
    rc=0
    tar --no-recursion \
        --warning=no-file-changed --warning=no-file-removed \
        -czf "$OUT/bbs-files.tar.gz" -C "$BBS_VOL" -T "$STAGE/filelist.txt" || rc=$?
    if [ "$rc" -ge 2 ]; then
        echo "FAIL bbs-files: tar exited $rc"
        fail=1
    else
        [ "$rc" -eq 1 ] && echo "WARN bbs-files: tar exit 1, a file changed while being read (normal on a live board)"
        echo "OK   bbs-files.tar.gz $(du -h "$OUT/bbs-files.tar.gz" | cut -f1) $nfiles files"
    fi
fi

# --- 3. The doorserver's archives: Sundays only (~282 MB, rarely change). -----
if [ "$(date -u +%u)" = "7" ] && [ -d "$DOOR_VOL/Archives" ]; then
    rc=0
    tar --warning=no-file-changed -czf "$OUT/doorserver-archives.tar.gz" \
        -C "$DOOR_VOL" Archives || rc=$?
    if [ "$rc" -ge 2 ]; then
        echo "FAIL doorserver-archives: tar exited $rc"
        fail=1
    else
        echo "OK   doorserver-archives.tar.gz $(du -h "$OUT/doorserver-archives.tar.gz" | cut -f1)"
    fi
fi

# --- 4. The host's own secrets (.env holds DOORREPO_LEARN_KEY, CORS_ORIGINS). -
if [ -f "$APP_DIR/.env" ]; then
    rc=0
    tar -czf "$OUT/host-config.tar.gz" -C "$APP_DIR" .env .env.local 2>/dev/null || rc=$?
    if [ "$rc" -ge 2 ]; then
        echo "FAIL host-config: tar exited $rc"
        fail=1
    else
        echo "OK   host-config.tar.gz $(du -h "$OUT/host-config.tar.gz" | cut -f1)"
    fi
else
    echo "WARN host-config: $APP_DIR/.env not present"
fi

# --- 5. A manifest, so a restore knows what it is holding. -------------------
# Counts only. This file must never contain caller personal data.
{
    echo "stamp:   $STAMP"
    echo "host:    $(hostname)"
    echo "image:   $(docker inspect -f '{{.Config.Image}} {{.Created}}' amiexpress-bbs 2>/dev/null || echo unknown)"
    echo "commit:  $(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "files:   $nfiles"
    echo "users:   $(zcat "$OUT/amiexpress.db.gz" 2>/dev/null > "$STAGE/m.db" && sqlite3 "$STAGE/m.db" 'select count(*) from users' 2>/dev/null || echo unknown)"
    echo "msgs:    $(sqlite3 "$STAGE/m.db" 'select count(*) from caller_activity' 2>/dev/null || echo unknown)"
} > "$OUT/MANIFEST"
rm -f "$STAGE/m.db" "$STAGE/m.db-wal" "$STAGE/m.db-shm"
( cd "$OUT" && sha256sum ./*.gz MANIFEST > SHA256SUMS 2>/dev/null ) || { echo "FAIL SHA256SUMS"; fail=1; }
rm -rf "$STAGE"
chmod -R go-rwx "$OUT"

echo "INFO snapshot size $(du -sh "$OUT" | cut -f1)"

# --- 6. Retention: every snapshot for 14 days, then Sundays for 8 weeks, ------
#        then the 1st of each month for 6 months.
now=$(date -u +%s)
for s in $(cd "$DEST" && ls -1d 20*/ 2>/dev/null | tr -d / | sort -r); do
    d=$(echo "$s" | cut -c1-8)
    then_s=$(date -u -d "$d" +%s 2>/dev/null) || continue
    age=$(( (now - then_s) / 86400 ))
    keep=0
    [ "$age" -le 14 ] && keep=1
    [ "$age" -le 56 ] && [ "$(date -u -d "$d" +%u)" = "7" ] && keep=1
    [ "$age" -le 190 ] && [ "$(echo "$d" | cut -c7-8)" = "01" ] && keep=1
    if [ "$keep" = "0" ]; then
        rm -rf "${DEST:?}/$s"
        echo "INFO pruned $s (age ${age}d)"
    fi
done

# --- 7. Offsite. Set BBS_BACKUP_REMOTE in bbs-backup.service once a target ----
#        exists, e.g. u123456@u123456.your-storagebox.de:bbs
if [ -n "${BBS_BACKUP_REMOTE:-}" ]; then
    if rsync -a --delete-after -e "ssh -o BatchMode=yes" "$DEST/" "$BBS_BACKUP_REMOTE/"; then
        echo "OK   offsite -> $BBS_BACKUP_REMOTE"
    else
        echo "FAIL offsite -> $BBS_BACKUP_REMOTE"
        fail=1
    fi
else
    echo "WARN no BBS_BACKUP_REMOTE set - this snapshot exists on ONE disk, the same disk as the board"
fi

echo "=== $STAMP end (fail=$fail) ==="

if [ "$fail" = "0" ]; then
    [ -x "$ALERT_SCRIPT" ] && "$ALERT_SCRIPT" clear || true
else
    [ -x "$ALERT_SCRIPT" ] && "$ALERT_SCRIPT" raise "bbs-backup.sh reported failures in snapshot $STAMP" || true
fi
exit "$fail"
