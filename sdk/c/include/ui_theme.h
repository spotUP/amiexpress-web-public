/*
 * ui_theme - the board's themes, at the eight colours a C door has.
 *
 * The sysop's answer to "must a C door look like its TypeScript twin?" was
 * yes - "the identity of our doors is important" (2026-09-02) - so all seven
 * themes are here, not just classic.
 *
 * THE TABLE IS GENERATED, never hand-edited: sdk/engines/ui/theme/tokens.ts
 * stays the one place a theme is defined, and tools/generate-theme-tables.ts
 * reduces each token to one of eight colours. `make check-themes` fails when
 * the header is stale, so the two cannot drift in silence.
 *
 * What does not survive the reduction, and why that is honest: `double`
 * borders (ansi_box draws + - |, so double degrades to line) and the exact
 * shades (a hex ramp has no 8-colour equivalent). What DOES survive is the
 * identity - phosphor stays green, neon stays magenta - which is the part a
 * caller recognises.
 */

#ifndef UI_THEME_H
#define UI_THEME_H

#include "ui_ansi.h"

#ifdef __cplusplus
extern "C" {
#endif

#define UI_BORDER_LINE 0
#define UI_BORDER_NONE 1

/**
 * One theme. The thirteen tokens are exactly ThemeTokens
 * (sdk/engines/ui/theme/tokens.ts), so the two implementations describe the
 * same roles rather than two vocabularies.
 */
typedef struct {
    const char *id;
    unsigned char ground, ink, chrome, dim, bar, bar_ink;
    unsigned char accent, accent_alt, selection_bg, selection_ink;
    unsigned char ok, warn, alert;
    int border;
    /** The ASCII branding mark, or "" for a theme with none. */
    const char *rail;
} ui_theme;

/**
 * A theme by id, or CLASSIC for an id this board does not have.
 *
 * Never NULL: a door asks once at startup and then reads tokens off the
 * result, and a null check at every one of those would be noise around a
 * case that means "draw the board as it always looked".
 */
const ui_theme *ui_theme_by_id(const char *id);

/** How many themes there are, and one by index - for a picker. */
int ui_theme_count(void);
const ui_theme *ui_theme_at(int index);

#ifdef __cplusplus
}
#endif

#endif /* UI_THEME_H */
