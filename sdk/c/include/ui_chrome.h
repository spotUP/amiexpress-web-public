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
