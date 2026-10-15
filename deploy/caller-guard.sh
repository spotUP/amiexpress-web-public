# Who is on the board that a deploy must not throw off.
#
# Recreating the container ends every session, so the deploy refuses while
# callers are on. The sysop testing his own fix is NOT one of them: counting
# him cost an evening on 2026-09-08 - every push run refused with exit 78, the
# image was rebuilt each time, the container was never recreated, and the fix
# sat unshipped while he asked "deployed?" four times. His words: "its always
# ok to force when spot or the sysop is online."
#
# It lives here rather than inside the workflow's inline script so it can be
# tested: `web/backend/tests/deploy/the-caller-guard-lets-the-sysop-through.test.ts`
# drives this file with real /health payloads.
#
# Usage:  callers_to_protect '<health json>' ['name1 name2']
# Prints: the number of callers who are NOT the sysop. 0 means deploy.
callers_to_protect() {
  HEALTH=${1:-}
  SYSOP_NAMES=${2:-spot sysop discord-bridge}

  CALLERS=$(printf '%s' "$HEALTH" | sed -n 's/.*"callers":\([0-9]*\).*/\1/p')
  CALLERS=${CALLERS:-0}
  [ "$CALLERS" -gt 0 ] 2>/dev/null || { echo 0; return 0; }

  ONLINE=$(printf '%s' "$HEALTH" | tr ',' '\n' | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')

  NAMED=0
  OTHERS=0
  for WHO in $ONLINE; do
    NAMED=$((NAMED + 1))
    IS_SYSOP=false
    for NAME in $SYSOP_NAMES; do
      if [ "$(printf '%s' "$WHO" | tr 'A-Z' 'a-z')" = "$(printf '%s' "$NAME" | tr 'A-Z' 'a-z')" ]; then
        IS_SYSOP=true
      fi
    done
    [ "$IS_SYSOP" = "true" ] || OTHERS=$((OTHERS + 1))
  done

  # An FTP caller holds a node with no session, so `callers` can exceed the
  # names /health lists. Anyone unnamed counts as somebody to protect: the
  # guard fails SAFE, and only a board whose every named caller is the sysop
  # deploys through it.
  UNNAMED=$((CALLERS - NAMED))
  [ "$UNNAMED" -gt 0 ] && OTHERS=$((OTHERS + UNNAMED))

  echo "$OTHERS"
}
