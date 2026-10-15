/* test_theme_preview.c - THEMEC previews the highlighted theme, saves only on Enter. */
#include "../examples/theme-picker/theme_preview.h"
#include "../include/ui_ansi.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static void the_highlighted_theme_becomes_the_active_palette(void)
{
    ansi_buf b;
    char mem[256];
    theme_preview p;
    int i;

    memset(&b, 0, sizeof(b));
    ansi_begin(&b, mem, (long) sizeof(mem));
    theme_preview_init(&p, 0);
    theme_preview_apply(&p, &b);
    assert(b.palette == ui_theme_at(0)->rgb);

    for (i = 1; i < ui_theme_count(); i++) {
        assert(theme_preview_follow(&p, i) == 1);      /* every move changes theme */
        theme_preview_apply(&p, &b);
        assert(b.palette == ui_theme_at(i)->rgb);
        assert(b.palette_idx == ui_theme_at(i)->idx);
        assert(theme_preview_shown(&p) == ui_theme_at(i));
    }
    assert(theme_preview_follow(&p, ui_theme_count() - 1) == 0);   /* no change, no repaint */
}

static void leaving_restores_the_callers_theme(void)
{
    ansi_buf b;
    char mem[256];
    theme_preview p;

    memset(&b, 0, sizeof(b));
    ansi_begin(&b, mem, (long) sizeof(mem));
    theme_preview_init(&p, 2);
    theme_preview_follow(&p, 5);
    theme_preview_apply(&p, &b);
    assert(b.palette == ui_theme_at(5)->rgb);

    theme_preview_leave(&p, &b);
    assert(b.palette == ui_theme_at(2)->rgb);
    assert(theme_preview_shown(&p) == ui_theme_at(2));
}

static void saving_makes_the_highlight_the_callers_theme(void)
{
    ansi_buf b;
    char mem[256];
    theme_preview p;

    memset(&b, 0, sizeof(b));
    ansi_begin(&b, mem, (long) sizeof(mem));
    theme_preview_init(&p, 0);
    theme_preview_follow(&p, 3);
    theme_preview_commit(&p);
    theme_preview_follow(&p, 4);
    theme_preview_leave(&p, &b);
    assert(b.palette == ui_theme_at(3)->rgb);
}

int main(void)
{
    the_highlighted_theme_becomes_the_active_palette();
    leaving_restores_the_callers_theme();
    saving_makes_the_highlight_the_callers_theme();
    printf("test_theme_preview: ok\n");
    return 0;
}
