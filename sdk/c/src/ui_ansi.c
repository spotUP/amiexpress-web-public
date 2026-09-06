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
    /* Not -1: the frame opens with SGR 0, which clears reverse, so it is
       KNOWN to be off. Leaving it unknown put a redundant ESC[27m at the
       head of every 80-column frame. */
    b->last_reverse = 0;
    /* An ANSI terminal until something says otherwise, which is what every
       existing caller has always been. */
    b->cell_backgrounds = 1;
    b->palette = 0;
    b->palette_idx = 0;
    b->palette_len = 0;
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
    /* Not -1: the frame opens with SGR 0, which clears reverse, so it is
       KNOWN to be off. Leaving it unknown put a redundant ESC[27m at the
       head of every 80-column frame. */
    b->last_reverse = 0;
}

void ansi_goto(ansi_buf *b, int row, int col)
{
    put_str(b, "\033[");
    put_int(b, row);
    put_char(b, ';');
    put_int(b, col);
    put_char(b, 'H');
}

/** The exact colour for a token, or -1 for "not one, or no palette". */
static long token_rgb(const ansi_buf *b, int colour)
{
    int n = colour - UI_TOKEN_BASE;

    if (colour < UI_TOKEN_BASE) return -1;
    if (!b->palette || n < 0 || n >= b->palette_len) return -1;
    return (long) b->palette[n];
}

static void put_rgb(ansi_buf *b, int lead, unsigned long rgb)
{
    put_int(b, lead);
    put_str(b, ";2;");
    put_int(b, (int) ((rgb >> 16) & 0xff));
    put_char(b, ';');
    put_int(b, (int) ((rgb >> 8) & 0xff));
    put_char(b, ';');
    put_int(b, (int) (rgb & 0xff));
}

void ansi_color(ansi_buf *b, int fg, int bg, int bold)
{
    int pen;
    int want_reverse = 0;
    /* What the CALLER asked for, which is what the cache remembers. Two
       tokens can share a sixteen-colour fallback and still be different
       colours - quiet-phosphor's accent and ink both fall back to 10 - so
       comparing the collapsed value made the second one a no-op and the
       masthead's title came out in the rail's colour. */
    int want_fg = fg;
    int want_bg = bg;

    long fg_rgb = token_rgb(b, fg);
    long bg_rgb = token_rgb(b, bg);

    /* A token with no truecolour behind it still has to be a colour: the
       theme's own nearest-of-sixteen for that token. Without this a door
       that named a token on a plain terminal asked for colour 106. */
    if (fg >= UI_TOKEN_BASE) {
        int n = fg - UI_TOKEN_BASE;
        fg = (b->palette_idx && n < b->palette_len) ? b->palette_idx[n] : ANSI_WHITE;
    }
    if (bg >= UI_TOKEN_BASE) {
        int n = bg - UI_TOKEN_BASE;
        bg = (b->palette_idx && n < b->palette_len) ? b->palette_idx[n] : ANSI_BLACK;
    }

    /* 8 and up is the bright half of the terminal's sixteen: bold, plus the
       base colour. A caller passes a theme token straight in and does not
       have to know which half it landed in.
       Only where the colour is a NUMBER, though: with the exact RGB going
       out there is nothing for bold to brighten, and asking for it anyway
       moved the C64's rendering of that cell onto a different VIC entry
       than the TypeScript's. */
    if (fg >= ANSI_BRIGHT && fg < UI_TOKEN_BASE) { bold = 1; fg -= ANSI_BRIGHT; }
    else if (fg_rgb >= 0) { bold = 0; }
    if (bg >= ANSI_BRIGHT && bg < UI_TOKEN_BASE) { bg -= ANSI_BRIGHT; }
    pen = fg;

    /* Already showing exactly this? Then the sequence is bytes for
     * nothing - and on this door bytes are milliseconds, because every
     * 198 of them is an XIM message costing about 45ms of 68K emulation. */
    if (b->last_fg == want_fg && b->last_bg == want_bg
        && b->last_bold == (bold ? 1 : 0)) {
        return;
    }
    b->last_fg = want_fg;
    b->last_bg = want_bg;
    b->last_bold = bold ? 1 : 0;

    /* INK ON A BAR, WHERE THERE ARE NO BACKGROUNDS.
     *
     * A C64 cell cannot carry one, so a caller asking for dark ink on a
     * bright bar would get the ink and nothing else - black on black under
     * five of the seven themes. Reverse video in the BAR's colour is the
     * same picture: the cell is painted in the pen and the glyph shows
     * through in the screen's background.
     *
     * A background OF the screen colour is not a bar at all, so it asks for
     * no reverse and the ink is the pen, exactly as before. */
    if (!b->cell_backgrounds) {
        if (bg > ANSI_BLACK) {
            pen = bg;
            want_reverse = 1;
        }
    }

    if (b->last_reverse != want_reverse) {
        b->last_reverse = want_reverse;
        put_str(b, want_reverse ? "\033[7m" : "\033[27m");
    }

    put_str(b, "\033[");
    put_int(b, bold ? 1 : 0);
    /* The leading 0 is SGR 0, and SGR 0 resets EVERY attribute - reverse
       video with them. So a colour written while the buffer is in reverse
       has to put it back in the same sequence, or the reverse lasts exactly
       until the next colour change. */
    if (!bold && b->last_reverse == 1) {
        put_str(b, ";7");
    }
    put_char(b, ';');
    /* THE EXACT COLOUR when the buffer has the theme's palette, and the
       nearest of sixteen when it has not. `38;2;r;g;b` is what the
       TypeScript writes, so the two implementations put the same shade on
       the same screen; a PETSCII caller gets the nearest VIC either way,
       because the transducer reduces truecolour on its way out. */
    if (fg_rgb >= 0) {
        put_rgb(b, 38, (unsigned long) fg_rgb);
    } else {
        put_int(b, 30 + pen);
    }
    /* Only where a cell can hold one. Asking on a C64 is what gets dropped. */
    if (b->cell_backgrounds && (bg_rgb >= 0 || bg >= 0)) {
        put_char(b, ';');
        if (bg_rgb >= 0) put_rgb(b, 48, (unsigned long) bg_rgb);
        else put_int(b, 40 + bg);
    }
    put_char(b, 'm');
}

