/*
 * ui_screen - see ui_screen.h.
 *
 * The only thing here with an opinion is where a frame goes: through the
 * session's transport as one write. Everything else is bookkeeping around
 * the ansi_buf.
 */

#include "ui_screen.h"
#include "aedoor.h"

#include <string.h>

/**
 * The sink: one finished frame, handed to the board.
 *
 * ae_session has no "write" of its own yet - phase 2's transport lift is
 * what adds it - so this is deliberately the one place that will change when
 * it does, rather than every door.
 */
static void to_session(void *context, const char *bytes, long len)
{
    ae_session *s = (ae_session *)context;

    if (!s || !bytes || len <= 0) return;
    /* A door whose carrier has gone is drawing into a dropped line; the
       session already knows, and writing anyway would block on a port that
       nobody is reading. */
    if (!ae_carrier(s)) return;

    /* One composed frame, one AEDoor write - the whole reason ui_ansi
       buffers. The 0 is "no line break": the frame positions its own cursor
       and a break here would scroll what it just drew. */
    ae_put(bytes, 0);
}

int ui_screen_open(ui_screen *sc, ae_session *s, char *frame, long cap)
{
    if (!sc || !frame || cap <= 0) return -1;

    memset(sc, 0, sizeof(*sc));
    sc->session = s;
    ansi_begin(&sc->buf, frame, cap);
    ui_screen_measure(sc);
    return 0;
}

void ui_screen_measure(ui_screen *sc)
{
    if (!sc) return;

    sc->cols = sc->session ? ae_screen_cols(sc->session) : AE_DEFAULT_COLS;
    sc->rows = sc->session ? ae_screen_rows(sc->session) : AE_DEFAULT_ROWS;
    /* The tier follows the size, always - a door that asked once at startup
       and then widened would draw an 80-column layout into 40 cells. */
    sc->profile = ui_profile_for(sc->cols);
}

void ui_screen_flush(ui_screen *sc)
{
    if (!sc) return;
    ansi_flush(&sc->buf, to_session, sc->session);
}

void ui_screen_close(ui_screen *sc)
{
    if (!sc) return;

    ansi_reset(&sc->buf);
    ansi_cursor(&sc->buf, 1);
    ui_screen_flush(sc);
}
