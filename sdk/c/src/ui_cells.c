/* ui_cells.c - see ui_cells.h. */
#include <stdlib.h>
#include <string.h>

#include "ui_cells.h"

static void set_cell(ui_cell *p, int ch, int fg, int bg, int bold)
{
    p->ch = (unsigned char)ch;
    p->fg = (unsigned char)(fg < 0 ? 7 : fg);
    p->bg = (unsigned char)(bg < 0 ? 0 : bg);
    p->flags = (unsigned char)((bold ? UI_CELLS_BOLD : 0) | (bg < 0 ? UI_CELLS_BG_DEFAULT : 0));
}

int ui_cells_open(ui_cells *c, int cols, int rows)
{
    long n, i;
    memset(c, 0, sizeof *c);
    if (cols <= 0 || rows <= 0) return -1;
    n = (long)cols * rows;
    c->back = (ui_cell *)malloc((size_t)n * sizeof(ui_cell));
    c->front = (ui_cell *)malloc((size_t)n * sizeof(ui_cell));
    if (c->back == 0 || c->front == 0) { ui_cells_close(c); return -1; }
    c->cols = cols;
    c->rows = rows;
    for (i = 0; i < n; i++) { set_cell(&c->back[i], ' ', 7, -1, 0); c->front[i] = c->back[i]; }
    c->full = 1;
    c->fg = 7; c->bg = UI_CELLS_DEFAULT; c->bold = 0;
    return 0;
}

void ui_cells_close(ui_cells *c)
{
    free(c->back);
    free(c->front);
    c->back = c->front = 0;
    c->cols = c->rows = 0;
}

void ui_cells_invalidate(ui_cells *c) { c->full = 1; }

void ui_cells_pen(ui_cells *c, int fg, int bg, int bold)
{
    c->fg = fg; c->bg = bg; c->bold = bold;
}

void ui_cells_put(ui_cells *c, int row, int col, int ch)
{
    if (row < 0 || col < 0 || row >= c->rows || col >= c->cols) return;
    set_cell(&c->back[(long)row * c->cols + col], ch, c->fg, c->bg, c->bold);
}

int ui_cells_text(ui_cells *c, int row, int col, const char *s, int max)
{
    int n = 0;
    if (max < 0) max = c->cols - col;
    while (s[n] != '\0' && n < max) { ui_cells_put(c, row, col + n, (unsigned char)s[n]); n++; }
    return n;
}

void ui_cells_fill(ui_cells *c, int row, int col, int h, int w, int ch)
{
    int r, k;
    for (r = 0; r < h; r++) for (k = 0; k < w; k++) ui_cells_put(c, row + r, col + k, ch);
}

void ui_cells_box(ui_cells *c, int top, int left, int h, int w, int border_fg, const char *label, int label_fg)
{
    int fg = c->fg, bold = c->bold, r, k, at;
    if (h < 2 || w < 2) return;
    c->fg = border_fg; c->bold = 0;
    ui_cells_put(c, top, left, '.');
    for (k = 1; k < w - 1; k++) ui_cells_put(c, top, left + k, '-');
    ui_cells_put(c, top, left + w - 1, '.');
    for (r = 1; r < h - 1; r++) { ui_cells_put(c, top + r, left, '|'); ui_cells_put(c, top + r, left + w - 1, '|'); }
    ui_cells_put(c, top + h - 1, left, '`');
    for (k = 1; k < w - 1; k++) ui_cells_put(c, top + h - 1, left + k, '-');
    ui_cells_put(c, top + h - 1, left + w - 1, '\'');
    if (label != 0 && label[0] != '\0' && w > 6) {
        c->fg = label_fg;
        ui_cells_put(c, top, left + 2, ' ');
        at = 3 + ui_cells_text(c, top, left + 3, label, w - 6);
        ui_cells_put(c, top, left + at, ' ');
    }
    c->fg = fg; c->bold = bold;
}

