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

static int grid_rows(int rows, int top, int footer_rows) { return rows - top - 2 - footer_rows; }

void md_layout(const ae_menu *m, int cols, int rows, md_layout_out *o)
{
    const ae_menu_logo *header, *footer, *side, *between;
    int third = rows / 3;

    memset(o, 0, sizeof *o);
    o->masthead_row = 1;
    o->status_row = rows - 1;
    o->prompt_row = rows;
    o->grid_left = 1;
    header = find_logo(m, "header");
    footer = find_logo(m, "footer");
    if (!logo_fits(header, cols, third)) header = 0;      /* taller than a third of the screen: dropped */
    if (!logo_fits(footer, cols, third)) footer = 0;
    o->grid_top = 2 + (header ? header->rows : 0);
    o->grid_height = grid_rows(rows, o->grid_top, footer ? footer->rows : 0);
    if (o->grid_height < MD_MIN_GRID_ROWS && footer) {    /* the grid is never squeezed: logos give way, footer first */
        footer = 0;
        o->grid_height = grid_rows(rows, o->grid_top, 0);
    }
    if (o->grid_height < MD_MIN_GRID_ROWS && header) {
        header = 0;
        o->grid_top = 2;
        o->grid_height = grid_rows(rows, 2, 0);
    }
    if (header) { o->header_top = 2; o->header_rows = header->rows; o->header_cols = cols; }
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

#define LEVELS 2
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
    char notice[40];                  /* shown in the status row instead of the description, until the next key */
    char title[32];
    int rail_tick;
    int gone;                         /* the caller hung up */
};

static struct menudoor shell;
static char frame_buffer[49152];      /* Decision 26 */
static char session_storage[AE_SESSION_MIN_STORAGE];

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
    g->band_after_section = lv->lay.band_after_section; g->band_height = lv->lay.band_height;
    g->mode = lv->menu.pages ? UI_GRID_PAGES : UI_GRID_SCROLL;
    g->ink = UI_TOKEN(UI_T_INK); g->accent = UI_TOKEN(UI_T_ACCENT); g->dim = UI_TOKEN(UI_T_DIM);
    g->selected_fg = UI_TOKEN(UI_T_SELECTION_INK); g->selected_bg = UI_TOKEN(UI_T_SELECTION_BG);
    g->ground = ground(d);
    g->caret = sc->cols <= 40 ? ">>" : 0;
    g->ctx = &lv->menu;
    ui_grid_layout(g);
    ui_grid_select(g, selected);
}

static void draw_masthead(struct menudoor *d)
{
    ui_screen *sc = &d->screen;
    ui_masthead_draw_tick(&sc->buf, 1, 1, sc->cols, d->title, d->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), d->rail_tick);
}

