/*
 * ui_profile - what fits on the screen this caller has.
 *
 * The C twin of the TypeScript layout tiers
 * (sdk/engines/ui/blessed/core/responsive-constants.ts). A C door and a
 * TypeScript door on the same 40-column caller must fold the same way, or
 * the board has two answers to one question.
 *
 * The rule that matters is the XXS tier: a C64 has 40 columns, borders cost
 * two of them, and decoration costs the rest. Everything here follows from
 * that one measurement.
 */

#ifndef UI_PROFILE_H
#define UI_PROFILE_H

#ifdef __cplusplus
extern "C" {
#endif

/** The width at which the 40-column tier ends (responsive-constants.ts:34). */
#define UI_BREAKPOINT_XXS 41

/** What a layout may spend at this width. */
typedef struct {
    /** Draw borders at all. False at 40 columns, where they cost 5%. */
    int borders;
    /** Stack what would have been columns. */
    int single_column;
    /** Masthead and footer collapse to one line. */
    int collapse_chrome;
    /** Cells between neighbours. */
    int gap;
    /** Cells inside a frame. */
    int padding;
} ui_profile;

/** The tier for a width. Always pass the LIVE width, never a constant. */
ui_profile ui_profile_for(int width);

/** True at the 40-column tier. */
int ui_is_compact_width(int width);

/**
 * Whether decoration may run at this width.
 *
 * A 40x25 screen has no spare cells for a glitch or a marquee, and running
 * them there leaves stray glyphs mid-row - measured on the PETSCII canvas,
 * 2026-09-02. Doors gate their effect setup on this.
 */
int ui_effects_allowed(int width);

#ifdef __cplusplus
}
#endif

#endif /* UI_PROFILE_H */
