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

        /* Every token is one of the SIXTEEN a terminal has: eight base
           colours and their bold twins. Eight was the first cut and it made
           `ink: white` and `dim: gray` the same number, so a C door drew a
           row's mark, name and blurb in one colour (2026-09-07). */
        assert(t->ground <= 15 && t->ink <= 15 && t->chrome <= 15 && t->dim <= 15);
        assert(t->bar <= 15 && t->bar_ink <= 15 && t->accent <= 15);
        assert(t->accent_alt <= 15 && t->selection_bg <= 15 && t->selection_ink <= 15);
        assert(t->ok <= 15 && t->warn <= 15 && t->alert <= 15);

        /* And ink is never the same colour as dim: the contrast between them
           is what a list row is built out of. */
        assert(t->ink != t->dim);
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
    /* The HUE is the identity; which half of the sixteen it lands in is
       brightness. neon's pink is a light magenta and takes the bright row -
       that is the theme keeping its colour, not losing it - so the check is
       on the base colour with the bright bit taken off. */
    #define BASE(c) ((c) & 7)
    assert(BASE(ui_theme_by_id("uprough-neon")->accent) == ANSI_MAGENTA);
    assert(BASE(ui_theme_by_id("quiet-phosphor")->accent) == ANSI_GREEN);
    assert(BASE(ui_theme_by_id("classic")->accent) == ANSI_YELLOW);
    assert(BASE(ui_theme_by_id("classic")->chrome) == ANSI_CYAN);
    /* And a light theme colour really is on the bright row, or the C door
       draws a demoscene pink as the dull magenta nobody chose. */
    assert(ui_theme_by_id("uprough-neon")->accent >= ANSI_BRIGHT);
    #undef BASE
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