void ui_cells_modal(ui_cells *c, int h, int w, int border_fg, const char *label, int label_fg, int *top, int *left)
{
    int t, l;
    if (w > c->cols) w = c->cols;
    if (h > c->rows) h = c->rows;
    l = (c->cols - w) / 2 - 1;
    if (l < 0) l = 0;
    t = (c->rows - h) / 2;
    ui_cells_fill(c, t + 1, l + 1, h - 2, w - 2, ' ');
    ui_cells_box(c, t, l, h, w, border_fg, label, label_fg);
    *top = t; *left = l;
}

int ui_cells_menu(ui_cells *c, int top, int left, const char *const *items, int n, int sel, int border_fg, int fg, int sel_fg)
{
    int i, wide = 0, w, pen = c->fg;
    for (i = 0; i < n; i++) { int l = (int)strlen(items[i]); if (l > wide) wide = l; }
    w = wide + 4;   /* "> " marker at left+1, text at left+3, one column before the border (the TS dropdown) */
    ui_cells_fill(c, top + 1, left + 1, n, w - 2, ' ');
    ui_cells_box(c, top, left, n + 2, w, border_fg, 0, 0);
    for (i = 0; i < n; i++) {
        c->fg = i == sel ? sel_fg : fg;
        ui_cells_text(c, top + 1 + i, left + 1, i == sel ? "> " : "  ", 2);
        ui_cells_text(c, top + 1 + i, left + 3, items[i], w - 4);
    }
    c->fg = pen;
    return w;
}

int ui_cells_marked_cols(const char *s)
{
    int n = 0;
    for (; *s != '\0'; s++) {
        if (*s == UI_CELLS_M_FG) { if (s[1] != '\0') s++; continue; }
        if (*s == UI_CELLS_M_BOLD || *s == UI_CELLS_M_PLAIN || *s == UI_CELLS_M_BASE) continue;
        n++;
    }
    return n;
}

int ui_cells_marked(ui_cells *c, int row, int col, const char *s, int from, int to, int max)
{
    int base_fg = c->fg, base_bold = c->bold, i, n = 0;
    for (i = 0; s[i] != '\0' && i < to; i++) {
        char ch = s[i];
        if (ch == UI_CELLS_M_FG && s[i + 1] != '\0') { c->fg = (unsigned char)s[++i]; continue; }
        if (ch == UI_CELLS_M_BOLD) { c->bold = 1; continue; }
        if (ch == UI_CELLS_M_PLAIN) { c->bold = 0; continue; }
        if (ch == UI_CELLS_M_BASE) { c->fg = base_fg; c->bold = base_bold; continue; }
        if (i < from) continue;
        if (n >= max) break;
        ui_cells_put(c, row, col + n, (unsigned char)ch);
        n++;
    }
    c->fg = base_fg; c->bold = base_bold;
    return n;
}

static int is_marker(const char *s, int i)
{
    return s[i] == UI_CELLS_M_BOLD || s[i] == UI_CELLS_M_PLAIN || s[i] == UI_CELLS_M_BASE || s[i] == UI_CELLS_M_FG;
}

int ui_cells_wrap(const char *s, int width, int *starts, int *ends, int max)
{
    int lines = 0, i = 0;
    if (width < 1) width = 1;
    while (s[i] != '\0' && lines < max) {
        int cols = 0, j = i, brk = -1, brk_next = -1;
        while (s[j] != '\0') {
            if (is_marker(s, j)) { j += (s[j] == UI_CELLS_M_FG && s[j + 1] != '\0') ? 2 : 1; continue; }
            if (s[j] == ' ') { brk = j; brk_next = j + 1; }
            if (cols == width) break;
            cols++;
            j++;
        }
        if (s[j] == '\0') { starts[lines] = i; ends[lines] = j; lines++; break; }
        if (s[j] == ' ') { brk = j; brk_next = j + 1; }
        if (brk <= i) { brk = j; brk_next = j; }   /* one word wider than the line: cut it */
        starts[lines] = i; ends[lines] = brk; lines++;
        i = brk_next;
    }
    if (lines == 0 && max > 0) { starts[0] = 0; ends[0] = 0; lines = 1; }
    return lines;
}

/* ---- the wire ---------------------------------------------------------- */

static void out_byte(ansi_buf *b, char ch)
{
    if (b->len + 1 > b->cap) { b->overflow = 1; return; }
    b->data[b->len++] = ch;
}

