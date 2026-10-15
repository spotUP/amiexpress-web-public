# Which door files on the volume differ from the image the board just booted.
#
# The deploy asks this after the entrypoint's Doors sync, to prove the code
# that runs is the code that was built. It must hold back exactly what the
# sync holds back: a door's cfg and art files once the sysop has saved them,
# and the state a 68K door writes beside its binary (the dRE wall, the MRC
# roster, high scores). Those are the BOARD's, so they differ from the image
# by design. The check compared everything, and on 2026-09-28 it failed a
# healthy deploy (rc=1) over Bulls.CFG, the REQUESTS header and tail, and the
# wall's own posts - a gate that cries wolf is a gate that gets ignored.
#
# The list is not repeated here: the entrypoint writes the one it gave tar
# to `<board>/.door-sync-excludes`, and this reads that file.
#
# It lives in its own file so it can be tested: `web/backend/tests/deploy/
# the-door-check-skips-what-the-board-owns.test.ts` drives it on temp trees.
#
# Usage:  doors_differing_from_image <image Doors dir> <volume Doors dir> [excludes file]
# Prints: one `./door/file` per differing file; nothing when they match.
# A subshell body, so the `cd` below never moves the caller.
doors_differing_from_image() (
  IMAGE_DOORS=$1
  VOLUME_DOORS=$2
  EXCLUDES=${3:-/dev/null}
  [ -f "$EXCLUDES" ] || EXCLUDES=/dev/null

  cd "$IMAGE_DOORS" 2>/dev/null || return 0
  # What actually RUNS is dist/, and the entrypoint strips door .ts sources
  # from the volume afterwards, so sources are not compared. Databases, logs
  # and `*/data/*` are runtime data the sync never writes (its own excludes).
  find . -type f ! -name "*.db" ! -name "*.sqlite" ! -name "*.log" \
         ! -name "*.ts" ! -path "*/node_modules/*" ! -path "*/data/*" |
    while IFS= read -r f; do
      owned=false
      while IFS= read -r pattern; do
        [ -n "$pattern" ] || continue
        # tar's patterns are globs over the same `./door/file` spelling.
        # shellcheck disable=SC2254
        case "$f" in $pattern) owned=true; break ;; esac
      done < "$EXCLUDES"
      [ "$owned" = "true" ] && continue
      cmp -s "$IMAGE_DOORS/$f" "$VOLUME_DOORS/$f" || echo "$f"
    done
)
