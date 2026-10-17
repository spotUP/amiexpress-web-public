/* test_ui_pages.c - the cover flow pager on its own: the key rule, the wrap, the indicator at 40 and 80 columns,
   the mouse hit test on the indicator's arrows, and the turn sequence that slides only when cols > 40. */
#include "ui_pages.h"
#include "ui_key.h"
#include "ae_board_screen.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

/* The board's slide: the turn asks for it only when it may play; the stub records what was asked and says yes. */
static int slides, slide_forward, slide_top, slide_rows;
int ae_bs_slide_begin(int forward, int top, int rows)
{
    slides++; slide_forward = forward; slide_top = top; slide_rows = rows;
    return 1;
}

static const char *const TITLES[5] = { "Messages", "Files", "Conferences and Doors", "System", "Utilities" };
static char trace[256];
static int shown;

static const char *title(void *ctx, int page) { (void)ctx; return TITLES[page]; }
static void show(void *ctx, int page) { (void)ctx; shown = page; strcat(trace, "show "); }
static void draw_fixed(void *ctx, int sliding) { (void)ctx; strcat(trace, sliding ? "fixed(slide) " : "fixed "); }
static void draw_region(void *ctx) { (void)ctx; strcat(trace, "region "); }
static void finish(void *ctx, int captured) { (void)ctx; strcat(trace, captured ? "finish(captured)" : "finish"); }

static void make(ui_pages *p, int count, int current, int cols, int slide)
{
    ui_pages_init(p, count, current, 0);
    p->cols = cols; p->slide = slide; p->top = 4; p->height = 18; p->status_row = 25;
    p->title = title; p->show = show; p->draw_fixed = draw_fixed; p->draw_region = draw_region; p->finish = finish;
}

static void the_key_rule(void)
{
    ui_pages p;
    make(&p, 5, 0, 80, 1);
    assert(ui_pages_step(&p, UI_KEY_PGDN, 0, 0) == 1 && ui_pages_step(&p, UI_KEY_PGUP, 3, 0) == -1);   /* always */
    assert(ui_pages_step(&p, UI_KEY_RIGHT, 0, 0) == 0);          /* not at the grid edge: the grid moves */
    assert(ui_pages_step(&p, UI_KEY_RIGHT, 0, 1) == 1 && ui_pages_step(&p, UI_KEY_LEFT, 0, 1) == -1);
    assert(ui_pages_step(&p, UI_KEY_RIGHT, 2, 1) == 0);          /* a typed line keeps Left/Right */
    assert(ui_pages_step(&p, UI_KEY_UP, 0, 1) == 0 && ui_pages_step(&p, UI_KEY_ENTER, 0, 1) == 0 && ui_pages_step(&p, 'q', 0, 1) == 0);
    make(&p, 1, 0, 80, 1);
    assert(ui_pages_step(&p, UI_KEY_PGDN, 0, 1) == 0 && ui_pages_step(&p, UI_KEY_RIGHT, 0, 1) == 0);   /* one page */
    printf("  [OK] PageUp/PageDown always turn, Left/Right only at the edge with no typed line\n");
}

static void pages_wrap(void)
{
    ui_pages p;
    make(&p, 5, 0, 80, 1);
    assert(ui_pages_wrap(&p, -1) == 4 && ui_pages_wrap(&p, 1) == 1);
    p.current = 4;
    assert(ui_pages_wrap(&p, 1) == 0 && ui_pages_wrap(&p, -1) == 3);
    printf("  [OK] pages wrap at both ends\n");
}

static void the_indicator(void)
{
    ui_pages p;
    char buf[UI_PAGES_INDICATOR_MAX];
    make(&p, 5, 1, 80, 1);
    ui_pages_indicator(&p, buf, (int)sizeof buf);
    assert(strcmp(buf, "< 2/5 Files >") == 0);
    p.current = 2;
    ui_pages_indicator(&p, buf, (int)sizeof buf);
    assert(strcmp(buf, "< 3/5 Conferences and Door >") == 0);    /* 21 chars clip to 20 at 80 columns */
    p.cols = 40;
    ui_pages_indicator(&p, buf, (int)sizeof buf);
    assert(strcmp(buf, "< 3/5 Conferen >") == 0);                /* 8 at 40 columns */
    make(&p, 1, 0, 80, 1);
    ui_pages_indicator(&p, buf, (int)sizeof buf);
    assert(buf[0] == '\0');                                      /* one page: no indicator */
    printf("  [OK] the indicator reads < n/m Title > and clips the title at 40 and 80 columns\n");
}

static void the_hit_test(void)
{
    ui_pages p;
    char buf[UI_PAGES_INDICATOR_MAX];
    int n, start;
    make(&p, 5, 1, 80, 1);
    n = ui_pages_indicator(&p, buf, (int)sizeof buf);
    assert(n == (int)strlen(buf));
    start = 80 - n + 1;                                          /* right-aligned on the status row */
    assert(ui_pages_hit(&p, 25, start) == -1 && ui_pages_hit(&p, 25, start + 1) == -1);
    assert(ui_pages_hit(&p, 25, start + n - 1) == 1 && ui_pages_hit(&p, 25, start + n - 2) == 1);
    assert(ui_pages_hit(&p, 25, start + 4) == 0);                /* the title is not an arrow */
    assert(ui_pages_hit(&p, 24, start) == 0);                    /* another row */
    printf("  [OK] a click on the indicator's arrows turns back or forward\n");
}

static void the_position_bar(void)
{
    ui_pages p;
    int start, size;
    make(&p, 3, 0, 80, 1);
    ui_pages_bar(&p, 80, &start, &size);
    assert(start == 0 && size == 26);                            /* a third of the row, at the left edge */
    p.current = 1;
    ui_pages_bar(&p, 80, &start, &size);
    assert(start == 27 && size == 26);                           /* the middle */
    p.current = 2;
    ui_pages_bar(&p, 80, &start, &size);
    assert(start + size == 80);                                  /* the last page ends at the right edge */
    make(&p, 100, 99, 40, 1);
    ui_pages_bar(&p, 40, &start, &size);
    assert(size == 1 && start == 39);                            /* more pages than cells: one cell, still visible */
    make(&p, 1, 0, 80, 1);
    ui_pages_bar(&p, 80, &start, &size);
    assert(start == 0 && size == 80);                            /* one page fills the row */
    printf("  [OK] the position bar is one page's share of the row and runs edge to edge\n");
}

static void slide_only_above_40_columns(void)
{
    ui_pages p;
    make(&p, 5, 0, 80, 1);
    trace[0] = '\0'; slides = 0;
    assert(ui_pages_turn(&p, 1) == 1 && p.current == 1 && shown == 1);
    assert(slides == 1 && slide_forward == 1 && slide_top == 4 && slide_rows == 18);
    assert(strcmp(trace, "show fixed(slide) region finish(captured)") == 0);
    make(&p, 5, 0, 40, 1);
    trace[0] = '\0'; slides = 0;
    assert(ui_pages_turn(&p, -1) == 0 && p.current == 4 && slides == 0);
    assert(strcmp(trace, "show fixed region finish") == 0);
    make(&p, 5, 0, 80, 0);                                       /* the sysop's slide flag off */
    slides = 0;
    assert(ui_pages_turn(&p, 1) == 0 && slides == 0);
    printf("  [OK] a turn slides only when the flag is on and cols > 40, and repaints once either way\n");
}

int main(void)
{
    printf("test_ui_pages\n");
    the_key_rule();
    pages_wrap();
    the_indicator();
    the_hit_test();
    the_position_bar();
    slide_only_above_40_columns();
    return 0;
}
