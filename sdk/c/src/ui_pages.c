/*
 * ui_pages - see include/ui_pages.h. No allocation.
 */
#include "ui_pages.h"
#include "ui_key.h"
#include "ui_profile.h"
#include "ae_board_screen.h"
#include <string.h>
#include <stdio.h>

void ui_pages_init(ui_pages *p, int count, int current, void *ctx)
{
    if (!p) return;
    memset(p, 0, sizeof *p);
    p->count = count < 0 ? 0 : count;
    p->current = current < 0 || current >= p->count ? 0 : current;
    p->ctx = ctx;
}

int ui_pages_step(const ui_pages *p, int key, int typed_len, int at_edge)
{
    if (!p || p->count < 2) return 0;
    if (key == UI_KEY_PGUP) return -1;
    if (key == UI_KEY_PGDN) return 1;
    if (typed_len > 0 || !at_edge) return 0;
    if (key == UI_KEY_LEFT) return -1;
    if (key == UI_KEY_RIGHT) return 1;
    return 0;
}

int ui_pages_wrap(const ui_pages *p, int step)
{
    if (!p || p->count < 1) return 0;
    return ((p->current + step) % p->count + p->count) % p->count;
}

int ui_pages_wants_slide(const ui_pages *p)
{
    return p && p->slide && ui_effects_allowed(p->cols) && p->height > 0;
}

int ui_pages_turn(ui_pages *p, int step)
{
    int sliding, captured;

    if (!p || p->count < 2 || step == 0) return -1;
    p->current = ui_pages_wrap(p, step < 0 ? -1 : 1);
    if (p->show) p->show(p->ctx, p->current);
    sliding = ui_pages_wants_slide(p);
    if (p->draw_fixed) p->draw_fixed(p->ctx, sliding);
    captured = sliding && ae_bs_slide_begin(step > 0, p->top, p->height) == 1;
    if (p->draw_region) p->draw_region(p->ctx);
    if (p->finish) p->finish(p->ctx, captured);
    return captured;
}

int ui_pages_indicator(const ui_pages *p, char *buf, int cap)
{
    char title[24];
    const char *t;
    int room, n;

    if (!buf || cap < 1) return 0;
    buf[0] = '\0';
    if (!p || p->count < 2 || cap < UI_PAGES_INDICATOR_MAX) return 0;
    t = p->title ? p->title(p->ctx, p->current) : 0;
    room = p->cols > 40 ? 20 : 8;
    title[0] = '\0';
    if (t && t[0]) {
        n = (int)strlen(t);
        if (n > room) n = room;
        title[0] = ' ';
        memcpy(title + 1, t, (size_t)n);
        title[1 + n] = '\0';
    }
    return sprintf(buf, "< %d/%d%s >", p->current + 1, p->count, title);
}

int ui_pages_hit(const ui_pages *p, int row, int col)
{
    char ind[UI_PAGES_INDICATOR_MAX];
    int n = ui_pages_indicator(p, ind, (int)sizeof ind), start;

    if (n == 0 || row != p->status_row) return 0;
    start = p->cols - n + 1;                          /* ui_status_draw right-aligns it in the row */
    if (col >= start && col <= start + 1) return -1;
    if (col >= start + n - 2 && col <= start + n - 1) return 1;
    return 0;
}

void ui_pages_bar(const ui_pages *p, int width, int *start, int *size)
{
    *start = 0;
    *size = width;
    if (p->count < 2 || width < 1) return;
    *size = width / p->count;
    if (*size < 1) *size = 1;
    *start = p->current * (width - *size) / (p->count - 1);
}
