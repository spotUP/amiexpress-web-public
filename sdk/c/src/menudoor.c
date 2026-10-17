/*
 * menudoor.c - the shared shell every menu door is (plan M10). C89. See menudoor.h.
 *
 * Nothing here knows MAIN from BULLETINS: strings, fallbacks and what Enter does
 * come from the door's menudoor_spec. The shape follows achieve.c (masthead
 * rail from the idle hook, theme from ae_user_theme, one flush per frame) and
 * draws only what changed: a key repaints two grid cells, the status row and the
 * prompt row; a page or a scroll repaints the grid box; the rail tick touches
 * the masthead only.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "aedoor.h"
#include "ae_session.h"
#include "ae_board_screen.h"
#include "ae_menu.h"
#include "ui_ansi.h"
#include "ui_chrome.h"
#include "ui_grid.h"
#include "ui_key.h"
#include "ui_list.h"
#include "ui_pages.h"
#include "ui_profile.h"
#include "ui_screen.h"
#include "ui_theme.h"
#include "menudoor.h"
#include "menudoor_model.h"

/* ------------------------------------------------------------------ model */

static int lower(int c) { return (c >= 'A' && c <= 'Z') ? c + 32 : c; }

static int ieq(const char *a, const char *b)
{
    for (; *a && *b; a++, b++) if (lower((unsigned char)*a) != lower((unsigned char)*b)) return 0;
    return *a == *b;
}

static int istarts(const char *s, const char *prefix)
{
    for (; *prefix; s++, prefix++) if (lower((unsigned char)*s) != lower((unsigned char)*prefix)) return 0;
    return 1;
}

int md_typeahead(const ae_menu *m, const char *typed)
{
    int i;
    if (!m || !typed || !typed[0]) return -1;
    for (i = 0; i < m->entry_count; i++) if (ieq(m->entries[i].key, typed)) return i;
    for (i = 0; i < m->entry_count; i++) if (istarts(m->entries[i].key, typed)) return i;
    return -1;
}

static int icontains(const char *s, const char *needle)
{
    for (; *s; s++) if (istarts(s, needle)) return 1;
    return 0;
}

/** Which D12 class entry `e` falls in for `typed`: 0 best .. 4, or -1 no match. */
static int palette_class(const ae_menu_entry *e, const char *typed)
{
    if (ieq(e->key, typed)) return 0;
    if (istarts(e->key, typed)) return 1;
    if (istarts(e->label, typed)) return 2;
    if (icontains(e->label, typed)) return 3;
    if (icontains(e->description, typed)) return 4;
    return -1;
}

int md_palette_rank(const ae_menu *m, const char *typed, int *order, int cap)
{
    int cls, i, n = 0;
    if (!m || !order || cap <= 0) return 0;
    if (!typed) typed = "";
    for (cls = 0; cls <= 4; cls++)                       /* one pass per class keeps catalogue order inside each */
        for (i = 0; i < m->entry_count && n < cap; i++)
            if ((typed[0] ? palette_class(&m->entries[i], typed) : 0) == cls) order[n++] = i;
    return n;
}

int md_q_leaves(const ae_menu *m)
{
    return m && md_typeahead(m, "q") < 0;          /* typeahead: an exact Q, else any key that starts with Q */
}

int md_digits_act(const ae_menu *m, const char *typed)
{
    int i, exact = -1;
    const char *c;
    if (!m || !typed || !typed[0]) return -1;
    for (c = typed; *c; c++) if (*c < '0' || *c > '9') return -1;
    for (i = 0; i < m->entry_count; i++) {
        if (strcmp(m->entries[i].key, typed) == 0) {
            if (exact >= 0) return -1;                       /* two entries with the same number: ask for Enter */
            exact = i;
        } else if (istarts(m->entries[i].key, typed)) {
            return -1;                                       /* "3" while "30" exists: wait */
        }
    }
    return exact;
}

static const ae_menu_logo *find_logo(const ae_menu *m, const char *position)
{
    int i;
    for (i = 0; i < m->logo_count; i++) if (strcmp(m->logos[i].position, position) == 0) return &m->logos[i];
    return 0;
}

static int logo_fits(const ae_menu_logo *l, int cols, int max_rows)
{
    return l && l->rows > 0 && l->cols > 0 && l->cols <= cols && l->rows <= max_rows;
}

/* With a header logo one empty row also sits between the list (or footer logo) and the status row (sysop 2026-10-15). */
static int grid_rows(int rows, int top, int footer_rows, int gap) { return rows - top - 2 - footer_rows - gap; }

void md_layout(const ae_menu *m, int cols, int rows, md_layout_out *o)
{
    const ae_menu_logo *header, *footer, *side, *between;

    memset(o, 0, sizeof *o);
    o->masthead_row = 1;
    o->status_row = rows > 1 ? rows - 1 : 1;               /* a one-row terminal stacks the rows: never row 0 */
    o->prompt_row = rows > 0 ? rows : 1;
    o->grid_left = 1;
    header = find_logo(m, "header");
    footer = find_logo(m, "footer");
    /* The list adapts to the logos (sysop ruling 2026-10-15): a logo is kept when it fits the width and the grid
       still has MD_MIN_GRID_ROWS rows below it; the grid takes whatever rows remain and a longer list scrolls. */
    if (!logo_fits(header, cols, rows)) header = 0;
    if (!logo_fits(footer, cols, rows)) footer = 0;
    o->grid_top = header ? 4 + header->rows : 2;          /* logo 1..h, blank, divider 2+h, blank, grid 4+h (sysop 2026-10-15: air around the rail) */
    o->grid_height = grid_rows(rows, o->grid_top, footer ? footer->rows : 0, header != 0);
    if (o->grid_height < MD_MIN_GRID_ROWS && footer) {    /* the grid is never squeezed: logos give way, footer first */
        footer = 0;
        o->grid_height = grid_rows(rows, o->grid_top, 0, header != 0);
    }
    if (o->grid_height < MD_MIN_GRID_ROWS && header) {
        header = 0;
        o->grid_top = 2;
        o->grid_height = grid_rows(rows, 2, 0, 0);
    }
    if (o->grid_height < 0) o->grid_height = 0;           /* a terminal too short for a grid draws none */
    if (header) {                                         /* sysop 2026-10-15: no title row above a header logo */
        o->masthead_row = 0;
        o->header_top = 1; o->header_rows = header->rows; o->header_cols = cols; o->divider_row = 2 + header->rows;
    }
    o->rail_row = o->divider_row ? o->divider_row : o->masthead_row;
    if (footer) { o->footer_top = o->grid_top + o->grid_height; o->footer_rows = footer->rows; o->footer_cols = cols; }
    o->grid_width = cols;
    side = find_logo(m, "side");
    if (cols >= MD_WIDE_COLS && logo_fits(side, cols / 2 - 2, o->grid_height)) {
        o->side_top = o->grid_top; o->side_rows = side->rows; o->side_cols = side->cols;
        o->side_left = cols - side->cols + 1;
        o->grid_width = cols - (side->cols + 2);
    }
    between = find_logo(m, "between");
    if (logo_fits(between, o->grid_width, o->grid_height - 1)) {
        o->band_after_section = between->after_section;
        o->band_height = between->rows;
        o->band_cols = o->grid_width;
    } else {
        o->band_after_section = -1;
    }
}

/* ------------------------------------------------------------------ shell */

#define LEVELS 2                      /* the menu (in cover flow: one section, a page) and an entry's child list */
#define TYPED_MAX 60
#define MOUSE_BATCH 8

typedef struct { ae_menu menu; ui_grid grid; md_layout_out lay; } level;

struct menudoor {
    const menudoor_spec *spec;
    ui_screen screen;
    ui_key_source keys;
    int pushback;
    const ui_theme *theme;
    const char *rail;                 /* "" at 40 columns: no effects there */
    level lv[LEVELS];
    int depth;
    char typed[TYPED_MAX + 1];
    int typed_len;
    int offwindow;                    /* the type-ahead match when it is below/above the window (named in the status row, not shown), else -1 */
    char notice[40];                  /* shown in the status row instead of the description, until the next key */
    char status_drawn[100];           /* the status row as the caller sees it; "" until a frame has drawn it */
    int status_valid;                 /* 0 = the row is not on the glass (a fresh frame is about to draw it) */
    char pager_drawn[UI_PAGES_INDICATOR_MAX];             /* the "Page n of m" at the right of the status row; "" when none */
    char title[80];                   /* what the masthead shows */
    int coverflow;                    /* the catalogue's style: lv[0] shows one section of `catalogue` at a time */
    int section_first;                /* cover flow: the catalogue index of the shown page's first entry */
    ui_pages pages;                   /* cover flow: the page key rule, indicator and turn */
    int palette;                      /* the search palette: lv[0] is the catalogue filtered by the typed text */
    int palette_total;                /* palette: the catalogue's entry count, the M of "N of M" */
    int ov_top, ov_left, ov_rows, ov_cols;    /* palette: the overlay box, 1-based (plan K3) */
    int escaped;                      /* palette: left by Esc, so the board's screen under the box comes back */
    int rail_tick;
    int gone;                         /* the caller hung up */
};

