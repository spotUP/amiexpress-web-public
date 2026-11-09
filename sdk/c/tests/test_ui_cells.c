/* test_ui_cells.c - native tests for the cell canvas and its diff flush. */
#include <stdio.h>
#include <string.h>

#include "ui_cells.h"
#include "ui_key.h"

static int fails = 0;
#define CHECK(cond, msg) do { if (!(cond)) { printf("FAIL: %s (line %d)\n", msg, __LINE__); fails++; } } while (0)

static char wire[4096];

static void flush_into(ui_cells *c, ansi_buf *b)
{
    b->data = wire; b->cap = (int)sizeof wire; b->len = 0; b->overflow = 0;
    ui_cells_flush(c, b, 0, 0);
    wire[b->len < (int)sizeof wire ? b->len : (int)sizeof wire - 1] = '\0';
}

static int cell_ch(ui_cells *c, int r, int k) { return c->back[r * c->cols + k].ch; }

/* ---- reference copies of fill / marked / wrap as they were before the round-5 hot-path rewrite (the
 * per-cell, per-character originals). The fuzz test below proves the fast versions write the same bytes. */
static void ref_set_cell(ui_cell *p, int ch, int fg, int bg, int bold)
{
    p->ch = (unsigned char)ch;
    p->fg = (unsigned char)(fg < 0 ? 7 : fg);
    p->bg = (unsigned char)(bg < 0 ? 0 : bg);
    p->flags = (unsigned char)((bold ? UI_CELLS_BOLD : 0) | (bg < 0 ? UI_CELLS_BG_DEFAULT : 0));
}

static void ref_fill(ui_cells *c, int row, int col, int h, int w, int ch)
{
    int r0 = row < 0 ? 0 : row, r1 = row + h > c->rows ? c->rows : row + h;
    int k0 = col < 0 ? 0 : col, k1 = col + w > c->cols ? c->cols : col + w;
    int r, k;
    ui_cell cell;
    if (h <= 0 || w <= 0 || r0 >= r1 || k0 >= k1) return;
    ref_set_cell(&cell, ch, c->fg, c->bg, c->bold);
    for (r = r0; r < r1; r++) {
        ui_cell *p = &c->back[(long)r * c->cols + k0];
        for (k = k0; k < k1; k++) *p++ = cell;
    }
}

static int ref_marked(ui_cells *c, int row, int col, const char *s, int from, int to, int max)
{
    int base_fg = c->fg, base_bold = c->bold, i, n = 0, k;
    ui_cell pen, *line = row < 0 || row >= c->rows ? 0 : &c->back[(long)row * c->cols];
    ref_set_cell(&pen, ' ', c->fg, c->bg, c->bold);
    for (i = 0; s[i] != '\0' && i < to; i++) {
        char ch = s[i];
        if (ch == UI_CELLS_M_WIDE) {
            if (s[i + 1] == '\0') continue;
            if (i++ < from) continue;
            if (n + 2 > max) break;
            k = col + n;
            if (line != 0 && k >= 0 && k + 1 < c->cols) {
                line[k] = pen; line[k].ch = (unsigned char)s[i]; line[k].flags |= UI_CELLS_WIDE;
                line[k + 1] = pen; line[k + 1].flags |= UI_CELLS_WIDE_TAIL;
            }
            n += 2;
            continue;
        }
        if ((unsigned char)ch <= (unsigned char)UI_CELLS_M_BASE) {
            if (ch == UI_CELLS_M_FG && s[i + 1] != '\0') { c->fg = (unsigned char)s[++i]; ref_set_cell(&pen, ' ', c->fg, c->bg, c->bold); continue; }
            if (ch == UI_CELLS_M_BOLD) { c->bold = 1; ref_set_cell(&pen, ' ', c->fg, c->bg, c->bold); continue; }
            if (ch == UI_CELLS_M_PLAIN) { c->bold = 0; ref_set_cell(&pen, ' ', c->fg, c->bg, c->bold); continue; }
            if (ch == UI_CELLS_M_BASE) { c->fg = base_fg; c->bold = base_bold; ref_set_cell(&pen, ' ', c->fg, c->bg, c->bold); continue; }
        }
        if (i < from) continue;
        if (n >= max) break;
        k = col + n;
        if (line != 0 && k >= 0 && k < c->cols) { line[k] = pen; line[k].ch = (unsigned char)ch; }
        n++;
    }
    c->fg = base_fg; c->bold = base_bold;
    return n;
}

