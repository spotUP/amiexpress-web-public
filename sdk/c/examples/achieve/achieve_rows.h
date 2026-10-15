/*
 * The rows ACHIEVE prints, apart from the door that prints them.
 *
 * Extracted from achieve.c so a host test can assert them (the pattern
 * `examples/subs/subs_scan.c` already uses), and because they are half of
 * backlog 4.13: these strings must equal the ones `Doors/achieve/app.ts`
 * builds for the same data at the same width. The fixture both sides read is
 * `tests/fixtures/achieve-rows.listing`; the strings both must produce are
 * `tests/fixtures/achieve-rows.golden`.
 *
 * WHAT PARITY COVERS (sysop's call, 2026-09-15, option 3): the scoreboard
 * rows, the catalogue rows, and the menu labels for the views both doors
 * have. Written exemptions, because the C door cannot do them at all:
 *
 *   - The PROFILE view. The twin's `profileLines` needs a per-caller profile;
 *     this door has no account flow (see achieve.c's header) and no menu
 *     entry for one.
 *   - The ACCOUNT states. The twin says "linked as <handle>" / "link this
 *     board"; this door says where that flow lives.
 *   - The UNLOCKED MARK on a catalogue row. The twin marks what the caller
 *     has unlocked; this door has no caller identity, so its mark is always
 *     the twin's not-unlocked space, and the fixture is rendered with an
 *     empty unlocked set.
 *   - The catalogue's `== FAMILY ==` grouping lines, and the leaderboard's
 *     two heading lines. This door draws a titled widget, not a line list;
 *     parity is on the ROWS, which is where a format drifts.
 */

#ifndef ACHIEVE_ROWS_H
#define ACHIEVE_ROWS_H

#define ACHIEVE_FIELDS_MAX 10
#define ACHIEVE_ROWS_MAX   256

/** One parsed row: pointers into the listing buffer, which must stay put. */
typedef struct {
    const char *field[ACHIEVE_FIELDS_MAX];
    int fields;
} achieve_row;

typedef struct {
    achieve_row row[ACHIEVE_ROWS_MAX];
    int count;
} achieve_rows;

/**
 * Split a listing in place: `|`-separated fields, CRLF or LF, the
 * `ACHIEVE|1|<revision>|<count>` header consumed.
 *
 * A conforming parser IGNORES trailing fields it does not know, which is what
 * makes the format append-only, so a row with more than ACHIEVE_FIELDS_MAX
 * fields keeps the extra ones inside the last field rather than being
 * refused. `listing` is MODIFIED (separators become NULs).
 */
void achieve_rows_split(char *listing, achieve_rows *out);

/** "" for anything out of range, never NULL. */
const char *achieve_rows_field(const achieve_rows *rows, int row, int index);

/**
 * Clip to the panel, never fold - a folded row eats the row underneath it.
 * The twin's `clip()`: too long becomes `width - 1` characters and a `~`.
 */
const char *achieve_clip(const char *text, int width, char *buf, unsigned long size);

/**
 * The menu labels, in the twin's own words (`app.ts menuItems`). `wide` is
 * an 80-column caller, 0 a 40-column one. Indexes are this door's menu, which
 * has no profile entry; see the exemptions above.
 */
const char *achieve_menu_row(int index, int wide);

/** `<rank>|<handle>|<points>|<unlocks>`, as `leaderboardLines` prints it. */
const char *achieve_board_row(const achieve_rows *rows, int index, int wide,
                              char *buf, unsigned long size);

/**
 * `<id>|<family>|<tier>|<points>|<hidden>|<name>|<description>|...`, as
 * `catalogLines` prints one achievement.
 */
const char *achieve_catalog_row(const achieve_rows *rows, int index, int wide,
                                char *buf, unsigned long size);

#endif
