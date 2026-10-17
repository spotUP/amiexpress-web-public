/*
 * ui_grid - sections of entries in columns, for a menu door (plan M8).
 *
 * ui_list is one column; a menu is headed sections side by side (the main
 * menu, the bulletins menu, and later the conference list). The grid owns
 * layout, navigation, paging and hit-testing so no door writes them again.
 */
#ifndef UI_GRID_H
#define UI_GRID_H
#include "ui_ansi.h"
#ifdef __cplusplus
extern "C" {
#endif

#define UI_GRID_MAX_ENTRIES 256
#define UI_GRID_MAX_LINES   400
#define UI_GRID_MAX_PAGES   64
#define UI_GRID_SCROLL 0
#define UI_GRID_PAGES  1

enum { UI_GL_HEADER = 1, UI_GL_ITEMS = 2, UI_GL_BAND = 3 };
/** HEADER: first = section. ITEMS: first entry, count. BAND: one row of the band. */
typedef struct { int kind; int first; int count; } ui_grid_line;

typedef const char *(*ui_grid_text_fn)(void *ctx, int index);

typedef struct {
    int top, left, height, width;
    int entry_count, section_count;
    const int *entry_section;              /* section of entry i; entries are in section order */
    ui_grid_text_fn key, label, section_title;   /* section_title 0: no header rows */
    ui_grid_text_fn right;                 /* may be 0 */
    ui_grid_text_fn flags;                 /* may be 0; 'C' current, 'G' greyed, 'L' has a list under it */
    int max_columns;                       /* 0 = 4 */
    int band_after_section, band_height;   /* -1, 0: no band */
    int mode;                              /* UI_GRID_SCROLL or UI_GRID_PAGES */
    int ink, accent, dim, selected_fg, selected_bg;
    /** The background every cell is drawn on (the door's ground), or -1 for the terminal's own (ui_grid_init). */
    int ground;
    /**
     * A cell's blank tail may be one erase-to-end-of-line (CSI K) instead of spaces: set by a door whose terminal has
     * it (ui_profile.line_erase) and whose grid runs to the right edge of the screen (an erase goes to the edge, so
     * a side logo there would go with it). Used for the last cell of a line, where nothing is to its right.
     */
    int erase_tail;
    const char *caret;                     /* 0 = paint a bar; ">>" at 40 columns */
    void *ctx;
    /* computed by ui_grid_layout - read, never set */
    int key_width, label_width, right_width, columns, col_width;
    int band_rows;                         /* band_height, or 0 when the box is too short to show it */
    ui_grid_line lines[UI_GRID_MAX_LINES];
    int line_count;
    int page_start[UI_GRID_MAX_PAGES + 1];
    int page_count;
    /* state */
    int selected, offset;
    int drawn_selected, drawn_offset;
} ui_grid;

void ui_grid_init(ui_grid *g);
/** Widths, columns, lines and pages from the current entries and box. Keeps `selected`, re-derives `offset`. */
void ui_grid_layout(ui_grid *g);
/** One key; returns 1 when the selection or the window moved. */
int  ui_grid_move(ui_grid *g, int key);
void ui_grid_select(ui_grid *g, int index);
/** 1 when `entry` is drawn in the box as it stands (its line is inside the window): a selection of it needs no scroll. */
int  ui_grid_visible(const ui_grid *g, int entry);
/** 1 when the selection cannot move further in the direction of `key` (UI_KEY_LEFT: the first column of its row;
    UI_KEY_RIGHT: the last), so the key belongs to whoever holds the grid (cover flow turns the page). Also 1 for an
    empty grid; 0 for any other key. */
int  ui_grid_at_edge(const ui_grid *g, int key);
int  ui_grid_page(const ui_grid *g);                     /* page of the selection, 0-based (PAGES mode) */
void ui_grid_draw(ui_grid *g, ansi_buf *b);
/** The same, for a box whose rows were just cleared to `ground` (ansi_clear_ground): no blank pass, so no row goes out twice. */
void ui_grid_draw_on_ground(ui_grid *g, ansi_buf *b);
/** Repaint what changed. Returns 1 when the whole box was redrawn (a scroll or a page turn) - the door wraps that in a page wipe. */
int  ui_grid_draw_changed(ui_grid *g, ansi_buf *b);
/** The entry under screen cell (row, col), or -1. */
int  ui_grid_hit(const ui_grid *g, int row, int col);
/** Screen row of the band's first visible row, 0 when the band is not on screen. */
int  ui_grid_band_row(const ui_grid *g);

#ifdef __cplusplus
}
#endif
#endif
