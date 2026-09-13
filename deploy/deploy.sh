#!/usr/bin/env bash
#
# THE DEPLOY, as a file the host can run.
#
# This was 534 lines inside `.github/workflows/deploy-hetzner.yml`, in the
# `script:` block an SSH action pasted onto the box. On 2026-09-08 GitHub
# Actions stopped running for this repository - "recent account payments have
# failed or your spending limit needs to be increased" - and with it went the
# ONLY copy of the caller guard, the .info backup, the health check and the
# rollback. The board could not be deployed at all, by anybody, and the fix
# had to be typed by hand on the host.
#
# So the logic lives in the repository, where it is version-controlled,
# testable and reachable without GitHub: the host already has a checkout, so
# it arrives with the pull it is about to perform. The workflow becomes a thin
# caller for the day Actions is paid for again.
#
# Run it as root on the board's host:
#
#     /app/amiexpress/deploy/deploy.sh              # deploy origin/main
#     FORCE_DEPLOY=true /app/amiexpress/deploy/deploy.sh   # even with callers on
#
# ONE AT A TIME. Two deploys in parallel raced into "Container name ... already
# in use" on 2026-05-20, which is why the workflow had a concurrency group; a
# file has no such thing, so this takes a lock and refuses rather than queues -
# a second deploy of the same commit is worth nothing anyway.
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/app/amiexpress}"
LOCK_FILE="${DEPLOY_LOCK:-/var/lock/amiexpress-deploy.lock}"

if [ "${DEPLOY_LOCK_HELD:-}" != "1" ]; then
  export DEPLOY_LOCK_HELD=1
  # NOT `exec flock ... || { ... }`. `exec` REPLACES this shell with flock, so
  # the `||` branch after it is unreachable: when the lock was held, flock
  # exited 1, nothing was printed, and the deploy looked to its caller like a
  # command that had simply finished. On 2026-09-08 that cost an hour - a
  # deploy reported success (the caller had piped it through `tail`, whose exit
  # status won), the board did not move, and the container was 35 minutes older
  # than the deploy that claimed to have built it. A deploy that silently does
  # nothing and reports success is worse than one that fails loudly.
  #
  # `--conflict-exit-code` makes 75 mean "the lock was held" and nothing else,
  # so the deploy's OWN exit status still reaches the caller unchanged. Without
  # it, flock returns 1 both for a held lock and for a deploy that failed, and
  # the two are not the same thing to whoever is reading the log.
  # `|| lock_status=$?` and not a bare call: `set -e` is on, so a bare
  # non-zero flock would kill this shell before the next line could read $?,
  # and the message would go missing all over again by a different route.
  lock_status=0
  flock --nonblock --conflict-exit-code 75 "$LOCK_FILE" "$0" "$@" || lock_status=$?
  if [ "$lock_status" -eq 75 ]; then
    echo "another deploy holds $LOCK_FILE - not starting a second one" >&2
  fi
  exit "$lock_status"
fi

cd "$DEPLOY_ROOT"

# Snapshot the board's configuration BEFORE anything touches it.
#
# The admin writes .info files and the BBS reads them; a deploy
# that changes a writer changes what lands in them. The 2026-08-31
# remediation rewrote ten of those writers at once, which is
# exactly when a copy of the previous state is worth having.
#
# Only the .info files, not the whole volume: the file areas are
# gigabytes of uploads that no deploy can touch, while every
# config file this project writes ends in .info (bbsConfig.info,
# ConfConfig.info, Conf<N>.info, Node<N>.info, Drives.info,
# ScreenTypes.info, ComputerList.info, Protocols/XprTypes.info,
# Languages/*, Fcheck/*, Access/ACS.*, Commands/**) or in the
# .info.txt companion AmiExpress reads beside it
# (tooltypes.e:259-270).
#
# Taken through a throwaway container so it works whether or not
# the BBS is running, and never depends on tar existing inside
# the app image. `-T -` rather than `--null`: alpine's tar is
# busybox, which has the first and not the second, and no .info
# file has a newline in its name. Verified on this host rather
# than assumed - run 33374484181 took 1816 files into 328K.
echo "== backup: the board's .info files =="
BACKUP_DIR=/root/bbs-backups
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
docker run --rm \
  -v amiexpress-bbs-data:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3 \
  sh -c "cd /data && find bbs \( -name '*.info' -o -name '*.info.txt' \) -print | tar -czf /backup/bbs-config-$STAMP.tar.gz -T -" \
  || echo "WARNING: backup failed (no volume yet?), continuing"