static void draw_status(struct menudoor *d)
{
    level *lv = cur(d);
    ui_screen *sc = &d->screen;
    char line[100];
    const char *text = "";

    if (d->notice[0]) text = d->notice;
    else if (lv->menu.entry_count > 0 && lv->grid.selected < lv->menu.entry_count)
        text = lv->menu.entries[lv->grid.selected].description;
    line[0] = ' ';
    strncpy(line + 1, text, sizeof line - 2);
    line[sizeof line - 1] = '\0';
    ui_status_draw(&sc->buf, lv->lay.status_row, 1, sc->cols, line, "", UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
}

/* The prompt row: the board's prompt, what is typed, and (nothing typed) the key bar at the right. The cursor ends
   after the typed text. One column is left free: the last cell of the last row scrolls a C64. */
static void draw_prompt(struct menudoor *d)
{
    level *lv = cur(d);
    ui_screen *sc = &d->screen;
    const menudoor_spec *spec = d->spec;
    char line[TYPED_MAX + 80];
    const char *bar = sc->cols >= 80 ? spec->keybar_wide : spec->keybar_narrow;
    int row = lv->lay.prompt_row, room = sc->cols - 1, plen, blen;

    line[0] = '\0';
    strncat(line, lv->menu.prompt, 72);
    strncat(line, d->typed, TYPED_MAX);
    plen = (int)strlen(line);
    if (plen > room) plen = room;
    ansi_color(&sc->buf, UI_TOKEN(UI_T_INK), ground(d), 0);
    ansi_text(&sc->buf, row, 1, line, room);
    if (d->typed_len == 0 && bar && bar[0]) {
        blen = (int)strlen(bar);
        if (plen + 2 + blen <= room) {
            ansi_color(&sc->buf, UI_TOKEN(UI_T_DIM), ground(d), 0);
            ansi_text_raw(&sc->buf, row, room - blen + 1, bar, blen);
        }
    }
    ansi_goto(&sc->buf, row, 1 + plen);
    ansi_cursor(&sc->buf, 1);
}

static void park_cursor(struct menudoor *d)
{
    level *lv = cur(d);
    int plen = (int)strlen(lv->menu.prompt) + d->typed_len;
    if (plen > d->screen.cols - 1) plen = d->screen.cols - 1;
    ansi_goto(&d->screen.buf, lv->lay.prompt_row, 1 + plen);
}

static void compose_all(struct menudoor *d)
{
    level *lv = cur(d);
    ansi_clear_ground(&d->screen.buf, UI_TOKEN(UI_T_INK), ground(d));
    draw_masthead(d);
    ui_grid_draw(&lv->grid, &d->screen.buf);
    draw_status(d);
    draw_prompt(d);
}

/* Logos are the board's: it draws them through the door's own output path, so a wipe capture includes them. */
static void draw_between(struct menudoor *d)
{
    level *lv = cur(d);
    int row = ui_grid_band_row(&lv->grid);
    if (row && lv->lay.band_height > 0)
        ae_menu_logo_draw("between", row, lv->grid.left, lv->lay.band_height, lv->lay.band_cols);
}

static void draw_logos(struct menudoor *d)
{
    level *lv = cur(d);
    if (lv->lay.header_rows) ae_menu_logo_draw("header", lv->lay.header_top, 1, lv->lay.header_rows, lv->lay.header_cols);
    if (lv->lay.footer_rows) ae_menu_logo_draw("footer", lv->lay.footer_top, 1, lv->lay.footer_rows, lv->lay.footer_cols);
    if (lv->lay.side_cols) ae_menu_logo_draw("side", lv->lay.side_top, lv->lay.side_left, lv->lay.side_rows, lv->lay.side_cols);
    draw_between(d);
}

/* A whole frame, inside a board wipe when there is one: compose, flush, logos (they join the capture), end. */
static void show_frame(struct menudoor *d, char wipe, int conceal)
{
    int capturing = wipe && ae_bs_wipe_begin(wipe, conceal) == 1;
    compose_all(d);
    ui_screen_flush(&d->screen);
    draw_logos(d);
    if (capturing) ae_bs_wipe_end();
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
    draw_status(d);
    park_cursor(d);
    ui_screen_flush(&d->screen);
    if (full) draw_between(d);
    if (capturing) ae_bs_wipe_end();
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
    draw_status(d);
    park_cursor(d);
    ui_screen_flush(&d->screen);
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
    /* The rail, not the row, and the caller's cursor is put back: it sits in the prompt while they type. */
    ansi_save_cursor(&d->screen.buf);
    ui_masthead_rail_tick(&d->screen.buf, 1, 1, d->screen.cols, d->title, d->rail,
                          UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), d->rail_tick);
    ansi_restore_cursor(&d->screen.buf);
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

menudoor_result menudoor_open_child(struct menudoor *d, int entry)
{
    level *parent = cur(d), *child;
    char parent_title[32], saved_typed[TYPED_MAX + 1];
    int rc, saved_len;
    menudoor_result result;

    if (!d || d->depth + 1 >= LEVELS || entry < 0 || entry >= parent->menu.entry_count) return MENUDOOR_STAY;
    child = &d->lv[d->depth + 1];
    rc = ae_menu_open(d->spec->kind, parent->menu.entries[entry].key, &child->menu);
    if (rc == AE_MENU_GONE) { d->gone = 1; return MENUDOOR_LEAVE; }
    if (rc != 1) {
        say(d, rc == 0 ? "That list is not available." : "The board did not answer.");
        return MENUDOOR_STAY;
    }
    strcpy(parent_title, d->title);
    strcpy(saved_typed, d->typed);
    saved_len = d->typed_len;
    d->typed[0] = '\0'; d->typed_len = 0;
    d->depth++;
    set_title(d, parent->menu.entries[entry].label);
    configure(d, child, child->menu.last_row);
    show_frame(d, 0, 0);
    result = loop(d);
    d->depth--;
    if (result == MENUDOOR_LEAVE) return MENUDOOR_LEAVE;
    strcpy(d->title, parent_title);                        /* Esc: back to the parent, its selection kept */
    strcpy(d->typed, saved_typed);
    d->typed_len = saved_len;
    show_frame(d, 0, 0);
    return MENUDOOR_STAY;
}

/* Enter (or a click) on an entry: a list opens, a greyed entry says so, anything else is the door's. */
static menudoor_result press_entry(struct menudoor *d, int entry)
{
    const ae_menu_entry *e = menudoor_entry(d, entry);
    if (!e) return MENUDOOR_STAY;
    if (strchr(e->flags, 'L') && d->depth == 0) return menudoor_open_child(d, entry);
    if (strchr(e->flags, 'G')) { say(d, "You cannot choose that."); return MENUDOOR_STAY; }
    return d->spec->activate ? d->spec->activate(d, entry) : MENUDOOR_STAY;
}

static menudoor_result press_enter(struct menudoor *d)
{
    menudoor_result r;
    if (d->typed_len > 0) {
        char line[TYPED_MAX + 1];
        strcpy(line, d->typed);
        d->typed[0] = '\0'; d->typed_len = 0;
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

static menudoor_result on_mouse(struct menudoor *d)
{
    ae_mouse_event evs[MOUSE_BATCH];
    int n = ae_bs_mouse_drain(evs, MOUSE_BATCH), i, hit;
    menudoor_result r;

    if (n < 0) return MENUDOOR_STAY;
    for (i = 0; i < n; i++) {
        if (evs[i].kind == 'U') move_key(d, UI_KEY_PGUP);
        else if (evs[i].kind == 'D') move_key(d, UI_KEY_PGDN);
        else if (evs[i].kind == 'M' || evs[i].kind == 'P') {
            hit = ui_grid_hit(&cur(d)->grid, evs[i].row, evs[i].col);
            if (hit < 0) continue;
            if (hit != cur(d)->grid.selected) select_entry(d, hit);      /* hover moves the real selection */
            if (evs[i].kind == 'P') {
                d->typed[0] = '\0'; d->typed_len = 0;
                r = press_entry(d, hit);
                if (r == MENUDOOR_LEAVE) return r;
            }
        }
    }
    return MENUDOOR_STAY;
}

static int printable(int key) { return (key >= 32 && key < 127) || (key >= 160 && key <= 255); }

static menudoor_result typed_key(struct menudoor *d, int key)
{
    int idx;
    if (key == 8 || key == 127) {
        if (d->typed_len == 0) return MENUDOOR_STAY;
        d->typed[--d->typed_len] = '\0';
    } else if (key == 21) {
        d->typed[0] = '\0'; d->typed_len = 0;
    } else if (printable(key) && d->typed_len < TYPED_MAX && !(key == ' ' && d->typed_len == 0)) {
        d->typed[d->typed_len++] = (char)key;
        d->typed[d->typed_len] = '\0';
        if (d->spec->digits_show_at_once) {
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
    idx = md_typeahead(&cur(d)->menu, d->typed);
    if (idx >= 0) select_entry(d, idx);
    draw_prompt(d);
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
        if (d->notice[0]) { d->notice[0] = '\0'; draw_status(d); park_cursor(d); ui_screen_flush(&d->screen); }
        r = MENUDOOR_STAY;
        switch (key) {
        case UI_KEY_UP: case UI_KEY_DOWN: case UI_KEY_LEFT: case UI_KEY_RIGHT:
        case UI_KEY_PGUP: case UI_KEY_PGDN: case UI_KEY_HOME: case UI_KEY_END:
            move_key(d, key);
            break;
        case UI_KEY_ENTER: case '\r': case '\n':
            r = press_enter(d);
            break;
        case UI_KEY_MOUSE:
            r = on_mouse(d);
            break;
        case UI_KEY_ESC:
            if (d->typed_len > 0) {
                d->typed[0] = '\0'; d->typed_len = 0;
                draw_prompt(d);
                ui_screen_flush(&d->screen);
            } else {
                return d->depth > 0 ? MENUDOOR_STAY : MENUDOOR_LEAVE;
            }
            break;
        default:
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

int menudoor_run(const menudoor_spec *spec, int node)
{
    static ae_session session;
    struct menudoor *d = &shell;
    level *top;
    int rc;

    if (!spec || !spec->kind) return 20;
    if ((rc = begin(d, &session, node)) != 0) return rc;
    d->spec = spec;
    top = &d->lv[0];

    rc = ae_menu_open(spec->kind, 0, &top->menu);
    if (rc != 1) {
        /* Silent board, or a file that cannot be read: the fallback runs. Refused: the board printed why. Gone: nothing. */
        if (rc == AE_MENU_SILENT && spec->fallback_command) ae_return_command(spec->fallback_command);
        ae_shutdown();
        return 0;
    }

    start_screen(d, &session);
    set_title(d, top->menu.title);
    configure(d, top, top->menu.last_row);
    show_frame(d, top->menu.wipe_open, 0);
    ae_bs_mouse(1);                                            /* an ANSI caller; ignored otherwise */

    loop(d);

    if (!d->gone) {
        ae_menu_row(top->grid.selected);                       /* one round trip, on leave only */
        d->depth = 0;
        if (top->menu.wipe_leave) show_frame(d, top->menu.wipe_leave, 1);
    }
    ae_bs_mouse(0);
    ui_screen_close(&d->screen);
    ae_shutdown();
    return 0;
}

/* --------------------------------------------------------------- settings */

static char settings_row[3][48];
static int settings_stored;                       /* 0 scroll, 1 pages, 2 board default */
static char settings_effective[16];

static const char *settings_text(void *ctx, int index)
{
    (void)ctx;
    return settings_row[index];
}

static void settings_rows(void)
{
    sprintf(settings_row[0], "%s Scroll", settings_stored == 0 ? "[*]" : "[ ]");
    sprintf(settings_row[1], "%s Pages", settings_stored == 1 ? "[*]" : "[ ]");
    sprintf(settings_row[2], "%s Board default (%.12s)", settings_stored == 2 ? "[*]" : "[ ]", settings_effective);
}

static void settings_read(void)
{
    char stored[16];
    stored[0] = '\0';
    settings_effective[0] = '\0';
    ae_menu_overflow_get(stored, (int)sizeof stored, settings_effective, (int)sizeof settings_effective);
    settings_stored = strcmp(stored, "scroll") == 0 ? 0 : strcmp(stored, "pages") == 0 ? 1 : 2;
    if (!settings_effective[0]) strcpy(settings_effective, "scroll");
    settings_rows();
}

int menudoor_settings_run(int node)
{
    static ae_session session;
    static const char *const MODE[3] = { "scroll", "pages", "default" };
    struct menudoor *d = &shell;
    ui_screen *sc;
    ui_list list;
    int rc, key, status_row;

    if ((rc = begin(d, &session, node)) != 0) return rc;
    d->spec = 0;
    start_screen(d, &session);
    sc = &d->screen;
    strcpy(d->title, "LONG MENUS");
    /* The board answers OVERFLOW only once a catalogue is open: open the main menu's, unshown. */
    ae_menu_open("MAIN", 0, &d->lv[0].menu);
    settings_read();

    ui_list_init(&list);
    list.top = 3; list.left = 1; list.width = sc->cols - 1; list.height = 3; list.count = 3;
    list.row = settings_text; list.context = 0; list.borders = 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT); list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK); list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);
    list.ground = ground(d);
    ui_list_select(&list, settings_stored);
    status_row = sc->rows - 1;

    ansi_clear_ground(&sc->buf, UI_TOKEN(UI_T_INK), ground(d));
    ui_masthead_draw_tick(&sc->buf, 1, 1, sc->cols, d->title, d->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), 0);
    ui_list_draw(&list, &sc->buf);
    ui_status_draw(&sc->buf, status_row, 1, sc->cols,
                   sc->cols >= 80 ? " Arrows Move  Enter Choose  Esc Back" : " Enter Choose  Esc Back", "",
                   UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
    ansi_cursor(&sc->buf, 0);
    ui_screen_flush(sc);

    for (;;) {
        key = ui_key_read(&d->keys, &d->pushback);
        if (key < 0 || key == UI_KEY_ESC || key == 'q' || key == 'Q') break;
        if (key == UI_KEY_UP) { ui_list_move(&list, -1); ui_list_draw_changed(&list, &sc->buf, 0); ui_screen_flush(sc); }
        else if (key == UI_KEY_DOWN) { ui_list_move(&list, 1); ui_list_draw_changed(&list, &sc->buf, 0); ui_screen_flush(sc); }
        else if (key == UI_KEY_ENTER || key == '\r' || key == ' ') {
            char effective[16];
            const char *said = ae_menu_overflow(MODE[list.selected], effective, (int)sizeof effective) == 1 ? " Saved." : " Could not save.";
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