static struct menudoor shell;
static ae_menu catalogue;             /* cover flow: the whole catalogue, while lv[0] shows one page; palette: before the filter */
static int page_section[AE_MENU_MAX_SECTIONS];    /* cover flow: page -> catalogue section */
static char frame_buffer[49152];      /* Decision 26 */
static char session_storage[AE_SESSION_MIN_STORAGE];

/* The board's prompt as the row shows it: clipped to 72 COLUMNS, and the ONE length drawing, parking and the typing
   room all use. It carries the board's own colours (express.e:28417), so its length is its columns, not strlen. */
#define PROMPT_SHOWN 72
static int prompt_len(const level *lv)
{
    int n = ansi_text_cols(lv->menu.prompt);
    return n < PROMPT_SHOWN ? n : PROMPT_SHOWN;
}

/* The prompt clipped to PROMPT_SHOWN columns, its escapes kept whole, and the pen back to the row's ink after it:
   the prompt's last colour is not the caller's typing. */
static void add_prompt(char *line, const level *lv)
{
    char pen[4];
    strncat(line, lv->menu.prompt, (size_t)ansi_text_bytes(lv->menu.prompt, PROMPT_SHOWN));
    ui_ink(pen, UI_TOKEN(UI_T_INK));
    strcat(line, pen);
}

static level *cur(struct menudoor *d) { return &d->lv[d->depth]; }
static int ground(const struct menudoor *d)
{
    return d->screen.profile.cell_backgrounds ? UI_TOKEN(UI_T_GROUND) : -1;
}

static const char *g_key(void *c, int i) { return ((ae_menu *)c)->entries[i].key; }
static const char *g_label(void *c, int i) { return ((ae_menu *)c)->entries[i].label; }
static const char *g_right(void *c, int i) { return ((ae_menu *)c)->entries[i].right; }
static const char *g_flags(void *c, int i) { return ((ae_menu *)c)->entries[i].flags; }
static const char *g_section(void *c, int i) { return ((ae_menu *)c)->section_title[i]; }

static void configure(struct menudoor *d, level *lv, int selected)
{
    ui_grid *g = &lv->grid;
    ui_screen *sc = &d->screen;

    md_layout(&lv->menu, sc->cols, sc->rows, &lv->lay);
    ui_grid_init(g);
    g->top = lv->lay.grid_top; g->left = lv->lay.grid_left;
    g->height = lv->lay.grid_height; g->width = lv->lay.grid_width;
    g->entry_count = lv->menu.entry_count; g->section_count = lv->menu.section_count;
    g->entry_section = lv->menu.entry_section;
    g->key = g_key; g->label = g_label; g->section_title = g_section; g->right = g_right; g->flags = g_flags;
    /* A lone section's header only repeats the masthead or the logo (sysop 2026-10-15): the list starts at once. */
    if (lv->menu.section_count == 1) g->section_title = 0;
    g->band_after_section = lv->lay.band_after_section; g->band_height = lv->lay.band_height;
    g->mode = lv->menu.pages ? UI_GRID_PAGES : UI_GRID_SCROLL;
    /* Cover flow is one column of the page's section (sysop 2026-10-17): Left/Right turn the page, Up/Down scroll. */
    if (d->coverflow && lv == &d->lv[0]) { g->mode = UI_GRID_SCROLL; g->max_columns = 1; }
    g->ink = UI_TOKEN(UI_T_INK); g->accent = UI_TOKEN(UI_T_ACCENT); g->dim = UI_TOKEN(UI_T_DIM);
    g->selected_fg = UI_TOKEN(UI_T_SELECTION_INK); g->selected_bg = UI_TOKEN(UI_T_SELECTION_BG);
    g->ground = ground(d);
    g->erase_tail = sc->profile.line_erase && lv->lay.grid_left == 1 && lv->lay.grid_width == sc->cols;
    g->caret = sc->profile.caret_selection ? ">>" : 0;
    g->ctx = &lv->menu;
    ui_grid_layout(g);
    ui_grid_select(g, selected);
}

/* Under a header logo the rail is the DIVIDER between logo and grid (sysop, 2026-10-15) and the logo takes row 1:
   no title row above it; without a logo the rail stays on row 1 beside the title. Without a rail (40 columns, effects off, a theme
   with none) the divider is a static rule in the accent token, so a logo is still separated. */
/* Under a header logo the title shows nowhere. */

static void draw_divider(struct menudoor *d)
{
    ui_screen *sc = &d->screen;
    int row = cur(d)->lay.divider_row;
    char rule[256];
    int n = sc->cols < (int)sizeof rule - 1 ? sc->cols : (int)sizeof rule - 1;

    if (!row) return;
    if (d->rail[0]) {
        ui_masthead_draw_tick(&sc->buf, row, 1, sc->cols, "", d->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), d->rail_tick);
        return;
    }
    memset(rule, '-', (size_t)n); rule[n] = '\0';
    ansi_color(&sc->buf, UI_TOKEN(UI_T_ACCENT), ground(d), 0);
    ansi_text_raw(&sc->buf, row, 1, rule, n);
}

static void draw_masthead(struct menudoor *d)
{
    ui_screen *sc = &d->screen;
    if (cur(d)->lay.masthead_row)
        ui_masthead_draw_tick(&sc->buf, 1, 1, sc->cols, d->title, d->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), d->rail_tick);
    draw_divider(d);
}

/* ------------------------------------------------------------- the palette overlay (plan K3) */

/* The palette is a box over whatever the board was showing, not a screen of its own: 60x16 centred on a wide screen,
   the width less one column each side and 14 rows on a narrow one. Inside: the search field, the filtered list (the
   grid, one column), and the highlighted entry's description. No masthead: an overlay has no title row. */
#define OVERLAY_WIDE_COLS 60
#define OVERLAY_WIDE_ROWS 16
#define OVERLAY_NARROW_ROWS 14
#define OVERLAY_LABEL "Search"
#define OVERLAY_NOTHING_WIDE "Nothing matches: Enter runs it as typed"
#define OVERLAY_NOTHING_NARROW "No match: Enter runs it as typed"
#define OVERLAY_PAGER_ROOM 12                             /* " 999 of 999 ": the count at the field's right */

static void overlay_place(struct menudoor *d)
{
    int cols = d->screen.cols, rows = d->screen.rows;
    int w = cols >= OVERLAY_WIDE_COLS + 2 ? OVERLAY_WIDE_COLS : cols - 2;
    int h = cols >= OVERLAY_WIDE_COLS + 2 ? OVERLAY_WIDE_ROWS : OVERLAY_NARROW_ROWS;
    if (w < 4) w = cols;
    if (h > rows) h = rows;
    d->ov_cols = w; d->ov_rows = h;
    d->ov_left = (cols - w) / 2 + 1;
    d->ov_top = (rows - h) / 2 + 1;
}

/* The grid as the overlay's list: the rows between the field and the description, one column, section headers, no band. */
static void overlay_configure(struct menudoor *d, level *lv, int selected)
{
    ui_grid *g = &lv->grid;
    configure(d, lv, selected);                           /* the theme's inks, the texts, the caret: the grid as everywhere */
    g->top = d->ov_top + 2; g->left = d->ov_left + 1;
    g->height = d->ov_rows - 4; g->width = d->ov_cols - 2;
    g->band_after_section = -1; g->band_height = 0;      /* section headers as configure() set them: none for one section */
    g->mode = UI_GRID_SCROLL; g->max_columns = 1;
    g->erase_tail = 0;                                    /* an erase would take the board's screen beside the box */
    ui_grid_layout(g);
    ui_grid_select(g, selected);
}

static int overlay_typed_room(const struct menudoor *d)
{
    int room = d->ov_cols - 2 - 1 - prompt_len(&d->lv[0]) - OVERLAY_PAGER_ROOM;
    return room < 0 ? 0 : room < TYPED_MAX ? room : TYPED_MAX;
}

static int overlay_caret_column(const struct menudoor *d)
{
    return d->ov_left + 1 + 1 + prompt_len(&d->lv[0]) + d->typed_len;
}

/* The search field: the hint until something is typed, then "Search: <typed>"; the match count at the right. One run
   of exactly the box's inner width, pens inline, written raw (no padding pass, no reset). */
