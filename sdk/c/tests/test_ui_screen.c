/*
 * What a C door's screen does to the terminal it borrowed.
 *
 * A door paints every cell it wants; the terminal's own cursor is left
 * wherever the last write put it, which is somewhere in the middle of the
 * art. The sysop, 2026-09-15, inside ACHIEVEC: "the cursor should be
 * disabled inside the door". It has to come back on when the door leaves -
 * the caller types at a prompt next.
 *
 * ui_screen_close had always restored it and nothing ever hid it, so the
 * pair was half written and every C door - THEMEC, ACHIEVEC, REQUESTS, SUBS,
 * TEXTTV - ran with a live cursor on the caller's screen.
 *
 * ui_screen talks to the door runtime (ae_put, ae_carrier, the screen size),
 * so this file provides those four symbols itself and reads what the screen
 * actually handed the board.
 */

#include "../include/ui_screen.h"
#include "../include/ui_ansi.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

/* ------------------------------------------------- the runtime, stubbed */

static char wire[8192];
static unsigned long wire_len;
static int carrier = 1;

void ae_put(const char *text, int newline)
{
    unsigned long n;

    (void)newline;
    if (text == 0) return;
    n = (unsigned long)strlen(text);
    if (wire_len + n >= sizeof wire) return;
    memcpy(wire + wire_len, text, n);
    wire_len += n;
    wire[wire_len] = '\0';
}

/* The session pointer is never dereferenced here: ui_screen only passes it
   back to these four. It must be non-NULL, because to_session refuses to
   write for a door that has no session at all. */
/* ui_screen_open_responsive asks AEW_SCREEN; this board is silent. */
int ae_field_exchange(int field, const char *request, char *out, int cap)
{
    (void)field; (void)request;
    if (out && cap > 0) out[0] = '\0';
    return 0;
}

int ae_carrier(const ae_session *s) { (void)s; return carrier; }
int ae_screen_cols(ae_session *s) { (void)s; return 80; }
int ae_screen_rows(ae_session *s) { (void)s; return 25; }

static void wire_clear(void) { wire_len = 0; wire[0] = '\0'; }

/* ------------------------------------------------------------------ cases */

static void the_first_frame_hides_the_cursor(void)
{
    ui_screen sc;
    char frame[2048];

    wire_clear();
    assert(ui_screen_open(&sc, (ae_session *)1, frame, (long)sizeof frame) == 0);
    ui_screen_flush(&sc);

    assert(strstr(wire, "\033[?25l") != 0);
    printf("  [OK] opening a screen hides the caller's cursor\n");
}

static void leaving_gives_it_back(void)
{
    ui_screen sc;
    char frame[2048];

    wire_clear();
    ui_screen_open(&sc, (ae_session *)1, frame, (long)sizeof frame);
    ui_screen_flush(&sc);
    wire_clear();
    ui_screen_close(&sc);

    assert(strstr(wire, "\033[?25h") != 0);
    printf("  [OK] closing it gives the cursor back to the board\n");
}

static void the_hide_is_in_the_first_frame_not_a_later_one(void)
{
    /* A door draws its first screen and then waits for a key. If the hide
       rode along with some later frame, the cursor would sit in the art for
       as long as the caller looked at it - which is the whole report. */
    ui_screen sc;
    char frame[2048];
    const char *hide;
    const char *first_text;

    wire_clear();
    ui_screen_open(&sc, (ae_session *)1, frame, (long)sizeof frame);
    ansi_text(&sc.buf, 1, 1, "ACHIEVEMENTS", 12);
    ui_screen_flush(&sc);

    hide = strstr(wire, "\033[?25l");
    first_text = strstr(wire, "ACHIEVEMENTS");
    assert(hide != 0 && first_text != 0);
    assert(hide < first_text);
    printf("  [OK] and hides it before it draws anything\n");
}

static void a_dropped_carrier_is_not_written_to(void)
{
    /* Nothing to do with the cursor, and the reason ui_screen checks at all:
       writing to a door whose caller has hung up blocks on a port nobody
       reads. Asserted here because this is the first test that can. */
    ui_screen sc;
    char frame[2048];

    carrier = 0;
    wire_clear();
    ui_screen_open(&sc, (ae_session *)1, frame, (long)sizeof frame);
    ansi_text(&sc.buf, 1, 1, "anybody there", 13);
    ui_screen_flush(&sc);
    carrier = 1;

    assert(wire_len == 0);
    printf("  [OK] a door whose caller hung up writes nothing\n");
}

int main(void)
{
    printf("a door's screen\n");
    the_first_frame_hides_the_cursor();
    leaving_gives_it_back();
    the_hide_is_in_the_first_frame_not_a_later_one();
    a_dropped_carrier_is_not_written_to();
    printf("a door's screen: all passed\n");
    return 0;
}