if [ -f "$BACKUP_DIR/bbs-config-$STAMP.tar.gz" ]; then
  echo "Backup: $BACKUP_DIR/bbs-config-$STAMP.tar.gz ($(du -h "$BACKUP_DIR/bbs-config-$STAMP.tar.gz" | cut -f1), $(tar -tzf "$BACKUP_DIR/bbs-config-$STAMP.tar.gz" | wc -l) files)"
fi
# Keep the last twenty; they are small and the disk is not.
ls -1t "$BACKUP_DIR"/bbs-config-*.tar.gz 2>/dev/null | tail -n +21 | xargs -r rm -f

# The doors' own data: scores, stats, message bases, anything a
# door wrote and cannot regenerate.
#
# The .info backup above covers configuration and nothing else,
# so when GRANDMASTER's match history vanished on 2026-09-01
# there was nothing to restore from - the file was simply gone.
# A deploy is the moment worth capturing, because a deploy is
# what replaces the code that owns the data.
#
# WAL files are included ON PURPOSE. These databases run in WAL
# mode, and grandmaster.db was a 4 KB header with 540 KB of
# uncheckpointed WAL beside it: backing up the .db alone would
# have preserved an empty database and thrown the scores away.
#
# Only node_modules is pruned. dist/ is NOT: frogger and
# super-qix keep their high scores inside dist/, which is also
# why the deploy's dist cleanup whitelists compiled extensions
# rather than deleting whatever the image lacks. The filters
# below match data, not code, so scanning dist costs nothing.
echo "== backup: the doors' data =="
docker run --rm \
  -v amiexpress-bbs-data:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3 \
  sh -c "cd /data && find bbs/Doors -name node_modules -prune -o \
         -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' \
                   -o -name '*.sqlite' -o -name '*.sqlite3' \
                   -o -name '*scores*.json' -o -name '*.dat' \
                   -o -path '*/data/*' \) -print \
         | tar -czf /backup/bbs-doordata-$STAMP.tar.gz -T -" \
  || echo "WARNING: door data backup failed, continuing"
if [ -f "$BACKUP_DIR/bbs-doordata-$STAMP.tar.gz" ]; then
  echo "Backup: $BACKUP_DIR/bbs-doordata-$STAMP.tar.gz ($(du -h "$BACKUP_DIR/bbs-doordata-$STAMP.tar.gz" | cut -f1), $(tar -tzf "$BACKUP_DIR/bbs-doordata-$STAMP.tar.gz" | wc -l) files)"
else
  echo "WARNING: no door data archive was written"
fi
# Twenty of these as well. They are bigger than the .info
# archive and still nothing next to the disk.
ls -1t "$BACKUP_DIR"/bbs-doordata-*.tar.gz 2>/dev/null | tail -n +21 | xargs -r rm -f

# The board's ART: the screens a sysop drew and the screen
# THEMES an artist uploaded.
#
# This ships with the Themes/ directory rather than after it, on
# purpose. Every other artist-facing directory on this board has
# been lost at least once - the .info backup covers configuration
# and the door backup covers door data, and neither covers a
# single screen file. An artist's theme exists ONLY on the
# volume: it is absent from the image by construction, so a lost
# volume is a lost theme with nothing to restore from.
#
# Screens/ comes too, including .Revisions: it is the board's
# own art and the ten-deep undo the admin editor keeps.
echo "== backup: the board's art and themes =="
docker run --rm \
  -v amiexpress-bbs-data:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3 \
  sh -c "cd /data && find bbs/Themes bbs/Screens bbs/Conf*/Screens \
         -type f -print 2>/dev/null \
         | tar -czf /backup/bbs-art-$STAMP.tar.gz -T -" \
  || echo "WARNING: art backup failed, continuing"
if [ -f "$BACKUP_DIR/bbs-art-$STAMP.tar.gz" ]; then
  echo "Backup: $BACKUP_DIR/bbs-art-$STAMP.tar.gz ($(du -h "$BACKUP_DIR/bbs-art-$STAMP.tar.gz" | cut -f1), $(tar -tzf "$BACKUP_DIR/bbs-art-$STAMP.tar.gz" | wc -l) files)"
else
  echo "WARNING: no art archive was written"
fi
ls -1t "$BACKUP_DIR"/bbs-art-*.tar.gz 2>/dev/null | tail -n +21 | xargs -r rm -f