static void overlay_field(struct menudoor *d)
{
    ui_screen *sc = &d->screen;
    level *lv = &d->lv[0];
    int inner = d->ov_cols - 2, plen, at, gap, plen_pager;
    char line[640], pager[32], pen[4];   /* inner + the prompt's colours + pens */
    const char *hint;

    if (inner < 1 || inner > 300) return;
    sprintf(pager, "%d of %d", lv->menu.entry_count, d->palette_total);
    plen_pager = (int)strlen(pager);
    line[0] = ' '; line[1] = '\0';
    if (d->typed_len == 0) {
        hint = (int)strlen(MENUDOOR_PALETTE_HINT_WIDE) + 3 + plen_pager <= inner ? MENUDOOR_PALETTE_HINT_WIDE
                                                                                : MENUDOOR_PALETTE_HINT_NARROW;
        ui_ink(pen, UI_TOKEN(UI_T_ACCENT_ALT)); strcat(line, pen);
        strncat(line, hint, (size_t)(inner - 1));
        plen = 1 + (int)strlen(hint);
    } else {
        ui_ink(pen, UI_TOKEN(UI_T_DIM)); strcat(line, pen);
        add_prompt(line, lv);
        strncat(line, d->typed, TYPED_MAX);
        plen = 1 + prompt_len(lv) + d->typed_len;
    }
    if (plen > inner) plen = inner;
    at = (int)strlen(line);
    gap = inner - plen - plen_pager - 1;
    if (gap >= 1) {
        memset(line + at, ' ', (size_t)gap); at += gap;
        ui_ink(pen, UI_TOKEN(UI_T_DIM)); strcpy(line + at, pen); at += (int)strlen(pen);
        strcpy(line + at, pager); at += plen_pager;
        line[at++] = ' '; line[at] = '\0';
    } else if (plen < inner) {
        memset(line + at, ' ', (size_t)(inner - plen)); at += inner - plen;
        line[at] = '\0';
    }
    ansi_color(&sc->buf, UI_TOKEN(UI_T_INK), ground(d), 0);
    ansi_text_raw(&sc->buf, d->ov_top + 1, d->ov_left + 1, line, inner);
    if (d->typed_len == 0) {
        ui_screen_cursor(sc, 0);
    } else {
        ansi_goto(&sc->buf, d->ov_top + 1, overlay_caret_column(d));
        ui_screen_cursor(sc, 1);
    }
}

/* The description row: a notice, else "nothing matches", else the highlighted entry's description. A row already
   showing this text is not sent again; `full` is a fresh frame. */
static void overlay_description(struct menudoor *d, int full)
{
    level *lv = &d->lv[0];
    int inner = d->ov_cols - 2, n;
    char line[100];
    const char *text = "";

    if (inner < 1 || inner > (int)sizeof line - 1) return;
    if (d->notice[0]) text = d->notice;
    else if (lv->menu.entry_count == 0)
        text = d->typed_len == 0 ? "" : (int)strlen(OVERLAY_NOTHING_WIDE) + 1 <= inner ? OVERLAY_NOTHING_WIDE : OVERLAY_NOTHING_NARROW;
    else if (lv->grid.selected >= 0 && lv->grid.selected < lv->menu.entry_count)
        text = lv->menu.entries[lv->grid.selected].description;
    line[0] = ' ';
    strncpy(line + 1, text, sizeof line - 2);
    line[sizeof line - 1] = '\0';
    n = (int)strlen(line);
    if (n > inner) n = inner;
    memset(line + n, ' ', (size_t)(inner - n));
    line[inner] = '\0';
    if (!full && d->status_valid && strcmp(line, d->status_drawn) == 0) return;
    ansi_color(&d->screen.buf, UI_TOKEN(UI_T_DIM), ground(d), 0);
    ansi_text_raw(&d->screen.buf, d->ov_top + d->ov_rows - 2, d->ov_left + 1, line, inner);
    strcpy(d->status_drawn, line);
    d->status_valid = 1;
}

/* The first paint: the frame, then every inner cell exactly once. The grid draws its rows without the blank pass (each
   row is written over once, not blanked and then written: half the bytes); what that leaves is filled here - the
   one column a cell keeps free at its right, and the list rows below the last entry. Later repaints use the blank
   pass, which covers exactly the inner width. */
static void overlay_compose(struct menudoor *d)
{
    ui_grid *g = &d->lv[0].grid;
    char blank[300];
    int inner = d->ov_cols - 2, row, shown = g->entry_count - g->offset;

    ansi_box(&d->screen.buf, d->ov_top, d->ov_left, d->ov_rows, d->ov_cols, UI_TOKEN(UI_T_CHROME), OVERLAY_LABEL);
    overlay_field(d);
    ui_grid_draw_on_ground(g, &d->screen.buf);
    if (inner > 0 && inner < (int)sizeof blank) {
        memset(blank, ' ', (size_t)inner); blank[inner] = '\0';
        ansi_color(&d->screen.buf, UI_TOKEN(UI_T_INK), ground(d), 0);
        for (row = 0; row < g->height; row++) {
            if (row < shown) ansi_text_raw(&d->screen.buf, g->top + row, d->ov_left + inner, " ", 1);
            else ansi_text_raw(&d->screen.buf, g->top + row, d->ov_left + 1, blank, inner);
        }
    }
    overlay_description(d, 1);
}

/* Cover flow: a line across the row above the status bar says where the caller is among the pages, the way a
   scrollbar says where a list is (sysop 2026-10-17). Track DIM, thumb INK, as ui_list's bar. That row is md_layout's
   gap, blank in every layout, and a cell that did not change is not sent again. */
static void draw_pages_bar(struct menudoor *d)
{
    ui_screen *sc = &d->screen;
    int row = cur(d)->lay.status_row - 1, start, size;
    ui_pages_bar(&d->pages, sc->cols, &start, &size);
    ansi_bar_cells(&sc->buf, row, 1, start, UI_TOKEN(UI_T_DIM), '-');
    ansi_bar_cells(&sc->buf, row, 1 + start, size, UI_TOKEN(UI_T_INK), '#');
    ansi_bar_cells(&sc->buf, row, 1 + start + size, sc->cols - start - size, UI_TOKEN(UI_T_DIM), '-');
}

/* The status row follows the selection. Drawn smart: a row already showing this text is not sent again, and a
   changed one is written only as far as the longer of the old and new text (the rest of the bar is untouched
   bar). `full` is a fresh frame, where the whole bar goes out once. */
static void draw_status(struct menudoor *d, int full)
{
    level *lv = cur(d);
    ui_screen *sc = &d->screen;
    char line[100], pager[UI_PAGES_INDICATOR_MAX], offtext[64];
    const char *text = "";
    int width, first, room;

    if (d->palette) { overlay_description(d, full); return; }
    if (d->notice[0]) text = d->notice;
    else if (d->palette && lv->menu.entry_count == 0) text = d->typed_len > 0 ? "Nothing matches: Enter runs it as typed" : "";
    else if (d->typed_len > 0 && d->offwindow >= 0 && d->offwindow < lv->menu.entry_count) {
        /* The match is not on the glass and the window does not move for typing: say what Enter will find, and that Tab shows it. */
        sprintf(offtext, "Enter runs: %s  %s", lv->menu.entries[d->offwindow].key, lv->menu.entries[d->offwindow].label);
        text = offtext;
    }
    else if (lv->menu.entry_count > 0 && lv->grid.selected < lv->menu.entry_count)
        text = lv->menu.entries[lv->grid.selected].description;
    line[0] = ' ';
    strncpy(line + 1, text, sizeof line - 2);
    line[sizeof line - 1] = '\0';
    /* A caller who reads a menu a page at a time must be told which page: the number outranks the description,
       which gives way to it (a C64 row has no room for both in full). */
    pager[0] = '\0';
    if (d->palette)
        sprintf(pager, "%d of %d", lv->menu.entry_count, d->palette_total);
    else if (d->coverflow && d->depth == 0)
        ui_pages_indicator(&d->pages, pager, (int)sizeof pager);
    else if (lv->grid.mode == UI_GRID_PAGES && lv->grid.page_count > 1)
        sprintf(pager, "Page %d of %d", ui_grid_page(&lv->grid) + 1, lv->grid.page_count);
    room = sc->cols - (int)strlen(pager) - 2;
    if (pager[0] && room > 0 && (int)strlen(line) > room) line[room] = '\0';
    if (full || !d->status_valid || strcmp(pager, d->pager_drawn) != 0) {
        ui_status_draw(&sc->buf, lv->lay.status_row, 1, sc->cols, line, pager, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
    } else {
        /* From the first character that differs to the end of the longer text: the shared lead stays on the glass,
           and the shorter text's tail is cleared by the padding. */
        width = (int)strlen(line) > (int)strlen(d->status_drawn) ? (int)strlen(line) : (int)strlen(d->status_drawn);
        if (width > sc->cols) width = sc->cols;
        for (first = 0; first < width; first++) {
            char a = line[first], b = d->status_drawn[first];
            if ((a ? a : ' ') != (b ? b : ' ')) break;
        }
        if (first < width) {
            ansi_color(&sc->buf, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), 0);
            ansi_text(&sc->buf, lv->lay.status_row, 1 + first, line + (first < (int)strlen(line) ? first : (int)strlen(line)), width - first);
        }
    }
    if (d->coverflow && d->depth == 0) draw_pages_bar(d);
    strcpy(d->status_drawn, line);
    strcpy(d->pager_drawn, pager);
    d->status_valid = 1;
}

