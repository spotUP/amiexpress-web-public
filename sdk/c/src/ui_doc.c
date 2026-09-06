/*
 * ui_doc - see ui_doc.h.
 *
 * The word wrap is the same rule the blessed engine learned on 2026-09-06
 * after a C64 caller read a lobby cut into "(e" / "mpty)": break at the last
 * space that fits, and only ever mid-word when one word is wider than the
 * whole box.
 */

#include "ui_doc.h"

#include <string.h>

void ui_doc_style_init(ui_doc_style *style)
{
    if (!style) return;
    style->top = 3;
    style->left = 5;
    style->height = 18;
    style->width = 70;
    style->fg = ANSI_WHITE;
    style->bg = ANSI_BLACK;
    style->ink = ANSI_CYAN;
}

int ui_doc_wrap(const char *text, int width,
                void (*line)(void *context, const char *start, int len),
                void *context)
{
    const char *p = text;
    int count = 0;

    if (!text || width < 1) return 0;

    while (*p) {
        const char *start = p;
        int len = 0;
        int last_space = -1;

        /* Walk up to `width` characters, remembering where a break may go. */
        while (p[len] && p[len] != '\n' && len < width) {
            if (p[len] == ' ') last_space = len;
            len++;
        }

        if (p[len] == '\n') {
            if (line) line(context, start, len);
            count++;
            p += len + 1;              /* the newline itself is consumed */
            continue;
        }

        if (!p[len]) {                  /* the tail fits */
            if (len > 0 || count == 0) {
                if (line) line(context, start, len);
                count++;
            }
            break;
        }

        /* The box is full mid-text: break at the last space that fits, and
         * mid-word only when the word is wider than the box. */
        if (last_space > 0) {
            if (line) line(context, start, last_space);
            count++;
            p += last_space + 1;        /* the space goes with the break */
        } else {
            if (line) line(context, start, width);
            count++;
            p += width;
        }
    }

    return count;
}

int ui_doc_pages(int total_lines, int rows)
{
    if (rows < 1) return 0;
    if (total_lines <= 0) return 1;
    return (total_lines + rows - 1) / rows;
}

int ui_doc_top_for(int total_lines, int rows, int line)
{
    int last_top;

    if (rows < 1) return 0;
    last_top = total_lines - rows;
    if (last_top < 0) last_top = 0;     /* shorter than the box: never scrolls */

    if (line < 0) return 0;
    if (line > last_top) return last_top;
    return line;
}

/* --------------------------------------------------------------------- */

typedef struct {
    ansi_buf *b;
    const ui_doc_style *st;
    int top_line;                       /* first line to draw */
    int drawn;                          /* how many rows have been used */
    int index;                          /* line counter as wrap walks */
} paint_ctx;

static void paint_line(void *context, const char *start, int len)
{
    paint_ctx *c = (paint_ctx *) context;
    char row[256];
    int room = (int) sizeof(row) - 1;
    int copy = len;

    if (c->index < c->top_line || c->drawn >= c->st->height) {
        c->index++;
        return;
    }

    if (copy > room) copy = room;
    if (copy > c->st->width) copy = c->st->width;
    memcpy(row, start, (size_t) copy);
    row[copy] = '\0';

    ansi_color(c->b, c->st->fg, c->st->bg, 0);
    ansi_text(c->b, c->st->top + 1 + c->drawn, c->st->left + 1, row, c->st->width);

    c->index++;
    c->drawn++;
}

/** One frame of the reader: the box, the visible lines, the footer. */
static void paint_page(ansi_buf *b, const ui_doc_style *st, const char *title,
                       const char *text, int top_line, int total, int rows)
{
    paint_ctx ctx;
    char footer[64];
    int page = rows > 0 ? (top_line / rows) + 1 : 1;
    int pages = ui_doc_pages(total, rows);

    ansi_panel(b, st->top, st->left, st->height + 2, st->width + 2,
               st->ink, st->bg, title);

    ctx.b = b;
    ctx.st = st;
    ctx.top_line = top_line;
    ctx.drawn = 0;
    ctx.index = 0;
    ui_doc_wrap(text, st->width, paint_line, &ctx);

    /* Blank whatever the last page does not fill, or the page before it
     * shows through - the reader would read stale text as content. */
    while (ctx.drawn < st->height) {
        ansi_fill(b, st->top + 1 + ctx.drawn, st->left + 1, st->width, st->fg, st->bg);
        ctx.drawn++;
    }

    /* THE WAY OUT IS THE LAST THING TO GO.
     *
     * A footer wider than the box is CLIPPED, and what gets clipped is the
     * right-hand end - which is where "Q LEAVE" sits. A narrow reader would
     * then show a page counter and no way out of the box. So the footer is
     * built longest-first and the first one that FITS is drawn; the keys
     * outrank the counter, because a reader who cannot leave is stuck and a
     * reader who cannot see the page number is merely uninformed. */
    footer[0] = '\0';
    {
        char counter[24];
        int n = 0;

        counter[0] = '\0';
        if (pages > 1) {
            counter[n++] = 'P'; counter[n++] = 'A'; counter[n++] = 'G';
            counter[n++] = 'E'; counter[n++] = ' ';
            if (page >= 10) counter[n++] = (char) ('0' + (page / 10) % 10);
            counter[n++] = (char) ('0' + page % 10);
            counter[n++] = '/';
            if (pages >= 10) counter[n++] = (char) ('0' + (pages / 10) % 10);
            counter[n++] = (char) ('0' + pages % 10);
            counter[n] = '\0';
        }

        if (counter[0] && (int) (strlen(counter) + 26) <= st->width) {
            strcpy(footer, counter);
            strcat(footer, "  SPACE NEXT  Q LEAVE");
        } else if ((int) strlen("SPACE NEXT  Q LEAVE") <= st->width) {
            strcpy(footer, "SPACE NEXT  Q LEAVE");
        } else {
            strcpy(footer, "Q LEAVE");
        }
    }

    ansi_color(b, st->ink, st->bg, 0);
    ansi_text(b, st->top + st->height + 1, st->left + 2, footer, st->width);
    ansi_cursor(b, 0);
}

int ui_doc(ansi_buf *b, const ui_key_source *src, int *pushback,
           const ui_doc_style *style, const char *title, const char *text)
{
    ui_doc_style fallback;
    const ui_doc_style *st = style;
    int total, rows, top = 0;

    if (!b || !src) return -1;
    if (!st) { ui_doc_style_init(&fallback); st = &fallback; }

    rows = st->height;
    if (rows < 1) rows = 1;
    total = ui_doc_wrap(text, st->width, 0, 0);

    for (;;) {
        int key;

        paint_page(b, st, title, text, top, total, rows);

        key = ui_key_read(src, pushback);
        if (key < 0) return -1;         /* the caller went away */

        switch (key) {
        case 'q': case 'Q': case UI_KEY_ESC: case UI_KEY_ENTER:
            ansi_cursor(b, 1);
            ansi_reset(b);
            return 0;
        case ' ': case UI_KEY_PGDN:
            top = ui_doc_top_for(total, rows, top + rows);
            break;
        case UI_KEY_PGUP:
            top = ui_doc_top_for(total, rows, top - rows);
            break;
        case UI_KEY_DOWN:
            top = ui_doc_top_for(total, rows, top + 1);
            break;
        case UI_KEY_UP:
            top = ui_doc_top_for(total, rows, top - 1);
            break;
        case UI_KEY_HOME:
            top = 0;
            break;
        case UI_KEY_END:
            top = ui_doc_top_for(total, rows, total);
            break;
        default:
            break;                      /* anything else is not a page turn */
        }
    }
}
