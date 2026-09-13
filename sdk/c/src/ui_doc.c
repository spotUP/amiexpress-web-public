/*
 * ui_doc - see ui_doc.h.
 *
 * The word wrap is the same rule the blessed engine learned on 2026-09-06
 * after a C64 caller read a lobby cut into "(e" / "mpty)": break at the last
 * space that fits, and only ever mid-word when one word is wider than the
 * whole box.
 */

#include "ui_doc.h"
#include "ui_ansi.h"

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
    style->frameless = 0;
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
        int len = 0;     /* bytes taken */
        int cols = 0;    /* columns they occupy - not the same number */
        int last_space = -1;

        /* Walk up to `width` COLUMNS, remembering where a break may go.
         *
         * A pen marker (UI_INK plus one byte, or three for the token form)
         * costs the row no columns - ansi_text pads and clips by what
         * reaches the screen. Counting its bytes as columns wrapped a
         * coloured document short by two characters for every colour change
         * in the line, which is what a Text-TV page is made of. */
        while (p[len] && p[len] != '\n' && cols < width) {
            if (p[len] == UI_INK && p[len + 1]) {
                len += (p[len + 1] == 'T' && p[len + 2]) ? 3 : 2;
                continue;
            }
            if (p[len] == ' ') last_space = len;
            len++;
            cols++;
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
            /* Mid-word: the break is where the walk stopped, in BYTES. */
            if (line) line(context, start, len);
            count++;
            p += len;
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
    int sel_line;                       /* line drawn inverted, -1 for none */
    int only_line;                      /* draw ONLY this line, -1 for all */
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

    /* Repainting ONE row: the others keep what they have. A cursor move on a
     * 68K door costs two rows, not a page - every 198 bytes is one XIM
     * message (RULES.md, "Doors draw smart"). */
    if (c->only_line >= 0 && c->index != c->only_line) {
        c->index++;
        c->drawn++;
        return;
    }

    if (copy > room) copy = room;
    /* Clamp by COLUMNS, not bytes. A pen marker is UI_INK plus one byte and
       reaches the screen as nothing, so a coloured row is longer in bytes
       than it is wide - clamping at `width` bytes cut the tail off every
       coloured row ("SVT:s mätn" for "SVT:s mätning", sysop's C64 walk). */
    {
        int bytes = 0;
        int cols = 0;
        while (bytes < copy && cols < c->st->width) {
            if (start[bytes] == UI_INK && bytes + 1 < copy) {
                bytes += (start[bytes + 1] == 'T' && bytes + 2 < copy) ? 3 : 2;
                continue;
            }
            bytes++;
            cols++;
        }
        copy = bytes;
    }
    memcpy(row, start, (size_t) copy);
    row[copy] = '\0';

    if (c->index == c->sel_line) {
        /* The selected headline, inverted: ground and ink swapped. */
        ansi_color(c->b, c->st->bg, c->st->fg, 0);
    } else {
        ansi_color(c->b, c->st->fg, c->st->bg, 0);
    }
    ansi_text(c->b, c->st->top + 1 + c->drawn,
              c->st->left + (c->st->frameless ? 0 : 1), row, c->st->width);
    ansi_color(c->b, c->st->fg, c->st->bg, 0);

    c->index++;
    c->drawn++;
}

