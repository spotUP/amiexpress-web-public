/* ansi.c - see ansi.h for the interface contract and the reasoning behind
 * buffering, ASCII box drawing, and the DOORMAN-matched palette.
 *
 * C89: no snprintf, so integers are formatted by hand. Every append goes
 * through put_char()/put_str(), which are the only places that touch the
 * buffer bounds - so the overflow check exists once rather than at each of
 * the dozen call sites.
 */

#include <string.h>
#include "ansi.h"
#include "aedoor.h"

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
}

void ansi_flush(ansi_buf *b)
{
    if (b->len <= 0) {
        return;
    }
    b->data[b->len] = '\0';
    ae_put(b->data, 0);
    b->len = 0;
    b->overflow = 0;
}

void ansi_clear(ansi_buf *b)
{
    put_str(b, "\033[2J\033[H");
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

void ansi_reset(ansi_buf *b)
{
    put_str(b, "\033[0m");
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
