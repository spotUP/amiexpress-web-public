/*
 * ui_grid - sections of entries in columns, for a menu door (plan M8).
 * See include/ui_grid.h. No allocation: lines and pages live in the struct.
 */
#include "ui_grid.h"
#include "ui_key.h"
#include "ui_theme.h"
#include <string.h>

#define KEY_CAP   15
#define LABEL_CAP 26
#define RIGHT_CAP 10
#define CELL_BUF  260

static int imax(int a, int b) { return a > b ? a : b; }
static int imin(int a, int b) { return a < b ? a : b; }

static int text_len(ui_grid_text_fn fn, void *ctx, int i)
{
    const char *s = fn ? fn(ctx, i) : 0;
    return s ? (int)strlen(s) : 0;
}

static const char *text_of(ui_grid_text_fn fn, void *ctx, int i)
{
    const char *s = fn ? fn(ctx, i) : 0;
    return s ? s : "";
}

void ui_grid_init(ui_grid *g)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));
    g->max_columns = 4;
    g->band_after_section = -1;
    g->ground = -1;
    g->ink = UI_TOKEN(UI_T_INK);
    g->accent = UI_TOKEN(UI_T_ACCENT);
    g->dim = UI_TOKEN(UI_T_DIM);
    g->selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    g->selected_bg = UI_TOKEN(UI_T_SELECTION_BG);
    g->drawn_selected = -1;
    g->drawn_offset = -1;
}

static void measure(ui_grid *g)
{
    int i, n = imin(g->entry_count, UI_GRID_MAX_ENTRIES);
    g->key_width = g->label_width = g->right_width = 0;
    for (i = 0; i < n; i++) {
        g->key_width = imax(g->key_width, text_len(g->key, g->ctx, i));
        g->label_width = imax(g->label_width, text_len(g->label, g->ctx, i));
        if (g->right) g->right_width = imax(g->right_width, text_len(g->right, g->ctx, i));
    }
    g->key_width = imin(g->key_width, KEY_CAP);
    g->label_width = imin(g->label_width, LABEL_CAP);
    g->right_width = imin(g->right_width, RIGHT_CAP);
}

static int cell_width(const ui_grid *g)
{
    return 2 + g->key_width + 2 + g->label_width
         + (g->right_width ? 1 + g->right_width : 0) + 2;
}

static void push(ui_grid *g, int kind, int first, int count)
{
    ui_grid_line *l;
    if (g->line_count >= UI_GRID_MAX_LINES) return;
    l = &g->lines[g->line_count++];
    l->kind = kind; l->first = first; l->count = count;
}

static void build_lines(ui_grid *g)
{
    int s, e = 0, n = imin(g->entry_count, UI_GRID_MAX_ENTRIES), r;

    g->line_count = 0;
    for (s = 0; s < g->section_count; s++) {
        int first = e;
        while (e < n && g->entry_section && g->entry_section[e] == s) e++;
        if (e == first) continue;                      /* a section with no entries has no header */
        push(g, UI_GL_HEADER, s, 0);
        for (r = first; r < e; r += g->columns)
            push(g, UI_GL_ITEMS, r, imin(g->columns, e - r));
        if (s == g->band_after_section)
            for (r = 0; r < g->band_rows; r++) push(g, UI_GL_BAND, r, 0);
    }
}

static void build_pages(ui_grid *g)
{
    int start = 0, h = g->height;

    g->page_count = 0;
    if (h < 1 || g->line_count == 0) {
        g->page_start[0] = 0; g->page_start[1] = g->line_count; g->page_count = 1;
        return;
    }
    while (start < g->line_count) {
        int end = start + h, again = 1;
        /* The last page (the UI_GRID_MAX_PAGES-1'th) takes the rest, however long: the page table is
           fixed-size, so a catalogue that needs more pages gets one overlong final page, never a lost entry. */
        if (g->page_count >= UI_GRID_MAX_PAGES - 1 || end >= g->line_count) {
            end = g->line_count;
        } else {
            while (again) {
                again = 0;
                if (end > start + 1 && g->lines[end - 1].kind == UI_GL_HEADER) { end--; again = 1; }
                if (end > start + 1 && g->lines[end].kind == UI_GL_BAND && g->lines[end - 1].kind == UI_GL_BAND) {
                    while (end > start + 1 && g->lines[end - 1].kind == UI_GL_BAND) end--;   /* never split a band */
                    again = 1;
                }
            }
        }
        g->page_start[g->page_count++] = start;
        start = end;
    }
    g->page_start[g->page_count] = g->line_count;
}

