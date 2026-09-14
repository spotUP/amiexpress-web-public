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
#include <stdlib.h>   /* atoi */
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
    /* Where the conference and its messages are, and how far this caller has
     * got through them. A board that leaves any of these NULL is a board that
     * does not answer that command - which is exactly what a classic
     * AmiExpress does for some of them, and the case worth testing. */
    const char *conf_name;
    const char *conf_location;
    const char *msgbase;
    const char *last_read;
    const char *last_scanned;
    /** Every round trip fails from this one onward. */
    int fail_after;
    int asked;
    /** What the door last wrote, and what the board resolved it to. */
    char theme[32];
    int writes;
    int can_write;
    /*
     * Does this board implement AE_FIELD_SETPOINTER?
     *
     * 0 models a real AmiExpress: the write is TAKEN (an unknown command is
     * not an error there) and nothing moves. That is the case the degradation
     * contract exists for, and the only way to prove a door survives it.
     */
    int knows_setpointer;
    /** Mutable pointer storage, so a board that knows the command can move. */
    char read_buf[16];
    char scan_buf[16];
    /** What a conference handing over its message base says it wants (600/601). */
    const char *msgbase_func;
    const char *msgbase_conf;
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
        case AE_FIELD_CONF_NAME:     value = b->conf_name; break;
        case AE_FIELD_CONF_LOCATION: value = b->conf_location; break;
        case AE_FIELD_MSGBASE_LOC:   value = b->msgbase; break;
        case AE_FIELD_LAST_READ:     value = b->last_read; break;
        case AE_FIELD_LAST_SCANNED:  value = b->last_scanned; break;
        case AE_FIELD_MSGBASE_FUNC:  value = b->msgbase_func; break;
        case AE_FIELD_MSGBASE_CONF:  value = b->msgbase_conf; break;
        case AE_FIELD_THEME:         value = b->can_write ? b->theme : 0; break;
        default: value = 0; break;
    }

    if (!value) { if (cap > 0) out[0] = '\0'; return 0; }
    strncpy(out, value, (size_t)cap - 1);
    out[cap - 1] = '\0';
    return (int)strlen(out);
}

/** The board taking a write, resolving an id it does not have to classic. */
static int fake_write(void *context, ae_field field, const char *value)
{
    fake_board *b = (fake_board *)context;

    if (!b->can_write) return -1;

    if (field == AE_FIELD_SETPOINTER) {
        int asked;
        b->writes += 1;
        /* A board that never heard of it still ACCEPTS the write - that is
           what makes this worth testing rather than assuming. */
        if (!b->knows_setpointer) return 0;
        if (sscanf(value + 5, "%d", &asked) != 1) return 0;
        if (strncmp(value, "READ ", 5) == 0) {
            if (asked > atoi(b->read_buf)) sprintf(b->read_buf, "%d", asked);
        } else if (strncmp(value, "SCAN ", 5) == 0) {
            if (asked > atoi(b->scan_buf)) sprintf(b->scan_buf, "%d", asked);
        }
        return 0;
    }

    if (field != AE_FIELD_THEME) return -1;

    b->writes += 1;
    if (strcmp(value, "uprough-neon") == 0 || strcmp(value, "classic") == 0) {
        strcpy(b->theme, value);
    } else {
        strcpy(b->theme, "classic");   /* what the board does with an unknown id */
    }
    return 0;
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
    b.conf_name = "Coding";
    b.conf_location = "BBS:Conf7/";
    b.msgbase = "BBS:Conf7/MsgBase/";
    b.last_read = "141";
    b.last_scanned = "138";
    b.can_write = 1;
    strcpy(b.theme, "classic");
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

static void a_door_can_read_and_change_the_theme(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char theme[32];
    fake_board b = a_board();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    ae_set_writer(&s, fake_write);

    assert(ae_user_theme(&s, theme, (int)sizeof(theme)) > 0);
    assert(strcmp(theme, "classic") == 0);

    assert(ae_set_user_theme(&s, "uprough-neon") == 1);
    assert(b.writes == 1);
    assert(ae_user_theme(&s, theme, (int)sizeof(theme)) > 0);
    assert(strcmp(theme, "uprough-neon") == 0);

    /* The board RESOLVES what it is given, so a door must read back rather
       than assume: an id this board does not have becomes classic. */
    assert(ae_set_user_theme(&s, "no-such-theme") == 1);
    assert(ae_user_theme(&s, theme, (int)sizeof(theme)) > 0);
    assert(strcmp(theme, "classic") == 0);
    printf("  [OK] a door can read the theme, and change it\n");
}

static void a_board_without_themes_says_so_rather_than_pretending(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char theme[32];
    fake_board b = a_board();

    b.can_write = 0;                    /* a classic AmiExpress */
    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);

    /* No writer at all: the door is told 0, not lied to. */
    assert(ae_set_user_theme(&s, "uprough-neon") == 0);
    /* And the read answers "" rather than "classic", which would look like
       a caller's choice. */
    assert(ae_user_theme(&s, theme, (int)sizeof(theme)) == 0);
    assert(theme[0] == '\0');
    printf("  [OK] a board without themes says so rather than pretending\n");
}