/** One frame of the reader: the box, the visible lines, the footer. */
static void paint_page(ansi_buf *b, const ui_doc_style *st, const char *title,
                       const char *text, int top_line, int total, int rows,
                       int sel_line, int only_line)
{
    paint_ctx ctx;
    char footer[64];
    int page = rows > 0 ? (top_line / rows) + 1 : 1;
    int pages = ui_doc_pages(total, rows);

    /* Only a row changed: the frame, the footer and every other row are
     * already on the caller's screen. */
    if (only_line < 0) {
        if (st->frameless) {
            /* The title owns the top row; the rows start directly under it. */
            ansi_fill(b, st->top, st->left, st->width, st->ink, st->bg);
            ansi_text(b, st->top, st->left, title, st->width);
        } else {
            ansi_panel(b, st->top, st->left, st->height + 2, st->width + 2,
                       st->ink, st->bg, title);
        }
    }

    ctx.b = b;
    ctx.st = st;
    ctx.top_line = top_line;
    ctx.drawn = 0;
    ctx.index = 0;
    ctx.sel_line = sel_line;
    ctx.only_line = only_line;
    ui_doc_wrap(text, st->width, paint_line, &ctx);
    if (only_line >= 0) return;

    /* Blank whatever the last page does not fill, or the page before it
     * shows through - the reader would read stale text as content. */
    while (ctx.drawn < st->height) {
        ansi_fill(b, st->top + 1 + ctx.drawn, st->left + (st->frameless ? 0 : 1),
                  st->width, st->fg, st->bg);
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

        /* WHEN THERE IS SOMETHING TO CHOOSE, SAY SO FIRST.
         *
         * The door put "RETURN READS" in the panel title, which a
         * forty-column screen cuts off - the one width where the caller most
         * needs telling. The keys outrank the counter (see above), and
         * "what RETURN does" outranks "which page this is". */
        if (sel_line >= 0) {
            if (counter[0] && (int) (strlen(counter) + 28) <= st->width) {
                strcpy(footer, counter);
                strcat(footer, "  ENTER READS  Q LEAVE");
            } else if ((int) strlen("ENTER READS  Q LEAVE") <= st->width) {
                strcpy(footer, "ENTER READS  Q LEAVE");
            } else {
                strcpy(footer, "ENTER READS");
            }
        } else if (counter[0] && (int) (strlen(counter) + 26) <= st->width) {
            strcpy(footer, counter);
            strcat(footer, "  SPACE NEXT  Q LEAVE");
        } else if ((int) strlen("SPACE NEXT  Q LEAVE") <= st->width) {
            strcpy(footer, "SPACE NEXT  Q LEAVE");
        } else {
            strcpy(footer, "Q LEAVE");
        }
    }

    ansi_color(b, st->ink, st->bg, 0);
    ansi_text(b, st->top + st->height + 1,
              st->left + (st->frameless ? 0 : 2), footer, st->width);
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

        paint_page(b, st, title, text, top, total, rows, -1, -1);

        /* The prompt is in a buffer until something sends it. */
        if (src->flush) src->flush(src->ctx);
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

/* The line the cursor sits on, or -1 when nothing is selected. */
static int sel_line_of(const int *lines, int count, int current)
{
    if (!lines || count <= 0 || current < 0 || current >= count) return -1;
    return lines[current];
}

int ui_doc_pick(ansi_buf *b, const ui_key_source *src, int *pushback,
                const ui_doc_style *style, const char *title, const char *text,
                const int *lines, int count, int *current)
{
    ui_doc_style fallback;
    const ui_doc_style *st = style;
    int total, rows, top = 0;
    int cur = current ? *current : -1;
    int painted_top = -1;
    int painted_sel = -2;

    if (!b || !src) return -1;
    if (!st) { ui_doc_style_init(&fallback); st = &fallback; }

    rows = st->height;
    if (rows < 1) rows = 1;
    total = ui_doc_wrap(text, st->width, 0, 0);

    if (count > 0 && cur < 0) cur = 0;

    for (;;) {
        int key;
        int sel = sel_line_of(lines, count, cur);

        /* Keep the cursor on screen without moving the page otherwise.
         *
         * When it HAS to scroll, put the selection in the middle rather than
         * against the edge it came from: a scroll repaints the whole box, and
         * landing on the edge means the very next move scrolls again.
         * Measured on the live index page at 40 columns - edge scrolling cost
         * two full repaints for four headlines (2778 and 2683 bytes),
         * centring costs one. A move that does not scroll is 197 bytes, one
         * XIM message. */
        if (sel >= 0 && (sel < top || sel >= top + rows)) {
            top = ui_doc_top_for(total, rows, sel - rows / 2);
        }

        if (top != painted_top || painted_sel == -2) {
            paint_page(b, st, title, text, top, total, rows, sel, -1);
        } else if (sel != painted_sel) {
            /* TWO ROWS, not a page: the one losing the cursor and the one
             * taking it. This is the whole reason the painter has a
             * single-line mode. */
            if (painted_sel >= 0)
                paint_page(b, st, title, text, top, total, rows, sel, painted_sel);
            if (sel >= 0)
                paint_page(b, st, title, text, top, total, rows, sel, sel);
        }
        painted_top = top;
        painted_sel = sel;

        if (src->flush) src->flush(src->ctx);
        key = ui_key_read(src, pushback);
        if (key < 0) return -1;

        switch (key) {
        case 'q': case 'Q': case UI_KEY_ESC:
            ansi_cursor(b, 1);
            ansi_reset(b);
            if (current) *current = cur;
            return 0;
        case UI_KEY_ENTER:
            if (count > 0 && cur >= 0) {
                ansi_cursor(b, 1);
                ansi_reset(b);
                if (current) *current = cur;
                return 1;
            }
            ansi_cursor(b, 1);
            ansi_reset(b);
            return 0;
        case UI_KEY_DOWN:
            if (count > 0) cur = (cur + 1) % count;
            else top = ui_doc_top_for(total, rows, top + 1);
            break;
        case UI_KEY_UP:
            if (count > 0) cur = cur <= 0 ? count - 1 : cur - 1;
            else top = ui_doc_top_for(total, rows, top - 1);
            break;
        case ' ': case UI_KEY_PGDN:
            top = ui_doc_top_for(total, rows, top + rows);
            break;
        case UI_KEY_PGUP:
            top = ui_doc_top_for(total, rows, top - rows);
            break;
        case UI_KEY_HOME:
            top = 0;
            break;
        case UI_KEY_END:
            top = ui_doc_top_for(total, rows, total);
            break;
        default:
            break;
        }
    }
}