/* The prompt row has two states (sysop decision 2026-10-15). NAVIGATION, nothing typed: a short hint in a theme
   colour and the key bar at the right, cursor hidden - the row reads as a door, not as a BBS prompt. TYPING, from the
   first character: the board's prompt, what is typed, the typing key bar if it fits, cursor shown. One column stays
   free: the last cell of the last row scrolls a C64. */
static const char *hint_text(const struct menudoor *d, const char *bar, int room)
{
    int numbers = d->spec->digits_show_at_once;
    const char *wide = numbers ? MENUDOOR_HINT_NUMBER_WIDE : MENUDOOR_HINT_WIDE;
    if (d->palette) {
        wide = MENUDOOR_PALETTE_HINT_WIDE;
        return d->screen.cols >= 80 && (int)strlen(wide) + 2 + (bar ? (int)strlen(bar) : 0) <= room ? wide : MENUDOOR_PALETTE_HINT_NARROW;
    }
    wide = numbers ? MENUDOOR_HINT_NUMBER_WIDE : MENUDOOR_HINT_WIDE;
    if (d->screen.cols >= 80 && (int)strlen(wide) + 2 + (bar ? (int)strlen(bar) : 0) <= room) return wide;
    return numbers ? MENUDOOR_HINT_NUMBER_NARROW : MENUDOOR_HINT_NARROW;
}

/* The typing bar that fits beside the prompt and `typed_len` characters (one column stays free), or 0 when neither does. */
static const char *typing_bar(const struct menudoor *d, int typed_len)
{
    int room = d->screen.cols - 1, plen = prompt_len(&d->lv[d->depth]) + typed_len;
    const char *wide = d->palette ? MENUDOOR_PALETTE_KEYBAR_WIDE : MENUDOOR_TYPING_KEYBAR_WIDE;
    const char *narrow = d->palette ? MENUDOOR_PALETTE_KEYBAR_NARROW : MENUDOOR_TYPING_KEYBAR_NARROW;
    if (plen + 2 + (int)strlen(wide) <= room) return wide;
    if (plen + 2 + (int)strlen(narrow) <= room) return narrow;
    return 0;
}

/* What Esc and Enter do NOW: the key bar for the mode the row is in. */
static const char *mode_bar(struct menudoor *d, char *out, size_t cap)
{
    level *lv = cur(d);
    int wide = d->screen.cols >= 80;
    const menudoor_spec *spec = d->spec;
    const char *bar, *esc;

    if (d->typed_len > 0) return typing_bar(d, d->typed_len);
    /* Esc leaves to the prompt at the top and goes up a level in a child list: the bar says which. */
    bar = d->depth > 0 ? (wide ? MENUDOOR_CHILD_KEYBAR_WIDE : MENUDOOR_CHILD_KEYBAR_NARROW)
                       : (wide ? spec->keybar_wide : spec->keybar_narrow);
    /* Where q leaves too (top level, no Q entry), the bar says so: "Esc Prompt" becomes "Esc/q Prompt", and a door
       whose Esc says "Leave" (BULLETINS) gets "Esc/q Leave". */
    if (bar && d->depth == 0 && !d->palette && md_q_leaves(&lv->menu)
        && ((esc = strstr(bar, "Esc Prompt")) != 0 || (esc = strstr(bar, "Esc Leave")) != 0)
        && strlen(bar) + 3 < cap) {
        const char *word = esc + strlen("Esc ");            /* "Prompt" or "Leave" */
        memcpy(out, bar, (size_t)(esc - bar));
        out[esc - bar] = '\0';
        strcat(out, "Esc/q ");
        strcat(out, word);
        bar = out;
    }
    return bar;
}

static void draw_prompt(struct menudoor *d)
{
    level *lv = cur(d);
    ui_screen *sc = &d->screen;
    char line[768], bar_q[96], pen[4];                       /* room + the prompt's colours + pens + the bar */
    const char *bar = mode_bar(d, bar_q, sizeof bar_q), *lead;
    int row = lv->lay.prompt_row, room = sc->cols - 1 < 400 ? sc->cols - 1 : 400, plen, blen = bar ? (int)strlen(bar) : 0, gap, at;

    if (d->palette) { overlay_field(d); return; }
    ansi_color(&sc->buf, UI_TOKEN(UI_T_INK), ground(d), 0);
    if (d->typed_len == 0) {
        lead = hint_text(d, bar, room);
        plen = (int)strlen(lead);
        ui_ink(pen, UI_TOKEN(UI_T_ACCENT_ALT));
        strcpy(line, pen);
        strncat(line, lead, (size_t)room);
    } else {
        line[0] = '\0';
        add_prompt(line, lv);
        strncat(line, d->typed, TYPED_MAX);
        plen = prompt_len(lv) + d->typed_len;
        if (plen > room) plen = room;
    }
    at = (int)strlen(line);
    /* The row is built to exactly `room` columns - text, spaces, then the bar right-aligned in its own pen - and
       written raw, so no padding pass ends the row with a colour reset. */
    if (bar && bar[0] && plen + 2 + blen <= room) {
        gap = room - blen - plen;
        memset(line + at, ' ', (size_t)gap); at += gap;
        ui_ink(pen, UI_TOKEN(UI_T_DIM));
        strcpy(line + at, pen); at += (int)strlen(pen);
        strcpy(line + at, bar);
    } else if (plen < room) {
        memset(line + at, ' ', (size_t)(room - plen)); at += room - plen;
        line[at] = '\0';
    }
    ansi_text_raw(&sc->buf, row, 1, line, room);
    if (d->typed_len == 0) {
        ui_screen_cursor(sc, 0);
    } else {
        ansi_goto(&sc->buf, row, 1 + plen);
        ui_screen_cursor(sc, 1);
    }
}

/* Typing mode keeps the caller's cursor in the prompt; navigation mode has none to keep. */
static void park_cursor(struct menudoor *d)
{
    level *lv = cur(d);
    int plen;
    if (d->typed_len == 0) return;
    if (d->palette) { ansi_goto(&d->screen.buf, d->ov_top + 1, overlay_caret_column(d)); return; }
    plen = prompt_len(lv) + d->typed_len;
    if (plen > d->screen.cols - 1) plen = d->screen.cols - 1;
    ansi_goto(&d->screen.buf, lv->lay.prompt_row, 1 + plen);
}

static void compose_all(struct menudoor *d)
{
    level *lv = cur(d);
    if (d->palette) { overlay_compose(d); return; }       /* an overlay: the board's screen stays round the box */
    ansi_clear_ground(&d->screen.buf, UI_TOKEN(UI_T_INK), ground(d));
    draw_masthead(d);
    ui_grid_draw_on_ground(&lv->grid, &d->screen.buf);       /* the screen was just cleared to the ground: no blank pass */
    draw_status(d, 1);
    draw_prompt(d);
}

/* A logo is drawn by the BOARD, through the door's own output path, and it ends in an SGR reset the door never wrote:
   the terminal is back to its default colours while the writer still believes the ground is in force. The next
   colour the door asks for would then be judged "already set" and skipped, and a repainted cell would land on the
   terminal's own background instead of the theme's ground (invisible on a black terminal, wrong on every other). */
static void forget_colours(struct menudoor *d)
{
    ansi_buf *b = &d->screen.buf;
    b->last_fg = -1;
    b->last_bg = -1;
    b->last_bold = -1;
    b->last_reverse = 0;
}

/* Logos are the board's: it draws them through the door's own output path, so a wipe capture includes them. */
static void draw_between(struct menudoor *d)
{
    level *lv = cur(d);
    int row = ui_grid_band_row(&lv->grid);
    if (row && lv->lay.band_height > 0)
        ae_menu_logo_draw("between", row, lv->grid.left, lv->lay.band_height, lv->lay.band_cols);
    forget_colours(d);
}

static void draw_logos(struct menudoor *d)
{
    level *lv = cur(d);
    if (d->palette) return;                               /* the overlay has no logos */
    if (lv->lay.header_rows) ae_menu_logo_draw("header", lv->lay.header_top, 1, lv->lay.header_rows, lv->lay.header_cols);
    if (lv->lay.footer_rows) ae_menu_logo_draw("footer", lv->lay.footer_top, 1, lv->lay.footer_rows, lv->lay.footer_cols);
    if (lv->lay.side_cols) ae_menu_logo_draw("side", lv->lay.side_top, lv->lay.side_left, lv->lay.side_rows, lv->lay.side_cols);
    draw_between(d);
}

/* A whole frame, inside a board wipe when there is one. The wipe letters are the BOARD's (the catalogue zeroes them for
   a 40-column caller when the sysop turned that switch off): the door plays what it is given at every width, and only
   the masthead rail is a wide-screen effect.
   Compose, flush, logos (they join the capture), end. */
