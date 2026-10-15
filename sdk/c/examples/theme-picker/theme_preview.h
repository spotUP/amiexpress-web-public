/* theme_preview.h - THEMEC's live preview: pure, no board, no screen. C89.
 *
 * The highlighted theme is the one the door wears; the caller's own stays
 * what is saved until Enter. Mirrors Doors/theme-picker wear() -> retintTree. */
#ifndef THEME_PREVIEW_H
#define THEME_PREVIEW_H

#include "ui_ansi.h"
#include "ui_theme.h"

typedef struct { int saved; int shown; } theme_preview;

void theme_preview_init(theme_preview *p, int saved_index);
/** Highlight moved to `index`: returns 1 when the door must repaint in another theme. */
int theme_preview_follow(theme_preview *p, int index);
const ui_theme *theme_preview_shown(const theme_preview *p);
/** Point the buffer's palette at the theme being shown. */
void theme_preview_apply(const theme_preview *p, ansi_buf *b);
/** Enter saved the highlighted theme. */
void theme_preview_commit(theme_preview *p);
/** Leaving: show the caller's saved theme again. */
void theme_preview_leave(theme_preview *p, ansi_buf *b);

#endif