static void it_says_where_the_messages_are(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char conf[64];
    char base[64];
    fake_board b = a_board();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_conf_name(&s, conf, (int)sizeof(conf)) > 0);
    assert(strcmp(conf, "Coding") == 0);
    assert(ae_conf_location(&s, conf, (int)sizeof(conf)) > 0);
    assert(strcmp(conf, "BBS:Conf7/") == 0);
    assert(ae_msgbase_path(&s, base, (int)sizeof(base)) > 0);
    assert(strcmp(base, "BBS:Conf7/MsgBase/") == 0);
    printf("  [OK] it says where the conference and its messages are\n");
}

static void it_reads_the_callers_pointers(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_last_read(&s) == 141);
    assert(ae_last_scanned(&s) == 138);
    printf("  [OK] it reads the caller's read and scan pointers\n");
}

static void a_pointer_of_zero_is_not_a_board_that_cannot_answer(void)
{
    /* The distinction this exists for: a caller who has read nothing here
     * genuinely has pointer 0. If "0" and "the board did not say" were the
     * same answer, a door could not tell a first-time visitor from a board
     * that does not implement the command - and would mark every message in
     * the conference new for somebody who has read them all. */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board();

    b.last_read = "0";
    b.last_scanned = 0;            /* this board does not answer at all */

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_last_read(&s) == 0);
    assert(ae_last_scanned(&s) == -1);
    printf("  [OK] a pointer of zero is not a board that cannot answer\n");
}

static void a_classic_board_leaves_the_paths_empty(void)
{
    /* A real AmiExpress answers BB_CONFLOCAL, and an old enough one may not
     * answer 604. Either way the door must get "" and say so, rather than
     * being handed whatever the previous round trip left in the buffer and
     * opening a file named after it. */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    char base[64];
    fake_board b = a_board();

    b.msgbase = 0;
    strcpy(base, "left over from the last question");

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_msgbase_path(&s, base, (int)sizeof(base)) == 0);
    assert(base[0] == '\0');
    printf("  [OK] a board that will not say leaves the path empty\n");
}

/** A board that implements the command, with the caller's pointers mutable. */
static fake_board a_board_that_marks_read(void)
{
    fake_board b = a_board();
    b.knows_setpointer = 1;
    strcpy(b.read_buf, "141");
    strcpy(b.scan_buf, "138");
    b.last_read = b.read_buf;
    b.last_scanned = b.scan_buf;
    return b;
}

static void a_door_can_mark_the_mail_read(void)
{
    /* The whole reason AE_FIELD_SETPOINTER exists: SUBS reads the message
     * base itself, so without this nothing ever advances the pointer and
     * every message stays new for ever. */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board_that_marks_read();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    ae_set_writer(&s, fake_write);

    assert(ae_set_last_read(&s, 200) == 1);
    assert(ae_last_read(&s) == 200);
    assert(ae_last_scanned(&s) == 138);      /* the other one is untouched */

    assert(ae_set_last_scanned(&s, 190) == 1);
    assert(ae_last_scanned(&s) == 190);
    printf("  [OK] a door can move each pointer, and only that one\n");
}

