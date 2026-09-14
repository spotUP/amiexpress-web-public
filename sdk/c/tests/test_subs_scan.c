/*
 * What a caller sees when they join a conference.
 *
 * This listing runs for EVERYBODY on EVERY join, before the menu prompt, with
 * the board's own screen half-drawn around it. So the two ways it can be wrong
 * are both loud: it can put a wall of text in front of somebody who joined a
 * conference to type one command, and it can hold them - which is what the
 * full door did, and what the sysop reported on 2026-09-14: "its not nice that
 * we are stuck inside a door when joining a conf".
 *
 * The holding is a structural fact (this function returns lines; it has no key
 * loop and nothing to wait on). The wall is what these assert: new messages
 * only, capped, counted honestly when it overflows, and ONE line for a caller
 * who is caught up.
 */

#include "../examples/subs/subs_scan.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static char out[SUBS_SCAN_LINES][SUBS_SCAN_LINE];

/**
 * A caller with no theme. Most cases are about WHAT the listing says, and
 * plain text is what it says without one - the colour has its own describe
 * block at the bottom.
 */
static const subs_scan_palette PLAIN = { 0, 0, 0, 0 };

/** A themed caller: four colours nothing else in this file uses. */
static const subs_scan_palette THEMED = { 0x66CCFF, 0xE8E8E8, 0x707070, 0xFFCC33 };

/** The printable text of a line, with every SGR run taken out. */
static void plain_text(const char *line, char *dst, int cap)
{
    int i = 0, n = 0;
    while (line[i] != '\0' && n < cap - 1) {
        if (line[i] == '\033') {
            while (line[i] != '\0' && line[i] != 'm') i++;
            if (line[i] == 'm') i++;
            continue;
        }
        dst[n++] = line[i++];
    }
    dst[n] = '\0';
}

/** A window of `n` messages, numbered from `first`, all new unless told. */
static void window_of(ae_msg_row *rows, int n, long first, char flag)
{
    int i;
    for (i = 0; i < n; i++) {
        memset(&rows[i], 0, sizeof rows[i]);
        rows[i].number = first + i;
        strcpy(rows[i].from, "Mahoney");
        sprintf(rows[i].subject, "topic %d", i + 1);
        rows[i].status = AE_MSG_PUBLIC;
        rows[i].flag = flag;
    }
}

static ae_msg_stat stat_of(long total, long unread)
{
    ae_msg_stat s;
    memset(&s, 0, sizeof s);
    s.total = total;
    s.unread = unread;
    return s;
}

/** Does any line contain this text? */
static int mentions(int count, const char *needle)
{
    int i;
    for (i = 0; i < count; i++) if (strstr(out[i], needle) != 0) return 1;
    return 0;
}

static void a_caller_who_is_caught_up_gets_one_line(void)
{
    ae_msg_stat stat = stat_of(740, 0);
    ae_msg_row rows[SUBS_SCAN_ROWS];
    int count;

    window_of(rows, SUBS_SCAN_ROWS, 700, '-');
    count = subs_scan_compose(&stat, rows, SUBS_SCAN_ROWS, "Amiga Chat", 80,
                              &PLAIN, out, SUBS_SCAN_LINES);

    /*
     * ONE line, even though a full window of readable messages was handed in.
     * The sysop joins conferences all evening; a heading and "nothing new"
     * three times over is worse than the count.
     */
    assert(count == 1);
    assert(strstr(out[0], "740 messages") != 0);
    assert(strstr(out[0], "0 new") != 0);
    printf("  [OK] caught up: one line, no topics\n");
}