# Always sync to origin/main exactly. `git pull` can silently
# leave the checkout behind when the working tree has local
# edits (which the server should never have, but accumulates
# in practice — e.g. a hand-edit, a CRLF conversion). Doing
# a hard fetch+reset guarantees the checkout matches the
# commit the workflow expects.
echo "== git fetch + hard reset =="
# Retried, and never allowed to prompt.
#
# github.com answers an anonymous HTTPS fetch with a broken ref
# listing often enough to matter: git then falls back to asking
# for a username, there is no terminal on an ssh-action shell,
# and the deploy dies in 15 seconds with "could not read
# Username for 'https://github.com': No such device or address"
# preceded by "expected flush after ref listing". Four deploys
# failed that way on 2026-09-02 alone, all of them within
# minutes of a fetch that worked by hand. Nothing is wrong with
# the checkout or the credentials - the same command succeeds on
# the next attempt.
#
# GIT_TERMINAL_PROMPT=0 keeps a REAL credential problem failing
# fast and honestly instead of hiding behind the prompt error.
# Fetch as SOMEBODY first.
#
# The retry loop was not enough: three deploys in a row on
# 2026-09-02 (860b18cf0, 91bd83287, 150751cfe) burned all five
# attempts in 75 seconds with the same "could not read Username"
# + "expected flush after ref listing" pair. That is not the
# transient the comment above describes - and the repo is
# PUBLIC, so it is not a permissions problem either. What it
# looks like is github.com rate-limiting UNAUTHENTICATED git
# traffic from this host's IP, which three agents pushing all
# day will earn: an authenticated fetch has a far higher
# allowance, and no number of extra attempts can outlast a
# limit that is counted per hour.
#
# The token is the workflow's own, short-lived and read-only,
# written to a 600 file rather than a command line so it is not
# in `ps` on the host. Anonymous stays as the fallback, so a run
# with no token behaves exactly as before.
CRED_FILE=""
if [ -n "${GH_TOKEN:-}" ]; then
  CRED_FILE=$(mktemp)
  chmod 600 "$CRED_FILE"
  printf 'https://x-access-token:%s@github.com\n' "$GH_TOKEN" > "$CRED_FILE"
fi

FETCH_OK=0
for attempt in 1 2 3 4 5; do
  if [ -n "$CRED_FILE" ] \
    && GIT_TERMINAL_PROMPT=0 git -c "credential.helper=store --file=$CRED_FILE" \
         fetch --prune origin main; then
    FETCH_OK=1
    break
  fi
  if GIT_TERMINAL_PROMPT=0 git fetch --prune origin main; then
    FETCH_OK=1
    break
  fi
  echo "fetch attempt $attempt failed; retrying in $((attempt * 5))s" >&2
  sleep $((attempt * 5))
done
if [ -n "$CRED_FILE" ]; then rm -f "$CRED_FILE"; fi
if [ "$FETCH_OK" != "1" ]; then
  echo "ERROR: could not fetch origin/main after 5 attempts" >&2
  exit 1
fi
EXPECTED_SHA=$(git rev-parse origin/main)
git reset --hard "$EXPECTED_SHA"
ACTUAL_SHA=$(git rev-parse HEAD)
echo "HEAD now at $ACTUAL_SHA"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "ERROR: HEAD ($ACTUAL_SHA) != origin/main ($EXPECTED_SHA)" >&2
  exit 1
fi