static int ref_is_marker(const char *s, int i)
{
    return (unsigned char)s[i] >= (unsigned char)UI_CELLS_M_FG && (unsigned char)s[i] <= (unsigned char)UI_CELLS_M_BASE;
}

static int ref_wrap(const char *s, int width, int *starts, int *ends, int max)
{
    int lines = 0, i = 0;
    if (width < 1) width = 1;
    while (s[i] != '\0' && lines < max) {
        int cols = 0, j = i, brk = -1, brk_next = -1;
        while (s[j] != '\0') {
            if (ref_is_marker(s, j)) { j += (s[j] == UI_CELLS_M_FG && s[j + 1] != '\0') ? 2 : 1; continue; }
            if (s[j] == UI_CELLS_M_WIDE && s[j + 1] != '\0') {
                if (cols + 2 > width && cols > 0) break;
                cols += 2;
                j += 2;
                continue;
            }
            if (s[j] == '\n') break;
            if (s[j] == ' ') { brk = j; brk_next = j + 1; }
            if (cols == width) break;
            cols++;
            j++;
        }
        if (s[j] == '\0') { starts[lines] = i; ends[lines] = j; lines++; break; }
        if (s[j] == '\n') { starts[lines] = i; ends[lines] = j; lines++; i = j + 1; continue; }
        if (s[j] == ' ') { brk = j; brk_next = j + 1; }
        if (brk <= i) { brk = j; brk_next = j; }
        starts[lines] = i; ends[lines] = brk; lines++;
        i = brk_next;
    }
    if (lines == 0 && max > 0) { starts[0] = 0; ends[0] = 0; lines = 1; }
    return lines;
}

static unsigned long rng_state = 12345;
static int rnd(int n) { rng_state = rng_state * 1103515245UL + 12345UL; return (int)((rng_state >> 16) % (unsigned long)n); }

/* Fuzz: random canvases, pens, clip rectangles and marked strings; fast and reference must leave the same
 * back buffer, pen and return values. Exact bytes, not a sample. */
static void fuzz_hot_paths(void)
{
    static const char alpha[] = {1, 2, 3, 4, 5, ' ', ' ', '\n', 'a', 'b', 'c', 'x', 'y', 'z', '1', 9, 31, 33, 'W', (char)200, (char)240};
    int iter;
    for (iter = 0; iter < 4000; iter++) {
        ui_cells a, b;
        char str[48];
        int cols = 1 + rnd(40), rows = 1 + rnd(6), len = rnd(sizeof str - 1), i, h, w, row, col, from, to, max, na, nb;
        int sa[16], ea[16], sb[16], eb[16];
        for (i = 0; i < len; i++) str[i] = alpha[rnd((int)sizeof alpha)];
        str[len] = '\0';
        if (ui_cells_open(&a, cols, rows) != 0 || ui_cells_open(&b, cols, rows) != 0) { CHECK(0, "fuzz open"); return; }
        memset(a.back, 0x5a, (size_t)cols * rows * sizeof(ui_cell));
        memset(b.back, 0x5a, (size_t)cols * rows * sizeof(ui_cell));
        a.fg = b.fg = rnd(3) == 0 ? -1 : rnd(256); a.bg = b.bg = rnd(3) == 0 ? -1 : rnd(256); a.bold = b.bold = rnd(2);
        row = rnd(rows + 4) - 2; col = rnd(cols + 8) - 4; h = rnd(rows + 3) - 1; w = rnd(cols + 10) - 2;
        ui_cells_fill(&a, row, col, h, w, 'f'); ref_fill(&b, row, col, h, w, 'f');
        CHECK(memcmp(a.back, b.back, (size_t)cols * rows * sizeof(ui_cell)) == 0, "fuzz fill bytes");
        row = rnd(rows + 4) - 2; col = rnd(cols + 8) - 4; from = rnd(len + 3); to = from + rnd(len + 3); max = rnd(cols + 6) - 1;
        na = ui_cells_marked(&a, row, col, str, from, to, max); nb = ref_marked(&b, row, col, str, from, to, max);
        CHECK(na == nb, "fuzz marked count");
        CHECK(memcmp(a.back, b.back, (size_t)cols * rows * sizeof(ui_cell)) == 0, "fuzz marked bytes");
        CHECK(a.fg == b.fg && a.bold == b.bold, "fuzz marked pen restored");
        w = rnd(12) - 1; max = rnd(10) - 1;
        na = max > 16 ? 16 : max; if (na < 0) na = 0;
        na = ui_cells_wrap(str, w, sa, ea, na); nb = ref_wrap(str, w, sb, eb, max > 16 ? 16 : max < 0 ? 0 : max);
        CHECK(na == nb && memcmp(sa, sb, sizeof(int) * (size_t)(na < 0 ? 0 : na)) == 0 && memcmp(ea, eb, sizeof(int) * (size_t)(na < 0 ? 0 : na)) == 0, "fuzz wrap");
        ui_cells_close(&a); ui_cells_close(&b);
        if (fails) return;
    }
}

