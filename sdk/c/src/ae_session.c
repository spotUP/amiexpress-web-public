/*
 * ae_session - the accessors, over whatever transport the caller gave.
 *
 * Every one of these is the same shape: ask, notice a dropped carrier, and
 * answer something a door can use even when the board said nothing. A door
 * that has to check for failure before printing a name is a door that will
 * print "(null)" the first time somebody forgets.
 */

#include "ae_session.h"

#include <stdlib.h>
#include <string.h>

int ae_open(ae_session *s, ae_transport_fn transport, void *context,
            char *storage, long cap, int node)
{
    if (!s || !transport || !storage) return -1;
    if (cap < AE_SESSION_MIN_STORAGE) return -1;

    s->transport = transport;
    s->context = context;
    s->storage = storage;
    s->cap = cap;
    s->node = node;
    s->carrier = 1;
    return 0;
}

void ae_close(ae_session *s)
{
    if (!s) return;
    s->transport = 0;
    s->context = 0;
    s->storage = 0;
    s->cap = 0;
    s->carrier = 0;
}

int ae_carrier(const ae_session *s)
{
    return (s && s->carrier) ? 1 : 0;
}

int ae_node(const ae_session *s)
{
    return s ? s->node : 0;
}

/**
 * One round trip, with the carrier check every caller would otherwise
 * repeat. Returns the transport's answer, or -1 when there is no session.
 */
static int ask(ae_session *s, ae_field field, char *out, int cap)
{
    int got;

    if (cap > 0 && out) out[0] = '\0';
    if (!s || !s->transport) return -1;
    /* Once the line is down it stays down: a door that keeps asking would
       get an answer shaped like a real one from a board that is not there. */
    if (!s->carrier) return -1;

    got = s->transport(s->context, field, out, cap);
    if (got < 0) {
        s->carrier = 0;
        return -1;
    }
    return got;
}

/** A field the board answers with a number, or `fallback` when it does not. */
static int ask_int(ae_session *s, ae_field field, int fallback)
{
    char text[32];
    int got = ask(s, field, text, (int)sizeof(text));

    if (got <= 0) return fallback;
    return atoi(text);
}

int ae_user_name(ae_session *s, char *out, int n)
{
    return ask(s, AE_FIELD_USER_NAME, out, n);
}

int ae_user_location(ae_session *s, char *out, int n)
{
    return ask(s, AE_FIELD_USER_LOCATION, out, n);
}

int ae_user_level(ae_session *s)
{
    /* -1, not 0: level 0 is a real (and very low) access level, so a door
       that could not ask must be able to tell the difference. */
    return ask_int(s, AE_FIELD_USER_LEVEL, -1);
}

int ae_user_time_left(ae_session *s)
{
    return ask_int(s, AE_FIELD_TIME_LEFT, -1);
}

int ae_user_is_ansi(ae_session *s)
{
    /* A board that says nothing is assumed NOT to take ANSI: the safe
       direction, the same rule ae_host takes for everything else. */
    return ask_int(s, AE_FIELD_IS_ANSI, 0) ? 1 : 0;
}

int ae_screen_cols(ae_session *s)
{
    int cols = ask_int(s, AE_FIELD_SCREEN_COLS, AE_DEFAULT_COLS);
    /* A board that answers 0 - or something absurd - is answering with a
       field it never filled in. 80 is what a classic door assumed. */
    return (cols >= 20 && cols <= 500) ? cols : AE_DEFAULT_COLS;
}

int ae_screen_rows(ae_session *s)
{
    int rows = ask_int(s, AE_FIELD_SCREEN_ROWS, AE_DEFAULT_ROWS);
    return (rows >= 10 && rows <= 200) ? rows : AE_DEFAULT_ROWS;
}

int ae_conference(ae_session *s)
{
    return ask_int(s, AE_FIELD_CONFERENCE, 1);
}
