/*
 * The tiers, and that they still agree with the TypeScript.
 *
 * A C door and a TypeScript door on the same 40-column caller have to fold
 * the same way. The numbers below are read off
 * sdk/engines/ui/blessed/core/responsive-constants.ts; if that file moves
 * one, this fails and somebody decides deliberately.
 */

#include "../include/ui_profile.h"

#include <assert.h>
#include <stdio.h>

static void forty_columns_is_the_compact_tier(void)
{
    /* BREAKPOINT_XXS is 41: 40 is compact, 41 is not. The boundary is the
       whole rule, so it is what gets pinned. */
    assert(ui_is_compact_width(40));
    assert(ui_is_compact_width(1));
    assert(!ui_is_compact_width(41));
    assert(!ui_is_compact_width(80));
    printf("  [OK] forty columns is the compact tier, forty-one is not\n");
}

static void a_c64_gets_no_borders_and_no_decoration(void)
{
    ui_profile p = ui_profile_for(40);

    /* Borders cost 2 of 40 columns; decoration costs the rest. */
    assert(!p.borders);
    assert(p.single_column);
    assert(p.collapse_chrome);
    assert(p.gap == 0);
    assert(p.padding == 0);
    assert(!ui_effects_allowed(40));
    printf("  [OK] a C64 gets no borders and no decoration\n");
}

static void eighty_columns_gets_the_lot(void)
{
    ui_profile p = ui_profile_for(80);

    assert(p.borders);
    assert(!p.single_column);
    assert(!p.collapse_chrome);
    assert(p.gap == 1);
    assert(p.padding == 1);
    assert(ui_effects_allowed(80));
    printf("  [OK] eighty columns gets borders, columns and decoration\n");
}

static void a_width_nobody_asked_about_still_answers(void)
{
    /* A door that passes 0 - an unmeasured screen - must get the SAFE tier
       rather than a wide layout drawn into nothing. */
    ui_profile p = ui_profile_for(0);

    assert(!p.borders);
    assert(p.collapse_chrome);
    assert(!ui_effects_allowed(0));
    printf("  [OK] an unmeasured width falls to the safe tier\n");
}

int main(void)
{
    printf("ui_profile\n");
    forty_columns_is_the_compact_tier();
    a_c64_gets_no_borders_and_no_decoration();
    eighty_columns_gets_the_lot();
    a_width_nobody_asked_about_still_answers();
    printf("ui_profile: all passed\n");
    return 0;
}
