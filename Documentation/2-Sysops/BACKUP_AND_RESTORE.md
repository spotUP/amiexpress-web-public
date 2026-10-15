# Backup and restore

The board takes one snapshot of itself every night and shouts if it stops.
This page is the operator's copy: what runs, where it writes, how you know it
broke, and how to get things back.

The reasoning behind every choice here -- what is precious, what protected it
before, and why SQLite needs its own step -- is in
`thoughts/shared/research/2026-09-08_bbs-backup-and-recovery-audit.md`.

---

## What is installed on the live host

Installed 2026-09-08 on `root@bbs.uprough.net`. Source of truth is `deploy/`;
`deploy/install-bbs-backup.sh` puts it in place and is safe to re-run.

| File on the host | From |
|---|---|
| `/usr/local/sbin/bbs-backup.sh` | `deploy/bbs-backup.sh` |
| `/usr/local/sbin/bbs-backup-alert.sh` | `deploy/bbs-backup-alert.sh` |
| `/usr/local/sbin/bbs-backup-check.sh` | `deploy/bbs-backup-check.sh` |
| `/etc/systemd/system/bbs-backup.{service,timer}` | `deploy/systemd/` |
| `/etc/systemd/system/bbs-backup-check.{service,timer}` | `deploy/systemd/` |
| `/etc/systemd/system/bbs-backup-alert.service` | `deploy/systemd/` |
| `/etc/update-motd.d/98-bbs-backup` | `deploy/systemd/98-bbs-backup` |

To reinstall after a host rebuild:

```sh
ssh root@bbs.uprough.net
/app/amiexpress/deploy/install-bbs-backup.sh
```

**These files are not deployed by the GitHub Actions workflow.** The deploy syncs
the application, not the host's `/usr/local/sbin` or `/etc/systemd`. Changing
`deploy/bbs-backup.sh` in git changes nothing on the board until somebody runs
the installer.

---

## Schedule

| Unit | When | What it does |
|---|---|---|
| `bbs-backup.timer` | `*-*-* 04:17:00 UTC`, `Persistent=true`, up to 5 min jitter | takes the snapshot |
| `bbs-backup-check.timer` | hourly | screams if the newest snapshot is stale or incomplete |

`Persistent=true` means a host that was down at 04:17 takes the snapshot as soon
as it is up again.

```sh
systemctl list-timers bbs-backup.timer bbs-backup-check.timer
```

---

## What one snapshot holds

`/var/backups/bbs/<YYYYMMDD-HHMMSS>/`, mode 0700 root -- it contains caller
personal data and the host's `.env` secrets.

| File | What |
|---|---|
| `amiexpress.db.gz` | the whole SQLite database, via `sqlite3 .backup`, `integrity_check`ed before it was compressed |
| `achievements.db.gz` | the doorserver's achievements database (second Docker volume) |
| `doors.db.gz` | the doorserver's door-repo catalog |
| `bbs-files.tar.gz` | the board's files -- see below |
| `doorserver-archives.tar.gz` | the door repo's `Archives/` -- **Sundays only** (~282 MB, rarely change) |
| `host-config.tar.gz` | `/app/amiexpress/.env` and `.env.local` |
| `MANIFEST` | stamp, image, git commit, file count, user and activity row counts |
| `SHA256SUMS` | verify with `sha256sum -c SHA256SUMS` before trusting a snapshot |

`bbs-files.tar.gz` holds, paths relative to the volume root:

- `bbs/user.data`, `bbs/user.keys`, `bbs/user.misc` -- every caller's account
- `bbs/Conf.DB`, `bbs/bbsConfig.info` and every other root-level board file
- every `bbs/Conf<N>/` conference -- `MsgBase/` (every message), `DIR` listings,
  `Files/`, `Screens/`, `Bulletins/`. Conference directories are **discovered**,
  not spelled out, so a new conference is covered automatically
