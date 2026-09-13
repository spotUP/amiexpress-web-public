/*
 * ae_session - the accessors, over whatever transport the caller gave.
 *
 * Every one of these is the same shape: ask, notice a dropped carrier, and
 * answer something a door can use even when the board said nothing. A door
 * that has to check for failure before printing a name is a door that will
 * print "(null)" the first time somebody forgets.
 */

#include "ae_session.h"

#include <stdio.h>      /* sprintf - C89 has no snprintf */
#include <stdlib.h>
#include <string.h>

int ae_open(ae_session *s, ae_transport_fn transport, void *context,
            char *storage, long cap, int node)
{
    if (!s || !transport || !storage) return -1;
    if (cap < AE_SESSION_MIN_STORAGE) return -1;

    s->transport = transport;
    s->write = 0;
    s->context = context;
    s->storage = storage;
    s->cap = cap;
    s->node = node;
    s->carrier = 1;
    return 0;
}

void ae_set_writer(ae_session *s, ae_write_fn write)
{
    if (!s) return;
    s->write = write;
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

int ae_conf_name(ae_session *s, char *out, int n)
{
    return ask(s, AE_FIELD_CONF_NAME, out, n);
}

int ae_conf_location(ae_session *s, char *out, int n)
{
    return ask(s, AE_FIELD_CONF_LOCATION, out, n);
}

int ae_msgbase_path(ae_session *s, char *out, int n)
{
    return ask(s, AE_FIELD_MSGBASE_LOC, out, n);
}

int ae_last_read(ae_session *s)
{
    /* -1, not 0, for the same reason ae_user_level uses -1: zero is a real
       answer here. A caller who has never read anything in this conference
       genuinely has pointer 0, so a door that cannot ask must be able to tell
       that apart from a board that will not say - otherwise it marks every
       message in the conference new for somebody who has read them all. */
    return ask_int(s, AE_FIELD_LAST_READ, -1);
}

int ae_last_scanned(ae_session *s)
{
    return ask_int(s, AE_FIELD_LAST_SCANNED, -1);
}

/**
 * Shared by both pointer setters: send "<VERB> <n>", then ask what the
 * pointer actually is.
 *
 * The read-back is not belt-and-braces, it is the whole detection mechanism.
 * ae_write_fn reports only whether the carrier survived, never what the board
 * decided, and a board that has never heard of AE_FIELD_SETPOINTER takes the
 * write without complaint and changes nothing. Asking afterwards is the only
 * way to tell "stored" from "politely ignored" - the same reason
 * ae_set_user_theme reads the theme back instead of trusting its own write.
 */
static int set_pointer(ae_session *s, const char *verb, int msg_num,
                       int (*read_back)(ae_session *))
{
    char request[32];
    int now;

    if (!s || !s->transport || msg_num < 0) return 0;
    if (!s->carrier) return 0;
    if (!s->write) return 0;            /* a read-only transport */

    /* sprintf, not snprintf - C89 has none, which is why ae_http.c and
       ae_transport_amiga.c do the same. Safe by construction here and not by
       hope: `verb` is one of two string literals four characters long, and an
       int cannot print more than 11 characters, so 32 bytes cannot overflow. */
    sprintf(request, "%s %d", verb, msg_num);

    if (s->write(s->context, AE_FIELD_SETPOINTER, request) < 0) {
        s->carrier = 0;
        return 0;
    }

    now = read_back(s);
    /* -1 is "the board would not say", which is not a stored pointer. */
    if (now < 0) return 0;
    return now >= msg_num ? 1 : 0;
}

int ae_set_last_read(ae_session *s, int msg_num)
{
    return set_pointer(s, "READ", msg_num, ae_last_read);
}

int ae_set_last_scanned(ae_session *s, int msg_num)
{
    return set_pointer(s, "SCAN", msg_num, ae_last_scanned);
}

long ae_now(ae_session *s)
{
    char text[32];
    int got = ask(s, AE_FIELD_CURR_TIME, text, (int)sizeof(text));

    if (got <= 0) return 0;
    return atol(text);
}

int ae_user_theme(ae_session *s, char *out, int n)
{
    int got = ask(s, AE_FIELD_THEME, out, n);

    /* A board with no themes answers nothing, and "" is what a door should
       see - not "classic", which would look like a caller's choice. */
    return got > 0 ? got : 0;
}

int ae_menu_command(ae_session *s, char *out, int n)
{
    int got = ask(s, AE_FIELD_MENU_COMMAND, out, n);

    /* "" for a board that does not answer, never a guessed name: a door that
       assumed its own primary name would run its main screen under every
       registration it has. */
    return got > 0 ? got : 0;
}

int ae_set_user_theme(ae_session *s, const char *theme_id)
{
    char round_trip[64];

    if (!s || !s->transport || !theme_id || !*theme_id) return 0;
    if (!s->carrier) return 0;

    if (s->write) {
        if (s->write(s->context, AE_FIELD_THEME, theme_id) < 0) {
            s->carrier = 0;
            return 0;
        }
    } else {
        return 0;               /* a transport that cannot write */
    }

    /* Read it back rather than trusting the write: the board RESOLVES what
       it was given (an id it does not have becomes classic), so what came
       back is the only honest answer to "what is the theme now". */
    if (ae_user_theme(s, round_trip, (int) sizeof(round_trip)) <= 0) return 0;
    return 1;
}
