/*
 * ui_input - a single-line editor, and the two dialogs built on it.
 *
 * LIFTED from examples/doorrepo-c/doorrepo.c's ui_text_prompt and ui_confirm,
 * which have been the door's prompts on a real board. What changed is the
 * coupling: those read the key straight from the BBS and flushed straight to
 * it, so the editor could not exist without a session. Here the key source
 * and the frame sink are the caller's (ui_key.h, ui_ansi.h), which is what
 * lets the editing rules be tested keystroke by keystroke.
 *
 * The rules themselves are unchanged, including the two that look like
 * details and are not:
 *
 *  - a cursor key inside a prompt means NOTHING and is swallowed, rather
 *    than inserting an escape sequence into the text;
 *  - the colours and the cursor are put back before returning, or the
 *    caller's next screen is painted in the prompt's blue.
 */

#ifndef UI_INPUT_H
#define UI_INPUT_H

#include "ui_ansi.h"
#include "ui_key.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Where a prompt draws, and in what colours. */
typedef struct {
    int row, left, cols;
    int fg, bg, ink;
    /** Fold typed letters to upper case - what a BBS command prompt wants. */
    int upper;
} ui_input_style;

/** Sensible defaults: white on blue, yellow text, no folding. */
void ui_input_style_init(ui_input_style *style);

/**
 * Edit `buf` in place until ENTER.
 *
 * Returns 1 when something was entered, 0 when the line was left empty, and
 * -1 when the caller went away mid-edit - which a door must treat as the end
 * of the session, not as an empty answer.
 */
int ui_input(ansi_buf *b, const ui_key_source *src, int *pushback,
             const ui_input_style *style, const char *label,
             char *buf, int maxlen);

/**
 * Ask a yes/no question. Y and N answer it; ENTER takes `default_yes`.
 *
 * Returns 1 for yes, 0 for no, -1 for a lost caller.
 */
int ui_confirm(ansi_buf *b, const ui_key_source *src, int *pushback,
               const ui_input_style *style, const char *question,
               int default_yes);

#ifdef __cplusplus
}
#endif

#endif /* UI_INPUT_H */
