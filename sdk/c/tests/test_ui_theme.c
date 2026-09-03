/*
 * The themes, at eight colours.
 *
 * The table is generated from tokens.ts, so what is worth asserting here is
 * not the numbers - the generator owns those - but the promises a door
 * relies on: a theme always resolves, every token is a colour a terminal
 * can draw, and each theme keeps the identity a caller recognises it by.
 */

#include "../include/ui_theme.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static void every_theme_is_a_theme(void)
{
    int i;

    assert(ui_theme_count() == 7);
    for (i = 0; i < ui_theme_count(); i++) {
        const ui_theme *t = ui_theme_at(i);

        assert(t->id && *t->id);
        assert(t->rail != 0);              /* "" is fine, NULL is not */
        assert(t->border == UI_BORDER_LINE || t->border == UI_BORDER_NONE);

        /* Every token is one of the eight a C door can actually draw. */
        assert(t->ground <= 7 && t->ink <= 7 && t->chrome <= 7 && t->dim <= 7);
        assert(t->bar <= 7 && t->bar_ink <= 7 && t->accent <= 7);
        assert(t->accent_alt <= 7 && t->selection_bg <= 7 && t->selection_ink <= 7);
        assert(t->ok <= 7 && t->warn <= 7 && t->alert <= 7);
    }
    printf("  [OK] every theme is a theme, in colours a terminal has\n");
}

static void an_unknown_id_is_classic(void)
{
    /* The same answer themeById() gives, and the same rule ae_host takes for
       a host it has never heard of. */
    assert(strcmp(ui_theme_by_id("no-such-theme")->id, "classic") == 0);
    assert(strcmp(ui_theme_by_id("")->id, "classic") == 0);
    assert(strcmp(ui_theme_by_id(0)->id, "classic") == 0);
    printf("  [OK] an unknown id is classic, and never NULL\n");
}

static void the_ids_match_the_typescript(void)
{
    /* If a theme is added or renamed on the TypeScript side, the generated
       table changes and this is where a stale expectation shows up. */
    assert(strcmp(ui_theme_by_id("classic")->id, "classic") == 0);
    assert(strcmp(ui_theme_by_id("uprough-neon")->id, "uprough-neon") == 0);
    assert(strcmp(ui_theme_by_id("quiet-phosphor")->id, "quiet-phosphor") == 0);
    printf("  [OK] the ids are the TypeScript's ids\n");
}

static void each_theme_keeps_its_identity(void)
{
    /* The reduction throws shades away; it must not throw away what the
       theme IS. Two reductions failed this before the generator matched on
       hue: neon's pink came out red, and phosphor's green came out cyan. */
    assert(ui_theme_by_id("uprough-neon")->accent == ANSI_MAGENTA);
    assert(ui_theme_by_id("quiet-phosphor")->accent == ANSI_GREEN);
    assert(ui_theme_by_id("classic")->accent == ANSI_YELLOW);
    assert(ui_theme_by_id("classic")->chrome == ANSI_CYAN);
    printf("  [OK] each theme keeps the colour it is known by\n");
}

static void nothing_dim_disappears_into_the_ground(void)
{
    int i;

    /* A `dim` equal to `ground` is not dim, it is invisible - which is what
       'gray' reduced to before the achromatic rule only sent the very
       darkest colours to black. */
    for (i = 0; i < ui_theme_count(); i++) {
        const ui_theme *t = ui_theme_at(i);
        assert(t->dim != t->ground);
        assert(t->ink != t->ground);
        assert(t->accent != t->ground);
    }
    printf("  [OK] nothing a door writes with disappears into the ground\n");
}

int main(void)
{
    printf("ui_theme\n");
    every_theme_is_a_theme();
    an_unknown_id_is_classic();
    the_ids_match_the_typescript();
    each_theme_keeps_its_identity();
    nothing_dim_disappears_into_the_ground();
    printf("ui_theme: all passed\n");
    return 0;
}
