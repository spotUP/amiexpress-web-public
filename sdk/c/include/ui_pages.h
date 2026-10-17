/*
 * ui_pages - a door's content split into pages, one shown at a time, turned with Left/Right at the grid's edge or
 * PageUp/PageDown (cover flow). The door owns what a page is and how it draws; ui_pages owns the key rule, the
 * wrap, the "< 2/5 Files >" indicator and its mouse hit test, and the page-turn sequence with the board's slide.
 *
 * A page turn: the door's `show` makes the page current, the fixed rows outside the region are drawn (the status
 * row with the indicator), then the region. With the slide flag on and effects allowed (more than 40 columns) the
 * region is drawn inside ae_bs_slide_begin's capture; otherwise it simply repaints. Pages wrap like a carousel.
 */
#ifndef UI_PAGES_H
#define UI_PAGES_H

#ifdef __cplusplus
extern "C" {
#endif

#define UI_PAGES_INDICATOR_MAX 40

typedef struct ui_pages {
    int count, current;
    int slide;                 /* the sysop's slide flag; the board may still refuse */
    int cols;                  /* terminal width: effects only above 40 columns */
    int top, height;           /* the region the slide moves (screen rows) */
    int status_row;            /* the row the indicator is drawn on, right-aligned in `cols` */
    void *ctx;
    const char *(*title)(void *ctx, int page);        /* the page's name in the indicator; 0 = numbers only */
    void (*show)(void *ctx, int page);                /* make `page` current in the door's model (may update top/height) */
    void (*draw_fixed)(void *ctx, int sliding);       /* rows outside the region; the door flushes */
    void (*draw_region)(void *ctx);                   /* the region; the door flushes */
    void (*finish)(void *ctx, int captured);          /* end the capture (or re-assert the cursor), park, flush */
} ui_pages;

/** Zeroes `p`, then sets count, current (clamped) and ctx. Callbacks and geometry are the caller's to set. */
void ui_pages_init(ui_pages *p, int count, int current, void *ctx);
/** The page step for `key`: -1, +1, or 0 when the key is not a page key here. PageUp/PageDown always turn;
    Left/Right turn only when nothing is typed and the grid is at its edge in that direction (`at_edge`). */
int  ui_pages_step(const ui_pages *p, int key, int typed_len, int at_edge);
/** The page `step` lands on, wrapping at both ends. */
int  ui_pages_wrap(const ui_pages *p, int step);
/** 1 when a turn asks the board for a slide: the flag is on, more than 40 columns, a region to move. */
int  ui_pages_wants_slide(const ui_pages *p);
/** Turns by `step` (-1/+1) and draws. 1 when the board captured a slide, 0 when it repainted, -1 nothing to turn. */
int  ui_pages_turn(ui_pages *p, int step);
/** "< 2/5 Files >" (the title clipped shorter at 40 columns), "" with fewer than two pages. Returns its length. */
int  ui_pages_indicator(const ui_pages *p, char *buf, int cap);
/** A click at (row, col) on the drawn indicator: -1 on "<", +1 on ">", else 0. */
int  ui_pages_hit(const ui_pages *p, int row, int col);

#ifdef __cplusplus
}
#endif

#endif
