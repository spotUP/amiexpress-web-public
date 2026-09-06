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
 *
 * LIFTED, not rewritten, from examples/doorrepo-c/ansi.h - the module a real
 * C door has been drawing with. One change: ansi_flush() no longer calls
 * ae_put() itself. A library cannot own the board connection (that is
 * ae_session's job now), so the caller says where a finished frame goes -
 * ui_screen_flush() hands it to the session, and a test hands it to a
 * buffer it can read back.
 */

#ifndef UI_ANSI_H
#define UI_ANSI_H

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
    /* What ansi_color() last wrote, so it can skip repeating itself. A
     * captured session showed 19 of 25 colour sequences in one screen
     * paint asking for the colour already in effect. -1 means "unknown",
     * which is the state at the start of every frame and after any reset:
     * the terminal may have been changed by something else in between, so
     * the next colour is always written. */
    int last_fg;
    int last_bg;
    int last_bold;
    /** Reverse video as last emitted; -1 after a reset, so it re-emits. */
    int last_reverse;
    /**
     * A cell on this terminal may carry its own background colour.
     *
     * 1 for an ANSI terminal, 0 for a C64: the VIC-II has one screen
     * background and per-cell background is dropped on the way out
     * (sdk/petscii/ansi-to-petscii.ts). Where it is 0, ansi_color() paints
     * "ink on a coloured bar" as REVERSE VIDEO in the bar's colour, which
     * is the same picture by the only means a C64 has.
     *
     * It lives here, on the writer, rather than in each widget: a bar, a
     * status line, a box label and a selected row all have the same
     * problem, and one of them remembering to handle it is how five of the
     * seven themes ended up drawing a black bar on a black screen.
     */
    int cell_backgrounds;
} ansi_buf;

/* Binds a buffer to caller storage and empties it. */
void ansi_begin(ansi_buf *b, char *storage, long capacity);

/* Writes the composed frame out in one ae_put() call and empties the
 * buffer. Safe to call on an empty buffer (does nothing). */
/** Where a finished frame goes: the board, or a test's buffer. */
typedef void (*ansi_sink_fn)(void *context, const char *bytes, long len);

void ansi_flush(ansi_buf *b, ansi_sink_fn sink, void *context);

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

/* Say whether this terminal's cells can carry a background (see the field).
 * Call once, after ansi_begin, from whatever knows the screen. */
void ansi_set_cell_backgrounds(ansi_buf *b, int can);

/* Reverse video on or off (SGR 7 / 27).
 *
 * The highlight a C64 has. Per-cell BACKGROUND is dropped on the way to a
 * PETSCII caller - the VIC-II has one screen background - so a selected row
 * painted as a coloured bar arrives with nothing marking it at all. These
 * two reach the caller as $12 and $92 (sdk/petscii/ansi-to-petscii.ts). */
void ansi_reverse(ansi_buf *b, int on);

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

/* ansi_box that paints its interior first, so a dialog drawn over the
 * browser hides what is behind it instead of letting it read through. */
void ansi_panel(ansi_buf *b, int top, int left, int height, int width,
                int fg, int bg, const char *label);

/* Writes `text` centred within `width` columns starting at (row, col). */
void ansi_center(ansi_buf *b, int row, int col, int width, const char *text);

#endif /* UI_ANSI_H */
