#!/usr/bin/env bash
#
# The Board Changes bulletin (bull10): what each deploy changed, newest first.
#
# The sysop, 2026-10-05: "we could have a changelogs bulletin that gets
# updated on every deploy in the bbs". The commit history is on the HOST, in
# the checkout deploy.sh has just reset - the container has no git - so the
# section is written here and handed to the board.
#
# Every commit goes in except the board's own housekeeping - `test`, `docs`,
# `chore`, `ci`, `build`, `style` and `refactor` - with a conventional prefix
# (`fix(screens): `) taken off. An untagged commit is a change too: listing
# only feat/fix/perf left those out (sysop, 2026-10-06, "fix it").
#
# Sourced by deploy.sh for `changelog_update`; `changelog_section` and
# `changelog_merge` are pure (text in, text out) so they can be tested
# against a scratch repository.

CHANGELOG_WIDTH=72
CHANGELOG_MAX_LINES=300
CHANGELOG_FIRST_RUN_COMMITS=30

# changelog_section <repo> <from-sha|""> <to-sha> <date-label>
# One dated section for the commits after <from> up to <to>; nothing at all
# when every one of them is housekeeping.
changelog_section() {
  local repo="$1" from="$2" to="$3" when="$4" range subjects
  if [ -n "$from" ] && git -C "$repo" cat-file -e "${from}^{commit}" 2>/dev/null; then
    range="${from}..${to}"
  else
    range="-n ${CHANGELOG_FIRST_RUN_COMMITS} ${to}"
  fi
  # shellcheck disable=SC2086
  subjects=$(git -C "$repo" log --no-merges --format='%s' $range \
    | grep -vE '^(test|tests|docs|chore|ci|build|style|refactor)(\([^)]*\))?!?: ' \
    | sed -E 's/^[a-z]+(\([^)]*\))?!?: //' || true)
  [ -n "$subjects" ] || return 0
  printf ' %s  deploy %s\n' "$when" "$(git -C "$repo" rev-parse --short=9 "$to")"
  printf '%s\n' "$subjects" | while IFS= read -r subject; do
    printf '%s\n' "$subject" | fold -s -w "$CHANGELOG_WIDTH" | awk 'NR==1 { print "   - " $0; next } { print "     " $0 }'
  done
  printf '\n'
}

# changelog_merge <new-section> <old-bulletin>
# The heading, the new section, then the older sections - capped, oldest
# lines dropped first.
changelog_merge() {
  local section="$1" old="$2" body
  body=$(printf '%s' "$old" | awk 'started { print } /^-{20,}$/ && !started { started = 1 }')
  {
    printf '\n  BOARD CHANGES - what changed on the board, newest first\n'
    printf '%s\n' "$(printf '%*s' 76 '' | tr ' ' '-')"
    printf '%s' "$section"
    printf '%s\n' "$body"
  } | head -n "$CHANGELOG_MAX_LINES"
}

# changelog_update <repo> <to-sha>
# Run by deploy.sh once the new container is up: reads the last sha the
# bulletin covered off the volume, writes the bulletin and the new sha back.
changelog_update() {
  local repo="$1" to="$2" dir=/app/data/bbs/Bulletins from old section
  from=$(docker exec amiexpress-bbs cat "$dir/.changelog-sha" 2>/dev/null || true)
  [ "$from" = "$to" ] && return 0
  old=$(docker exec amiexpress-bbs cat "$dir/bull10.txt" 2>/dev/null || true)
  section=$(changelog_section "$repo" "$from" "$to" "$(date +%m-%d-%y)")
  if [ -n "$section" ]; then
    changelog_merge "$section
" "$old" | docker exec -i -u 1001 amiexpress-bbs sh -c "cat > '$dir/bull10.txt'"
  fi
  printf '%s' "$to" | docker exec -i -u 1001 amiexpress-bbs sh -c "cat > '$dir/.changelog-sha'"
}
