/* test_ae_board_screen.c - the client for AEW_SCREEN (10800), against a stand-in board. */
#include "../include/ae_board_screen.h"
#include "../include/ae_transport_native.h"
#include "../include/ae_session.h"
#include "../include/ui_key.h"
#include "../include/ui_screen.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static char last_request[256];
static int requests;
static int silent;
static int queued_mouse;   /* MOUSE? answers this many events, then "" */

static int answer(const char *text, char *out, int cap)
{
    int n = (int)strlen(text);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, text, (size_t)n);
    out[n] = '\0';
    return n;
}

static int stand_in(void *ctx, int field, const char *request, char *out, int cap)
{
    (void)ctx; (void)field;
    out[0] = '\0';
    strncpy(last_request, request, sizeof(last_request) - 1);
    requests++;
    if (silent) return 0;
    if (strcmp(request, "SIZE") == 0) return answer("132\t40", out, cap);
    if (strncmp(request, "WIPE IN ", 8) == 0 || strncmp(request, "WIPE OUT ", 9) == 0) return answer("OK", out, cap);
    if (strcmp(request, "WIPE END") == 0) return answer("OK", out, cap);
    if (strcmp(request, "MOUSE ON") == 0) return answer("OK", out, cap);
    if (strcmp(request, "MOUSE?") == 0) {
        if (queued_mouse > 0) { queued_mouse--; return answer("M\t12\t7", out, cap); }
        return 0;
    }
    return 0;
}

/* The session transport: BB_SCRWIDTH is 80 for every ANSI caller. */
static int session_transport(void *ctx, ae_field field, char *out, int cap)
{
    (void)ctx;
    if (field == AE_FIELD_SCREEN_COLS) return answer("80", out, cap);
    if (field == AE_FIELD_SCREEN_ROWS) return answer("25", out, cap);
    return 0;
}

static void a_listening_board_answers_the_real_size(void)
{
    int c = 0, r = 0;
    silent = 0;
    assert(ae_bs_size(&c, &r) == 1 && c == 132 && r == 40);
    printf("  [OK] a listening board answers the real size\n");
}

static void a_silent_board_leaves_the_outputs_alone(void)
{
    int c = 7, r = 9;
    silent = 1;
    assert(ae_bs_size(&c, &r) == 0 && c == 7 && r == 9);
    silent = 0;
    printf("  [OK] a silent board leaves the outputs alone\n");
}

static void the_size_parser_is_strict(void)
{
    int c = 1, r = 1;
    assert(ae_bs_parse_size("x\t40", &c, &r) == 0);
    assert(ae_bs_parse_size("90\t", &c, &r) == 0);
    assert(ae_bs_parse_size("90\t30x", &c, &r) == 0);
    assert(ae_bs_parse_size("0\t30", &c, &r) == 0);
    assert(ae_bs_parse_size("90", &c, &r) == 0);
    assert(c == 1 && r == 1);
    assert(ae_bs_parse_size("90\t30", &c, &r) == 1 && c == 90 && r == 30);
    printf("  [OK] the size parser is strict\n");
}

static void a_wipe_sends_exactly_the_verb_and_a_missing_one_sends_nothing(void)
{
    silent = 0; requests = 0;
    assert(ae_bs_wipe_begin('H', 0) == 1 && strcmp(last_request, "WIPE IN H") == 0);
    assert(ae_bs_wipe_begin('V', 1) == 1 && strcmp(last_request, "WIPE OUT V") == 0);
    assert(ae_bs_wipe_end() == 1 && strcmp(last_request, "WIPE END") == 0);
    requests = 0;
    assert(ae_bs_wipe_begin(0, 0) == 0 && requests == 0);
    silent = 1;
    assert(ae_bs_wipe_begin('H', 0) == 0);
    assert(ae_bs_wipe_end() == 0);
    silent = 0;
    printf("  [OK] a wipe sends exactly its verb; no letter sends nothing\n");
}

static void the_mouse_is_switched_on_and_events_come_one_by_one(void)
{
    ae_mouse_event ev;
    silent = 0; queued_mouse = 1;
    assert(ae_bs_mouse(1) == 1 && strcmp(last_request, "MOUSE ON") == 0);
    assert(ae_bs_mouse_next(&ev) == 1 && ev.kind == 'M' && ev.col == 12 && ev.row == 7);
    assert(ae_bs_mouse_next(&ev) == 0);
    silent = 1;
    assert(ae_bs_mouse(1) == 0);
    silent = 0;
    printf("  [OK] the mouse switches on and events come one by one\n");
}

static void the_mouse_parser_is_strict(void)
{
    ae_mouse_event ev;
    memset(&ev, 0, sizeof ev);
    assert(ae_bs_parse_mouse("Q\t1\t1", &ev) == 0);       /* unknown kind */
    assert(ae_bs_parse_mouse("P\t0\t5", &ev) == 0);       /* not 1-based */
    assert(ae_bs_parse_mouse("P\t5", &ev) == 0);
    assert(ev.kind == 0);
    assert(ae_bs_parse_mouse("U\t3\t4", &ev) == 1 && ev.kind == 'U' && ev.col == 3 && ev.row == 4);
    printf("  [OK] the mouse parser is strict\n");
}