static void the_new_ones_are_listed_by_number_and_sender(void)
{
    ae_msg_stat stat = stat_of(740, 3);
    ae_msg_row rows[3];
    int count;

    window_of(rows, 3, 738, 'N');
    strcpy(rows[1].from, "Spot");
    strcpy(rows[1].subject, "Re: the 060 board");

    count = subs_scan_compose(&stat, rows, 3, "Amiga Chat", 80, &PLAIN, out, SUBS_SCAN_LINES);

    assert(mentions(count, "#738"));
    assert(mentions(count, "#739"));
    assert(mentions(count, "#740"));
    assert(mentions(count, "Spot"));
    assert(mentions(count, "Re: the 060 board"));
    assert(mentions(count, "Type SUBS to read them"));
    printf("  [OK] three new messages, three topics, and the way in\n");
}

static void a_message_already_read_is_not_in_the_list(void)
{
    /*
     * The rule lives HERE, not in the caller: a row is new when ae_msgbase
     * flagged it 'N' from this caller's own scan pointer. A window is the
     * newest few messages in the base, so it routinely contains messages the
     * caller has read.
     */
    ae_msg_stat stat = stat_of(740, 1);
    ae_msg_row rows[4];
    int count;

    window_of(rows, 4, 737, '-');
    rows[3].flag = 'N';
    strcpy(rows[3].subject, "the only new one");

    count = subs_scan_compose(&stat, rows, 4, "Amiga Chat", 80, &PLAIN, out, SUBS_SCAN_LINES);

    assert(mentions(count, "the only new one"));
    assert(!mentions(count, "#737"));
    assert(!mentions(count, "#738"));
    assert(!mentions(count, "#739"));
    printf("  [OK] read messages stay out of it\n");
}

static void a_month_away_does_not_print_a_month(void)
{
    /*
     * THE WALL THIS EXISTS TO PREVENT. 400 unread, a window of 15: fifteen
     * rows and an honest count of the rest. The `+N` comes from the STAT, not
     * from the window - telling a caller about the fifteen he can see while
     * pretending the other 385 do not exist is how somebody stops trusting a
     * board's numbers.
     */
    ae_msg_stat stat = stat_of(740, 400);
    ae_msg_row rows[SUBS_SCAN_ROWS];
    int count, topics = 0, i;

    window_of(rows, SUBS_SCAN_ROWS, 726, 'N');
    count = subs_scan_compose(&stat, rows, SUBS_SCAN_ROWS, "Amiga Chat", 80,
                              &PLAIN, out, SUBS_SCAN_LINES);

    for (i = 0; i < count; i++) if (out[i][0] == ' ' && out[i][2] == '#') topics++;
    assert(topics == SUBS_SCAN_ROWS);
    assert(mentions(count, "+385 more"));
    assert(count <= SUBS_SCAN_LINES);
    printf("  [OK] 400 unread: 15 topics and \"+385 more\"\n");
}

static void an_empty_conference_says_nothing_at_all(void)
{
    /* A bulletin that says "0" at every join is worse than one that says
       nothing, and the door's caller prints exactly what it is given. */
    ae_msg_stat stat = stat_of(0, 0);
    int count = subs_scan_compose(&stat, 0, 0, "Amiga Chat", 80, &PLAIN, out, SUBS_SCAN_LINES);

    assert(count == 1);
    assert(strstr(out[0], "0 messages") != 0);
    printf("  [OK] an empty base still only costs the count line\n");
}

static void forty_columns_drops_the_sender_and_clips(void)
{
    ae_msg_stat stat = stat_of(740, 1);
    ae_msg_row rows[1];
    int count, i;

    window_of(rows, 1, 740, 'N');
    strcpy(rows[0].from, "Mahoney");
    /* The LONGEST a subject can be: the header record gives it 32 bytes and
       ae_msgbase NUL-terminates, so 31 characters is the real worst case and
       inventing a longer one would test a string the board cannot store. */
    memset(rows[0].subject, 'x', AE_MSG_SUBJECT_MAX - 1);
    rows[0].subject[AE_MSG_SUBJECT_MAX - 1] = '\0';

    count = subs_scan_compose(&stat, rows, 1, "Amiga Chat", 40, &PLAIN, out, SUBS_SCAN_LINES);

    /* Every line fits, because a wrapped row mid-join reads as a broken
       screen rather than as a long subject. */
    for (i = 0; i < count; i++) {
        assert((int)strlen(out[i]) <= 40);
    }
    assert(!mentions(count, "Mahoney"));
    assert(mentions(count, "#740"));
    assert(mentions(count, "xxxx"));            /* the subject IS there, clipped */
    printf("  [OK] forty columns: no sender, nothing wraps\n");
}