static int last_entry(const ui_grid *g)
{
    int i;
    for (i = g->line_count - 1; i >= 0; i--)
        if (g->lines[i].kind == UI_GL_ITEMS) return g->lines[i].first + g->lines[i].count - 1;
    return 0;
}

/* The ITEMS line holding `entry`, -1 when it is not laid out. */
static int line_of(const ui_grid *g, int entry, int *col)
{
    int i;
    for (i = 0; i < g->line_count; i++)
        if (g->lines[i].kind == UI_GL_ITEMS && entry >= g->lines[i].first
            && entry < g->lines[i].first + g->lines[i].count) {
            if (col) *col = entry - g->lines[i].first;
            return i;
        }
    return -1;
}

int ui_grid_page(const ui_grid *g)
{
    int l = line_of(g, g->selected, 0), p;
    if (l < 0) return 0;
    for (p = g->page_count - 1; p > 0; p--)
        if (g->page_start[p] <= l) return p;
    return 0;
}

static void follow(ui_grid *g)
{
    int l = line_of(g, g->selected, 0), h = g->height, maxoff;

    if (h < 1) { g->offset = 0; return; }
    if (g->mode == UI_GRID_PAGES) { g->offset = g->page_start[ui_grid_page(g)]; return; }
    maxoff = imax(0, g->line_count - h);
    if (l >= 0) {
        if (l < g->offset) g->offset = imax(0, l - h + 1);
        else if (l >= g->offset + h) {
            g->offset = l;
            if (l > 0 && g->lines[l - 1].kind == UI_GL_HEADER) g->offset = l - 1;
        }
    }
    if (g->offset > maxoff) g->offset = maxoff;
    if (g->offset < 0) g->offset = 0;
}

void ui_grid_layout(ui_grid *g)
{
    int cw, last;

    if (!g) return;
    measure(g);
    cw = cell_width(g);
    if (g->width <= 40) g->columns = 1;
    else {
        g->columns = cw > 0 ? g->width / cw : 1;
        g->columns = imin(g->columns, g->max_columns > 0 ? g->max_columns : 4);
        if (g->columns < 1) g->columns = 1;
    }
    g->col_width = g->width / g->columns;
    if (cw > g->col_width) g->label_width = imax(4, g->label_width - (cw - g->col_width));
    /* A band taller than the box can never show. Computed, so the caller's band_height is left alone
       and the band comes back when the box grows. */
    g->band_rows = g->band_height > g->height ? 0 : g->band_height;
    build_lines(g);
    build_pages(g);
    last = last_entry(g);
    if (g->selected > last) g->selected = last;
    if (g->selected < 0) g->selected = 0;
    follow(g);
}

/* One step of the same-column walk: delta -1 up, +1 down; -1 when there is no such row. */
static int step_row(const ui_grid *g, int entry, int delta)
{
    int col, l = line_of(g, entry, &col);
    if (l < 0) return -1;
    for (l += delta; l >= 0 && l < g->line_count; l += delta)
        if (g->lines[l].kind == UI_GL_ITEMS)
            return g->lines[l].first + imin(col, g->lines[l].count - 1);
    return -1;
}

static int first_entry_at_or_after(const ui_grid *g, int line)
{
    for (; line < g->line_count; line++)
        if (g->lines[line].kind == UI_GL_ITEMS) return g->lines[line].first;
    return -1;
}

void ui_grid_select(ui_grid *g, int index)
{
    int last = last_entry(g);
    if (index > last) index = last;
    if (index < 0) index = 0;
    g->selected = index;
    follow(g);
}

