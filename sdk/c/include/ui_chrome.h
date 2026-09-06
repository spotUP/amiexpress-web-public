/*
 * ui_chrome - the three bars a door wears: masthead, footer, status.
 *
 * A door's screen is a list in the middle and bars around it. The bars are
 * where doors have historically drifted apart, because each one hand-rolled
 * its own width arithmetic and its own truncation, and the failures are not
 * cosmetic: DoorRepo's footer once dropped Q=Quit on any row that had ads
 * AND a doc, because it concatenated everything and cut at `cols`.
 *
 * So the width budget lives here, and it has one guarantee: the SUFFIX is
 * never dropped. A narrow screen loses optional keys, highest priority
 * first, and never the one that gets you out.
 */

#ifndef UI_CHROME_H
#define UI_CHROME_H

#include "ui_ansi.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Build a footer line that fits `cols`.
 *
 * `prefix` and `suffix` are mandatory - the suffix is appended whatever the
 * width, which is the "never silently drop Q=Quit" rule. `optional` is in
 * PRIORITY ORDER: the first part that does not fit stops the loop, and
 * later parts are not tried in its place, because a shorter part appearing
 * where a longer higher-priority one was dropped would invert the ordering
 * the caller expressed.
 *
 * Returns the length written, or -1 when `out` is too small - which is a
 * programming error, not a narrow screen.
 *
 * Lifted from examples/doorrepo-c/flow.c:1887, where it has been the rule
 * for DoorRepo's footer.
 */
int ui_footer_build(char *out, unsigned long cap, int cols,
                    const char *prefix,
                    const char *const *optional, int optional_count,
                    const char *suffix);

/**
 * Draw a full-width bar: `text` on the left, the rest filled with the bar's
 * colour so it reads as one band rather than a coloured word.
 */
void ui_bar_draw(ansi_buf *b, int row, int left, int cols,
                 const char *text, int fg, int bg);

/**
 * The masthead: a title on the left and the theme's rail filling the row.
 *
 * The rail is branding, not information, so it is what gets cut when the
 * row is narrow - never the title. A rail of "" draws a plain bar, which is
 * what `classic` (and any 40-column caller) gets.
 */
void ui_masthead_draw(ansi_buf *b, int row, int left, int cols,
                      const char *title, const char *rail, int fg, int bg);

/**
 * One window onto the rail's stream, `width` cells of it, `offset` along.
 *
 * A 1:1 port of railStream() in sdk/engines/ui/theme/chrome.ts, down to the
 * generator: state = state * 1664525 + 1013904223 (mod 2^32), runs of 2 to 8
 * marks separated by 1 to 3 spaces, a ring at least twice the width and
 * never shorter than 64, doubled so a window near the end wraps cleanly.
 *
 * Same seed, same bytes - which is the point. The masthead a C door draws
 * has to be the masthead a TypeScript door draws, or the board has two
 * brandings (sysop, 2026-09-06: "reference the blessed sdk and do it 1:1").
 * tests/test_ui_chrome.c pins the C output against strings taken from the
 * TypeScript.
 *
 * A rail of "///" is not tiled: the movement people see is the GAPS
 * travelling, which is what a stream has and a repeated pattern does not.
 */
void ui_rail_stream(const char *rail, int width, int offset,
                    unsigned long seed, char *out, unsigned long cap);

/**
 * The same masthead, with the rail shifted `tick` cells along.
 *
 * One frame of the slide the TypeScript chrome runs (railFrame(),
 * engines/ui/theme/chrome.ts): the period is the rail's own length, so no
 * frame is ever empty - a gap reads as the branding having broken rather
 * than as movement. `tick` 0 is what ui_masthead_draw draws.
 *
 * A door calls this from its idle hook (ui_key.h) because a 68K door has no
 * timers; every frame costs an XIM message, so a tick of four or five a
 * second is the sensible rate, not twenty.
 */
void ui_masthead_draw_tick(ansi_buf *b, int row, int left, int cols,
                           const char *title, const char *rail,
                           int fg, int bg, int tick);

/**
 * The status line: left text, right text, and the gap between them filled.
 *
 * The right side is dropped rather than overlapped when both cannot fit -
 * two strings colliding mid-row is the shape a caller reads as corruption.
 */
void ui_status_draw(ansi_buf *b, int row, int left, int cols,
                    const char *left_text, const char *right_text,
                    int fg, int bg);

#ifdef __cplusplus
}
#endif

#endif /* UI_CHROME_H */
