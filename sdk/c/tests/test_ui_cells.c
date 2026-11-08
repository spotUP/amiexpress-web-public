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
    if (fails == 0) printf("test_ui_cells: all passed\n");
    return fails == 0 ? 0 : 1;
}