int main(void)
{
    ui_cells c;
    ansi_buf b;
    int starts[8], ends[8], n, top, left;
    const char *items[2] = { "Help", "About" };
    char marked[64];

    memset(&b, 0, sizeof b);
    CHECK(ui_cells_open(&c, 20, 6) == 0, "open");

    /* First flush sends every cell but the bottom-right one. */
    flush_into(&c, &b);
    CHECK(c.sent == 20 * 6 - 1, "full flush sends all but last cell");
    CHECK(strstr(wire, "\033[0;49;37m") != 0, "default style is reset, bg 49, fg 37");
    CHECK(strstr(wire, "\033[0;40") == 0, "never paints bg 40 by default");

    /* Nothing changed: nothing sent. */
    flush_into(&c, &b);
    CHECK(c.sent == 0 && b.len == 0, "idle flush sends nothing");

    /* One region changes: only it goes out, with a CUP and 256-colour SGR. */
    ui_cells_pen(&c, 0, 204, 1);
    ui_cells_text(&c, 2, 3, "Hi", -1);
    flush_into(&c, &b);
    CHECK(c.sent == 2, "two changed cells sent");
    CHECK(strcmp(wire, "\033[3;4H\033[0;1;48;5;204;30mHi") == 0, "exact region bytes");
    CHECK(b.last_fg == -1 && b.last_bg == -1, "ansi_buf colour cache reset");

    /* Box with label. */
    ui_cells_pen(&c, 7, UI_CELLS_DEFAULT, 0);
    ui_cells_box(&c, 0, 0, 4, 12, 204, "Ab", 255);
    CHECK(cell_ch(&c, 0, 0) == '.' && cell_ch(&c, 0, 11) == '.', "top corners");
    CHECK(cell_ch(&c, 3, 0) == '`' && cell_ch(&c, 3, 11) == '\'', "bottom corners");
    CHECK(cell_ch(&c, 1, 0) == '|' && cell_ch(&c, 0, 1) == '-', "sides");
    CHECK(cell_ch(&c, 0, 3) == 'A' && c.back[3].fg == 255 && c.back[1].fg == 204, "label colour");

    /* Every edge cell of a box is drawn with its fill and pen; interior stays untouched. */
    {
        int rr, kk, bad = 0;
        ui_cells d;
        CHECK(ui_cells_open(&d, 20, 20) == 0, "open 20x20");
        ui_cells_pen(&d, 7, UI_CELLS_DEFAULT, 0);
        ui_cells_fill(&d, 6, 0, 6, 20, 'z');
        ui_cells_box(&d, 6, 2, 5, 9, 204, NULL, 255);
        for (rr = 0; rr < 5; rr++)
            for (kk = 0; kk < 9; kk++) {
                int edge = rr == 0 || rr == 4 || kk == 0 || kk == 8;
                int corner = (rr == 0 || rr == 4) && (kk == 0 || kk == 8);
                int ch = cell_ch(&d, 6 + rr, 2 + kk);
                if (!edge && ch != 'z') bad = 1;
                if (edge && !corner && ch != ((rr == 0 || rr == 4) ? '-' : '|')) bad = 1;
                if (edge && d.back[(6 + rr) * d.cols + 2 + kk].fg != 204) bad = 1;
            }
        CHECK(!bad, "box edges are runs, interior untouched");
        ui_cells_box(&d, 10, 15, 4, 12, 204, NULL, 255);   /* hangs off the right and bottom: must clip, not overrun */
        CHECK(cell_ch(&d, 10, 15) == '.' && cell_ch(&d, 10, 19) == '-', "clipped box top");
        ui_cells_close(&d);
    }

    /* Marked text keeps style across a wrap. */
    snprintf(marked, sizeof marked, "aa %c%cbbbb cc%c dd", UI_CELLS_M_FG, (char)221, UI_CELLS_M_BASE);
    CHECK(ui_cells_marked_cols(marked) == 13, "marked cols skip markers");
    n = ui_cells_wrap(marked, 7, starts, ends, 8);
    CHECK(n == 2, "wraps into two lines");
    ui_cells_marked(&c, 5, 0, marked, starts[1], ends[1], 20);
    CHECK(cell_ch(&c, 5, 0) == 'c' && c.back[5 * 20].fg == 221, "second line keeps marker colour");
    CHECK(cell_ch(&c, 5, 3) == 'd' && c.back[5 * 20 + 3].fg == 7, "base marker restores pen");

    /* A newline ends the row there and is not drawn. */
    n = ui_cells_wrap("ab\ncd ef", 20, starts, ends, 8);
    CHECK(n == 2 && ends[0] - starts[0] == 2 && starts[1] == 3 && ends[1] - starts[1] == 5, "newline is a hard break");

    /* A word longer than the width is cut. */
    n = ui_cells_wrap("abcdefghij", 4, starts, ends, 8);
    CHECK(n == 3 && ends[0] - starts[0] == 4, "long word cut");

    /* Modal and menu. */
    ui_cells_modal(&c, 4, 10, 204, "M", 255, &top, &left);
    CHECK(top == 1 && left == 4, "modal centred");
    CHECK(ui_cells_menu(&c, 1, 1, items, 2, 1, 204, 255, 204) == 9, "menu width");
    CHECK(cell_ch(&c, 3, 2) == '>', "selected marker");

    /* Bar and button. */
    ui_cells_bar(&c, 0, 0, 20, "Hi", 0, 204, 0);
    CHECK(cell_ch(&c, 0, 1) == 'i' && cell_ch(&c, 0, 19) == ' ', "bar pads");
    CHECK(c.back[19].bg == 204 && c.back[19].fg == 0, "bar colour to the end");
    ui_cells_button(&c, 2, 0, 6, ":D", 7, 221);
    CHECK(cell_ch(&c, 3, 2) == ':' && c.back[3 * 20 + 2].fg == 221, "button text centred");
    CHECK(cell_ch(&c, 2, 0) == '.' && c.back[2 * 20].fg == 7, "button border");

    /* Hit regions: the last added (drawn on top) wins, with the offset inside it. */
    {
        ui_hit h; int dr = -1, dc = -1;
        ui_hit_reset(&h);
        ui_hit_add(&h, 1, 0, 0, 6, 20);
        ui_hit_add(&h, 2, 2, 4, 2, 5);
        CHECK(ui_hit_at(&h, 3, 6, &dr, &dc) == 2 && dr == 1 && dc == 2, "topmost region wins");
        CHECK(ui_hit_at(&h, 0, 0, 0, 0) == 1 && ui_hit_at(&h, 6, 0, 0, 0) == -1, "outside is -1");
    }
    /* Popup: clamped like context-menus.ts, separators skipped, click and keys pick. */
    {
        static const char *const pm[] = { "Reply", "---", "Delete" };
        ui_popup p;
        ui_popup_open(&p, pm, 3, 4UL, 5, 18, 25, 80);
        CHECK(p.open && p.top == 5 && p.left == 18 && p.w == 24 && p.sel == 0, "popup opens at the click");
        ui_popup_open(&p, pm, 3, 4UL, 24, 79, 25, 80);
        CHECK(p.top == 25 - 7 && p.left == 80 - 26, "popup clamped to the screen");
        CHECK(ui_popup_key(&p, UI_KEY_DOWN) == UI_POPUP_STAY && p.sel == 2, "down skips the separator");
        CHECK(ui_popup_key(&p, UI_KEY_ENTER) == 2 && !p.open, "enter picks and closes");
        ui_popup_open(&p, pm, 3, 4UL, 0, 0, 6, 20);
        CHECK(ui_popup_click(&p, p.top + 2, 3) == UI_POPUP_STAY && p.open, "separator click stays");
        ui_popup_draw(&c, &p, 7, 255, 204, 196);
        CHECK(cell_ch(&c, p.top + 2, 2) == '-' && c.back[(p.top + 3) * 20 + 4].fg == 196, "separator and alert colour drawn");
        CHECK(ui_popup_click(&p, p.top + 3, 4) == 2 && !p.open, "click picks the item");
        ui_popup_open(&p, pm, 3, 0UL, 0, 0, 6, 20);
        CHECK(ui_popup_key(&p, UI_KEY_ESC) == UI_POPUP_CLOSE && !p.open, "esc closes");
        ui_popup_open(&p, pm, 3, 0UL, 0, 0, 6, 20);
        CHECK(ui_popup_click(&p, 5, 0) == UI_POPUP_CLOSE && !p.open, "click outside closes");
    }

    /* Invalidate resends everything. */
    ui_cells_invalidate(&c);
    flush_into(&c, &b);
    CHECK(c.sent == 20 * 6 - 1, "invalidate resends all");
    ui_cells_close(&c);

    /* The diff flush's exact bytes for a known change set on a 5x3 canvas: the last column of row 0
     * (the column counter must wrap to the next row), two neighbours at the start of row 1 (no
     * cursor move between them) and one cell in row 2 in a new colour. The flush steps row and
     * column instead of dividing the index; a wrong step shows up here as a wrong ESC[r;cH. */
    {
        static const char want[] = "\033[1;5H\033[0;49;37mA" "\033[2;1HBC" "\033[3;3H\033[0;49;32mD";
        CHECK(ui_cells_open(&c, 5, 3) == 0, "open 5x3");
        flush_into(&c, &b);
        ui_cells_pen(&c, 7, UI_CELLS_DEFAULT, 0);
        ui_cells_put(&c, 0, 4, 'A');
        ui_cells_text(&c, 1, 0, "BC", -1);
        ui_cells_pen(&c, 2, UI_CELLS_DEFAULT, 0);
        ui_cells_put(&c, 2, 2, 'D');
        flush_into(&c, &b);
        CHECK(strcmp(wire, want) == 0, "flush bytes for a known change set (row/col stepping)");
        CHECK(c.sent == 4, "four cells sent");
        flush_into(&c, &b);
        CHECK(b.len == 0, "a second flush sends nothing");
        ui_cells_fill(&c, -1, 3, 3, 9, '#');        /* clipped: rows -1..1 and columns 3..11 -> rows 0..1, columns 3..4 */
        CHECK(cell_ch(&c, 0, 3) == '#' && cell_ch(&c, 1, 4) == '#' && cell_ch(&c, 2, 3) == ' ' && cell_ch(&c, 0, 2) == ' ',
              "fill clips to the canvas");
    }

    ui_cells_close(&c);

    /* Attribute marker (UI_CELLS_M_ATTR + arg): italic, underline, reverse as flags; BASE and the call's end restore. */
    {
        const char *s = "a\006" "B" "b" "\006@" "c";                    /* a, italic b, plain c */
        CHECK(ui_cells_marked_cols(s) == 3, "attr marker and its arg take no columns");
        CHECK(ui_cells_open(&c, 8, 1) == 0, "open attr");
        ui_cells_marked(&c, 0, 0, s, 0, (int)strlen(s), 8);
        CHECK(!(c.back[0].flags & UI_CELLS_ITALIC) && (c.back[1].flags & UI_CELLS_ITALIC) && !(c.back[2].flags & UI_CELLS_ITALIC), "italic only on b");
        s = "\006" "G" "x" "\004" "y";                                   /* underline+italic+reverse, then BASE */
        ui_cells_marked(&c, 0, 3, s, 0, (int)strlen(s), 5);
        CHECK((c.back[3].flags & (UI_CELLS_UNDERLINE | UI_CELLS_ITALIC | UI_CELLS_REVERSE)) == (UI_CELLS_UNDERLINE | UI_CELLS_ITALIC | UI_CELLS_REVERSE), "all three attributes");
        CHECK((c.back[4].flags & (UI_CELLS_UNDERLINE | UI_CELLS_ITALIC | UI_CELLS_REVERSE)) == 0, "BASE clears the attributes");
        CHECK(c.attr == 0, "the pen's attributes restored at the end");
        flush_into(&c, &b);
        CHECK(strstr(wire, "3;") != 0 && strstr(wire, "4;") != 0 && strstr(wire, "7;") != 0, "SGR 3, 4 and 7 sent");
        ui_cells_close(&c);
    }

    /* Two-column glyphs (UI_CELLS_M_WIDE + id): one UTF-8 send, two columns, never torn. */
    {
        static const char *const glyphs[1] = { "\360\237\221\215" };   /* U+1F44D */
        const char *s = "a\005\001x3 bc";                                /* "a" thumbs "x3 bc" */
        char *at;
        CHECK(ui_cells_marked_cols(s) == 8, "a wide glyph counts two columns");
        n = ui_cells_wrap("ab \005\001 3", 4, starts, ends, 8);         /* "ab" + glyph would be 5 */
        CHECK(n == 2 && starts[1] == 3, "wrap moves a wide glyph whole to the next line");
        n = ui_cells_wrap("a\005\001", 2, starts, ends, 8);
        CHECK(n == 2 && ends[0] == 1, "a glyph that cannot share a line is not split");
        CHECK(ui_cells_open(&c, 12, 2) == 0, "open wide");
        ui_cells_wide_table(&c, glyphs, 1);
        flush_into(&c, &b);
        ui_cells_marked(&c, 0, 0, s, 0, (int)strlen(s), 12);
        CHECK((c.back[1].flags & UI_CELLS_WIDE) && (c.back[2].flags & UI_CELLS_WIDE_TAIL), "head and tail cells");
        flush_into(&c, &b);
        at = strstr(wire, "\360\237\221\215");
        CHECK(at != 0 && strstr(at + 1, "\360\237\221\215") == 0, "glyph sent once");
        CHECK(at != 0 && strncmp(at + 4, "x3", 2) == 0, "cursor counted two columns: the text follows with no move");
        flush_into(&c, &b);
        CHECK(b.len == 0, "a second flush sends nothing");
        /* The tail overwritten: the orphan head goes out as a blank, never half a glyph. */
        ui_cells_marked(&c, 0, 2, "x", 0, 1, 1);
        flush_into(&c, &b);
        CHECK(strstr(wire, "\360") == 0 && strstr(wire, " x") != 0, "a broken pair is sent as a blank");
        /* No table registered (latin1 caller): the marker is drawn as blanks, no high bytes. */
        ui_cells_close(&c);
        CHECK(ui_cells_open(&c, 12, 2) == 0, "open no table");
        ui_cells_marked(&c, 0, 0, s, 0, (int)strlen(s), 12);
        flush_into(&c, &b);
        CHECK(strstr(wire, "\360") == 0, "no table: no UTF-8 bytes");
        ui_cells_close(&c);
    }
    fuzz_hot_paths();
    if (fails == 0) printf("test_ui_cells: all passed\n");
    return fails == 0 ? 0 : 1;
}
