/* test_ui_cells.c - native tests for the cell canvas and its diff flush. */
#include <stdio.h>
#include <string.h>

#include "ui_cells.h"

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

    /* Marked text keeps style across a wrap. */
    snprintf(marked, sizeof marked, "aa %c%cbbbb cc%c dd", UI_CELLS_M_FG, (char)221, UI_CELLS_M_BASE);
    CHECK(ui_cells_marked_cols(marked) == 13, "marked cols skip markers");
    n = ui_cells_wrap(marked, 7, starts, ends, 8);
    CHECK(n == 2, "wraps into two lines");
    ui_cells_marked(&c, 5, 0, marked, starts[1], ends[1], 20);
    CHECK(cell_ch(&c, 5, 0) == 'c' && c.back[5 * 20].fg == 221, "second line keeps marker colour");
    CHECK(cell_ch(&c, 5, 3) == 'd' && c.back[5 * 20 + 3].fg == 7, "base marker restores pen");

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

    /* Invalidate resends everything. */
    ui_cells_invalidate(&c);
    flush_into(&c, &b);
    CHECK(c.sent == 20 * 6 - 1, "invalidate resends all");

    ui_cells_close(&c);
    if (fails == 0) printf("test_ui_cells: all passed\n");
    return fails == 0 ? 0 : 1;
}