int ui_grid_move(ui_grid *g, int key)
{
    int before_sel, before_off, target = -1, i;

    if (!g || g->line_count == 0) return 0;
    before_sel = g->selected;
    before_off = g->offset;
    switch (key) {
    case UI_KEY_UP:    target = step_row(g, g->selected, -1); break;
    case UI_KEY_DOWN:  target = step_row(g, g->selected, 1); break;
    case UI_KEY_LEFT:  target = g->selected - 1; break;
    case UI_KEY_RIGHT: target = g->selected + 1; break;
    case UI_KEY_HOME:  target = 0; break;
    case UI_KEY_END:   target = last_entry(g); break;
    case UI_KEY_PGUP:
    case UI_KEY_PGDN: {
        int dir = key == UI_KEY_PGUP ? -1 : 1;
        if (g->mode == UI_GRID_PAGES) {
            int p = ui_grid_page(g) + dir;
            if (p >= 0 && p < g->page_count) target = first_entry_at_or_after(g, g->page_start[p]);
        } else {
            int cur = g->selected, next;
            for (i = 0; i < imax(1, g->height - 1); i++) {
                next = step_row(g, cur, dir);
                if (next < 0) break;
                cur = next;
            }
            target = cur;
        }
        break; }
    default: return 0;
    }
    if (target < 0) return 0;
    ui_grid_select(g, target);
    return g->selected != before_sel || g->offset != before_off;
}

/* ---- drawing --------------------------------------------------------- */

/* The cell as exactly `cw` characters: mark, key, label, right. */
static void compose(const ui_grid *g, int entry, int selected, char *buf, int cw)
{
    const char *key = text_of(g->key, g->ctx, entry);
    const char *label = text_of(g->label, g->ctx, entry);
    const char *right = text_of(g->right, g->ctx, entry);
    const char *flags = text_of(g->flags, g->ctx, entry);
    int i, pos, lab_at, rl = (int)strlen(right);

    if (cw > CELL_BUF - 1) cw = CELL_BUF - 1;
    memset(buf, ' ', (size_t)cw);
    if (selected && g->caret) {
        for (i = 0; g->caret[i] && i < 2 && i < cw; i++) buf[i] = g->caret[i];
    } else if (strchr(flags, 'C') && cw > 0) {
        buf[0] = '*';
    }
    for (i = 0; key[i] && i < g->key_width && 2 + i < cw; i++) buf[2 + i] = key[i];
    lab_at = 2 + g->key_width + 2;
    for (i = 0; label[i] && i < g->label_width && lab_at + i < cw; i++) buf[lab_at + i] = label[i];
    if (g->right_width && rl > 0) {
        rl = imin(rl, g->right_width);
        pos = imax(lab_at + g->label_width + 1, cw - rl);
        for (i = 0; i < rl && pos + i < cw; i++) buf[pos + i] = right[i];
    }
    buf[cw] = '\0';
}

static void draw_cell(ui_grid *g, ansi_buf *b, int entry, int row, int col)
{
    char buf[CELL_BUF];
    int cw = imin(g->col_width - 1, CELL_BUF - 1), chosen = entry == g->selected;
    const char *flags = text_of(g->flags, g->ctx, entry);
    int grey = strchr(flags, 'G') != 0, key_end = 2 + g->key_width + 2, lab_end = key_end + g->label_width;

    if (cw < 1) return;
    compose(g, entry, chosen, buf, cw);
    if (chosen) {
        /* A bar in the selection's colours; with a caret, the caret IS the mark and no bar is painted. */
        if (g->caret) ansi_color(b, g->selected_fg, g->ground, 1);
        else          ansi_color(b, g->selected_fg, g->selected_bg, 1);
        ansi_text(b, row, col, buf, cw);
        return;
    }
    if (key_end > cw) key_end = cw;
    if (lab_end > cw) lab_end = cw;
    ansi_color(b, grey ? g->dim : g->accent, g->ground, 0);
    ansi_text(b, row, col, buf, key_end);
    ansi_color(b, grey ? g->dim : g->ink, g->ground, 0);
    ansi_text(b, row, col + key_end, buf + key_end, lab_end - key_end);
    if (cw > lab_end) {
        ansi_color(b, g->dim, g->ground, 0);
        ansi_text(b, row, col + lab_end, buf + lab_end, cw - lab_end);
    }
}