static void out_str(ansi_buf *b, const char *s) { while (*s != '\0') out_byte(b, *s++); }

static void out_int(ansi_buf *b, int v)
{
    char tmp[8];
    int n = 0;
    if (v == 0) { out_byte(b, '0'); return; }
    while (v > 0 && n < 7) { tmp[n++] = (char)('0' + v % 10); v /= 10; }
    while (n > 0) out_byte(b, tmp[--n]);
}

static void out_colour(ansi_buf *b, int base, int bright, int ext, int v)
{
    if (v < 8) out_int(b, base + v);
    else if (v < 16) out_int(b, bright + v - 8);
    else { out_int(b, ext); out_str(b, ";5;"); out_int(b, v); }
}

/* blessed's shape: ESC[0;[1;]<bg>;<fg>m */
static void out_sgr(ansi_buf *b, const ui_cell *p)
{
    out_str(b, "\033[0;");
    if (p->flags & UI_CELLS_BOLD) out_str(b, "1;");
    if (p->flags & UI_CELLS_BG_DEFAULT) out_str(b, "49");
    else out_colour(b, 40, 100, 48, p->bg);
    out_byte(b, ';');
    out_colour(b, 30, 90, 38, p->fg);
    out_byte(b, 'm');
}

static int same_style(const ui_cell *a, const ui_cell *b)
{
    return a->fg == b->fg && a->bg == b->bg && a->flags == b->flags;
}

void ui_cells_flush(ui_cells *c, ansi_buf *out, ui_cells_drain_fn drain, void *ctx)
{
    long i, n = (long)c->cols * c->rows;
    int cur_row = -1, cur_col = -1, have_style = 0;
    ui_cell style;
    memset(&style, 0, sizeof style);
    c->sent = 0;
    for (i = 0; i < n - 1; i++) {
        ui_cell *p = &c->back[i];
        int row = (int)(i / c->cols), col = (int)(i % c->cols);
        if (!c->full && memcmp(p, &c->front[i], sizeof *p) == 0) continue;
        if (drain != 0 && out->len > out->cap - 64) { drain(ctx); }
        if (row != cur_row || col != cur_col) {
            out_str(out, "\033["); out_int(out, row + 1); out_byte(out, ';'); out_int(out, col + 1); out_byte(out, 'H');
        }
        if (!have_style || !same_style(&style, p)) { out_sgr(out, p); style = *p; have_style = 1; }
        out_byte(out, (char)p->ch);
        c->front[i] = *p;
        c->sent++;
        cur_row = row;
        cur_col = col + 1;
        if (cur_col >= c->cols) cur_row = -1;
    }
    c->front[n - 1] = c->back[n - 1];
    if (have_style) {
        /* ansi_color's cache no longer matches the terminal. */
        out->last_fg = -1; out->last_bg = -1; out->last_bold = -1; out->last_reverse = -1;
    }
    c->full = 0;
}

/* One row of `w` cells in one colour: `text` from the left, spaces after it. The menu bar, the
 * chat pane's label bar and the status line are all this, in different colours. */
void ui_cells_bar(ui_cells *c, int row, int col, int w, const char *text, int fg, int bg, int bold)
{
    int pfg = c->fg, pbg = c->bg, pbold = c->bold, n = 0;
    ui_cells_pen(c, fg, bg, bold);
    if (text != 0) n = ui_cells_text(c, row, col, text, w);
    if (n < w) ui_cells_fill(c, row, col + n, 1, w - n, ' ');
    ui_cells_pen(c, pfg, pbg, pbold);
}

/* A bordered button three rows high: the border in `border_fg`, `text` centred inside in `fg`. */
void ui_cells_button(ui_cells *c, int top, int left, int w, const char *text, int border_fg, int fg)
{
    int pfg = c->fg, len = (int)strlen(text), at;
    if (w < 3) return;
    ui_cells_box(c, top, left, 3, w, border_fg, 0, 0);
    c->fg = fg;
    ui_cells_fill(c, top + 1, left + 1, 1, w - 2, ' ');
    at = (w - 2 - len) / 2;
    if (at < 0) at = 0;
    ui_cells_text(c, top + 1, left + 1 + at, text, w - 2);
    c->fg = pfg;
}