/* (A) The wake byte re-arms only after the board's queue drains, so one MOUSE? per wake strands the rest. */
static void a_wake_is_answered_by_asking_until_the_board_says_empty(void)
{
    ae_mouse_event evs[4];
    silent = 0; queued_mouse = 3; requests = 0;
    assert(ae_bs_mouse_drain(evs, 4) == 3);
    assert(queued_mouse == 0);                             /* the queue is empty on the board */
    assert(requests == 4);                                 /* three events and the empty answer */
    assert(evs[0].kind == 'M' && evs[2].col == 12);
    requests = 0;
    assert(ae_bs_mouse_drain(evs, 4) == 0 && requests == 1);
    printf("  [OK] a wake is answered by asking until the board says empty\n");
}

static void a_drain_with_a_small_buffer_still_empties_the_board(void)
{
    ae_mouse_event evs[2];
    silent = 0; queued_mouse = 5;
    assert(ae_bs_mouse_drain(evs, 2) == 2);
    assert(queued_mouse == 0);                             /* nothing left to strand the next wake */
    printf("  [OK] a small buffer still empties the board\n");
}

/* ---- ui_key ---------------------------------------------------------- */

static const char *feed;
static int feed_pos;
static int src_next(void *c) { (void)c; return feed[feed_pos] ? (unsigned char)feed[feed_pos++] : -1; }
static int src_pending(void *c) { (void)c; return feed[feed_pos] != 0; }

static int key_from(const char *bytes, int skip)
{
    ui_key_source src;
    int pushback = -1, k = 0, i;
    feed = bytes; feed_pos = 0;
    src.next = src_next; src.pending = src_pending; src.settle = 0; src.idle = 0; src.flush = 0; src.ctx = 0;
    for (i = 0; i <= skip; i++) k = ui_key_read(&src, &pushback);
    return k;
}

static void the_wake_byte_is_a_mouse_key_and_ordinary_keys_are_themselves(void)
{
    assert(key_from("\x1e", 0) == UI_KEY_MOUSE);
    assert(key_from("a", 0) == 'a');
    printf("  [OK] 0x1E is UI_KEY_MOUSE; 'a' is 'a'\n");
}

/* (A) A report split after ESC [ : the board only holds one that starts ESC [ <. */
static void the_tail_of_a_split_mouse_report_never_reaches_the_door_as_keys(void)
{
    assert(key_from("\x1b[<35;10;5Mx", 0) == 0);           /* the report is swallowed whole */
    assert(key_from("\x1b[<35;10;5Mx", 1) == 'x');         /* and the next key is intact */
    assert(key_from("\x1b[<0;1;1mq", 1) == 'q');           /* release form */
    assert(key_from("\x1b[<3x", 1) == 'x');                /* a malformed tail hands the byte back */
    assert(key_from("\x1b[A", 0) == UI_KEY_UP);            /* real arrows still work */
    printf("  [OK] the tail of a split mouse report never reaches the door as keys\n");
}

/* ---- ui_screen_open_responsive --------------------------------------- */

static void a_responsive_screen_takes_the_real_size_and_the_wide_tier(void)
{
    static char frame[8192], storage[AE_SESSION_MIN_STORAGE];
    ae_session s;
    ui_screen sc;
    ui_screen plain;
    silent = 0;
    assert(ae_open(&s, session_transport, 0, storage, (long)sizeof storage, 1) == 0);
    assert(ui_screen_open_responsive(&sc, &s, frame, (long)sizeof frame) == 0);
    assert(sc.cols == 132 && sc.rows == 40);
    assert(sc.profile.cell_backgrounds == ui_profile_for(132).cell_backgrounds && sc.profile.borders);
    ui_screen_measure(&sc);                                /* measuring again keeps the real size */
    assert(sc.cols == 132 && sc.rows == 40);

    silent = 1;
    assert(ui_screen_open_responsive(&sc, &s, frame, (long)sizeof frame) == 0);
    assert(ui_screen_open(&plain, &s, frame, (long)sizeof frame) == 0);
    assert(sc.cols == plain.cols && sc.rows == plain.rows && sc.cols == 80);
    assert(sc.profile.borders == plain.profile.borders && sc.profile.gap == plain.profile.gap);
    silent = 0;
    printf("  [OK] a responsive screen takes the real size; a silent board changes nothing\n");
}

int main(void)
{
    ae_native_set_exchange(stand_in, 0);
    a_listening_board_answers_the_real_size();
    a_silent_board_leaves_the_outputs_alone();
    the_size_parser_is_strict();
    a_wipe_sends_exactly_the_verb_and_a_missing_one_sends_nothing();
    the_mouse_is_switched_on_and_events_come_one_by_one();
    the_mouse_parser_is_strict();
    a_wake_is_answered_by_asking_until_the_board_says_empty();
    a_drain_with_a_small_buffer_still_empties_the_board();
    the_wake_byte_is_a_mouse_key_and_ordinary_keys_are_themselves();
    the_tail_of_a_split_mouse_report_never_reaches_the_door_as_keys();
    a_responsive_screen_takes_the_real_size_and_the_wide_tier();
    puts("test_ae_board_screen: OK");
    return 0;
}
