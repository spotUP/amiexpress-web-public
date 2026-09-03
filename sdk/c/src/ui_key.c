/*
 * ui_key - see ui_key.h.
 *
 * ui_decode_escape is lifted verbatim from examples/doorrepo-c/flow.c:1553,
 * renamed. ui_key_read is the loop around it that every caller of the
 * original wrote for itself.
 */

#include "ui_key.h"

int ui_decode_escape(const ui_key_source *src, int *pushback)
{
    int c;

    *pushback = -1;

    /* Give the rest of a sequence time to arrive, then ask - without
     * consuming - whether anything did. Nothing queued means the user
     * pressed ESC and nothing else. */
    if (src->settle != (void (*)(void *)) 0) {
        src->settle(src->ctx);
    }
    if (!src->pending(src->ctx)) {
        return UI_KEY_ESC;
    }

    c = src->next(src->ctx);
    if (c < 0) {
        return c;
    }
    if (c != '[' && c != 'O') {
        /* ESC followed by an ordinary key: two keystrokes, not one
         * sequence. The second one is handed back, not eaten. */
        *pushback = c;
        return UI_KEY_ESC;
    }

    c = src->next(src->ctx);
    if (c < 0) {
        return c;
    }
    switch (c) {
    case 'A': return UI_KEY_UP;
    case 'B': return UI_KEY_DOWN;
    case 'C': return UI_KEY_PGDN;
    case 'D': return UI_KEY_PGUP;
    case 'H': return UI_KEY_HOME;
    case 'F': return UI_KEY_END;
    case '5': case '6': case '1': case '4': {
        /* ESC [ n ~ : the tilde is part of the sequence. */
        int t = src->next(src->ctx);
        if (t < 0) {
            return t;
        }
        if (c == '5') return UI_KEY_PGUP;
        if (c == '6') return UI_KEY_PGDN;
        if (c == '1') return UI_KEY_HOME;
        return UI_KEY_END;
    }
    default:
        return 0;
    }
}

int ui_key_read(const ui_key_source *src, int *pushback)
{
    int c;

    if (!src || !src->next || !pushback) return -1;

    /* A byte handed back by the last decode comes first, or an ESC that was
       followed by an ordinary key would lose that key. */
    if (*pushback >= 0) {
        c = *pushback;
        *pushback = -1;
        return c;
    }

    c = src->next(src->ctx);
    if (c < 0) return c;

    /* CR and LF both mean ENTER: a telnet client sends CR, a raw socket LF,
       and a door that only knew one of them would look dead to half its
       callers. */
    if (c == '\r' || c == '\n') return UI_KEY_ENTER;
    if (c == 0x1b) return ui_decode_escape(src, pushback);

    return c;
}
