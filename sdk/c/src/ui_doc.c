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
    style->page_keys = 0;
    style->help_key = 0;
}

/**
 * Bytes of the ANSI escape sequence starting at `p`, or 0 if there is none.
 *
 * A message body is not the door's text - it is whatever a caller wrote, and
 * on this board that is very often RAW ANSI: the Conftop results, bulletins,
 * art. Those carry real `ESC [ ... m` sequences, not the SDK's own UI_INK
 * markers, so the walk below counted all five bytes of `\x1b[32m` as five
 * columns and could break in the middle of one. The sysop saw a table wrap
 * two characters short on every coloured row and a bare `[32m12.` printed as
 * text where the ESC had been left on the line above (2026-09-14).
 *
 * CSI is `ESC [`, then any number of parameter/intermediate bytes, then one
 * final byte in 0x40-0x7E. A lone `ESC` that starts nothing is one byte and
 * one column, which is what it looks like on screen.
 */
static int ansi_escape_len(const char *p)
{
    int n;

    if (p[0] != 0x1b || p[1] != '[') return 0;
    n = 2;
    while (p[n] && ((unsigned char)p[n] < 0x40 || (unsigned char)p[n] > 0x7e)) n++;
    return p[n] ? n + 1 : n;       /* an unterminated run is all of it */
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
            int esc;
            if (p[len] == UI_INK && p[len + 1]) {
                len += ((p[len + 1] == 'T' || p[len + 1] == 'H') && p[len + 2]) ? 3 : 2;
                continue;
            }
            /* A real ANSI sequence costs no columns either, and must never be
               broken across a line - half of it renders as text. */
            if ((esc = ansi_escape_len(p + len)) > 0) { len += esc; continue; }
            if (p[len] == ' ') last_space = len;
            len++;
            cols++;
        }

        /* THE PENS THAT FOLLOW THE LAST COLUMN BELONG TO THIS LINE.
         *
         * A teletext row IS exactly forty columns and ends with a pen reset.
         * The walk above stops on the fortieth column with the marker still
         * ahead, and `p[len]` is then UI_INK rather than the newline - so
         * the row broke and the marker became a LINE, which is why page 100
         * wrapped to fifty-one lines at forty columns instead of twenty-seven:
         * every second row was an invisible one. That also moved every line
         * index, so the headline cursor sat on the wrong row and each move
         * scrolled (1500 bytes a keypress, measured 2026-09-13).
         *
         * A zero-width marker cannot need a line of its own. */
        for (;;) {
            int esc;
            if (p[len] == UI_INK && p[len + 1]) {
                len += ((p[len + 1] == 'T' || p[len + 1] == 'H') && p[len + 2]) ? 3 : 2;
                continue;
            }
            if ((esc = ansi_escape_len(p + len)) > 0) { len += esc; continue; }
            break;
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

/**
 * Is this row the bottom half of the selected double-height line?
 *
 * The marker sits at the very start of the row (UI_INK 'H' '4'), because a
 * line attribute is the line's, not a run's inside it. Only the row DIRECTLY
 * under the selection can be its other half.
 */
static int dh_bottom_of(const char *start, int len, int index, int sel_line)
{
    if (sel_line < 0 || index != sel_line + 1) return 0;
    if (len < 3) return 0;
    return start[0] == UI_INK && start[1] == 'H' && start[2] == '4';
}

static void paint_line(void *context, const char *start, int len)
{
    paint_ctx *c = (paint_ctx *) context;
    char row[256];
    int room = (int) sizeof(row) - 1;
    int copy = len;
    int selected;
    int marker = 0;
    int left;

    if (c->index < c->top_line || c->drawn >= c->st->height) {
        c->index++;
        return;
    }

    /* Repainting ONE row: the others keep what they have. A cursor move on a
     * 68K door costs two rows, not a page - every 198 bytes is one XIM
     * message (RULES.md, "Doors draw smart"). */
    /* A single-row repaint takes the row asked for, and the one under it when
       that row is the other half of a double-height line - the two are one
       line, and repainting half of one leaves half a highlight bar. Any other
       row is skipped, so an ordinary page still costs two rows a move. */
    if (c->only_line >= 0 && c->index != c->only_line
        && !dh_bottom_of(start, len, c->index, c->only_line)) {
        c->index++;
        c->drawn++;
        return;
    }

    selected = c->index == c->sel_line
               || dh_bottom_of(start, len, c->index, c->sel_line);
    /* With colour off the board strips the inverted bar with every other
       SGR, so the selected headline is marked by ">>" in its first two
       columns - taking the row's own two-space pad when it has one, so the
       text does not move (ui_ansi.h, colour; the same rule as ui_list.c). */
    if (selected && !c->b->colour && c->st->width > 2) {
        marker = 2;
        if (copy >= 2 && start[0] == ' ' && start[1] == ' ') {
            start += 2;
            copy -= 2;
        }
    }

    if (copy > room) copy = room;
    /* Clamp by COLUMNS, not bytes. A pen marker is UI_INK plus one byte and
       reaches the screen as nothing, so a coloured row is longer in bytes
       than it is wide - clamping at `width` bytes cut the tail off every
       coloured row ("SVT:s mätn" for "SVT:s mätning", sysop's C64 walk). */
    {
        int bytes = 0;
        int cols = 0;
        while (bytes < copy && cols < c->st->width - marker) {
            int esc;
            if (start[bytes] == UI_INK && bytes + 1 < copy) {
                bytes += ((start[bytes + 1] == 'T' || start[bytes + 1] == 'H')
                          && bytes + 2 < copy) ? 3 : 2;
                continue;
            }
            /* A raw ANSI sequence is no columns either - the same rule as
               the wrap above, or a coloured message row is cut short. */
            if ((esc = ansi_escape_len(start + bytes)) > 0 && bytes + esc <= copy) {
                bytes += esc;
                continue;
            }
            bytes++;
            cols++;
        }
        copy = bytes;
    }
    memcpy(row, start, (size_t) copy);
    row[copy] = '\0';

    if (selected) {
        /* The selected headline, inverted: ground and ink swapped.
           A double-height headline is TWO rows and one line, so the row
           carrying its bottom half is selected with it - highlighting only
           the top half cut the bar across the middle of the letters
           (sysop, 2026-09-14). */
        ansi_color(c->b, c->st->bg, c->st->fg, 0);
    } else {
        ansi_color(c->b, c->st->fg, c->st->bg, 0);
    }
    left = c->st->left + (c->st->frameless ? 0 : 1);
    if (marker) ansi_text_raw(c->b, c->st->top + 1 + c->drawn, left, ">>", 2);
    ansi_text(c->b, c->st->top + 1 + c->drawn,
              left + marker, row, c->st->width - marker);
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
    int room;
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
    /* THE FOOTER SITS IN THE BOTTOM EDGE, NOT OVER IT.
     *
     * A framed footer starts two columns in, on the frame's own bottom row.
     * It used to be written `width` columns wide and PADDED, which reached
     * the right-hand corner and blanked every dash after the text: the box
     * had a top, two sides and no bottom (TEXTTV, sysop 2026-10-04). The
     * text now stops short of the corner and is written without padding,
     * so the edge the panel just drew stays visible around it. Frameless, the row is the footer's own
     * and is still padded - nothing else clears it. */
    room = st->frameless ? st->width : st->width - 1;
    if (room < 0) room = 0;

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
            if (st->page_keys && counter[0] &&
                (int) (strlen(counter) + 39) <= room) {
                /* Eighty columns carry the home key too. */
                strcpy(footer, counter);
                strcat(footer, "  <> PAGE  H HOME  ENTER READS  Q LEAVE");
            } else if (st->page_keys && counter[0] &&
                (int) (strlen(counter) + 31) <= room) {
                /* Forty columns fit all three: "PAGE 1/3  <> PAGE  ENTER
                   READS  Q LEAVE" is thirty-nine. */
                strcpy(footer, counter);
                strcat(footer, "  <> PAGE  ENTER READS  Q LEAVE");
            } else if (st->page_keys && (int) strlen("<> PAGE  ENTER READS  Q LEAVE") <= room) {
                strcpy(footer, "<> PAGE  ENTER READS  Q LEAVE");
            } else if (counter[0] && (int) (strlen(counter) + 28) <= room) {
                strcpy(footer, counter);
                strcat(footer, "  ENTER READS  Q LEAVE");
            } else if ((int) strlen("ENTER READS  Q LEAVE") <= room) {
                strcpy(footer, "ENTER READS  Q LEAVE");
            } else {
                strcpy(footer, "ENTER READS");
            }
        } else if (st->page_keys && counter[0] &&
                   (int) (strlen(counter) + 32) <= room) {
            strcpy(footer, counter);
            strcat(footer, "  <> PAGE  H HOME  Q LEAVE");
        } else if (st->page_keys && counter[0] &&
                   (int) (strlen(counter) + 24) <= room) {
            strcpy(footer, counter);
            strcat(footer, "  <> PAGE  Q LEAVE");
        } else if (st->page_keys && (int) strlen("<> PAGE  SPACE NEXT  Q LEAVE") <= room) {
            strcpy(footer, "<> PAGE  SPACE NEXT  Q LEAVE");
        } else if (counter[0] && (int) (strlen(counter) + 26) <= room) {
            strcpy(footer, counter);
            strcat(footer, "  SPACE NEXT  Q LEAVE");
        } else if ((int) strlen("SPACE NEXT  Q LEAVE") <= room) {
            strcpy(footer, "SPACE NEXT  Q LEAVE");
        } else {
            strcpy(footer, "Q LEAVE");
        }
    }

    /* A caller with help to give says so, after everything above - the way
       out still outranks it, so it only goes where the whole thing fits. */
    if (st->help_key && (int) (strlen(footer) + 8) <= room)
        strcat(footer, "  ? HELP");

    ansi_color(b, st->ink, st->bg, 0);
    if (st->frameless)
        ansi_text(b, st->top + st->height + 1, st->left, footer, room);
    else
        ansi_text_raw(b, st->top + st->height + 1, st->left + 2, footer, room);
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
        /* LEFT and RIGHT still page here. ui_key used to decode them AS
           PGUP/PGDN and this reader's callers expect that; only
           ui_doc_pick, and only when the caller asks, reads them as a
           document change. */
        case ' ': case UI_KEY_PGDN: case UI_KEY_RIGHT:
            top = ui_doc_top_for(total, rows, top + rows);
            break;
        case UI_KEY_PGUP: case UI_KEY_LEFT:
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
             * single-line mode.
             *
             * A double-height headline is two rows and one line, so the
             * painter carries its other half along with it - and only its
             * other half, which is why an ordinary page still costs two rows
             * a move rather than four. */
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
        case UI_KEY_LEFT:
        case UI_KEY_RIGHT:
            if (!st->page_keys) {
                top = ui_doc_top_for(total, rows,
                                     key == UI_KEY_LEFT ? top - rows : top + rows);
                break;
            }
            /* The document before or after this one - a teletext set's
               arrows, not a scroll. The caller fetches; SPACE still pages
               within what is on screen. */
            ansi_cursor(b, 1);
            ansi_reset(b);
            if (current) *current = cur;
            return key == UI_KEY_LEFT ? UI_DOC_PREV : UI_DOC_NEXT;
        case 'h': case 'H':
            /* Not the HOME key, which still means "top of THIS document":
               this is the way out of a walk - six flips deep into the
               numbering, one key back to where the set starts. Only a
               caller that navigates documents has such a place. */
            if (!st->page_keys) break;
            ansi_cursor(b, 1);
            ansi_reset(b);
            if (current) *current = cur;
            return UI_DOC_HOME;
        case '?':
            /* What the keys do. The reader cannot know the caller's own
               keys, so it hands the question back; the caller shows its
               help and reopens the document. */
            if (!st->help_key) break;
            ansi_cursor(b, 1);
            ansi_reset(b);
            if (current) *current = cur;
            return UI_DOC_HELP;
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