static void show_frame(struct menudoor *d, char wipe, int conceal)
{
    int capturing;
    capturing = wipe && ae_bs_wipe_begin(wipe, conceal) == 1;
    compose_all(d);
    ui_screen_flush(&d->screen);
    draw_logos(d);
    if (capturing) ui_screen_wipe_end(&d->screen);
    else ui_screen_cursor_reassert(&d->screen);
    park_cursor(d);
    ui_screen_flush(&d->screen);
}

/* The grid after a selection or window change: two cells for a move, the whole box for a scroll or a page turn
   (a PAGES turn inside the paging wipe). The status row follows the selection. */
static void repaint_grid(struct menudoor *d)
{
    level *lv = cur(d);
    ui_grid *g = &lv->grid;
    int full = g->drawn_offset < 0 || g->offset != g->drawn_offset;
    char wipe = (full && g->mode == UI_GRID_PAGES && g->drawn_offset >= 0) ? lv->menu.wipe_page : 0;
    int capturing = wipe && ae_bs_wipe_begin(wipe, 0) == 1;

    ui_grid_draw_changed(g, &d->screen.buf);
    draw_status(d, 0);
    park_cursor(d);
    ui_screen_flush(&d->screen);
    if (full) draw_between(d);
    if (capturing) ui_screen_wipe_end(&d->screen);
    else if (full) ui_screen_cursor_reassert(&d->screen);
    if (full) { park_cursor(d); ui_screen_flush(&d->screen); }
}

static void select_entry(struct menudoor *d, int entry)
{
    ui_grid *g = &cur(d)->grid;
    int before = g->selected, before_off = g->offset;
    ui_grid_select(g, entry);
    if (g->selected != before || g->offset != before_off) repaint_grid(d);
}

static void say(struct menudoor *d, const char *text)
{
    strncpy(d->notice, text, sizeof d->notice - 1);
    d->notice[sizeof d->notice - 1] = '\0';
    draw_status(d, 0);
    park_cursor(d);
    ui_screen_flush(&d->screen);
}

void menudoor_status(struct menudoor *d, const char *text)
{
    if (d && text) say(d, text);
}

const ae_menu_entry *menudoor_entry(struct menudoor *d, int entry)
{
    level *lv;
    if (!d) return 0;
    lv = cur(d);
    return (entry >= 0 && entry < lv->menu.entry_count) ? &lv->menu.entries[entry] : 0;
}

static void door_idle(void *ctx)
{
    struct menudoor *d = (struct menudoor *)ctx;
    if (!d->rail[0]) { ae_delay_ticks(UI_RAIL_TICK_DELAY); return; }
    d->rail_tick += UI_RAIL_STEP;
    /* The rail, not the row. The tick saves and restores the caller's cursor itself (it sits in the prompt while they
       type), so a second save here would only send four more bytes. */
    {
        const md_layout_out *lay = &cur(d)->lay;
        ui_masthead_rail_tick(&d->screen.buf, lay->rail_row, 1, d->screen.cols, lay->divider_row ? "" : d->title, d->rail,
                              UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), d->rail_tick);
    }
    ui_screen_flush(&d->screen);
    ae_delay_ticks(UI_RAIL_TICK_DELAY);
}

static int door_key(void *ctx) { (void)ctx; return ae_key(); }
static int door_pending(void *ctx) { (void)ctx; return ae_input_pending(); }
static void door_settle(void *ctx) { (void)ctx; ae_delay_ticks(1); }

static void set_title(struct menudoor *d, const char *text)
{
    strncpy(d->title, text && text[0] ? text : d->spec->masthead, sizeof d->title - 1);
    d->title[sizeof d->title - 1] = '\0';
}

static menudoor_result loop(struct menudoor *d);




/* The deepest level a door may open: an entry's child list, one level below the menu. */
#define DEEPEST 1

/* Down into d->lv[depth + 1], already filled; back up when its loop ends. The parent keeps its selection and typed text. */
static menudoor_result enter_level(struct menudoor *d, const char *label)
{
    level *parent = cur(d), *child = &d->lv[d->depth + 1];
    char parent_title[sizeof d->title], saved_typed[TYPED_MAX + 1];
    int saved_len, saved_off;
    menudoor_result result;

    strcpy(parent_title, d->title);
    strcpy(saved_typed, d->typed);
    saved_len = d->typed_len;
    saved_off = d->offwindow;
    d->typed[0] = '\0'; d->typed_len = 0; d->offwindow = -1;
    d->depth++;
    set_title(d, label);
    configure(d, child, child->menu.last_row);
    show_frame(d, 0, 0);
    result = loop(d);
    d->depth--;
    if (result == MENUDOOR_LEAVE) return MENUDOOR_LEAVE;
    strcpy(d->title, parent_title);                        /* Esc: back to the parent, its selection kept */
    strcpy(d->typed, saved_typed);
    d->typed_len = saved_len;
    d->offwindow = saved_off;
    (void)parent;
    show_frame(d, 0, 0);
    return MENUDOOR_STAY;
}

menudoor_result menudoor_open_child(struct menudoor *d, int entry)
{
    level *parent = cur(d), *child;
    int rc;

    if (!d || d->depth + 1 > DEEPEST || entry < 0 || entry >= parent->menu.entry_count) return MENUDOOR_STAY;
    child = &d->lv[d->depth + 1];
    rc = ae_menu_open(d->spec->kind, parent->menu.entries[entry].key, &child->menu);
    if (rc == AE_MENU_GONE) { d->gone = 1; return MENUDOOR_LEAVE; }
    if (rc != 1) {
        say(d, rc == 0 ? "That list is not available." : "The board did not answer.");
        return MENUDOOR_STAY;
    }
    return enter_level(d, parent->menu.entries[entry].label);
}

/* ------------------------------------------------------------------ cover flow */

static void drop_logo(ae_menu *m, const char *position)
{
    int i, n = 0;
    for (i = 0; i < m->logo_count; i++) if (strcmp(m->logos[i].position, position) != 0) m->logos[n++] = m->logos[i];
    m->logo_count = n;
}

/* A level of ONE section: no header row, and no between logo (it sits between sections). */
static void one_section(ae_menu *m, const char *title)
{
    int i;
    for (i = 0; i < m->entry_count; i++) m->entry_section[i] = 0;
    m->section_count = 1;
    strncpy(m->section_title[0], title, sizeof m->section_title[0] - 1);
    m->section_title[0][sizeof m->section_title[0] - 1] = '\0';
    drop_logo(m, "between");
}

/* Cover flow: one page per catalogue section that has entries. The page the caller left on (the catalogue's last
   row) opens first. Returns the page count. */
static int coverflow_pages(int *current)
{
    int sec, i, n = 0;
    *current = 0;
    for (sec = 0; sec < catalogue.section_count; sec++) {
        for (i = 0; i < catalogue.entry_count && catalogue.entry_section[i] != sec; i++) {}
        if (i == catalogue.entry_count) continue;
        if (catalogue.last_row >= 0 && catalogue.last_row < catalogue.entry_count && catalogue.entry_section[catalogue.last_row] == sec)
            *current = n;
        page_section[n++] = sec;
    }
    return n;
}

/* lv[0] becomes page `page`: that section's entries, cut from the catalogue already here (no second request). */
static void show_page(struct menudoor *d, int page)
{
    const ae_menu *src = &catalogue;
    ae_menu *m = &d->lv[0].menu;
    int sec = page_section[page], first, n = 0;

    for (first = 0; first < src->entry_count && src->entry_section[first] != sec; first++) {}
    while (first + n < src->entry_count && src->entry_section[first + n] == sec) n++;
    memcpy(m, src, sizeof *m);
    memmove(m->entries, &src->entries[first], (size_t)n * sizeof m->entries[0]);
    m->entry_count = n;
    one_section(m, src->section_title[sec]);
    m->last_row = src->last_row >= first && src->last_row < first + n ? src->last_row - first : 0;
    d->section_first = first;
    d->typed[0] = '\0'; d->typed_len = 0; d->offwindow = -1;
    configure(d, &d->lv[0], m->last_row);
    d->pages.top = d->lv[0].lay.grid_top;
    d->pages.height = d->lv[0].lay.grid_height;
    d->pages.status_row = d->lv[0].lay.status_row;
}

static const char *page_title(void *ctx, int page) { (void)ctx; return catalogue.section_title[page_section[page]]; }
static void page_show(void *ctx, int page) { show_page((struct menudoor *)ctx, page); }

/* The rows outside the region: only the status row changes (its indicator); the masthead and prompt stay. */
static void page_fixed(void *ctx, int sliding)
{
    struct menudoor *d = (struct menudoor *)ctx;
    (void)sliding;
    draw_status(d, 0);
    ui_screen_flush(&d->screen);
}

