/*
 * Who is calling, and on what screen.
 *
 * The transport is a table here, which is the point of it being a seam: the
 * accessors, the fallbacks and the carrier rule are the same code that runs
 * on the 68K, and none of it needs an emulator to test.
 */

#include "../include/ae_session.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

/** A board that answers from a table, and can be told to drop the line. */
typedef struct {
    const char *name;
    const char *location;
    const char *level;
    const char *time_left;
    const char *is_ansi;
    const char *cols;
    const char *rows;
    const char *conference;
    /** Every round trip fails from this one onward. */
    int fail_after;
    int asked;
} fake_board;

static int fake_transport(void *context, ae_field field, char *out, int cap)
{
    fake_board *b = (fake_board *)context;
    const char *value = 0;

    b->asked += 1;
    if (b->fail_after > 0 && b->asked > b->fail_after) return -1;

    switch (field) {
        case AE_FIELD_USER_NAME:     value = b->name; break;
        case AE_FIELD_USER_LOCATION: value = b->location; break;
        case AE_FIELD_USER_LEVEL:    value = b->level; break;
        case AE_FIELD_TIME_LEFT:     value = b->time_left; break;
        case AE_FIELD_IS_ANSI:       value = b->is_ansi; break;
        case AE_FIELD_SCREEN_COLS:   value = b->cols; break;
        case AE_FIELD_SCREEN_ROWS:   value = b->rows; break;
        case AE_FIELD_CONFERENCE:    value = b->conference; break;
        default: value = 0; break;
    }

    if (!value) { if (cap > 0) out[0] = '\0'; return 0; }
    strncpy(out, value, (size_t)cap - 1);
    out[cap - 1] = '\0';
    return (int)strlen(out);
}

static fake_board a_board(void)
{
    fake_board b;
    memset(&b, 0, sizeof(b));
    b.name = "sysop";
    b.location = "Stockholm";
    b.level = "255";
    b.time_left = "42";
    b.is_ansi = "1";
    b.cols = "132";
    b.rows = "50";
    b.conference = "7";
    return b;
}

static void a_session_needs_room_for_the_boards_reply(void)
{
    ae_session s;
    char small[16];
    char enough[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board();

    /* The AEDoor message is 264 bytes; a door that hands over less would
       have the board write past the end of it. */
    assert(ae_open(&s, fake_transport, &b, small, (long)sizeof(small), 1) == -1);
    assert(ae_open(&s, fake_transport, &b, enough, (long)sizeof(enough), 1) == 0);
    assert(ae_node(&s) == 1);
    assert(ae_carrier(&s));
    printf("  [OK] a session needs room for the board's reply\n");
}

static void it_answers_who_is_calling(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char name[32];
    char where[64];
    fake_board b = a_board();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 3) == 0);

    assert(ae_user_name(&s, name, (int)sizeof(name)) == 5);
    assert(strcmp(name, "sysop") == 0);
    assert(ae_user_location(&s, where, (int)sizeof(where)) > 0);
    assert(strcmp(where, "Stockholm") == 0);
    assert(ae_user_level(&s) == 255);
    assert(ae_user_time_left(&s) == 42);
    assert(ae_user_is_ansi(&s) == 1);
    printf("  [OK] it answers who is calling\n");
}

static void it_answers_how_much_room_they_have(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_screen_cols(&s) == 132);
    assert(ae_screen_rows(&s) == 50);
    assert(ae_conference(&s) == 7);
    printf("  [OK] it answers how much room they have\n");
}

static void a_board_that_says_nothing_gets_the_classic_answer(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char name[32];
    fake_board b;

    memset(&b, 0, sizeof(b));          /* every field empty */
    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);

    /* 80x25 is what a classic door assumed, and what a door must draw for
       when nobody says otherwise. */
    assert(ae_screen_cols(&s) == AE_DEFAULT_COLS);
    assert(ae_screen_rows(&s) == AE_DEFAULT_ROWS);
    /* Not ANSI: the safe direction, the same rule ae_host takes. */
    assert(ae_user_is_ansi(&s) == 0);
    /* -1, because 0 is a real access level and a door must tell them apart. */
    assert(ae_user_level(&s) == -1);
    /* And a name a door can print without checking. */
    assert(ae_user_name(&s, name, (int)sizeof(name)) == 0);
    assert(name[0] == '\0');
    printf("  [OK] a board that says nothing gets the classic answer\n");
}

static void an_absurd_width_is_not_believed(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board();

    b.cols = "0";                       /* a field the board never filled in */
    b.rows = "9999";
    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_screen_cols(&s) == AE_DEFAULT_COLS);
    assert(ae_screen_rows(&s) == AE_DEFAULT_ROWS);
    printf("  [OK] an absurd width is not believed\n");
}

static void a_dropped_carrier_stops_everything(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char name[32];
    fake_board b = a_board();

    b.fail_after = 1;                   /* the second round trip finds no line */
    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);

    assert(ae_user_name(&s, name, (int)sizeof(name)) == 5);
    assert(ae_carrier(&s));

    assert(ae_user_location(&s, name, (int)sizeof(name)) == -1);
    assert(!ae_carrier(&s));

    /* And it STAYS down: asking again must not produce an answer shaped like
       a real one from a board that is not there. */
    b.fail_after = 0;
    assert(ae_user_name(&s, name, (int)sizeof(name)) == -1);
    assert(ae_user_level(&s) == -1);
    assert(ae_screen_cols(&s) == AE_DEFAULT_COLS);
    printf("  [OK] a dropped carrier stops everything, and stays down\n");
}

static void a_closed_session_is_safe_to_use(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char name[32];
    fake_board b = a_board();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    ae_close(&s);

    assert(!ae_carrier(&s));
    assert(ae_user_name(&s, name, (int)sizeof(name)) == -1);
    assert(name[0] == '\0');
    ae_close(&s);                       /* twice is not a crash */
    printf("  [OK] a closed session is safe to use\n");
}

int main(void)
{
    printf("ae_session\n");
    a_session_needs_room_for_the_boards_reply();
    it_answers_who_is_calling();
    it_answers_how_much_room_they_have();
    a_board_that_says_nothing_gets_the_classic_answer();
    an_absurd_width_is_not_believed();
    a_dropped_carrier_stops_everything();
    a_closed_session_is_safe_to_use();
    printf("ae_session: all passed\n");
    return 0;
}
