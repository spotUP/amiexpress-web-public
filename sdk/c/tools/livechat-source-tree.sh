#!/bin/sh
# Stage LiveChat68's portable source tree: the door, the C SDK files it needs,
# a standalone Makefile, LICENSE and PORTING.txt. The same tree goes into the
# release LHA (LiveChat68/src) and into the public repo spotUP/livechat68.
#
#   tools/livechat-source-tree.sh <out-dir>
#
# The file set is an allow-list. Nothing board-specific, no LIVECHAT.cfg, no
# keys. The tree is scanned before it is accepted (see the checks at the end).
set -eu

cd "$(dirname "$0")/.."
OUT=${1:?usage: livechat-source-tree.sh <out-dir>}
TPL=tools/release/livechat-src

SRC_C="ae_host ui_cells ae_chat ae_request ae_http ae_net ae_net_tls json_lite
ae_dos ae_session ae_session_bbs ae_board_screen ae_usernote ae_chatprefs
ui_ansi ui_chrome ui_key ui_input ui_list ui_profile ui_screen ui_theme
ae_transport_amiga ae_dos_amiga ae_chunk ae_field_shape
ae_transport_native ae_dos_native"
SRC_OTHER="ae_net_internal.h ui_cells_68k.s"
HEADERS="aedoor.h ae_board_screen.h ae_chat.h ae_chatprefs.h ae_chunk.h ae_dos.h
ae_field_shape.h ae_host.h ae_http.h ae_net.h ae_request.h ae_session.h
ae_transport_native.h ae_usernote.h json_lite.h theme_tables.h ui_ansi.h
ui_cells.h ui_chrome.h ui_input.h ui_key.h ui_list.h ui_profile.h ui_screen.h
ui_theme.h"
DOOR="livechat.c livechat_ui.c livechat_ui.h"
TESTS="test_chat.c test_livechat_ui.c stub_server.c stub_server.h"
FIXTURES="lc68-ts-main-80x25.grid lc68-ts-main-40x25.grid lc68-ts-main-80x15.grid lc68-ts-colour-map.txt"

rm -rf "$OUT"
mkdir -p "$OUT/src" "$OUT/include" "$OUT/examples/livechat" "$OUT/tests/fixtures"
for f in $SRC_C; do cp "src/$f.c" "$OUT/src/"; done
for f in $SRC_OTHER; do cp "src/$f" "$OUT/src/"; done
for f in $HEADERS; do cp "include/$f" "$OUT/include/"; done
for f in $DOOR; do cp "examples/livechat/$f" "$OUT/examples/livechat/"; done
for f in $TESTS; do cp "tests/$f" "$OUT/tests/"; done
for f in $FIXTURES; do cp "tests/fixtures/$f" "$OUT/tests/fixtures/"; done
cp "$TPL/Makefile" "$TPL/LICENSE" "$TPL/PORTING.txt" "$TPL/README.md" "$OUT/"
cp ../../board/Doors/LIVECHAT68/LIVECHAT.cfg.example "$OUT/"

# Refuse anything that must never be published.
bad=$(find "$OUT" \( -iname 'LIVECHAT.cfg' -o -iname '.env*' -o -iname 'MailLock' \
  -o -iname '*.pem' -o -iname '*.key' \) -print)
if [ -n "$bad" ]; then echo "livechat-source-tree: refused, found: $bad" >&2; exit 1; fi
if grep -ril 'reference-board' "$OUT" >/dev/null 2>&1; then
  echo "livechat-source-tree: refused, reference-board reference in: $(grep -ril reference-board "$OUT")" >&2
  exit 1
fi
if grep -rlE '/Users/|/home/[a-z]' "$OUT" >/dev/null 2>&1; then
  echo "livechat-source-tree: refused, a local home path in: $(grep -rlE '/Users/|/home/[a-z]' "$OUT")" >&2
  exit 1
fi
if grep -rlE '[A-Za-z0-9_-]+\.[A-Fa-f0-9]{32,}' "$OUT" >/dev/null 2>&1; then
  echo "livechat-source-tree: refused, looks like a board key in: $(grep -rlE '[A-Za-z0-9_-]+\.[A-Fa-f0-9]{32,}' "$OUT")" >&2
  exit 1
fi
echo "livechat-source-tree: staged $(find "$OUT" -type f | wc -l | tr -d ' ') files in $OUT"
