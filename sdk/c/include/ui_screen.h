/*
 * ui_screen - the door's frame, and where it goes.
 *
 * One frame, one write. Everything a door draws lands in a caller-owned
 * buffer and reaches the caller in a single ae_put - the measurement behind
 * that is in ui_ansi.h: the first version of this wrote each escape and each
 * cell separately, about a hundred round trips per frame, and redraw was
 * visibly slow on every keystroke.
 *
 * The screen owns its size, which it asks the session for once. A door that
 * redraws on a resize asks again with ui_screen_measure().
 */

#ifndef UI_SCREEN_H
#define UI_SCREEN_H

#include "ae_session.h"
#include "ui_ansi.h"
#include "ui_profile.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int rows;
    int cols;
    ansi_buf buf;
    ae_session *session;
    /** The tier this size belongs to, refreshed with the size. */
    ui_profile profile;
} ui_screen;

/**
 * Bind a screen to a session and a frame buffer.
 *
 * Asks the board how big the caller's terminal is, so `cols`, `rows` and
 * `profile` are usable immediately. Returns 0, or -1 when the arguments
 * cannot work. Allocates nothing.
 */
int ui_screen_open(ui_screen *sc, ae_session *s, char *frame, long cap);

/** Ask the board for the size again - after a resize, or on a hunch. */
void ui_screen_measure(ui_screen *sc);

/** Send what has been drawn. One write, then the buffer is empty again. */
void ui_screen_flush(ui_screen *sc);

/**
 * Put the terminal back: attributes reset, cursor shown, and flushed.
 *
 * A door that skips this leaves the caller's next prompt painted in the
 * door's last colour, which reads as the BOARD being broken.
 */
void ui_screen_close(ui_screen *sc);

#ifdef __cplusplus
}
#endif

#endif /* UI_SCREEN_H */
