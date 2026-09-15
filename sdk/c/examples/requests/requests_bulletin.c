/* See requests_bulletin.h for what this is and why the budget is 23. */

#include <string.h>

#include "requests_bulletin.h"

/* C89: no stdint, no snprintf. Everything below is bounded by hand. */

/** Visible width of `s`, CSI sequences not counting. */
static int visible_width(const char *s, unsigned long len)
{
    unsigned long i = 0;
    int width = 0;

    while (i < len) {
        if (s[i] == '\033') {
            /* ESC [ ... <final byte 0x40-0x7e>. An unterminated sequence
               swallows the rest of the line, which is what a terminal does
               with it too. */
            i++;
            if (i < len && s[i] == '[') {
                i++;
                while (i < len && (unsigned char)s[i] >= 0x20 &&
                       (unsigned char)s[i] < 0x40) i++;
                if (i < len) i++;
            }
            continue;
        }
        width++;
        i++;
    }
    return width;
}

/** Append `len` bytes of `text`, or report that it did not fit. */
static int put(char *out, unsigned long cap, unsigned long *used,
               const char *text, unsigned long len)
{
    if (*used + len > cap) return 0;
    memcpy(out + *used, text, len);
    *used += len;
    return 1;
}

static int put_str(char *out, unsigned long cap, unsigned long *used,
                   const char *text)
{
    return put(out, cap, used, text, (unsigned long)strlen(text));
}

/** Spaces out to `columns` visible. */
static int pad_to_columns(char *out, unsigned long cap, unsigned long *used,
                          int width)
{
    int i;
    for (i = width; i < REQUESTS_BULLETIN_COLUMNS; i++) {
        if (!put(out, cap, used, " ", 1)) return 0;
    }
    return 1;
}

/**
 * One line of art: verbatim, padded to the screen, CRLF.
 *
 * VERBATIM IS THE POINT. The art is authored with the colour carrying over
 * from one line to the next - only five of the header's eight lines set a
 * colour at all, and the rest inherit it. Writing an ink reset at the end of
 * each line, which is what the classic door's own output shows, means
 * RE-STATING that colour at the start of the next one; do the first without
 * the second and the logo comes out half white. So this writes neither, and
 * the art keeps the colours its author gave it.
 *
 * The LAST line of the bulletin ends `[0m` and NO CRLF. Both halves matter.
 * The reset stops the screen tinting whatever the board prints after it; the
 * missing newline is the difference between a 23-row screen and a 24-row one,
 * because the loader's `needsPaging` counts the empty element a trailing
 * newline leaves behind and paginates on it.
 */
static int put_art_line(char *out, unsigned long cap, unsigned long *used,
                        const char *line, unsigned long len, int last)
{
    if (!put(out, cap, used, line, len)) return 0;
    if (!pad_to_columns(out, cap, used, visible_width(line, len))) return 0;
    if (last) return put_str(out, cap, used, "\033[0m");
    return put(out, cap, used, "\r\n", 2);
}

/** The next line of `art`, without its separator. */
static const char *art_line(const char *p, unsigned long *len,
                            const char **next)
{
    const char *nl = strchr(p, '\n');
    unsigned long n;

    if (nl == 0) {
        n = (unsigned long)strlen(p);
        *next = p + n;
    } else {
        n = (unsigned long)(nl - p);
        *next = nl + 1;
    }
    if (n > 0 && p[n - 1] == '\r') n--;
    *len = n;
    return p;
}

int requests_bulletin_art_rows(const char *art)
{
    int rows = 0;
    const char *p;

    if (art == 0) return 0;
    p = art;
    while (*p != '\0') {
        unsigned long len;
        const char *next;
        art_line(p, &len, &next);
        rows++;
        p = next;
    }
    return rows;
}

int requests_bulletin_fits(const char *text, int budget)
{
    /* `requests_bulletin_art_rows` counts exactly what a caller sees: a
       trailing newline leaves an empty element that is not a row, and the
       board's own `needsPaging` allows for it the same way. */
    if (text == 0) return 0;
    return requests_bulletin_art_rows(text) <= budget;
}

int requests_bulletin_budget_for(const char *header, const char *tail)
{
    int art = requests_bulletin_art_rows(header)
            + requests_bulletin_art_rows(tail);
    int needed = art + REQUESTS_BULLETIN_MIN_ROWS;

    return needed > REQUESTS_BULLETIN_ROW_BUDGET
         ? needed
         : REQUESTS_BULLETIN_ROW_BUDGET;
}

int requests_bulletin_capacity(const char *header, const char *tail, int budget)
{
    int room = budget - requests_bulletin_art_rows(header)
                      - requests_bulletin_art_rows(tail);
    return room > 0 ? room : 0;
}

/** `text` in a `width`-wide column, truncated rather than wrapped. */
static int put_column(char *out, unsigned long cap, unsigned long *used,
                      const char *text, int width)
{
    int n = (int)strlen(text != 0 ? text : "");
    int i;

    if (n > width) n = width;
    if (n > 0 && !put(out, cap, used, text, (unsigned long)n)) return 0;
    for (i = n; i < width; i++) {
        if (!put(out, cap, used, " ", 1)) return 0;
    }
    return 1;
}

/** `| <handle> | <title> |`, in the header art's own columns and colours. */
static int put_request_row(char *out, unsigned long cap, unsigned long *used,
                           const requests_bulletin_row *row)
{
    if (!put_str(out, cap, used, "\033[34m|\033[37m ")) return 0;
    if (!put_column(out, cap, used, row->handle, REQUESTS_BULLETIN_HANDLE_W))
        return 0;
    if (!put_str(out, cap, used, " \033[34m|\033[37m ")) return 0;
    if (!put_column(out, cap, used, row->title, REQUESTS_BULLETIN_TITLE_W))
        return 0;
    if (!put_str(out, cap, used, "\033[34m|\033[37m  ")) return 0;
    return put(out, cap, used, "\r\n", 2);
}

static int put_art(char *out, unsigned long cap, unsigned long *used,
                   const char *art, int last_block)
{
    const char *p = art;

    if (art == 0) return 1;
    while (*p != '\0') {
        unsigned long len;
        const char *next;
        const char *line = art_line(p, &len, &next);
        p = next;
        if (!put_art_line(out, cap, used, line, len,
                          last_block && *p == '\0')) return 0;
    }
    return 1;
}

unsigned long requests_bulletin_render_header(char *out, unsigned long cap,
                                              const char *header)
{
    unsigned long used = 0;

    if (out == 0 || cap == 0) return 0;
    if (!put_art(out, cap, &used, header, 0)) return 0;
    return used;
}

unsigned long requests_bulletin_render_tail(char *out, unsigned long cap,
                                            const char *tail)
{
    unsigned long used = 0;

    if (out == 0 || cap == 0) return 0;
    if (!put_art(out, cap, &used, tail, 1)) return 0;
    return used;
}

unsigned long requests_bulletin_render(char *out, unsigned long cap,
                                       const char *header, const char *tail,
                                       const requests_bulletin_row *rows,
                                       int row_count, int budget)
{
    unsigned long used = 0;
    int room = requests_bulletin_capacity(header, tail, budget);
    int i;

    if (out == 0 || cap == 0) return 0;
    if (row_count > room) row_count = room;
    if (row_count < 0) row_count = 0;

    if (!put_art(out, cap, &used, header, 0)) return 0;
    for (i = 0; i < row_count; i++) {
        if (!put_request_row(out, cap, &used, &rows[i])) return 0;
    }
    if (!put_art(out, cap, &used, tail, 1)) return 0;
    return used;
}
