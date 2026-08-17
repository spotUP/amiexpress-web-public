/* ansi.h - buffered ANSI screen primitives for the DoorRepo door.
 *
 * Exists so doorrepo.c can render the same full-screen layout DOORMAN (the
 * TypeScript door, Doors/door-manager/app.ts) renders with blessed, without
 * a TUI library that could not exist on a real Amiga.
 *
 * EVERYTHING IS BUFFERED, AND THAT IS THE WHOLE POINT. The first version of
 * this module wrote each escape and each cell straight to ae_put(), which
 * cost roughly a hundred XIM message round trips per frame and was visibly
 * slow to redraw on every keystroke. Now a whole frame - escapes, colours,
 * box edges, text - is composed into one caller-owned buffer and handed to
 * ae_put() in a single call. One frame, one write.
 *
 * Why ANSI is safe to assume: AmiExpress is an ANSI BBS - the catalog's own
 * NAME fields carry scene ANSI art, /X's menus are ANSI, and every terminal
 * that talks to it understands CSI sequences. A sysop with a dumb terminal
 * sets Ansi=no in DoorRepo.cfg and gets the original line-at-a-time
 * renderer instead.
 *
 * Colours match DOORMAN panel for panel: white-on-blue header and footer
 * bars, a cyan-bordered list, a blue-bordered info pane, and a
 * white-on-blue selected row.
 *
 * Box drawing is plain ASCII (+ - |), NOT the Unicode DOORMAN uses: on a
 * real Amiga the terminal is topaz-8 in a Latin-1 world, where a multi-byte
 * U+2500 renders as mojibake.
 *
 * C89. No stdint.h, no snprintf.
 */

#ifndef DOORREPO_ANSI_H
#define DOORREPO_ANSI_H

/* Colour codes; values are CSI foreground numbers minus 30, so a background
 * is the same value +10. */
#define ANSI_BLACK   0
#define ANSI_RED     1
#define ANSI_GREEN   2
#define ANSI_YELLOW  3
#define ANSI_BLUE    4
#define ANSI_MAGENTA 5
#define ANSI_CYAN    6
#define ANSI_WHITE   7

/* A frame under construction. `data` is caller-owned storage; `len` is how
 * much of it is used; `cap` is its size. Once `len` would exceed `cap` the
 * buffer stops accepting output and sets `overflow` rather than writing past
 * the end - a truncated frame is a cosmetic fault, a smashed stack is not. */
typedef struct {
    char *data;
    long len;
    long cap;
    int overflow;
} ansi_buf;

/* Binds a buffer to caller storage and empties it. */
void ansi_begin(ansi_buf *b, char *storage, long capacity);

/* Writes the composed frame out in one ae_put() call and empties the
 * buffer. Safe to call on an empty buffer (does nothing). */
void ansi_flush(ansi_buf *b);

/* Clears the whole screen and homes the cursor. */
void ansi_clear(ansi_buf *b);

/* Moves the cursor. Rows and columns are 1-based, as in the escape itself. */
void ansi_goto(ansi_buf *b, int row, int col);

/* Sets foreground/background. Pass -1 for background to leave it at the
 * terminal default; `bold` brightens the foreground. */
void ansi_color(ansi_buf *b, int fg, int bg, int bold);

/* Restores the terminal's default attributes. Always emit this before
 * handing control back to the BBS. */
void ansi_reset(ansi_buf *b);

/* Hides/shows the hardware cursor. */
void ansi_cursor(ansi_buf *b, int visible);

/* Writes `text` at (row, col), truncated to `maxlen` columns and padded
 * with spaces to exactly that width, so a row always overwrites whatever
 * was under it without a separate clearing pass.
 *
 * Control bytes are replaced with spaces. High-bit Latin-1 passes through
 * untouched (one byte per column), which is what carries the catalog's
 * scene art. */
void ansi_text(ansi_buf *b, int row, int col, const char *text, int maxlen);

/* Same, but does NOT pad - use where trailing cells must keep their
 * existing contents. */
void ansi_text_raw(ansi_buf *b, int row, int col, const char *text, int maxlen);

/* Fills `width` columns at (row, col) with spaces in the given colours. */
void ansi_fill(ansi_buf *b, int row, int col, int width, int fg, int bg);

/* Draws a single-line ASCII box. `label`, when non-NULL and non-empty, is
 * written into the top edge as " label ", where blessed puts a panel label. */
void ansi_box(ansi_buf *b, int top, int left, int height, int width, int fg, const char *label);

/* Writes `text` centred within `width` columns starting at (row, col). */
void ansi_center(ansi_buf *b, int row, int col, int width, const char *text);

#endif /* DOORREPO_ANSI_H */
