/*
 * ui_doc - a paged reader for a block of text.
 *
 * The dialog four doors in the catalogue want (DocModal in the TypeScript
 * SDK): a manual, a help page, a release note. It BLOCKS, like ui_confirm,
 * and returns when the reader leaves.
 *
 * The arithmetic is separate from the drawing, for the same reason ui_list
 * owns its scrolling: paging is where a hand-rolled reader goes wrong - a
 * last page that scrolls past the end, a PgUp at the top that walks
 * negative, a document shorter than the box that must not scroll at all -
 * and none of that needs a terminal to be tested.
 *
 * Wrapping is by WORD, never by column: a manual cut mid-word is the defect
 * this board has already fixed once on the blessed side (2026-09-06). A word
 * longer than the box still breaks, because nothing else can.
 */

#ifndef UI_DOC_H
#define UI_DOC_H

#include "ui_ansi.h"
#include "ui_key.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Where the reader draws, and in what colours. */
typedef struct {
    int top, left, height, width;
    int fg, bg, ink;
} ui_doc_style;

/** A frame in the middle of an 80x24 screen, white on black. */
void ui_doc_style_init(ui_doc_style *style);

/**
 * Break `text` into lines no wider than `width`, at word boundaries.
 *
 * Calls `line(context, start, len)` once per produced line, in order, where
 * `start` points into `text`. Returns the number of lines. A NULL callback
 * counts without emitting, which is what the pager uses to size a document
 * before it draws one.
 *
 * Existing newlines are kept: they end a line wherever they appear.
 */
int ui_doc_wrap(const char *text, int width,
                void (*line)(void *context, const char *start, int len),
                void *context);

/**
 * The first line of the page holding `line`, given a box `rows` tall.
 *
 * Clamped at both ends: never negative, and never so far down that the last
 * page shows blank rows it does not have to.
 */
int ui_doc_top_for(int total_lines, int rows, int line);

/** How many pages a document of `total_lines` needs in a box `rows` tall. */
int ui_doc_pages(int total_lines, int rows);

/**
 * Show `text` until the reader leaves with Q, ESC or ENTER.
 *
 * Returns 0 normally and -1 when the caller went away mid-read, which a door
 * must treat as the end of the session rather than as a page turn.
 */
int ui_doc(ansi_buf *b, const ui_key_source *src, int *pushback,
           const ui_doc_style *style, const char *title, const char *text);

#ifdef __cplusplus
}
#endif

#endif /* UI_DOC_H */