void ansi_set_palette(ansi_buf *b, const unsigned long *rgb,
                      const unsigned char *idx, int count)
{
    if (!b) return;
    b->palette = rgb;
    b->palette_idx = idx;
    b->palette_len = (rgb || idx) ? count : 0;
    /* The colour on screen was written in the old palette's terms. */
    b->last_fg = -1;
    b->last_bg = -1;
    b->last_bold = -1;
}

void ansi_set_cell_backgrounds(ansi_buf *b, int can)
{
    if (!b) return;
    b->cell_backgrounds = can ? 1 : 0;
}

void ansi_reverse(ansi_buf *b, int on)
{
    if (!b) return;
    if (b->last_reverse == (on ? 1 : 0)) return;
    b->last_reverse = on ? 1 : 0;
    /* The colour cache is now stale in one direction: the NEXT ansi_color
       may ask for exactly what was last written, return early, and never
       re-assert reverse in its SGR 0. Forget the last colour so it writes
       itself out. */
    b->last_bold = -1;
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
    /* Not -1: the frame opens with SGR 0, which clears reverse, so it is
       KNOWN to be off. Leaving it unknown put a redundant ESC[27m at the
       head of every 80-column frame. */
    b->last_reverse = 0;
}

void ansi_cursor(ansi_buf *b, int visible)
{
    put_str(b, visible ? "\033[?25h" : "\033[?25l");
}

static void write_text(ansi_buf *b, int row, int col, const char *text, int maxlen, int pad)
{
    int n;            /* columns written - markers do not count */
    const char *at = text;
    int base_fg = b->last_fg;
    int base_bg = b->last_bg;
    int base_bold = b->last_bold;

    if (maxlen <= 0) {
        return;
    }
    ansi_goto(b, row, col);
    n = 0;
    while (*at != '\0' && n < maxlen) {
        char c = *at;

        /* A pen change, and it costs the row no columns (ui_ansi.h). */
        if (c == UI_INK && at[1] != '\0') {
            char what = at[1];
            if (what == 'T' && at[2] != '\0') {
                /* A token: the palette decides what colour that is. */
                char d = at[2];
                int n = (d >= '0' && d <= '9') ? d - '0' : 10 + (d - 'a');
                ansi_color(b, UI_TOKEN(n), base_bg, b->last_bold);
                at += 3;
                continue;
            }
            if (what >= '0' && what <= '9') {
                ansi_color(b, what - '0', base_bg, b->last_bold);
            } else if (what >= 'a' && what <= 'f') {
                /* The bright half; ansi_color turns it into bold + base. */
                ansi_color(b, 10 + (what - 'a'), base_bg, b->last_bold);
            } else if (what == 'B') {
                ansi_color(b, b->last_fg, base_bg, 1);
            } else if (what == 'b') {
                ansi_color(b, b->last_fg, base_bg, 0);
            } else if (what == 'R') {
                ansi_color(b, base_fg, base_bg, base_bold);
            }
            /* The colour moved the cursor nowhere, but ansi_color wrote an
               escape into the stream - so the next glyph still lands where
               it should. */
            at += 2;
            continue;
        }

        /* Control bytes become spaces: high-bit Latin-1 art passes through
         * one byte per column, but a raw ESC or CR from the server would
         * move the cursor and corrupt the entire layout. A line-at-a-time
         * renderer can forward those; a cursor-addressed one cannot. */
        put_char(b, (c >= 0 && c < 32) ? ' ' : c);
        n++;
        at++;
    }
    if (pad) {
        /* Padding is the CALLER's colour, not whatever the last marker left
           behind: a row that ends mid-accent would trail a coloured bar. */
        ansi_color(b, base_fg, base_bg, base_bold);
        while (n < maxlen) {
            put_char(b, ' ');
            n++;
        }
    }
}

unsigned long ui_printable_len(const char *text)
{
    unsigned long n = 0;

    if (!text) return 0;
    while (*text) {
        if (*text == UI_INK && text[1]) {
            /* Two bytes for a colour, three for a token. */
            text += (text[1] == 'T' && text[2]) ? 3 : 2;
            continue;
        }
        n++;
        text++;
    }
    return n;
}

void ui_ink(char *out, int colour)
{
    int c;

    if (!out) return;

    /* A THEME TOKEN, which the palette turns into the exact colour: three
       bytes, `UI_INK 'T' <hex>`. A door with a palette wants these, because
       the sixteen-colour form can only be the nearest shade. */
    if (colour >= UI_TOKEN_BASE) {
        int n = (colour - UI_TOKEN_BASE) & 15;
        out[0] = UI_INK;
        out[1] = 'T';
        out[2] = (char) (n < 10 ? '0' + n : 'a' + (n - 10));
        out[3] = '\0';
        return;
    }

    c = colour & 15;
    out[0] = UI_INK;
    /* A hex digit, so the bright half fits: '0'-'7' are the base colours and
       '8'-'f' their bold twins. */
    out[1] = (char) (c < 10 ? '0' + c : 'a' + (c - 10));
    out[2] = '\0';
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
