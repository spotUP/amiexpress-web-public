/* ansi.c - see ansi.h for the interface contract and the reasoning behind
 * buffering, ASCII box drawing, and the DOORMAN-matched palette.
 *
 * C89: no snprintf, so integers are formatted by hand. Every append goes
 * through put_char()/put_str(), which are the only places that touch the
 * buffer bounds - so the overflow check exists once rather than at each of
 * the dozen call sites.
 */

#include <string.h>
#include "ui_ansi.h"

static void put_char(ansi_buf *b, char c)
{
    if (b->overflow) {
        return;
    }
    if (b->len + 1 >= b->cap) {
        b->overflow = 1;
        return;
    }
    b->data[b->len++] = c;
}

static void put_str(ansi_buf *b, const char *s)
{
    while (*s != '\0') {
        put_char(b, *s++);
    }
}

/* Appends a non-negative int in decimal. Values here are screen coordinates
 * and colour codes; a negative one would be a programming error and is
 * clamped to 0 rather than emitting a '-' that would corrupt the escape
 * sequence and everything the terminal read after it. */
static void put_int(ansi_buf *b, int value)
{
    char tmp[12];
    int i;

    if (value < 0) {
        value = 0;
    }
    i = 0;
    if (value == 0) {
        tmp[i++] = '0';
    }
    while (value > 0) {
        tmp[i++] = (char) ('0' + (value % 10));
        value /= 10;
    }
    while (i > 0) {
        put_char(b, tmp[--i]);
    }
}

void ansi_begin(ansi_buf *b, char *storage, long capacity)
{
    b->data = storage;
    b->len = 0;
    b->cap = capacity;
    b->overflow = 0;
    /* Nothing is known about the terminal's colour at the start of a frame:
     * the BBS may have written between this frame and the last. */
    b->last_fg = -1;
    b->last_bg = -1;
    b->last_bold = -1;
    b->last_reverse = -1;
}

void ansi_flush(ansi_buf *b, ansi_sink_fn sink, void *context)
{
    if (b->len <= 0) {
        return;
    }
    b->data[b->len] = '\0';
    /* Whoever owns the connection writes it. In doorrepo-c this called
       ae_put() directly; a library cannot, because the session is the
       caller's (include/ae_session.h) and a test needs somewhere else for
       the bytes to go. */
    if (sink) sink(context, b->data, b->len);
    b->len = 0;
    b->overflow = 0;
}

void ansi_clear(ansi_buf *b)
{
    /* The reset is not decoration: ESC[2J erases using the CURRENT
     * background colour, so clearing while a coloured bar's attributes are
     * still set paints the WHOLE screen in that colour. Reported from the
     * live BBS as "answer N at the install prompt and the background goes
     * blue" - the confirm bar is white-on-blue, and the redraw that followed
     * inherited it. Prompts restore their own colours too (that is where the
     * ownership belongs), but clearing is the operation that turns a stray
     * attribute into a full-screen one, so it defends itself. */
    put_str(b, "\033[0m\033[2J\033[H");
    b->last_fg = -1;
    b->last_bg = -1;
    b->last_bold = -1;
    b->last_reverse = -1;
}

void ansi_goto(ansi_buf *b, int row, int col)
{
    put_str(b, "\033[");
    put_int(b, row);
    put_char(b, ';');
    put_int(b, col);
    put_char(b, 'H');
}

void ansi_color(ansi_buf *b, int fg, int bg, int bold)
{
    /* Already showing exactly this? Then the sequence is bytes for
     * nothing - and on this door bytes are milliseconds, because every
     * 198 of them is an XIM message costing about 45ms of 68K emulation. */
    if (b->last_fg == fg && b->last_bg == bg && b->last_bold == (bold ? 1 : 0)) {
        return;
    }
    b->last_fg = fg;
    b->last_bg = bg;
    b->last_bold = bold ? 1 : 0;

    put_str(b, "\033[");
    put_int(b, bold ? 1 : 0);
    put_char(b, ';');
    put_int(b, 30 + fg);
    if (bg >= 0) {
        put_char(b, ';');
        put_int(b, 40 + bg);
    }
    put_char(b, 'm');
}

void ansi_reverse(ansi_buf *b, int on)
{
    if (!b) return;
    if (b->last_reverse == (on ? 1 : 0)) return;
    b->last_reverse = on ? 1 : 0;
    put_str(b, on ? "\033[7m" : "\033[27m");
}