- `bbs/Screens`, `bbs/Themes`, `bbs/Access`, `bbs/Commands`, `bbs/Storage`,
  `bbs/Devs`, `bbs/configs` (DreamTagWall's `tagwall.dat`), `bbs/Bulletins`,
  `bbs/Env`, `bbs/Prompts`, `bbs/SysopStats`
- `bbs/Node*` at depth 1 -- caller logs, door logs, `Answers`, node config
- `bbs/_conf-backups` -- the conference removal/compaction snapshots
- door state under `bbs/Doors`: every `*.db`/`-wal`/`-shm`/`*.sqlite`,
  `*scores*.json` anywhere (eight doors write theirs into `dist/`), `*.dat`,
  `*.cfg`, anything under a `data/` directory, `door.settings.json`, and the
  named extensionless files (`STNG/HISCORES`, `ustats/stats`, `mrc/mrcstat1`,
  `Kickboxing/KB.LChamp`, `dRE!WAll`, `DreamStats`, `zOOtILITY`, `5DPAGER`,
  `ACCV105/Account`, `DoorRepo`)

The list **names what to include**, never what to exclude. That is deliberate:
`bbs/logs` is 7.5 GB and must never join a backup by accident. The cost is that
**a new door that keeps state is a new hole until somebody adds it to
`filelist()` in `deploy/bbs-backup.sh`.** Ask once a quarter: *if the disk died
right now, what would I not get back?*

Measured first run, 2026-09-08: **4,079 files, 62 MB** for the whole snapshot.

## Retention

Every snapshot for **14 days**, then Sundays for **8 weeks**, then the 1st of
each month for **6 months**. About 28 snapshots, ~1.8 GB.

## Where it is NOT

**Every snapshot is on `/dev/sda1` -- the same disk as the board it protects.**
This host has exactly one disk (`lsblk`: `sda` only), no second volume, no
network mount, and no object-storage credential anywhere in the project. There
is nowhere off-box to put it. A disk failure loses the board and the backups
together, and no amount of scripting changes that.

Two ways to fix it, either of which takes minutes:

1. **Hetzner Storage Box** -- speaks rsync-over-SSH. Uncomment
   `Environment=BBS_BACKUP_REMOTE=...` in
   `/etc/systemd/system/bbs-backup.service`, `systemctl daemon-reload`. The
   script already mirrors `/var/backups/bbs/` there and fails loudly if it
   cannot.
2. **Pull to the sysop's own machine**, free, today:
   ```sh
   rsync -av --delete root@bbs.uprough.net:/var/backups/bbs/ ~/BBS-Backups/
   ```
   These copies contain caller personal data. Keep them off shared drives and
   **out of every git repository** -- that is the mistake this board spent 307
   days paying for.

---

## How you find out it broke

A backup that fails quietly is worse than none, because it is believed. There is
no mail transport and no notification credential on this host, so the alarm uses
the four channels that exist:

1. `/var/backups/bbs/ALERT` -- the marker file, with the reason and a log tail
2. `logger -p daemon.crit` -- `journalctl -t bbs-backup`
3. **`/etc/update-motd.d/98-bbs-backup` -- a banner on every SSH login to the
   host.** On a good day the same banner prints the newest snapshot and its size
4. systemd leaves the unit failed, so it shows in `systemctl --failed`

The alert clears itself the next time a snapshot succeeds.

`bbs-backup-check.timer` exists for the failure an exit code cannot report: the
backup that **never ran at all** -- a disabled timer, a host that stayed down, a
full disk. Hourly it asserts that a snapshot exists, is under 36 hours old, has
all six expected members non-empty, and is at least 20 MB.

Optional: set `BBS_BACKUP_ALERT_URL` in `bbs-backup.service` to a Discord or
Slack webhook and the alarm is POSTed there too.

```sh
systemctl status bbs-backup.service bbs-backup-check.service
grep -E "WARN|FAIL" /var/backups/bbs/bbs-backup.log | tail -20
cat /var/backups/bbs/ALERT
systemctl start bbs-backup.service          # take one now
```

---

## Restore

Full procedures -- one caller's account, one screen that survives the next
deploy, the whole database, a lost volume -- are in section 5 of the audit,
`thoughts/shared/research/2026-09-08_bbs-backup-and-recovery-audit.md`. The three
everyday ones:

**One door's high scores** (board stays up; a door reads its data at launch):

```sh
S=/var/backups/bbs/20260908-121037
V=/var/lib/docker/volumes/amiexpress-bbs-data/_data
F=bbs/Doors/grandmaster/data/high-scores.json
mkdir -p /root/restore && cd /root/restore
tar -xzf "$S/bbs-files.tar.gz" "$F"
cp "$V/$F" "$V/$F.before-restore-$(date -u +%Y%m%d)"
cp "/root/restore/$F" "$V/$F"
chown 1001:1001 "$V/$F"          # on the HOST; the container runs as uid 1001
```

For a door's SQLite database, also `rm -f` the `-wal` and `-shm` beside it, or
SQLite replays a journal belonging to a different database. Do it while nobody
is inside that door (`GET /debug/api/sessions`, check `activeDoors[]`).

**One screen** -- same, plus one extra command, or the next deploy takes it
back. The entrypoint treats a `.backup` beside a screen as "the sysop owns
this":

```sh
cp "$V/bbs/Screens/BBSTITLE.txt" "$V/bbs/Screens/BBSTITLE.txt.backup"
chown 1001:1001 "$V/bbs/Screens/BBSTITLE.txt.backup"
```

**The database** -- the board must come down; announce it first:

```sh
cd /app/amiexpress && docker compose stop bbs
V=/var/lib/docker/volumes/amiexpress-bbs-data/_data
mv "$V/db/amiexpress.db"     "$V/db/amiexpress.db.broken-$(date -u +%Y%m%d-%H%M%S)"
mv "$V/db/amiexpress.db-wal" "$V/db/amiexpress.db-wal.broken" 2>/dev/null || true
rm -f "$V/db/amiexpress.db-shm"
gunzip -c "$S/amiexpress.db.gz" > "$V/db/amiexpress.db"
chown 1001:1001 "$V/db/amiexpress.db"
sqlite3 "$V/db/amiexpress.db" 'pragma integrity_check;'    # expect: ok
docker compose up -d bbs
```

Then verify **on the board**, not in the terminal: log in at
https://bbs.uprough.net, check your account and access level, read a message,
run GRANDMASTER. A green health check is not a restored board.

**`user.data` is a fixed-slot archive of every account.** Putting yesterday's
file back to recover one caller reverts everyone else who called since. To
recover a single account, read the archived copy and re-enter it through the
admin user editor -- audit section 5.5.

## Drilling it

Never into live. Extract into a scratch directory and check what came out:

```sh
S=/var/backups/bbs/$(ls -1 /var/backups/bbs | grep '^20' | tail -1)
(cd "$S" && sha256sum -c SHA256SUMS)
gunzip -c "$S/amiexpress.db.gz" > /root/drill.db
sqlite3 /root/drill.db 'pragma integrity_check; select count(*) from users;'
for p in bbs/user.data bbs/Conf1/MsgBase/HeaderFile bbs/Screens/BBSTITLE.txt \
         bbs/Doors/grandmaster/data/high-scores.json bbs/Node1/CallersLog \
         bbs/configs/tagwall.dat; do
  tar -tzf "$S/bbs-files.tar.gz" "$p" >/dev/null 2>&1 \
    && echo "[OK]    $p" || echo "[ERROR] $p MISSING FROM BACKUP"
done
rm -f /root/drill.db
```

Done for real on 2026-09-08 against `20260908-121037`: every file above
extracted, both databases returned `integrity_check = ok`, and the restored
`high-scores.json` and `BBSTITLE.txt` matched the live files byte for byte by
sha256.

---

## What a backup cannot fix

Two known bugs destroy door state, and no snapshot repairs either. Both are
tracked in the audit (sections 3.1 and 3.2) and are **not** fixed by this work:

1. **Doors using the SDK's default storage** -- WHIP, card-lobby, ansi-editor and
   every per-user store -- write to `/app/web/backend/data/doors/`, which is on
   the container's overlay filesystem, not the volume. There is nothing on disk
   to back up, so this backup cannot recover them. The fix is one line in
   `sdk/core/Storage.ts`.
2. **Ten door state files are tracked in git**, therefore in the image,
   therefore written back over the live copies by the deploy's `Doors` sync
   (`mrc/*`, `STNG/HISCORES`, `ustats/stats`, `DreamStats`, `Kickboxing/*`,
   `GWall/GWALL.cfg`, `dRE!WAll`, `zOOtILITY/zOOsTAT`). This backup **does**
   capture all ten, so you can restore them -- but the next deploy takes them
   again. Fix the tracking (`git rm --cached` plus `.gitignore`) or accept that
   you are restoring on borrowed time.
