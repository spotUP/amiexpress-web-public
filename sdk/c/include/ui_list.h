/*
 * ui_list - a bordered list with a selection and a scroll bar.
 *
 * The widget the catalogue actually needs: nearly every door in the door
 * list is "show these rows, let somebody pick one". DOORMAN draws it with
 * blessed; this draws the same thing in a C door, at eight colours and in
 * plain ASCII, because on a real Amiga the terminal is topaz-8 and a
 * multi-byte box character renders as mojibake.
 *
 * The list OWNS the scrolling arithmetic, which is the part every hand-rolled
 * copy gets wrong: a selection that walks off the bottom has to pull the
 * window with it, a window must never show past the end, and a list shorter
 * than its box must not scroll at all.
 */

#ifndef UI_LIST_H
#define UI_LIST_H

#include "ui_ansi.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Where the rows come from: `index` is 0-based, the return is the text. */
typedef const char *(*ui_list_row_fn)(void *context, int index);

typedef struct {
    /** Where the box sits, 1-based like every ANSI coordinate. */
    int top, left, height, width;
    /** How many rows exist, and which one is chosen. */
    int count;
    int selected;
    /** The first visible row - the widget maintains it. */
    int offset;
    /** Border colour, row colour, and the selected row's two. */
    int chrome, ink, selected_fg, selected_bg;
    /** Drawn in the top border, or 0 for none. */
    const char *label;
    /** Draw the border at all. False at 40 columns (ui_profile.h). */
    int borders;
    /**
     * A cell here may carry its own background (ui_profile.cell_backgrounds).
     *
     * When it cannot - the 40-column tier, which is a C64 - the selected row
     * is marked with REVERSE VIDEO instead of a coloured bar, because
     * per-cell background is dropped on the way to a PETSCII caller and a
     * bar drawn that way marks nothing. Defaults to 1: a door that says
     * nothing gets the 80-column behaviour it always had.
     */
    int cell_backgrounds;
    ui_list_row_fn row;
    void *context;
} ui_list;

/**
 * Sensible defaults: white on black, a cyan frame, borders on, nothing
 * selected. A caller then sets what it cares about.
 */
void ui_list_init(ui_list *list);

/** Rows visible inside the box, which is the height minus its frame. */
int ui_list_visible_rows(const ui_list *list);

/**
 * Move the selection by `delta` and pull the window after it.
 *
 * Clamps at both ends rather than wrapping: a list that jumps from the last
 * row to the first on one keypress is how somebody loses their place.
 */
void ui_list_move(ui_list *list, int delta);

/** Select an exact row, clamped, window following. */
void ui_list_select(ui_list *list, int index);

/** Draw it. Composes into `b`; the caller flushes. */
void ui_list_draw(ui_list *list, ansi_buf *b);

#ifdef __cplusplus
}
#endif

#endif /* UI_LIST_H */
