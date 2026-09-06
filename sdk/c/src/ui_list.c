/*
 * ui_list - see ui_list.h.
 *
 * Two things worth reading before changing anything here.
 *
 * THE WINDOW FOLLOWS THE SELECTION, not the other way round. Every function
 * that moves the selection ends by calling follow(), which is the only place
 * `offset` is written. A second place that scrolled would eventually
 * disagree with this one, and the symptom is a selected row that is not on
 * screen.
 *
 * THE SCROLL BAR IS PROPORTIONAL AND ALWAYS HAS A THUMB. A bar that rounds
 * its thumb to zero rows on a long list looks like a bar that is broken.
 */

#include "ui_list.h"

#include <string.h>

void ui_list_init(ui_list *list)
{
    if (!list) return;

    memset(list, 0, sizeof(*list));
    list->chrome = ANSI_CYAN;
    list->ink = ANSI_WHITE;
    list->selected_fg = ANSI_WHITE;
    list->selected_bg = ANSI_BLUE;
    list->caret = 0;
    list->borders = 1;
}

int ui_list_visible_rows(const ui_list *list)
{
    int rows;

    if (!list) return 0;
    rows = list->borders ? list->height - 2 : list->height;
    return rows > 0 ? rows : 0;
}

/** Keep `offset` showing `selected`, and never past the end. */
static void follow(ui_list *list)
{
    int visible = ui_list_visible_rows(list);
    int max_offset;

    if (visible <= 0) { list->offset = 0; return; }

    if (list->selected < list->offset) {
        list->offset = list->selected;
    } else if (list->selected >= list->offset + visible) {
        list->offset = list->selected - visible + 1;
    }

    /* A list shorter than its box does not scroll at all, and no window ever
       shows past the last row. */
    max_offset = list->count - visible;
    if (max_offset < 0) max_offset = 0;
    if (list->offset > max_offset) list->offset = max_offset;
    if (list->offset < 0) list->offset = 0;
}

void ui_list_select(ui_list *list, int index)
{
    if (!list) return;

    if (index < 0) index = 0;
    if (index > list->count - 1) index = list->count - 1;
    if (index < 0) index = 0;              /* an empty list selects nothing */

    list->selected = index;
    follow(list);
}

void ui_list_move(ui_list *list, int delta)
{
    if (!list) return;
    ui_list_select(list, list->selected + delta);
}

/**
 * The scroll bar's thumb: where it starts and how tall it is.
 *
 * Proportional to what is showing, with a floor of one row - a thumb that
 * rounds to nothing reads as a broken widget rather than a long list.
 */
static void thumb_for(const ui_list *list, int visible, int *start, int *size)
{
    int span;

    *size = (visible * visible) / (list->count > 0 ? list->count : 1);
    if (*size < 1) *size = 1;
    if (*size > visible) *size = visible;

    span = list->count - visible;
    if (span <= 0) { *start = 0; *size = visible; return; }

    *start = (list->offset * (visible - *size)) / span;
    if (*start < 0) *start = 0;
    if (*start > visible - *size) *start = visible - *size;
}

void ui_list_draw(ui_list *list, ansi_buf *b)
{
    int visible, row, inner_left, inner_width;
    int thumb_start = 0, thumb_size = 0;
    int scrolls;

    if (!list || !b || list->width < 3 || list->height < 1) return;

    visible = ui_list_visible_rows(list);
    if (visible <= 0) return;

    if (list->borders) {
        ansi_box(b, list->top, list->left, list->height, list->width,
                 list->chrome, list->label);
    }

    inner_left = list->borders ? list->left + 1 : list->left;
    inner_width = list->borders ? list->width - 2 : list->width;

    /* The bar takes a column from the text, and only when there is
       something to scroll: a list that fits should not lose a column to a
       bar that would never move. */
    scrolls = list->count > visible;
    if (scrolls) inner_width -= 1;
    if (inner_width < 1) return;

    if (scrolls) thumb_for(list, visible, &thumb_start, &thumb_size);

    for (row = 0; row < visible; row++) {
        int index = list->offset + row;
        int screen_row = (list->borders ? list->top + 1 : list->top) + row;
        int chosen = (index == list->selected) && (list->count > 0);
        const char *text = "";

        if (index < list->count && list->row) {
            text = list->row(list->context, index);
            if (!text) text = "";
        }

        /* The selected row is a filled bar, not just coloured text: a
           highlight that stops at the end of the word leaves the eye
           hunting for where the selection is. */
        if (chosen && list->caret) {
            /* A caret, and the row in the selection's ink beside it. No
               bar: the caret IS the mark. */
            ansi_color(b, list->ink, -1, 1);
            ansi_text_raw(b, screen_row, inner_left, list->caret,
                          (int) strlen(list->caret));
        } else if (chosen) {
            /* Ink on a bar. On a screen whose cells cannot carry a
               background, ansi_color turns this into reverse video in the
               bar's colour - the widget does not need to know which kind of
               screen it is on (ui_ansi.h, cell_backgrounds). */
            ansi_fill(b, screen_row, inner_left, inner_width,
                      list->selected_fg, list->selected_bg);
            ansi_color(b, list->selected_fg, list->selected_bg, 1);
        } else {
            /* No background: a list row is text on whatever the screen is,
               which is what blessed draws - `style.item` carries a colour
               and no bg. Painting the ground explicitly made every row a
               filled band in the C door and none in the TypeScript. */
            ansi_color(b, list->ink, -1, 0);
        }

        /* ansi_text pads to the width, so a shorter row overwrites what was
           under it without a clearing pass. A caret row starts after the
           caret; every other row starts where the caret would have been, so
           the list does not shuffle sideways as the cursor moves. */
        {
            int lead = list->caret ? (int) ui_printable_len(list->caret) : 0;
            ansi_text(b, screen_row, inner_left + lead, text,
                      inner_width - lead);
        }

        if (scrolls) {
            int on_thumb = (row >= thumb_start) && (row < thumb_start + thumb_size);
            ansi_color(b, list->chrome, ANSI_BLACK, 0);
            ansi_text_raw(b, screen_row, inner_left + inner_width,
                          on_thumb ? "#" : "|", 1);
        }
    }

    ansi_color(b, list->ink, -1, 0);
}