void ansi_reset(ansi_buf *b)
{
    put_str(b, "\033[0m");
    /* The terminal is back to defaults; nothing is known about its colour
     * any more, so the next ansi_color() must write itself out. */
    b->last_fg = -1;
    b->last_bg = -1;
    b->last_bold = -1;
    b->last_reverse = -1;
}

void ansi_cursor(ansi_buf *b, int visible)
{
    put_str(b, visible ? "\033[?25h" : "\033[?25l");
}

static void write_text(ansi_buf *b, int row, int col, const char *text, int maxlen, int pad)
{
    int n;

    if (maxlen <= 0) {
        return;
    }
    ansi_goto(b, row, col);
    n = 0;
    while (text[n] != '\0' && n < maxlen) {
        char c = text[n];
        /* Control bytes become spaces: high-bit Latin-1 art passes through
         * one byte per column, but a raw ESC or CR from the server would
         * move the cursor and corrupt the entire layout. A line-at-a-time
         * renderer can forward those; a cursor-addressed one cannot. */
        put_char(b, (c >= 0 && c < 32) ? ' ' : c);
        n++;
    }
    if (pad) {
        while (n < maxlen) {
            put_char(b, ' ');
            n++;
        }
    }
}

void ansi_text(ansi_buf *b, int row, int col, const char *text, int maxlen)
{
    write_text(b, row, col, text, maxlen, 1);
}

void ansi_text_raw(ansi_buf *b, int row, int col, const char *text, int maxlen)
{
    write_text(b, row, col, text, maxlen, 0);
}

void ansi_fill(ansi_buf *b, int row, int col, int width, int fg, int bg)
{
    int i;

    if (width <= 0) {
        return;
    }
    ansi_color(b, fg, bg, 0);
    ansi_goto(b, row, col);
    for (i = 0; i < width; i++) {
        put_char(b, ' ');
    }
}

/* A box that HIDES what is behind it.
 *
 * ansi_box() draws a frame and nothing else, which is right on a screen
 * that was just cleared and wrong for a dialog: the "Not installed" notice
 * opened over the browser and the archive list and the ANSI art behind it
 * read straight through the middle of it (screenshot, 2026-08-31).
 *
 * Painting the rectangle first is the whole difference. Every overlay wants
 * it, so it lives here rather than as a fill loop copied into each caller -
 * and a caller that draws on a cleared screen keeps using ansi_box, which
 * writes fewer bytes down a modem line.
 */
void ansi_panel(ansi_buf *b, int top, int left, int height, int width,
                int fg, int bg, const char *label)
{
    int row;

    if (width < 2 || height < 2) {
        return;
    }
    for (row = 0; row < height; row++) {
        ansi_fill(b, top + row, left, width, fg, bg);
    }
    ansi_box(b, top, left, height, width, fg, label);
}

void ansi_box(ansi_buf *b, int top, int left, int height, int width, int fg, const char *label)
{
    int i;
    int inner;
    int labellen;

    if (width < 2 || height < 2) {
        return;
    }
    inner = width - 2;
    labellen = 0;
    if (label != (const char *) 0) {
        labellen = (int) strlen(label);
        if (labellen > inner - 3) {
            labellen = inner - 3;
        }
        if (labellen < 0) {
            labellen = 0;
        }
    }

    ansi_color(b, fg, -1, 0);

    /* Top edge, with the label written into it the way blessed does. */
    ansi_goto(b, top, left);
    put_char(b, '+');
    if (labellen > 0) {
        put_char(b, '-');
        put_char(b, ' ');
        for (i = 0; i < labellen; i++) {
            put_char(b, label[i]);
        }
        put_char(b, ' ');
        for (i = labellen + 3; i < inner; i++) {
            put_char(b, '-');
        }
    } else {
        for (i = 0; i < inner; i++) {
            put_char(b, '-');
        }
    }
    put_char(b, '+');

    /* Sides only - the interior is written by whoever owns it, so redrawing
     * the frame never erases the content inside it. */
    for (i = 1; i < height - 1; i++) {
        ansi_goto(b, top + i, left);
        put_char(b, '|');
        ansi_goto(b, top + i, left + width - 1);
        put_char(b, '|');
    }

    ansi_goto(b, top + height - 1, left);
    put_char(b, '+');
    for (i = 0; i < inner; i++) {
        put_char(b, '-');
    }
    put_char(b, '+');
}

void ansi_center(ansi_buf *b, int row, int col, int width, const char *text)
{
    int len;
    int pad;

    len = (int) strlen(text);
    if (len > width) {
        len = width;
    }
    pad = (width - len) / 2;
    ansi_text_raw(b, row, col + pad, text, len);
}