# A COLLISION MUST NOT REACH THE IMAGE.
#
# This checkout is Linux/ext4 and CASE-SENSITIVE; the sysop's is
# macOS/APFS and CASE-INSENSITIVE. Git tracks a path as bytes, so
# it will carry BOTH `Doors/GWall/GWALL.cfg` and `gwall.cfg`. On
# the mac only one of them exists, so the collision is invisible
# there - and it is right here, after `git reset --hard`, that
# both files become real for the first time. `COPY Doors ./Doors`
# then puts both in the image, the entrypoint's tar sync (which
# only ever ADDS) puts both on the volume where they live for
# ever, and `findCaseInsensitive` in amigafs hands the door
# whichever one readdir returns first - arbitrary, and it can
# flip when an unrelated file is added to the directory.
#
# The position matters: this is AFTER the SHA is pinned and
# BEFORE the image is built or the container recreated, so a bad
# commit costs a red workflow and no downtime at all. The same
# rule runs as `dev/scripts/check-case-collisions.cjs` in the
# pre-commit hook and in `web/backend/tests/repo/
# case-collisions.test.ts`; this copy exists because
# backend-tests.yml is a SEPARATE push-triggered workflow with no
# `needs:` on it and main has no branch protection, so a red test
# suite does not stop a deploy. Shell rather than node: nothing
# guarantees a node on the host outside the container.
#
# LC_ALL=C on purpose - the repo carries Amiga filenames with
# high-bit bytes and a UTF-8 locale makes awk choke on them. No
# `| head` either: head closing the pipe under `set -o pipefail`
# fails the deploy with exit 141.
echo "== case-collision check =="
COLLISIONS=$(git ls-files | LC_ALL=C awk '
  {
    n = split($0, part, "/")
    p = ""
    for (i = 1; i <= n; i++) {
      p = (i == 1) ? part[i] : p "/" part[i]
      k = tolower(p)
      if (k in seen) {
        if (seen[k] != p && !((k SUBSEP p) in done)) {
          print "  " seen[k] "\n  == " p
          done[k SUBSEP p] = 1
        }
      } else {
        seen[k] = p
      }
    }
  }')
if [ -n "$COLLISIONS" ]; then
  echo "ERROR: refusing to deploy - two tracked paths differ only in case:" >&2
  printf '%b\n' "$COLLISIONS" >&2
  echo "" >&2
  echo "Both spellings exist in this Linux checkout and would both be baked" >&2
  echo "into the image; on the sysop's mac only one is visible, which is why" >&2
  echo "this was committed without anyone seeing it. The volume sync never" >&2
  echo "deletes, so once both land on /app/data they stay there for ever." >&2
  echo "Fix it on main: keep the spelling the BOARD opens (check the .info" >&2
  echo "LOCATION and \`strings -a Doors/<door>/<binary>\`), then" >&2
  echo "\`git rm --cached\` the other. If the two files have DIFFERENT" >&2
  echo "content they are two different files, not a duplicate - stop and ask." >&2
  exit 1
fi
echo "== no case collisions among $(git ls-files | wc -l | tr -d ' ') tracked paths =="

# Build FIRST, separately from the recreate. Recreating the
# container drops every connected session, so the people using
# the BBS get a countdown between the two steps — and because
# the image is already built by then, that countdown costs no
# extra downtime. It used to be one `up --build --force-recreate`
# with no warning at all: on 2026-08-26 eight deploys went out in
# 46 minutes and threw the user out of /chat over and over.
#
# Pass the resolved SHA as a build-arg so the image records
# which revision it was built from. fetch-live-logs.yml reads
# /app/.git-sha to surface this — answers "is the live deploy
# actually fresh?" without having to inspect mtimes.
# Remember the image that is serving RIGHT NOW, so a deploy
# that builds fine and then cannot start has somewhere to go
# back to. Tagged rather than remembered by ID: an untagged
# image whose tag has moved is a prune away from being gone.
if docker image inspect amiexpress-bbs:latest >/dev/null 2>&1; then
  docker tag amiexpress-bbs:latest amiexpress-bbs:rollback
  echo "== previous image tagged amiexpress-bbs:rollback =="
else
  echo "== no previous image to tag (first deploy) =="
fi

# Make room BEFORE building, not after failing to.
#
# 2026-09-01: the board went down mid-session with the disk at
# 100% and the container in a restart loop - the entrypoint
# could not write a byte. Nothing in this pipeline had ever
# freed anything, so every deploy left its build cache and its
# displaced image behind: 27.4GB of buildkit cache across 1348
# entries, and 19 images totalling 49GB, on a 75GB disk. The
# deploy still reported success, because the workflow is green
# when the build is green - the board was serving an image from
# hours earlier.
#
# --keep-storage leaves the recent layers, so an ordinary
# deploy still builds from cache; only the long tail goes. The
# daemon's own builder.gc enforces the same ceiling between
# deploys (see /etc/docker/daemon.json) - this is the belt to
# that braces, and the one that runs when it matters.
echo "== free space before build =="
df -h / | tail -1
docker builder prune -f --keep-storage=10GB 2>&1 | tail -2 || true
# Untagged leftovers only: :latest and :rollback are tags, so
# neither is a dangling image and neither can be caught here.
docker image prune -f 2>&1 | tail -2 || true
df -h / | tail -1

# PROFILES THAT ARE ALREADY RUNNING MUST BE DEPLOYED TOO.
#
# `whip-bot` sits behind `profiles: [bots]` because it is opt-in - a board
# with no Discord bot should not have one started for it. But `docker compose
# build` and `up` SKIP a profiled service unless its profile is named, so the
# deploy rebuilt the board, recreated it, reported success, and left the bot
# running whatever image it first started with.
#
# It ran that way for three days. The bot's feed-reconnect fix was committed,
# tested, merged and deployed green while the running bot still carried the
# bug - retrying on the 60s cap for ever instead of resetting its backoff on a
# good connection. Green in git, absent in production, and nothing said so.
#
# The rule that fixes it without overriding the sysop's choice: a profile with
# something ALREADY RUNNING is deployed; a profile with nothing running stays
# down. Opt-in is still opt-in, and what is up is never stale.
#
# Derived, never hardcoded: the profile list comes from compose, and the
# services a profile gates are the difference between the service list with it
# and without it.
active_profile_args() {
  local args="" profile gated running
  running="$(docker compose ps --services --status running 2>/dev/null | sort)"
  [ -n "$running" ] || return 0
  for profile in $(docker compose config --profiles 2>/dev/null); do
    [ -n "$profile" ] || continue
    gated="$(comm -13 \
      <(docker compose config --services 2>/dev/null | sort) \
      <(docker compose --profile "$profile" config --services 2>/dev/null | sort))"
    [ -n "$gated" ] || continue
    # Any gated service currently up makes the whole profile part of this deploy.
    if [ -n "$(comm -12 <(echo "$gated" | sort) <(echo "$running"))" ]; then
      args="$args --profile $profile"
    fi
  done
  printf '%s' "$args"
}

PROFILE_ARGS="$(active_profile_args)"
if [ -n "$PROFILE_ARGS" ]; then
  echo "== profiles with running services, included in this deploy:$PROFILE_ARGS =="
else
  echo "== no profiled service is running; none will be started =="
fi

echo "== docker compose build (with GIT_SHA) =="
# shellcheck disable=SC2086 - PROFILE_ARGS is a deliberate word list
GIT_SHA="$ACTUAL_SHA" docker compose $PROFILE_ARGS build

# Warn everybody who is connected, then wait out the countdown.
# SIGUSR1 is handled in web/backend/src/index.ts; the backend
# announces at 60/30/10/5s. A signal rather than an HTTP call
# because Caddy proxies every path to 3001 — an admin endpoint
# would be reachable from the outside and would need its own
# secret, `docker kill` needs neither.
#
# RESTART_NOTICE_SECONDS in docker-compose.yml must match this
# sleep. Skipped entirely when nothing is running (first deploy,
# or a container that died), so a cold start is not delayed.
# WHO IS ON THE BOARD RIGHT NOW.
#
# Recreating the container ends every session. On 2026-09-07 an
# evening of iterating on FTP meant kicking the sysop's callers
# off over and over - "we are throwing users out of the live
# bbs" - and nothing in the pipeline knew or cared.
#
# The board answers on its own /health: `callers` counts anyone
# LOGGED ON over any transport, plus anyone on over FTP (who
# holds a node but no session). A connection sitting at the
# login prompt is not counted, or a port scanner would block
# deploys for ever.
#
# Curled from the HOST against the published port, so it tests
# what a caller would reach rather than a container's own idea
# of itself. A board that does not answer is a board with nobody
# on it - that is a cold start, not a reason to refuse.
#
# Override: run the workflow manually with force=true. It says
# what it is about to do, deliberately, in the log.
# Empty on a push run; appleboy passes no value for an input
# that was never asked for, and `set -u` would abort here.
FORCE_DEPLOY="${FORCE_DEPLOY:-false}"
if [ "$(docker inspect -f '{{.State.Running}}' amiexpress-bbs 2>/dev/null || echo false)" = "true" ]; then
  HEALTH=$(curl -s --max-time 5 http://127.0.0.1:3001/health || echo '')
  CALLERS=$(printf '%s' "$HEALTH" | sed -n 's/.*"callers":\([0-9]*\).*/\1/p')
  CALLERS=${CALLERS:-0}
  # WHO IS ON THAT A DEPLOY MUST NOT THROW OFF.
  #
  # The sysop's own session is not one of them. Counting it meant
  # every push run refused while he waited for his fix - exit 78,
  # image built, container never recreated. "its always ok to
  # force when spot or the sysop is online" (2026-09-08).
  #
  # The rule lives in `deploy/caller-guard.sh` so it can be
  # executed by a test rather than only by this workflow; see
  # tests/deploy/the-caller-guard-lets-the-sysop-through.test.ts.
  . ./deploy/caller-guard.sh
  OTHERS=$(callers_to_protect "$HEALTH" "${DEPLOY_IGNORE_CALLERS:-spot sysop discord-bridge}")

  if [ "$CALLERS" -gt 0 ] && [ "$OTHERS" -le 0 ] 2>/dev/null; then
    echo "== only the sysop is on the board; deploying =="
    printf '%s' "$HEALTH" | tr ',' '\n' | grep -i 'username' || true
  elif [ "$CALLERS" -gt 0 ] 2>/dev/null; then
    echo "== $CALLERS caller(s) are on the board, $OTHERS of them not the sysop =="
    printf '%s' "$HEALTH" | tr ',' '\n' | grep -i 'username' || true
    if [ "$FORCE_DEPLOY" = "true" ]; then
      echo "== force=true: deploying anyway, they will be disconnected =="
    else
      echo ""
      echo "REFUSING TO DEPLOY. The image is built and the repo is updated;"
      echo "nothing has been recreated, so the board is untouched and still"
      echo "serving the previous build."
      echo ""
      echo "Re-run this workflow when they have gone, or run it manually with"
      echo "force=true to disconnect them deliberately."
      exit 78
    fi
  else
    echo "== nobody is on the board; deploying =="
  fi
fi

NOTICE_SECONDS=60
if [ "$(docker inspect -f '{{.State.Running}}' amiexpress-bbs 2>/dev/null || echo false)" = "true" ]; then
  echo "== restart notice: SIGUSR1, then ${NOTICE_SECONDS}s countdown =="
  docker kill -s SIGUSR1 amiexpress-bbs || true
  sleep "$NOTICE_SECONDS"
else
  echo "== restart notice skipped: no running container =="
fi

# FTPS material, staged where the container can actually read it.
#
# Caddy keeps its certificates 0600 and owned by the caddy user;
# the container runs as uid 1001 (bbsuser), so mounting Caddy's
# own directory gave `EACCES: permission denied, open
# /certs/bbs.uprough.net.crt` and AUTH TLS answered 431 while
# looking configured. So the pair is copied to a directory owned
# by that uid, key mode 0400, and THAT is what compose mounts.
#
# Re-copied on every deploy, which is also how a renewed
# certificate reaches FTPS: Caddy renews in place, and the FTP
# server reads the file once at boot.
# Both names the board answers to: uptown is the address the
# sysop gives out, bbs is what everything internal uses. A
# certificate is issued for ONE name, so the FTP server carries
# both and picks by SNI (FTP_TLS_HOSTS in docker-compose.yml).
CADDY_CERTS=/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory
install -d -m 0750 -o 1001 -g 1001 /app/ftp-certs
for FTP_HOSTNAME in uptown.uprough.net bbs.uprough.net; do
  if [ -f "$CADDY_CERTS/$FTP_HOSTNAME/$FTP_HOSTNAME.crt" ]; then
    echo "== staging FTPS certificate for $FTP_HOSTNAME =="
    install -m 0444 -o 1001 -g 1001 "$CADDY_CERTS/$FTP_HOSTNAME/$FTP_HOSTNAME.crt" /app/ftp-certs/
    install -m 0400 -o 1001 -g 1001 "$CADDY_CERTS/$FTP_HOSTNAME/$FTP_HOSTNAME.key" /app/ftp-certs/
  else
    echo "== no Caddy certificate for $FTP_HOSTNAME; that name will not serve TLS =="
  fi
done

# `--force-recreate` is the critical bit: without it, docker
# compose can decide the running container "matches" the spec
# hash and skip the restart even when the build produced a
# brand-new image. Result: new image sits idle, old container
# keeps serving stale code (the source of every "deploy
# succeeded but the site shows old behaviour" report).
echo "== docker compose up --force-recreate =="
# shellcheck disable=SC2086 - PROFILE_ARGS is a deliberate word list
GIT_SHA="$ACTUAL_SHA" docker compose $PROFILE_ARGS up -d --force-recreate --no-build

# Sanity check: assert the container was actually recreated
# by this build, not a leftover from an earlier run. Tighter
# than the old 600s heuristic (which silently passed any
# deploy that landed within 10 min of a prior good one).
echo "== verification =="
CREATED_AT=$(docker inspect -f '{{.Created}}' amiexpress-bbs)
CREATED_EPOCH=$(date -d "$CREATED_AT" +%s)
NOW_EPOCH=$(date +%s)
AGE=$((NOW_EPOCH - CREATED_EPOCH))
echo "Container amiexpress-bbs created: $CREATED_AT (${AGE}s ago)"
if [ "$AGE" -gt 300 ]; then
  echo "ERROR: container is ${AGE}s old (> 300s) -- --force-recreate did not take effect" >&2
  exit 1
fi

# Health endpoint must respond (proves the container actually
# started, not just got created and crashed). The entrypoint
# syncs doors, screens, and content before starting the server
# — allow up to 120s.
echo "Waiting for /health to respond..."
for i in $(seq 1 60); do
  if curl -fsS http://localhost:3001/health >/dev/null 2>&1; then
    echo "OK: /health responding after ${i}*2s"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "ERROR: /health never responded after 120s" >&2
    docker logs amiexpress-bbs --tail 100 >&2

    # Put the board back up before failing.
    #
    # Everything above this point is safe: the build happens
    # before the swap, so a build that fails leaves the running
    # container alone. This is the case that is NOT safe - the
    # image built, the container was recreated from it, and it
    # will not serve. Without this the deploy reports failure
    # and the BBS simply stays down until somebody notices,
    # which is what happened on 2026-08-30.
    if docker image inspect amiexpress-bbs:rollback >/dev/null 2>&1; then
      echo "== rolling back to the previous image ==" >&2
      docker tag amiexpress-bbs:rollback amiexpress-bbs:latest
      # Same profiles as the deploy that is being undone: rolling the board
      # back while leaving a profiled service on the failed build is exactly
      # the split state this whole mechanism exists to prevent.
      # shellcheck disable=SC2086 - PROFILE_ARGS is a deliberate word list
      GIT_SHA="rollback" docker compose $PROFILE_ARGS up -d --force-recreate --no-build || true
      for j in $(seq 1 30); do
        if curl -fsS http://localhost:3001/health >/dev/null 2>&1; then
          echo "OK: board is back up on the previous image after ${j}*2s" >&2
          break
        fi
        sleep 2
      done
      if ! curl -fsS http://localhost:3001/health >/dev/null 2>&1; then
        echo "ERROR: rollback did not come up either - the board is DOWN" >&2
      fi
    else
      echo "ERROR: no rollback image available - the board is DOWN" >&2
    fi
    exit 1
  fi
  sleep 2
done
# The doors the container is actually RUNNING must match the
# ones in the image. They live on a persistent volume, so a
# deploy updates the image and the entrypoint syncs them across
# - and when that sync silently failed, live served door code
# from an earlier deploy while every check here passed
# (2026-08-26: the video aspect fix was in the image and not in
# the running door). Compare them and say so.
# WHAT IS RUNNING MUST BE WHAT WAS JUST BUILT.
#
# Everything above proves the BOARD is new - the container's age, and /health
# answering with the deployed SHA. Nothing proved it of any OTHER service, and
# on 2026-09-13 that gap ran for three days: the WHIP bot sat behind
# `profiles: [bots]`, `docker compose build` and `up` skipped it, and the
# deploy rebuilt the board, recreated it, verified health and reported success
# while the bot kept running a three-day-old image. Its feed fix had been
# committed, tested, merged and deployed green, and was not in the process.
#
# The test that would have caught it on day one: for every RUNNING service,
# does the container's image ID still equal the ID its tag points at now? A
# tag that has moved since the container started is the definition of stale -
# something rebuilt that image and this container did not get it.
#
# Cheap, generic, and needs no JSON: `.Config.Image` is the tag the container
# was created from, `.Image` is the ID it actually runs.
echo "== running images match what was just built =="
STALE_SERVICES=""
# shellcheck disable=SC2086 - PROFILE_ARGS is a deliberate word list
for svc in $(docker compose $PROFILE_ARGS ps --services --status running 2>/dev/null); do
  [ -n "$svc" ] || continue
  # shellcheck disable=SC2086
  cid=$(docker compose $PROFILE_ARGS ps -q "$svc" 2>/dev/null | head -1)
  [ -n "$cid" ] || continue

  running_id=$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null)
  tag=$(docker inspect -f '{{.Config.Image}}' "$cid" 2>/dev/null)
  [ -n "$running_id" ] && [ -n "$tag" ] || continue

  tag_id=$(docker image inspect -f '{{.Id}}' "$tag" 2>/dev/null || true)
  # A tag that no longer exists cannot be compared; say so rather than pass.
  if [ -z "$tag_id" ]; then
    echo "  $svc: WARNING cannot resolve image tag $tag"
    continue
  fi

  if [ "$running_id" = "$tag_id" ]; then
    echo "  $svc: OK (running the current $tag)"
  else
    echo "  $svc: STALE - running ${running_id#sha256:} but $tag is now ${tag_id#sha256:}" >&2
    STALE_SERVICES="$STALE_SERVICES $svc"
  fi
done

if [ -n "$STALE_SERVICES" ]; then
  echo "ERROR: these services were not recreated from the image just built:$STALE_SERVICES" >&2
  echo "       The deploy built a new image and left them on the old one - the fix is" >&2
  echo "       in the repository and NOT in the running process. Recreate them with:" >&2
  # shellcheck disable=SC2086
  echo "       docker compose $PROFILE_ARGS up -d --force-recreate --no-build$STALE_SERVICES" >&2
  exit 1
fi

echo "== door sync verification =="
# Wait for the entrypoint to SAY it has finished, rather than
# inferring it from /health. Health answers while the sync is
# still copying, so this check used to compare a half-copied
# volume and fail a deploy that was seconds from correct.
SYNC_WAIT=0
until docker exec amiexpress-bbs test -f /app/data/bbs/.sync-complete 2>/dev/null; do
  SYNC_WAIT=$((SYNC_WAIT + 2))
  if [ "$SYNC_WAIT" -ge 180 ]; then
    echo "ERROR: code sync never completed after ${SYNC_WAIT}s" >&2
    exit 1
  fi
  sleep 2
done
echo "code sync completed at $(docker exec amiexpress-bbs cat /app/data/bbs/.sync-complete 2>/dev/null)"

# Tracked files: did the sync that protects sysop edits run?
#
# The entrypoint's own output goes to the container log, not to
# this one, so a deploy could report success while the tracked
# pass silently did nothing - and nobody would find out until a
# sysop's saved settings came back reverted. Surface it here.
echo "== tracked-file sync =="
if docker exec amiexpress-bbs test -f /app/data/bbs/.deployed-manifest; then
  TRACKED_COUNT=$(docker exec amiexpress-bbs sh -c 'wc -l < /app/data/bbs/.deployed-manifest' | tr -d ' ')
  echo "manifest: $TRACKED_COUNT files tracked"
  docker logs amiexpress-bbs 2>&1 | grep -E '\[Entrypoint\].*Tracked:' | tail -1 || true
  if [ "$TRACKED_COUNT" -lt 100 ]; then
    echo "ERROR: only $TRACKED_COUNT files tracked; Commands/ alone should be 150+" >&2
    exit 1
  fi
else
  echo "ERROR: no /app/data/bbs/.deployed-manifest - the tracked sync did not run" >&2
  docker logs amiexpress-bbs 2>&1 | tail -40 >&2
  exit 1
fi

# NO `| head` on this pipeline. head closes the pipe as soon as
# it has enough, the producer takes SIGPIPE, and under `set -o
# pipefail` that fails the whole deploy - which is exactly what
# happened the first time this check ran (exit 141), AFTER the
# container was already live and healthy.
# What actually RUNS is dist/, and the entrypoint deliberately
# strips door .ts sources from the volume afterwards
# ("production uses compiled dist/"). Comparing every file in
# the image therefore reported the stripped sources as stale
# for ever and failed three deploys on a volume that was
# correct. Compare the code that runs.
STALE=$(docker exec amiexpress-bbs sh -c '
  cd /app/default-data/Doors 2>/dev/null || exit 0
  find . -type f ! -name "*.db" ! -name "*.sqlite" ! -name "*.log" \
         ! -name "*.ts" ! -path "*/node_modules/*" |
    while IFS= read -r f; do
      cmp -s "/app/default-data/Doors/$f" "/app/data/bbs/Doors/$f" || echo "$f"
    done
' || true)
if [ -n "$STALE" ]; then
  echo "ERROR: doors on the volume differ from the image:" >&2
  printf '%s\n' "$STALE" | sed -n '1,20p' >&2
  exit 1
fi
echo "OK: doors on the volume match the image"

echo "Deploy complete: HEAD=$ACTUAL_SHA at $(date)"