static void draw_header(ui_grid *g, ansi_buf *b, int section, int row)
{
    char title[CELL_BUF], rule[CELL_BUF];
    const char *t = text_of(g->section_title, g->ctx, section);
    int w = imin(g->width, CELL_BUF - 1), tl = 0;

    title[tl++] = ' ';
    while (*t && tl < w - 3) title[tl++] = *t++;
    title[tl++] = ' ';
    title[tl] = '\0';
    ansi_color(b, g->accent, g->ground, 1);
    ansi_text(b, row, g->left + 1, title, tl);
    if (w - 1 - tl > 0) {
        memset(rule, '-', (size_t)(w - 1 - tl));
        rule[w - 1 - tl] = '\0';
        ansi_color(b, g->dim, g->ground, 0);
        ansi_text(b, row, g->left + 1 + tl, rule, w - 1 - tl);
    }
}

static void blank_row(ui_grid *g, ansi_buf *b, int row)
{
    ansi_color(b, g->ink, g->ground, 0);
    ansi_text(b, row, g->left, "", g->width);
}

static void draw_line(ui_grid *g, ansi_buf *b, int li, int row)
{
    const ui_grid_line *l;
    int c;

    if (li < 0 || li >= g->line_count) { blank_row(g, b, row); return; }
    l = &g->lines[li];
    blank_row(g, b, row);
    if (l->kind == UI_GL_HEADER) draw_header(g, b, l->first, row);
    else if (l->kind == UI_GL_ITEMS)
        for (c = 0; c < l->count; c++) draw_cell(g, b, l->first + c, row, g->left + c * g->col_width);
    /* BAND: left blank - the board draws the logo over it after the flush. */
}

void ui_grid_draw(ui_grid *g, ansi_buf *b)
{
    int r;
    if (!g || !b || g->width < 1 || g->height < 1) return;
    for (r = 0; r < g->height; r++) draw_line(g, b, g->offset + r, g->top + r);
    g->drawn_selected = g->selected;
    g->drawn_offset = g->offset;
}

static void redraw_entry(ui_grid *g, ansi_buf *b, int entry)
{
    int col, l = line_of(g, entry, &col);
    if (l < g->offset || l >= g->offset + g->height) return;
    draw_cell(g, b, entry, g->top + l - g->offset, g->left + col * g->col_width);
}

int ui_grid_draw_changed(ui_grid *g, ansi_buf *b)
{
    if (!g || !b) return 0;
    if (g->drawn_offset < 0 || g->offset != g->drawn_offset) { ui_grid_draw(g, b); return 1; }
    if (g->drawn_selected != g->selected) {
        if (g->drawn_selected >= 0) redraw_entry(g, b, g->drawn_selected);
        redraw_entry(g, b, g->selected);
        g->drawn_selected = g->selected;
    }
    return 0;
}

int ui_grid_hit(const ui_grid *g, int row, int col)
{
    int li, c;
    if (!g || g->col_width < 1 || row < g->top || row >= g->top + g->height) return -1;
    if (col < g->left || col >= g->left + g->width) return -1;
    li = g->offset + row - g->top;
    if (li >= g->line_count || g->lines[li].kind != UI_GL_ITEMS) return -1;
    c = (col - g->left) / g->col_width;
    return c < g->lines[li].count ? g->lines[li].first + c : -1;
}

int ui_grid_band_row(const ui_grid *g)
{
    int r;
    if (!g) return 0;
    for (r = 0; r < g->height; r++) {
        int li = g->offset + r;
        if (li >= g->line_count) break;
        if (g->lines[li].kind == UI_GL_BAND) return g->top + r;
    }
    return 0;
}