static void page_region(void *ctx)
{
    struct menudoor *d = (struct menudoor *)ctx;
    level *lv = cur(d);
    ui_grid_draw(&lv->grid, &d->screen.buf);
    ui_screen_flush(&d->screen);
    if (lv->lay.side_cols) ae_menu_logo_draw("side", lv->lay.side_top, lv->lay.side_left, lv->lay.side_rows, lv->lay.side_cols);
    draw_between(d);
}

static void page_finish(void *ctx, int captured)
{
    struct menudoor *d = (struct menudoor *)ctx;
    if (captured) ui_screen_wipe_end(&d->screen);
    else ui_screen_cursor_reassert(&d->screen);
    park_cursor(d);
    ui_screen_flush(&d->screen);
}

/* Cover flow from the catalogue in lv[0]: 0 when it has fewer than two pages (then the menu scrolls). */
static int start_coverflow(struct menudoor *d)
{
    int current, count;
    memcpy(&catalogue, &d->lv[0].menu, sizeof catalogue);
    count = coverflow_pages(&current);
    if (count < 2) return 0;
    ui_pages_init(&d->pages, count, current, d);
    d->pages.slide = catalogue.slide;
    d->pages.cols = d->screen.cols;
    d->pages.title = page_title;
    d->pages.show = page_show;
    d->pages.draw_fixed = page_fixed;
    d->pages.draw_region = page_region;
    d->pages.finish = page_finish;
    d->coverflow = 1;
    show_page(d, current);
    return 1;
}

/* Enter (or a click) on an entry: a list opens, a greyed entry says so, anything else is the door's. */
static menudoor_result press_entry(struct menudoor *d, int entry)
{
    const ae_menu_entry *e = menudoor_entry(d, entry);
    if (!e) return MENUDOOR_STAY;
    if (d->palette) {                                    /* a flat list: an 'L' entry runs its key like any other */
        if (strchr(e->flags, 'G')) { say(d, "You cannot choose that."); return MENUDOOR_STAY; }
        return d->spec->activate ? d->spec->activate(d, entry) : MENUDOOR_STAY;
    }
    if (strchr(e->flags, 'L') && d->depth == DEEPEST - 1) return menudoor_open_child(d, entry);
    if (strchr(e->flags, 'G')) { say(d, "You cannot choose that."); return MENUDOOR_STAY; }
    return d->spec->activate ? d->spec->activate(d, entry) : MENUDOOR_STAY;
}

static void drop_line(struct menudoor *d);
static void palette_refresh(struct menudoor *d, int was_len);

/* Decision 11: the exact key, else the highlighted match, else the line as typed (an unlisted "J 3.1" still runs).
   The exact key ranks first (D12), so it is entry 0 of the filtered list. */
static menudoor_result palette_enter(struct menudoor *d)
{
    level *lv = cur(d);
    char line[TYPED_MAX + 1];

    if (lv->menu.entry_count > 0) {
        if (d->typed_len > 0 && palette_class(&lv->menu.entries[0], d->typed) == 0) return press_entry(d, 0);
        return press_entry(d, lv->grid.selected);
    }
    if (d->typed_len == 0) return MENUDOOR_STAY;
    strcpy(line, d->typed);
    return d->spec->typed ? d->spec->typed(d, line) : MENUDOOR_STAY;
}

static menudoor_result press_enter(struct menudoor *d)
{
    menudoor_result r;
    if (d->palette) return palette_enter(d);
    if (d->typed_len > 0) {
        char line[TYPED_MAX + 1];
        strcpy(line, d->typed);
        d->typed[0] = '\0'; d->typed_len = 0;
        if (d->offwindow >= 0) { d->offwindow = -1; draw_status(d, 0); }
        draw_prompt(d);
        ui_screen_flush(&d->screen);
        return d->spec->typed ? d->spec->typed(d, line) : MENUDOOR_STAY;
    }
    r = press_entry(d, cur(d)->grid.selected);
    return r;
}

static void move_key(struct menudoor *d, int key)
{
    if (ui_grid_move(&cur(d)->grid, key)) repaint_grid(d);
}

/* Cover flow owns Left/Right at the grid's edge and PageUp/PageDown (ui_pages_step); everything else moves the grid.
   The palette is one column with Up/Down for a row, so Left/Right turn its page. */
static void page_or_move(struct menudoor *d, int key)
{
    int step = 0;
    if (d->palette && (key == UI_KEY_LEFT || key == UI_KEY_RIGHT)) key = key == UI_KEY_LEFT ? UI_KEY_PGUP : UI_KEY_PGDN;
    if (d->coverflow && d->depth == 0 && !d->palette)
        step = ui_pages_step(&d->pages, key, d->typed_len, ui_grid_at_edge(&cur(d)->grid, key));
    if (step) ui_pages_turn(&d->pages, step);
    else move_key(d, key);
}

static menudoor_result on_mouse(struct menudoor *d)
{
    ae_mouse_event evs[MOUSE_BATCH];
    int n = ae_bs_mouse_drain(evs, MOUSE_BATCH), i, hit;
    menudoor_result r;

    if (n < 0) return MENUDOOR_STAY;
    for (i = 0; i < n; i++) {
        if (evs[i].kind == 'U') page_or_move(d, UI_KEY_PGUP);
        else if (evs[i].kind == 'D') page_or_move(d, UI_KEY_PGDN);
        else if (evs[i].kind == 'M' || evs[i].kind == 'P') {
            if (d->coverflow && d->depth == 0 && !d->palette && (hit = ui_pages_hit(&d->pages, evs[i].row, evs[i].col)) != 0) {
                if (evs[i].kind == 'P') ui_pages_turn(&d->pages, hit);     /* a click on the indicator's arrow */
                continue;
            }
            hit = ui_grid_hit(&cur(d)->grid, evs[i].row, evs[i].col);
            if (hit < 0) continue;
            if (hit != cur(d)->grid.selected) select_entry(d, hit);      /* hover moves the real selection */
            if (evs[i].kind == 'P') {
                if (d->typed_len > 0) drop_line(d);             /* the line is dropped: the prompt row says so too */
                r = press_entry(d, hit);
                if (r == MENUDOOR_LEAVE) return r;
            }
        }
    }
    return MENUDOOR_STAY;
}

static int printable(int key) { return (key >= 32 && key < 127) || (key >= 160 && key <= 255); }

/* What the caller can see: the columns left after the prompt (one stays free), never more than the buffer. */
static int typed_room(struct menudoor *d)
{
    int room = d->screen.cols - 1 - prompt_len(cur(d));
    if (d->palette) return overlay_typed_room(d);
    return room < TYPED_MAX ? room : TYPED_MAX;
}

/* The typed text alone, when the row was already in typing mode and the key bar stays as it was: a character costs
   itself, not the row. draw_prompt_after_edit says when the whole row has to be drawn. */
static void draw_prompt_after_edit(struct menudoor *d, int was_len)
{
    level *lv = cur(d);
    ui_screen *sc = &d->screen;
    int plen = prompt_len(lv), width;
    const char *was_bar, *bar;

    if (was_len == 0 || d->typed_len == 0 || d->palette) { draw_prompt(d); return; }
    was_bar = typing_bar(d, was_len);                     /* the bar's identity: a different bar (or none) is a different row */
    bar = typing_bar(d, d->typed_len);
    /* The key bar at the right is in the way of an erase (it would go with the tail), and a bar that APPEARS has to
       be drawn: both are the whole row. When there is none before or after - or it has just gone - the typed text
       and one erase to the end of the line are the whole change: three bytes instead of the row's blank padding. */
    if (sc->profile.line_erase && !bar) {
        ansi_color(&sc->buf, UI_TOKEN(UI_T_INK), ground(d), 0);
        ansi_text_raw(&sc->buf, lv->lay.prompt_row, 1 + plen, d->typed, d->typed_len);
        ansi_erase_to_eol(&sc->buf);
        park_cursor(d);
        return;
    }
    if (was_bar != bar) { draw_prompt(d); return; }
    width = d->typed_len > was_len ? d->typed_len : was_len;
    ansi_color(&sc->buf, UI_TOKEN(UI_T_INK), ground(d), 0);
    ansi_text(&sc->buf, lv->lay.prompt_row, 1 + plen, d->typed, width);
    park_cursor(d);
}

/* The type-ahead highlight (sysop ruling 2026-10-15: typing never scrolls or repaints the window). A match ON the glass
   moves the bar by repainting two cells and the status row, as before. A match off it leaves the bar where it was and
   is named in the status row ("Enter runs: M  Colour Mode"); Tab is what brings the window to it. The bar is only a
   display: Enter runs the TYPED text whatever it shows. */
static void follow_typed(struct menudoor *d)
{
    level *lv = cur(d);
    int idx = d->typed_len > 0 ? md_typeahead(&lv->menu, d->typed) : -1, was = d->offwindow;

    d->offwindow = -1;
    if (idx >= 0) {
        if (ui_grid_visible(&lv->grid, idx)) select_entry(d, idx);
        else d->offwindow = idx;
    }
    if (d->offwindow != was) draw_status(d, 0);          /* the "Enter runs" line came, changed or went; an unchanged row sends nothing */
}

