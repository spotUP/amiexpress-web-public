/*
 * ui_cells.h - a cell canvas with a diff flush, for doors that paint a
 * windowed screen (menu bar, panes, boxes, modals) and resend only the cells
 * that changed.
 *
 * WHY. ui_ansi writes straight to the wire and colours by theme token
 * (truecolour or 16 colours). A door that must look like a neo-blessed door
 * cell for cell needs blessed's palette (xterm-256 indices) and blessed's
 * SGR shape: every run starts with a reset, so a cell never inherits state
 * from the terminal. The canvas holds what the screen should be (back) and
 * what was last sent (front); ui_cells_flush sends the difference.
 *
 * COLOURS. 0..255 are xterm indices: 0-7 go out as SGR 30-37 / 40-47,
 * 8-15 as 90-97 / 100-107, 16-255 as 38;5;N / 48;5;N. UI_CELLS_DEFAULT (-1)
 * as a background is SGR 49, never 40 (a painted black shows as blocks).
 *
 * MARKED TEXT. ui_cells_marked and ui_cells_wrap take text with inline
 * style bytes: UI_CELLS_M_FG then one byte 1..255 sets the foreground,
 * UI_CELLS_M_BOLD and UI_CELLS_M_PLAIN switch bold, UI_CELLS_M_BASE returns
 * to the pen the call started with. Markers take no columns.
 *
 * MEMORY. Two heap arrays of cols*rows cells (4 bytes each): 16000 bytes at
 * 80x25. Nothing large on the stack.
 *
 * BORDERS are ASCII: '.' top corners, '`' bottom left, '\'' bottom right,
 * '-' and '|'. A labelled top edge reads ".- label ----.".
 */
#ifndef UI_CELLS_H
#define UI_CELLS_H

#include "ui_ansi.h"

#ifdef __cplusplus
extern "C" {
#endif

#define UI_CELLS_DEFAULT (-1)
#define UI_CELLS_BOLD 1
#define UI_CELLS_BG_DEFAULT 2

#define UI_CELLS_M_FG    '\001'
#define UI_CELLS_M_BOLD  '\002'
#define UI_CELLS_M_PLAIN '\003'
#define UI_CELLS_M_BASE  '\004'

typedef struct {
    unsigned char ch;
    unsigned char fg;
    unsigned char bg;
    unsigned char flags;   /* UI_CELLS_BOLD, UI_CELLS_BG_DEFAULT */
} ui_cell;

typedef struct {
    int cols, rows;
    ui_cell *back;         /* what the screen should show */
    ui_cell *front;        /* what was last sent */
    int full;              /* 1: the next flush resends every cell */
    int fg, bg, bold;      /* the pen */
    long sent;             /* cells sent by the last flush */
} ui_cells;

/** Allocates both buffers; every cell is a blank in fg 7 on the default background. Returns 0 or -1. */
int ui_cells_open(ui_cells *c, int cols, int rows);
void ui_cells_close(ui_cells *c);
/** Forgets what the terminal shows: the next flush sends every cell (after a resize or a clear). */
void ui_cells_invalidate(ui_cells *c);

void ui_cells_pen(ui_cells *c, int fg, int bg, int bold);
/** One cell in the pen. Off-canvas writes are dropped. */
void ui_cells_put(ui_cells *c, int row, int col, int ch);
/** Plain text in the pen, at most `max` columns (max < 0: to the right edge). Returns columns written. */
int ui_cells_text(ui_cells *c, int row, int col, const char *s, int max);
/** A rectangle of `ch` in the pen. */
void ui_cells_fill(ui_cells *c, int row, int col, int h, int w, int ch);
/** An ASCII box in `border_fg` on the pen background; `label` (may be NULL) sits in the top edge in
 *  `label_fg` as ".- label ---.". The inside is not touched. */
void ui_cells_box(ui_cells *c, int top, int left, int h, int w, int border_fg, const char *label, int label_fg);
/** A centred box with a cleared inside: writes its top/left to *top / *left. Clamped to the canvas. */
void ui_cells_modal(ui_cells *c, int h, int w, int border_fg, const char *label, int label_fg, int *top, int *left);
/** A vertical menu inside a box at top/left: the selected item is "> item" in `sel_fg`, the rest
 *  "  item" in `fg`. Width is the longest item + 4 (+2 border). Returns the box width. */
int ui_cells_menu(ui_cells *c, int top, int left, const char *const *items, int n, int sel, int border_fg, int fg, int sel_fg);

/** Visible columns of marked text. */
int ui_cells_marked_cols(const char *s);
/** Marked text bytes [from, to) at row/col, at most `max` columns. Style markers before `from` are
 *  applied but not drawn, so a wrapped line keeps the style it started in. Returns columns written. */
int ui_cells_marked(ui_cells *c, int row, int col, const char *s, int from, int to, int max);
/** Word-wraps marked text to `width` columns. starts[k]/ends[k] get each line's byte range (the space
 *  at a break is dropped; a word longer than the width is cut). Returns the number of lines, at most `max`. */
int ui_cells_wrap(const char *s, int width, int *starts, int *ends, int max);

/** Callback that empties `out` when it is nearly full (ui_screen_flush for a door). */
/* A row of `w` cells: text from the left, then spaces, all in fg/bg/bold (menu bar, label bar, status line). */
void ui_cells_bar(ui_cells *c, int row, int col, int w, const char *text, int fg, int bg, int bold);
/* A three-row bordered button with centred text. */
void ui_cells_button(ui_cells *c, int top, int left, int w, const char *text, int border_fg, int fg);

typedef void (*ui_cells_drain_fn)(void *ctx);
/** Sends the cells that differ from what was last sent: CUP only on a jump, one reset-led SGR per
 *  style change. The bottom-right cell is never sent (it would scroll some terminals). */
void ui_cells_flush(ui_cells *c, ansi_buf *out, ui_cells_drain_fn drain, void *ctx);

#ifdef __cplusplus
}
#endif

#endif /* UI_CELLS_H */
