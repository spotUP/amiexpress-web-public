/* theme_preview.c - see theme_preview.h. */
#include "theme_preview.h"

void theme_preview_init(theme_preview *p, int saved_index)
{
    p->saved = saved_index;
    p->shown = saved_index;
}

int theme_preview_follow(theme_preview *p, int index)
{
    if (index == p->shown) return 0;
    p->shown = index;
    return 1;
}

const ui_theme *theme_preview_shown(const theme_preview *p)
{
    return ui_theme_at(p->shown);
}

void theme_preview_apply(const theme_preview *p, ansi_buf *b)
{
    const ui_theme *t = ui_theme_at(p->shown);
    ansi_set_palette(b, t->rgb, t->idx, UI_TOKEN_COUNT);
}

void theme_preview_commit(theme_preview *p)
{
    p->saved = p->shown;
}

void theme_preview_leave(theme_preview *p, ansi_buf *b)
{
    p->shown = p->saved;
    theme_preview_apply(p, b);
}