/* The line is dropped (Esc, a click): the prompt row says so, and so does the status row if it was naming a match. */
static void drop_line(struct menudoor *d)
{
    int was_len = d->typed_len;
    d->typed[0] = '\0'; d->typed_len = 0;
    if (d->palette) { palette_refresh(d, was_len); return; }
    if (d->offwindow >= 0) { d->offwindow = -1; draw_status(d, 0); }
    draw_prompt(d);
    ui_screen_flush(&d->screen);
}

/* Tab: bring the window to the match the status row is naming. A match already in view has nothing to show. */
static void show_match(struct menudoor *d)
{
    int idx = d->offwindow;
    if (d->typed_len == 0 || idx < 0) return;
    d->offwindow = -1;
    select_entry(d, idx);                                /* the one allowed window rewrite: one batch, no clear */
}

/* Tab on an empty line at the top (sysop 2026-10-17): the next door style, stored for the caller and shown at once.
   Classic is not in the cycle: it leaves the door, and Tab could not bring it back. The catalogue is opened again
   so the board's answer (one section never flips, a refused style) decides what shows; the selected row stays. */
static void next_style(struct menudoor *d)
{
    static const char *const cycle[3] = { "pages", "coverflow", "scroll" };   /* after scroll, pages, coverflow */
    static const char *const named[3] = { "Scroll", "Pages", "Cover flow" };
    level *top = &d->lv[0];
    int row = d->coverflow ? d->section_first + top->grid.selected : top->grid.selected;
    int style = d->coverflow ? AE_MENU_STYLE_COVERFLOW : top->menu.style;
    char line[40];

    if (ae_menu_style(cycle[style], 0) != 1 || ae_menu_open(d->spec->kind, 0, &top->menu) != 1) {
        say(d, "Could not change the menu style.");
        return;
    }
    top->menu.last_row = row;
    d->coverflow = 0;
    if (top->menu.style != AE_MENU_STYLE_COVERFLOW || !start_coverflow(d))
        configure(d, top, row);
    show_frame(d, 0, 0);
    sprintf(line, "Menu style: %s", named[d->coverflow ? AE_MENU_STYLE_COVERFLOW : top->menu.pages ? AE_MENU_STYLE_PAGES : AE_MENU_STYLE_SCROLL]);
    say(d, line);
}

/* The palette's list: the catalogue ranked by the typed text (D12), copied into lv[0] so the grid, the mouse and
   menudoor_entry see only the matches. The matches sit under their catalogue section's header; a section comes in
   the order of its best match and keeps the rank order inside, so entry 0 is still the best match of all. */
static void palette_filter(struct menudoor *d)
{
    static int order[AE_MENU_MAX_ENTRIES];
    ae_menu *m = &d->lv[0].menu;
    int n = md_palette_rank(&catalogue, d->typed, order, AE_MENU_MAX_ENTRIES), i, g, out = 0;
    int groups[AE_MENU_MAX_SECTIONS], group_count = 0, sec;

    for (i = 0; i < n; i++) {
        sec = catalogue.entry_section[order[i]];
        for (g = 0; g < group_count && groups[g] != sec; g++) {}
        if (g == group_count && group_count < AE_MENU_MAX_SECTIONS) groups[group_count++] = sec;
    }
    for (g = 0; g < group_count; g++) {
        strcpy(m->section_title[g], catalogue.section_title[groups[g]]);
        for (i = 0; i < n; i++)
            if (catalogue.entry_section[order[i]] == groups[g]) { m->entries[out] = catalogue.entries[order[i]]; m->entry_section[out++] = g; }
    }
    m->entry_count = out;
    m->section_count = group_count;
}

/* After an edit: the list region again, the best match selected. The rows around it stay; a list that changes the
   layout (a logo that no longer fits beside it) is a whole frame. */
static void palette_refresh(struct menudoor *d, int was_len)
{
    level *lv = &d->lv[0];

    (void)was_len;                                        /* the field is one run inside the box: drawn whole */
    palette_filter(d);
    overlay_configure(d, lv, 0);                          /* the box does not move: no layout change, no new frame */
    ui_grid_draw(&lv->grid, &d->screen.buf);
    overlay_description(d, 0);
    overlay_field(d);
    ui_screen_flush(&d->screen);
}

static menudoor_result typed_key(struct menudoor *d, int key)
{
    int idx, was_len = d->typed_len;
    if (key == 8 || key == 127) {
        if (d->typed_len == 0) return MENUDOOR_STAY;
        d->typed[--d->typed_len] = '\0';
    } else if (key == 21) {
        d->typed[0] = '\0'; d->typed_len = 0;
    } else if (printable(key) && d->typed_len < typed_room(d) && !(key == ' ' && d->typed_len == 0)) {
        d->typed[d->typed_len++] = (char)key;
        d->typed[d->typed_len] = '\0';
        if (d->spec->digits_show_at_once && !d->palette) {
            idx = md_digits_act(&cur(d)->menu, d->typed);
            if (idx >= 0) {                                    /* a unique number acts without Enter (Decision 38) */
                d->typed[0] = '\0'; d->typed_len = 0;
                select_entry(d, idx);
                draw_prompt(d);
                ui_screen_flush(&d->screen);
                return press_entry(d, idx);
            }
        }
    } else {
        return MENUDOOR_STAY;
    }
    if (d->palette) { palette_refresh(d, was_len); return MENUDOOR_STAY; }
    follow_typed(d);
    draw_prompt_after_edit(d, was_len);
    ui_screen_flush(&d->screen);
    return MENUDOOR_STAY;
}

static menudoor_result loop(struct menudoor *d)
{
    menudoor_result r;
    int key;

    for (;;) {
        key = ui_key_read(&d->keys, &d->pushback);
        if (key < 0) { d->gone = 1; return MENUDOOR_LEAVE; }
        if (d->notice[0]) { d->notice[0] = '\0'; draw_status(d, 0); park_cursor(d); ui_screen_flush(&d->screen); }
        r = MENUDOOR_STAY;
        switch (key) {
        case UI_KEY_UP: case UI_KEY_DOWN: case UI_KEY_LEFT: case UI_KEY_RIGHT:
        case UI_KEY_PGUP: case UI_KEY_PGDN: case UI_KEY_HOME: case UI_KEY_END:
            page_or_move(d, key);
            break;
        case UI_KEY_ENTER: case '\r': case '\n':
            r = press_enter(d);
            break;
        case UI_KEY_MOUSE:
            r = on_mouse(d);
            break;
        case 9:                                            /* Tab: the type-ahead match the window does not show; empty: the next style */
            if (d->typed_len == 0 && d->depth == 0 && !d->palette) next_style(d);
            else show_match(d);
            break;
        case UI_KEY_ESC:
            if (d->typed_len > 0) {
                drop_line(d);
            } else {
                if (d->depth == 0 && d->palette) d->escaped = 1;  /* the board's screen under the box comes back (plan K4) */
                return d->depth > 0 ? MENUDOOR_STAY : MENUDOOR_LEAVE;
            }
            break;
        default:
            /* Decision 37: q on an empty line leaves to the prompt, unless an entry key starts with Q (then q is a command). */
            if ((key == 'q' || key == 'Q') && d->typed_len == 0 && d->depth == 0 && !d->palette && md_q_leaves(&cur(d)->menu)) return MENUDOOR_LEAVE;
            if (key < 1000) r = typed_key(d, key);
            break;
        }
        if (r == MENUDOOR_LEAVE) return r;
    }
}

/* ------------------------------------------------------------- entry points */

static int begin(struct menudoor *d, ae_session *session, int node)
{
    char theme_id[32];

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(session, session_storage, (long)sizeof session_storage, node) != 0) { ae_shutdown(); return 20; }
    memset(d, 0, sizeof *d);
    d->offwindow = -1;
    ae_user_theme(session, theme_id, (int)sizeof theme_id);
    d->theme = ui_theme_by_id(theme_id);
    return 0;
}

static void start_screen(struct menudoor *d, ae_session *session)
{
    ui_screen_open_responsive(&d->screen, session, frame_buffer, (long)sizeof frame_buffer);
    ansi_set_palette(&d->screen.buf, d->theme->rgb, d->theme->idx, UI_TOKEN_COUNT);
    d->rail = ui_effects_allowed(d->screen.cols) ? d->theme->rail : "";
    d->keys.next = door_key;
    d->keys.pending = door_pending;
    d->keys.settle = door_settle;
    d->keys.idle = door_idle;
    d->keys.flush = 0;
    d->keys.ctx = d;
    d->pushback = -1;
}