static void eighty_columns_fit_too(void)
{
    ae_msg_stat stat = stat_of(740, SUBS_SCAN_ROWS);
    ae_msg_row rows[SUBS_SCAN_ROWS];
    int count, i;

    window_of(rows, SUBS_SCAN_ROWS, 726, 'N');
    for (i = 0; i < SUBS_SCAN_ROWS; i++) {
        /* Both fields at their on-disk maximum, which is what a real record
           can hand this function and no more. */
        memset(rows[i].from, 'W', AE_MSG_NAME_MAX - 1);
        rows[i].from[AE_MSG_NAME_MAX - 1] = '\0';
        memset(rows[i].subject, 'x', AE_MSG_SUBJECT_MAX - 1);
        rows[i].subject[AE_MSG_SUBJECT_MAX - 1] = '\0';
    }

    count = subs_scan_compose(&stat, rows, SUBS_SCAN_ROWS, "Amiga Chat", 80,
                              &PLAIN, out, SUBS_SCAN_LINES);
    for (i = 0; i < count; i++) {
        assert((int)strlen(out[i]) <= 80);
    }
    assert(!mentions(count, "WWWWWWWWWWWWWWWWW"));   /* 17 W: the sender is clipped to 14 */
    printf("  [OK] eighty columns: long names and subjects are clipped, not wrapped\n");
}

static void it_never_writes_past_the_caller_s_array(void)
{
    /* A door hands in a fixed array. The composer must respect its size even
       when the traffic would fill more. */
    ae_msg_stat stat = stat_of(740, 400);
    ae_msg_row rows[SUBS_SCAN_ROWS];
    char small[3][SUBS_SCAN_LINE];
    int count;

    window_of(rows, SUBS_SCAN_ROWS, 726, 'N');
    memset(small, 0x7f, sizeof small);
    count = subs_scan_compose(&stat, rows, SUBS_SCAN_ROWS, "Amiga Chat", 80, &PLAIN, small, 3);

    assert(count == 3);
    printf("  [OK] the cap is a cap\n");
}


static void a_themed_caller_reads_it_in_his_own_colours(void)
{
    /*
     * THE LISTING IS THE ONE SCREEN NOBODY OPTS INTO - it runs at every join -
     * and it was plain text while every other door on this board draws in the
     * caller's theme ("the topic list i just plain text it should be styled as
     * our cool sdk", sysop 2026-09-14).
     *
     * Truecolour, like the rest of the C doors: the nearest-of-sixteen was the
     * right hue and the wrong shade on a web terminal.
     */
    ae_msg_stat stat = stat_of(740, 2);
    ae_msg_row rows[2];
    char text[SUBS_SCAN_LINE];
    int count;

    window_of(rows, 2, 739, 'N');
    count = subs_scan_compose(&stat, rows, 2, "Amiga Chat", 80, &THEMED,
                              out, SUBS_SCAN_LINES);

    assert(count > 2);
    assert(mentions(count, "\033[38;2;102;204;255m"));   /* accent: the number */
    assert(mentions(count, "\033[38;2;255;204;51m"));    /* warn: how many are new */
    assert(mentions(count, "\033[38;2;112;112;112m"));   /* dim: the rule, the subject */

    /* And the TEXT is the same text: colour is not content. */
    plain_text(out[0], text, (int) sizeof text);
    assert(strstr(text, "Amiga Chat") != 0);
    assert(strstr(text, "740 messages") != 0);
    printf("  [OK] a themed caller gets his own colours\n");
}