static void a_pointer_never_goes_backwards(void)
{
    /* express.e:12370 is IF(msgNum>lastMsgReadConf) THEN ..., never a plain
     * assignment. A door walking the list backwards must not un-read
     * everything after it. Asking for less is not an error - the state asked
     * for is already true - so it answers 1 and moves nothing. */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board_that_marks_read();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    ae_set_writer(&s, fake_write);

    assert(ae_set_last_read(&s, 5) == 1);
    assert(ae_last_read(&s) == 141);
    printf("  [OK] a pointer never goes backwards\n");
}

static void a_board_that_cannot_mark_read_does_not_break_the_door(void)
{
    /*
     * THE DEGRADATION CONTRACT, and the reason the read-back exists.
     *
     * A real AmiExpress has no such command. It does not fail the write - an
     * unknown command is simply not acted on - so ae_write_fn reports success
     * and the pointer has not moved. Only asking afterwards tells the two
     * apart. The door must get a plain 0 and carry on.
     */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board_that_marks_read();

    b.knows_setpointer = 0;                  /* a classic AmiExpress */

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    ae_set_writer(&s, fake_write);

    assert(ae_set_last_read(&s, 200) == 0);
    assert(ae_last_read(&s) == 141);         /* exactly where it was */
    assert(ae_carrier(&s) == 1);             /* and the door is still up */
    printf("  [OK] a board without the command leaves the door running\n");
}

static void marking_read_needs_a_writer(void)
{
    /* A read-only transport is a valid one (ae_session.h:141), and every
     * door built on one must still run. */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board_that_marks_read();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    /* deliberately no ae_set_writer */

    assert(ae_set_last_read(&s, 200) == 0);
    assert(b.writes == 0);
    printf("  [OK] no writer is answered, not crashed\n");
}

static void marking_read_refuses_nonsense_without_asking_the_board(void)
{
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board_that_marks_read();

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    ae_set_writer(&s, fake_write);

    assert(ae_set_last_read(&s, -1) == 0);
    assert(ae_set_last_read(0, 5) == 0);     /* no session at all */
    assert(b.writes == 0);
    printf("  [OK] a negative pointer never reaches the board\n");
}

static void it_reads_why_a_message_base_launched_it(void)
{
    /*
     * express.e:3959-3962. A conference carrying the tooltype CUSTOM hands
     * every message command to one door and says which - MAIL_READ here - and
     * which conference, which during `MS` is NOT the one the caller is
     * standing in (:25260-25268).
     */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board();

    b.msgbase_func = "1";          /* MAIL_READ */
    b.msgbase_conf = "12";         /* ...of conference 12, not the caller's */

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_msgbase_function(&s) == 1);
    assert(ae_msgbase_conference(&s) == 12);
    printf("  [OK] it reads the message function and its conference\n");
}

static void a_door_nobody_handed_a_message_base_gets_zero(void)
{
    /*
     * THE DEFAULT THAT MATTERS. A board with no CUSTOM conference, a board
     * that has never heard of 600, and express.e between invocations
     * (:273-274) all answer the same thing, and a door must read all three as
     * "you were launched normally - draw yourself". Zero is that answer, which
     * is why these two do NOT use the -1 sentinel the read pointers need.
     */
    ae_session s;
    char storage[AE_SESSION_MIN_STORAGE];
    fake_board b = a_board();      /* says nothing about 600/601 at all */

    assert(ae_open(&s, fake_transport, &b, storage, (long)sizeof(storage), 1) == 0);
    assert(ae_msgbase_function(&s) == 0);
    assert(ae_msgbase_conference(&s) == 0);
    printf("  [OK] no custom invocation reads as zero, not as an error\n");
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
    a_door_can_read_and_change_the_theme();
    a_board_without_themes_says_so_rather_than_pretending();
    it_says_where_the_messages_are();
    it_reads_the_callers_pointers();
    a_pointer_of_zero_is_not_a_board_that_cannot_answer();
    it_reads_why_a_message_base_launched_it();
    a_door_nobody_handed_a_message_base_gets_zero();
    a_classic_board_leaves_the_paths_empty();
    a_door_can_mark_the_mail_read();
    a_pointer_never_goes_backwards();
    a_board_that_cannot_mark_read_does_not_break_the_door();
    marking_read_needs_a_writer();
    marking_read_refuses_nonsense_without_asking_the_board();
    printf("ae_session: all passed\n");
    return 0;
}