static int run_menu_started(struct menudoor *d, ae_session *session, const menudoor_spec *spec)
{
    level *top;
    int rc;

    d->spec = spec;
    top = &d->lv[0];

    rc = ae_menu_open(spec->kind, 0, &top->menu);
    if (rc != 1) {
        /* Silent board, or a file that cannot be read: the fallback runs. Refused: the board printed why. Gone: nothing. */
        if (rc == AE_MENU_SILENT && spec->fallback_command) ae_return_command(spec->fallback_command);
        ae_shutdown();
        return 0;
    }

    start_screen(d, session);
    set_title(d, top->menu.title);
    /* Cover flow (the style the board decided): one section per page. One section has nothing to flip: it scrolls. */
    if (top->menu.style != AE_MENU_STYLE_COVERFLOW || !start_coverflow(d))
        configure(d, top, top->menu.last_row);
    show_frame(d, top->menu.wipe_open, 0);
    ae_bs_mouse(1);                                            /* an ANSI caller; ignored otherwise */

    loop(d);

    if (!d->gone) {
        ae_menu_row(d->coverflow ? d->section_first + top->grid.selected : top->grid.selected);   /* on leave only; cover flow: a catalogue row */
        d->depth = 0;
        if (top->menu.wipe_leave) show_frame(d, top->menu.wipe_leave, 1);
    }
    ae_bs_mouse(0);
    ui_screen_close(&d->screen);
    ae_shutdown();
    return 0;
}

/* The search palette (plan P4): MAIN flattened, filtered as the caller types. The board's main line is
   "<palette name> <what was typed at the prompt>"; the rest after the name is the starting filter. */
static int run_palette_started(struct menudoor *d, ae_session *session, const menudoor_spec *spec)
{
    level *top = &d->lv[0];
    char line[128];
    const char *start = line;
    int rc, n = (int)strlen(spec->palette_name);

    d->spec = spec;
    d->palette = 1;
    rc = ae_menu_open(spec->kind, 0, &top->menu);
    if (rc != 1) {
        if (rc == AE_MENU_SILENT && spec->fallback_command) ae_return_command(spec->fallback_command);
        ae_shutdown();
        return 0;
    }
    start_screen(d, session);
    strcpy(top->menu.prompt, "Search: ");             /* the catalogue keeps its sections: palette_filter groups by them */
    memcpy(&catalogue, &top->menu, sizeof catalogue);
    d->palette_total = catalogue.entry_count;
    overlay_place(d);

    line[0] = '\0';
    ae_main_line(session, line, (int)sizeof line);
    while (*start == ' ') start++;
    if (istarts(start, spec->palette_name) && (start[n] == ' ' || start[n] == '\0')) start += n;
    while (*start == ' ') start++;
    while (*start && d->typed_len < typed_room(d)) {
        if (printable((unsigned char)*start)) d->typed[d->typed_len++] = *start;
        start++;
    }
    while (d->typed_len > 0 && d->typed[d->typed_len - 1] == ' ') d->typed_len--;
    d->typed[d->typed_len] = '\0';

    palette_filter(d);
    overlay_configure(d, top, 0);
    /* The board keeps the cells under the box, so Esc can give them back (plan K3/K4). Not held (0): the palette
       still runs, and leaving closes with a clear as it always did. */
    if (ae_bs_save(d->ov_top, d->ov_left, d->ov_rows, d->ov_cols) == AE_BS_GONE) { ae_shutdown(); return 0; }
    show_frame(d, 0, 0);
    ae_bs_mouse(1);
    loop(d);                                              /* no ROW on leave: a filtered row is not the menu's */
    ae_bs_mouse(0);
    if (!d->gone && d->escaped) {
        ui_screen_cursor(&d->screen, 1);
        ansi_reset(&d->screen.buf);
        ui_screen_flush(&d->screen);
        if (ae_bs_restore() == 1) { ae_shutdown(); return 0; }  /* no close: its clear would wipe what came back */
    }
    ui_screen_close(&d->screen);
    ae_shutdown();
    return 0;
}

int menudoor_run(const menudoor_spec *spec, int node)
{
    static ae_session session;
    struct menudoor *d = &shell;
    int rc;

    if (!spec || !spec->kind) return 20;
    if ((rc = begin(d, &session, node)) != 0) return rc;
    return run_menu_started(d, &session, spec);
}

/* --------------------------------------------------------------- settings */

#define SETTINGS_ROWS 5
static const char *const MODE[SETTINGS_ROWS] = { "classic", "scroll", "pages", "coverflow", "default" };
static char settings_row[SETTINGS_ROWS][48];
static int settings_stored;                       /* an index into MODE; 4 = the board's default */
static char settings_effective[AE_MENU_STYLE_CAP];

static const char *settings_text(void *ctx, int index)
{
    (void)ctx;
    return settings_row[index];
}

static void settings_rows(void)
{
    static const char *const LABEL[SETTINGS_ROWS - 1] = { "Classic screen", "Grid scroll", "Grid pages", "Cover flow" };
    int i;
    for (i = 0; i < SETTINGS_ROWS - 1; i++) sprintf(settings_row[i], "%s %s", settings_stored == i ? "[*]" : "[ ]", LABEL[i]);
    sprintf(settings_row[i], "%s Board default (%.12s)", settings_stored == i ? "[*]" : "[ ]", settings_effective);
}

static void settings_read(void)
{
    char stored[AE_MENU_STYLE_CAP];
    stored[0] = '\0';
    settings_effective[0] = '\0';
    ae_menu_style_get(stored, settings_effective);
    for (settings_stored = 0; settings_stored < SETTINGS_ROWS - 1 && strcmp(stored, MODE[settings_stored]) != 0; settings_stored++) {}
    if (!settings_effective[0]) strcpy(settings_effective, "scroll");
    settings_rows();
}

static int run_settings_started(struct menudoor *d, ae_session *session)
{
    ui_screen *sc;
    ui_list list;
    int key, status_row;

    d->spec = 0;
    start_screen(d, session);
    sc = &d->screen;
    strcpy(d->title, "MENU STYLE");
    settings_read();

    ui_list_init(&list);
    list.top = 3; list.left = 1; list.width = sc->cols - 1; list.height = SETTINGS_ROWS; list.count = SETTINGS_ROWS;
    list.row = settings_text; list.context = 0; list.borders = 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT); list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK); list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);
    list.ground = ground(d);
    ui_list_select(&list, settings_stored);
    status_row = sc->rows > 1 ? sc->rows - 1 : 1;            /* a one-row terminal: never row 0 */

    ansi_clear_ground(&sc->buf, UI_TOKEN(UI_T_INK), ground(d));
    ui_masthead_draw_tick(&sc->buf, 1, 1, sc->cols, d->title, d->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), 0);
    ui_list_draw(&list, &sc->buf);
    ui_status_draw(&sc->buf, status_row, 1, sc->cols,
                   sc->cols >= 80 ? " Arrows Move  Enter Choose  Esc/q Back" : " Enter Choose  Esc/q Back", "",
                   UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
    ui_screen_cursor(sc, 0);
    ui_screen_flush(sc);

    for (;;) {
        key = ui_key_read(&d->keys, &d->pushback);
        if (key < 0 || key == UI_KEY_ESC || key == 'q' || key == 'Q') break;
        if (key == UI_KEY_UP) { ui_list_move(&list, -1); ui_list_draw_changed(&list, &sc->buf, 0); ui_screen_flush(sc); }
        else if (key == UI_KEY_DOWN) { ui_list_move(&list, 1); ui_list_draw_changed(&list, &sc->buf, 0); ui_screen_flush(sc); }
        else if (key == UI_KEY_ENTER || key == '\r' || key == ' ') {
            char effective[AE_MENU_STYLE_CAP];
            const char *said = ae_menu_style(MODE[list.selected], effective) == 1 ? " Saved." : " Could not save.";
            settings_read();
            ui_list_draw(&list, &sc->buf);
            ui_status_draw(&sc->buf, status_row, 1, sc->cols, said, "", UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
            ui_screen_flush(sc);
        }
    }
    ui_screen_close(sc);
    ae_shutdown();
    return 0;
}

int menudoor_settings_run(int node)
{
    static ae_session session;
    struct menudoor *d = &shell;
    int rc;

    if ((rc = begin(d, &session, node)) != 0) return rc;
    return run_settings_started(d, &session);
}

int menudoor_main(const menudoor_spec *spec, const char *settings_name, int node)
{
    static ae_session session;
    struct menudoor *d = &shell;
    char invoked[24];
    int rc;

    if (!spec || !spec->kind) return 20;
    if ((rc = begin(d, &session, node)) != 0) return rc;
    invoked[0] = '\0';
    if ((settings_name || spec->palette_name) && ae_menu_command(&session, invoked, (int)sizeof invoked) > 0) {
        if (settings_name && strcmp(invoked, settings_name) == 0) return run_settings_started(d, &session);
        if (spec->palette_name && strcmp(invoked, spec->palette_name) == 0) return run_palette_started(d, &session, spec);
    }
    return run_menu_started(d, &session, spec);
}