static void every_coloured_line_closes_its_pen(void)
{
    /*
     * This prints into a screen the DOOR DOES NOT OWN: the join is mid-flight
     * around it. A pen left in force would recolour whatever the board writes
     * next - the "Joining conference" line, the menu, the prompt.
     */
    ae_msg_stat stat = stat_of(740, 3);
    ae_msg_row rows[3];
    int count, i;

    window_of(rows, 3, 738, 'N');
    count = subs_scan_compose(&stat, rows, 3, "Amiga Chat", 80, &THEMED,
                              out, SUBS_SCAN_LINES);

    for (i = 0; i < count; i++) {
        if (strstr(out[i], "\033[") == 0) continue;      /* no colour, nothing to close */
        assert(strstr(out[i], "\033[0m") != 0);
    }
    printf("  [OK] every coloured line ends in a reset\n");
}

static void an_unthemed_caller_gets_no_escapes_at_all(void)
{
    /*
     * A board that will not say which theme he wears, or a caller on
     * something that cannot colour: the listing is plain text, not a screen
     * of escapes. Zero means NO pen rather than black, which on this board's
     * ground would be invisible.
     */
    ae_msg_stat stat = stat_of(740, 2);
    ae_msg_row rows[2];
    int count, i;

    window_of(rows, 2, 739, 'N');
    count = subs_scan_compose(&stat, rows, 2, "Amiga Chat", 80, &PLAIN,
                              out, SUBS_SCAN_LINES);

    for (i = 0; i < count; i++) assert(strstr(out[i], "\033") == 0);
    printf("  [OK] no theme, no escapes\n");
}

static void colour_does_not_cost_the_caller_a_second_message(void)
{
    /*
     * RULES.md: ~198 bytes is one XIM message on 68K. A themed row carries
     * four truecolour introducers and a reset on top of its eighty columns,
     * and a row that crossed the boundary would arrive in two pieces a fifth
     * of a second apart - which is what made the editor tear.
     */
    ae_msg_stat stat = stat_of(740, SUBS_SCAN_ROWS);
    ae_msg_row rows[SUBS_SCAN_ROWS];
    int count, i;

    window_of(rows, SUBS_SCAN_ROWS, 726, 'N');
    for (i = 0; i < SUBS_SCAN_ROWS; i++) {
        memset(rows[i].from, 'W', AE_MSG_NAME_MAX - 1);
        rows[i].from[AE_MSG_NAME_MAX - 1] = '\0';
        memset(rows[i].subject, 'x', AE_MSG_SUBJECT_MAX - 1);
        rows[i].subject[AE_MSG_SUBJECT_MAX - 1] = '\0';
    }
    count = subs_scan_compose(&stat, rows, SUBS_SCAN_ROWS, "Amiga Chat", 80, &THEMED,
                              out, SUBS_SCAN_LINES);

    for (i = 0; i < count; i++) assert((int) strlen(out[i]) <= 198);
    printf("  [OK] a themed row still fits one XIM message\n");
}

int main(void)
{
    printf("subs join listing\n");
    a_caller_who_is_caught_up_gets_one_line();
    the_new_ones_are_listed_by_number_and_sender();
    a_message_already_read_is_not_in_the_list();
    a_month_away_does_not_print_a_month();
    an_empty_conference_says_nothing_at_all();
    forty_columns_drops_the_sender_and_clips();
    eighty_columns_fit_too();
    it_never_writes_past_the_caller_s_array();
    a_themed_caller_reads_it_in_his_own_colours();
    every_coloured_line_closes_its_pen();
    an_unthemed_caller_gets_no_escapes_at_all();
    colour_does_not_cost_the_caller_a_second_message();
    printf("subs join listing: all passed\n");
    return 0;
}
