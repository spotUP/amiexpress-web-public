/* test_ae_msgbase.c - reading a message base off the disk.
 *
 * THE FIXTURES ARE REAL BYTES. web/backend/tests/fixtures/msgheaders/ holds
 * two 3-record HeaderFiles that came off real boards - one written by
 * AmiExpress, one written by this port - and they are already tracked and
 * already used by the TypeScript classifier's own tests. This file builds its
 * message bases out of them at runtime rather than adding a third copy.
 *
 * That matters more than it sounds. A fixture invented by the same mind that
 * wrote the parser proves only that the two agree with each other: the parser
 * could read every field from the wrong offset and a matching fixture would
 * sail through. These records were written by machines that had never heard
 * of this code - junk in the pad bytes, undefined leftovers after each name's
 * NUL, and all.
 *
 * Concatenating them produces exactly the hard case the whole classifier
 * exists for: an AmiExpress run of 1,2,3 followed by port records whose real
 * numbers are also 1,2,3 but which read as 321,578,835 at the AmiExpress
 * offset. Per-record classification cannot settle those - both shapes match -
 * and the sequence pass must, by preferring the reading that continues the
 * run.
 *
 * No emulator, no BBS, no network. C89.
 */

#include <stdio.h>
#include <string.h>

#include "../include/ae_msgbase.h"
#include "../include/ae_dos.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-62s ", #name); fflush(stdout); test_##name(); } while (0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((long)(got) == (long)(expected)) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s (got %ld, expected %ld)\n", msg, (long)(got), (long)(expected)); } \
    tests_run++; \
} while (0)
#define ASSERT_STR(got, expected, msg) do { \
    if (strcmp((got), (expected)) == 0) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s (got \"%s\", expected \"%s\")\n", msg, (got), (expected)); } \
    tests_run++; \
} while (0)
#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s\n", msg); } \
    tests_run++; \
} while (0)

/* Relative to sdk/c, which is where `make test` runs these. */
#define AMIGA_FIXTURE "../../web/backend/tests/fixtures/msgheaders/amiga-written.HeaderFile"
#define PORT_FIXTURE  "../../web/backend/tests/fixtures/msgheaders/port-written.HeaderFile"

/* The base under test is built in the current directory. A door reads
 * "BBS:Conf3/MsgBase/"; here it is "./", and join_path handles both. */
#define BASE_DIR   "."
#define HEADERFILE "./HeaderFile"
#define MAILSTATS  "./MailStats"

static unsigned char amiga_records[3 * AE_MSG_RECORD_SIZE];
static unsigned char port_records[3 * AE_MSG_RECORD_SIZE];
static int fixtures_loaded;

static int load_fixtures(void)
{
    ae_file *f;

    f = ae_dos_open(AMIGA_FIXTURE, AE_DOS_READ);
    if (f == 0) return 0;
    if (ae_dos_read_full(f, amiga_records, sizeof amiga_records) != 1) { ae_dos_close(f); return 0; }
    ae_dos_close(f);

    f = ae_dos_open(PORT_FIXTURE, AE_DOS_READ);
    if (f == 0) return 0;
    if (ae_dos_read_full(f, port_records, sizeof port_records) != 1) { ae_dos_close(f); return 0; }
    ae_dos_close(f);

    fixtures_loaded = 1;
    return 1;
}

/** Write a HeaderFile out of whatever records the test wants. */
static int put_headers(const unsigned char *records, long bytes)
{
    ae_file *f = ae_dos_open(HEADERFILE, AE_DOS_WRITE);
    long put;
    if (f == 0) return 0;
    put = ae_dos_write(f, records, bytes);
    ae_dos_close(f);
    return put == bytes;
}

static void clear_base(void)
{
    ae_dos_delete(HEADERFILE);
    ae_dos_delete(MAILSTATS);
    ae_dos_delete("./1");
    ae_dos_delete("./2");
    ae_dos_delete("./3");
}

/** One record, hand-built, for the cases that are about REJECTION. */
static void synth(unsigned char *r, char status, long number,
                  const char *to, const char *from, const char *subject)
{
    memset(r, 0, AE_MSG_RECORD_SIZE);
    r[0] = (unsigned char)status;
    ae_dos_put_long(r + 2, number);
    strcpy((char *)r + 6, to);
    strcpy((char *)r + 37, from);
    strcpy((char *)r + 68, subject);
    ae_dos_put_long(r + 100, 1000000L);
    ae_dos_put_long(r + 104, 0);
}

/* ---- the layouts ------------------------------------------------------- */

TEST(eall_reads_as_the_readers_own_name_all)
{
    char out[64];
    ae_msg_to_label("eall", "spot", out, (int)sizeof out);
    ASSERT_STR(out, "spot (ALL)", "EALL is the reader, as express.e shows it");
    ae_msg_to_label("EALL", "Randy", out, (int)sizeof out);
    ASSERT_STR(out, "Randy (ALL)", "in any case");
    ae_msg_to_label("model", "spot", out, (int)sizeof out);
    ASSERT_STR(out, "model", "a person stays who they are");
    ae_msg_to_label("eall", "averyveryverylongcallername", out, 12);
    ASSERT_STR(out, "avery (ALL)", "the name gives way, the (ALL) stays, inside the buffer");
}

TEST(a_real_amiga_headerfile_reads)
{
    ae_msg_row rows[8];
    int n;

    put_headers(amiga_records, sizeof amiga_records);
    /* Those three records are all private ('R') and addressed to sandman and
     * Aquarius), so the caller has to be one of them to see anything. */
    ASSERT_EQ(ae_msg_open(BASE_DIR, "sandman", 0, -1), AE_MSG_OK, "open the base");
    n = ae_msg_list(0, rows, 8);
    ASSERT_EQ(n, 2, "sandman sees his own two, not Aquarius's");
    ASSERT_EQ(rows[0].number, 1, "first message number");
    ASSERT_STR(rows[0].from, "AquaPWFail v1.0", "sender read from the right offset");
    ASSERT_STR(rows[0].subject, "Password failure!", "subject read from the right offset");
}

TEST(a_real_port_written_headerfile_reads)
{
    ae_msg_row rows[8];
    int n;

    put_headers(port_records, sizeof port_records);
    ASSERT_EQ(ae_msg_open(BASE_DIR, "nobody", 0, -1), AE_MSG_OK, "open the base");
    n = ae_msg_list(0, rows, 8);
    ASSERT_EQ(n, 3, "all three are public");
    /* Read at the AmiExpress offset these would be 321, 578, 835 and the
     * names would be "ll" and "ester" - the tell that the layout was missed. */
    ASSERT_EQ(rows[0].number, 1, "port record numbered from its own offset");
    ASSERT_STR(rows[0].to, "All", "toName, not \"ll\"");
    ASSERT_STR(rows[0].from, "tester", "fromName, not \"ester\"");
    ASSERT_STR(rows[0].subject, "Test Subject", "subject, not \"est Subject\"");
}

TEST(one_file_holding_both_layouts_reads_both)
{
    /* THE CASE THE CLASSIFIER EXISTS FOR. Per-record classification cannot
     * settle the port records here - they have a plausible number at both
     * offsets - so the sequence pass has to, by preferring the reading that
     * continues 1,2,3. */
    unsigned char mixed[6 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[8];
    int n;

    memcpy(mixed, amiga_records, sizeof amiga_records);
    memcpy(mixed + sizeof amiga_records, port_records, sizeof port_records);
    put_headers(mixed, sizeof mixed);

    ASSERT_EQ(ae_msg_open(BASE_DIR, "sandman", 0, -1), AE_MSG_OK, "open the mixed base");
    n = ae_msg_list(0, rows, 8);
    ASSERT_EQ(n, 5, "two private of sandman's plus three public");

    /* The port records must NOT have been read as 321/578/835. */
    ASSERT_EQ(rows[2].number, 1, "the first port record keeps its own number");
    ASSERT_STR(rows[2].from, "tester", "and its own sender");
    ASSERT_EQ(rows[4].number, 3, "and the last one too");
}

TEST(a_record_with_no_number_anywhere_is_counted_not_guessed_at)
{
    unsigned char records[2 * AE_MSG_RECORD_SIZE];
    ae_msg_stat st;

    synth(records, AE_MSG_PUBLIC, 1, "EALL", "sysop", "real");
    memset(records + AE_MSG_RECORD_SIZE, 0, AE_MSG_RECORD_SIZE);  /* not a record */
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_stat_read(&st), AE_MSG_OK, "stat the base");
    ASSERT_EQ(st.total, 1, "only the real one is listed");
    ASSERT_EQ(st.unreadable, 1, "and the other is REPORTED, not silently dropped");
}

/* ---- what the caller may see ------------------------------------------- */

TEST(deleted_messages_are_never_shown_to_anyone)
{
    unsigned char records[2 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[4];

    synth(records, AE_MSG_DELETED, 1, "EALL", "sysop", "gone");
    synth(records + AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 2, "EALL", "sysop", "here");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "sysop", 1, -1);      /* even as a sysop */
    ASSERT_EQ(ae_msg_list(0, rows, 4), 1, "the deleted one is not listed");
    ASSERT_EQ(rows[0].number, 2, "and the survivor is the right one");
}

TEST(private_mail_is_for_its_two_people_only)
{
    unsigned char records[3 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[4];

    synth(records, AE_MSG_PRIVATE, 1, "spot", "sysop", "yours");
    synth(records + AE_MSG_RECORD_SIZE, AE_MSG_PRIVATE, 2, "dino", "sysop", "not yours");
    synth(records + 2 * AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 3, "EALL", "sysop", "everyone's");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "spot", 0, -1);
    ASSERT_EQ(ae_msg_list(0, rows, 4), 2, "his own private one, plus the public one");
    ASSERT_EQ(rows[0].number, 1, "the one addressed to him");
    ASSERT_EQ(rows[1].number, 3, "and the public one");

    ae_msg_open(BASE_DIR, "sysop", 0, -1);
    ASSERT_EQ(ae_msg_list(0, rows, 4), 3, "the SENDER sees both of his, even to dino");
}

TEST(a_sysop_sees_private_mail_and_an_ordinary_caller_does_not)
{
    unsigned char records[1 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[4];

    synth(records, AE_MSG_PRIVATE, 1, "dino", "spot", "between us");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "stranger", 0, -1);
    ASSERT_EQ(ae_msg_list(0, rows, 4), 0, "a stranger sees nothing");

    ae_msg_open(BASE_DIR, "stranger", 1, -1);
    ASSERT_EQ(ae_msg_list(0, rows, 4), 1, "a sysop sees it");
}

TEST(a_name_matches_whatever_case_it_was_typed_in)
{
    unsigned char records[1 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[4];

    synth(records, AE_MSG_PRIVATE, 1, "Spot", "sysop", "hello");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "spot", 0, -1);
    ASSERT_EQ(ae_msg_list(0, rows, 4), 1, "\"spot\" reads mail addressed to \"Spot\"");
}

TEST(censored_and_public_are_both_public)
{
    unsigned char records[2 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[4];

    synth(records, AE_MSG_CENSORED, 1, "EALL", "sysop", "censored");
    synth(records + AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 2, "ALL", "sysop", "plain");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_list(0, rows, 4), 2, "both are readable");
    ASSERT_EQ(rows[0].flag, '*', "the censored one is marked");
}

/* ---- what is new ------------------------------------------------------- */

TEST(new_is_measured_against_the_callers_scan_pointer)
{
    unsigned char records[3 * AE_MSG_RECORD_SIZE];
    ae_msg_stat st;

    synth(records, AE_MSG_PUBLIC, 1, "EALL", "sysop", "old");
    synth(records + AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 2, "EALL", "sysop", "old");
    synth(records + 2 * AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 3, "EALL", "sysop", "new");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, 2);
    ae_msg_stat_read(&st);
    ASSERT_EQ(st.total, 3, "three readable");
    ASSERT_EQ(st.unread, 1, "one of them above the pointer");
}

TEST(a_board_that_would_not_say_reports_nothing_new_rather_than_everything)
{
    /* ae_last_scanned answers -1 when the board will not say. Treating that
     * as 0 would mark every message in the conference new. */
    unsigned char records[2 * AE_MSG_RECORD_SIZE];
    ae_msg_stat st;

    synth(records, AE_MSG_PUBLIC, 1, "EALL", "sysop", "a");
    synth(records + AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 2, "EALL", "sysop", "b");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ae_msg_stat_read(&st);
    ASSERT_EQ(st.unread, 0, "nothing claimed new when the pointer is unknown");
}

/* ---- MailStats and the off-by-one that ate messages once ---------------- */

TEST(mailstats_high_is_the_next_number_not_the_highest)
{
    unsigned char records[2 * AE_MSG_RECORD_SIZE];
    unsigned char stats[18];
    ae_msg_stat st;
    ae_file *f;

    synth(records, AE_MSG_PUBLIC, 1, "EALL", "sysop", "a");
    synth(records + AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 2, "EALL", "sysop", "b");
    put_headers(records, sizeof records);

    memset(stats, 0, sizeof stats);
    ae_dos_put_long(stats + 0, 1);      /* lowestKey */
    ae_dos_put_long(stats + 4, 3);      /* highMsgNum: the NEXT one */
    ae_dos_put_long(stats + 8, 1);      /* lowestNotDel */
    f = ae_dos_open(MAILSTATS, AE_DOS_WRITE);
    ae_dos_write(f, stats, 18);
    ae_dos_close(f);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ae_msg_stat_read(&st);
    ASSERT_EQ(st.high, 3, "high is what the next message will take");
    ASSERT_EQ(st.lowest, 1, "lowest present");
}

TEST(a_base_with_no_mailstats_still_answers)
{
    /* A fresh conference has no MailStats at all, and a door that refused to
     * draw without one would show nothing on a board that works. */
    unsigned char records[1 * AE_MSG_RECORD_SIZE];
    ae_msg_stat st;

    synth(records, AE_MSG_PUBLIC, 7, "EALL", "sysop", "only");
    put_headers(records, sizeof records);
    ae_dos_delete(MAILSTATS);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_stat_read(&st), AE_MSG_OK, "stat without MailStats");
    ASSERT_EQ(st.high, 8, "derived from the headers, still the NEXT number");
}

/* ---- paging ------------------------------------------------------------ */

TEST(a_negative_first_asks_for_the_newest_window)
{
    unsigned char records[5 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[2];
    int i;

    for (i = 0; i < 5; i++) {
        synth(records + i * AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, i + 1, "EALL", "sysop", "x");
    }
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_list(-1, rows, 2), 2, "two rows for a window of two");
    ASSERT_EQ(rows[0].number, 4, "the newest window, still ascending");
    ASSERT_EQ(rows[1].number, 5, "and it ends at the newest");
}

TEST(a_window_larger_than_the_conference_is_the_whole_conference)
{
    unsigned char records[2 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[10];

    synth(records, AE_MSG_PUBLIC, 1, "EALL", "sysop", "a");
    synth(records + AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, 2, "EALL", "sysop", "b");
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_list(-1, rows, 10), 2, "asking for ten of two gives two");
    ASSERT_EQ(rows[0].number, 1, "starting at the first");
}

TEST(listing_from_a_number_starts_there)
{
    unsigned char records[4 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[10];
    int i;

    for (i = 0; i < 4; i++) {
        synth(records + i * AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, i + 1, "EALL", "sysop", "x");
    }
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_list(3, rows, 10), 2, "messages 3 and 4");
    ASSERT_EQ(rows[0].number, 3, "starting at 3");
}

TEST(a_listing_never_writes_past_the_callers_array)
{
    unsigned char records[6 * AE_MSG_RECORD_SIZE];
    ae_msg_row rows[3];
    int i;

    for (i = 0; i < 6; i++) {
        synth(records + i * AE_MSG_RECORD_SIZE, AE_MSG_PUBLIC, i + 1, "EALL", "sysop", "x");
    }
    put_headers(records, sizeof records);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_list(0, rows, 3), 3, "stops at the array's end");
}

/* ---- bodies ------------------------------------------------------------ */

TEST(a_body_is_read_from_the_file_named_after_the_message)
{
    unsigned char records[1 * AE_MSG_RECORD_SIZE];
    char body[128];
    ae_file *f;
    long got;

    synth(records, AE_MSG_PUBLIC, 2, "EALL", "sysop", "hello");
    put_headers(records, sizeof records);

    f = ae_dos_open("./2", AE_DOS_WRITE);
    ae_dos_write(f, "the body\nsecond line\n", 21);
    ae_dos_close(f);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    got = ae_msg_body(2, body, sizeof body);
    ASSERT_EQ(got, 21L, "all of it");
    ASSERT_STR(body, "the body\nsecond line\n", "byte for byte");
}

TEST(a_header_with_no_body_file_is_not_an_error)
{
    /* Real boards have these, and express.e's own scan skips them rather than
     * stopping. */
    unsigned char records[1 * AE_MSG_RECORD_SIZE];
    char body[64];

    synth(records, AE_MSG_PUBLIC, 3, "EALL", "sysop", "no body");
    put_headers(records, sizeof records);
    ae_dos_delete("./3");

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    ASSERT_EQ(ae_msg_body(3, body, sizeof body), 0L, "no bytes, no error");
    ASSERT_STR(body, "", "and an empty buffer");
}

TEST(a_body_the_caller_may_not_read_is_not_handed_over)
{
    unsigned char records[1 * AE_MSG_RECORD_SIZE];
    char body[64];
    ae_file *f;

    synth(records, AE_MSG_PRIVATE, 1, "dino", "spot", "private");
    put_headers(records, sizeof records);
    f = ae_dos_open("./1", AE_DOS_WRITE);
    ae_dos_write(f, "secrets", 7);
    ae_dos_close(f);

    ae_msg_open(BASE_DIR, "stranger", 0, -1);
    ASSERT_TRUE(ae_msg_body(1, body, sizeof body) < 0, "refused");
    ASSERT_STR(body, "", "and nothing left in the buffer");
}

TEST(a_body_stops_at_the_callers_buffer)
{
    unsigned char records[1 * AE_MSG_RECORD_SIZE];
    char body[8];
    ae_file *f;
    long got;

    synth(records, AE_MSG_PUBLIC, 1, "EALL", "sysop", "long");
    put_headers(records, sizeof records);
    f = ae_dos_open("./1", AE_DOS_WRITE);
    ae_dos_write(f, "much longer than eight bytes", 28);
    ae_dos_close(f);

    ae_msg_open(BASE_DIR, "anyone", 0, -1);
    got = ae_msg_body(1, body, sizeof body);
    ASSERT_EQ(got, 7L, "cap - 1, leaving room for the terminator");
    ASSERT_EQ(body[7], '\0', "and it is terminated");
}

/* ---- a base that is not there ------------------------------------------ */

TEST(a_conference_with_no_messages_yet_says_so)
{
    /* Told apart from "nothing you may read", because they need different
     * sentences on screen: one invites the caller to post, the other does
     * not. */
    clear_base();
    ASSERT_EQ(ae_msg_open("./no-such-directory", "anyone", 0, -1),
              AE_MSG_ERR_NOBASE, "a base that is not there");
}

/* ---- dates ------------------------------------------------------------- */

TEST(a_message_date_renders_the_way_the_board_renders_it)
{
    char out[8];

    /* 1687536471 is a recv stamp lifted from a real Amiga-written HeaderFile
     * (reference-boardBBS Conf2): getSystemTime()'s 1970-based seconds plus 21600,
     * which is the morning of 23 June 2023 on that board's clock. */
    ae_msg_date_string(1687536471L, out, sizeof out);
    ASSERT_STR(out, "23Jun23", "a real stamp off a real board");

    /* 23:30 on 30 September 2026 by the board's clock is stored as
     * 1790811000+21600. Read as unix seconds it would be 05:30 the next
     * morning - the day the door used to show for a late-evening post. */
    ae_msg_date_string(1790832600L, out, sizeof out);
    ASSERT_STR(out, "30Sep26", "the 21600 comes off before the day is worked out");

    ae_msg_date_string(0L, out, sizeof out);
    ASSERT_STR(out, "", "an unset date renders as nothing, not as 1970");
}

TEST(a_leap_day_is_not_off_by_one)
{
    /* The whole reason the conversion shifts the year to start in March. */
    char out[8];
    ae_msg_date_string(1709186400L, out, sizeof out);   /* 2024-02-29 00:00 board clock */
    ASSERT_STR(out, "29Feb24", "the leap day itself");
    ae_msg_date_string(1709272800L, out, sizeof out);   /* 2024-03-01 00:00 board clock */
    ASSERT_STR(out, "01Mar24", "and the day after it");
}

TEST(nonsense_arguments_are_refused)
{
    ae_msg_row row;
    char body[8];

    ASSERT_EQ(ae_msg_open(0, "x", 0, -1), AE_MSG_ERR_ARGS, "NULL directory");
    ASSERT_EQ(ae_msg_list(0, 0, 4), AE_MSG_ERR_ARGS, "NULL array");
    ASSERT_EQ(ae_msg_header(0, &row), AE_MSG_ERR_ARGS, "message zero");
    ASSERT_EQ(ae_msg_body(1, body, 0), AE_MSG_ERR_ARGS, "no room");
}


/**
 * A conference that exists but holds nothing yet - an empty HeaderFile, not a
 * missing one. That is the real shape of a fresh base on this board: Conf5 was
 * rebuilt to exactly this on 2026-09-13, and ae_msg_open needs the file there.
 */
static void empty_base(void)
{
    ae_file *f;
    clear_base();
    ae_dos_delete("./MailLock");
    f = ae_dos_open(HEADERFILE, AE_DOS_WRITE);
    if (f != 0) ae_dos_close(f);
}

/* ---- writing ------------------------------------------------------------
 *
 * R1 wrote nothing on purpose: "a wrong byte in a 110-byte header is not a bug
 * anyone notices until somebody's mail is unreadable". So these assert the
 * bytes, and the round trip through this module's own reader, and the refusal
 * that keeps the writer away from a file it would be guessing about.
 */

TEST(a_written_message_reads_back)
{
    ae_msg_new msg;
    ae_msg_row row;
    char body[128];
    long n;

    empty_base();
    ae_dos_delete("./1");
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");

    msg.to = "EALL"; msg.from = "spot"; msg.subject = "first post";
    msg.status = AE_MSG_PUBLIC; msg.date = 1600000000L;

    n = ae_msg_write(&msg, "hello\nthere\n", 12);
    ASSERT_EQ(n, 1, "n");                      /* an empty base starts at 1 */

    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    ASSERT_EQ(ae_msg_header(1, &row), AE_MSG_OK, "ae_msg_header(1, &row)");
    ASSERT_STR(row.from, "spot", "row.from");
    ASSERT_STR(row.to, "EALL", "row.to");
    ASSERT_STR(row.subject, "first post", "row.subject");
    ASSERT_EQ(row.date, 1600000000L, "row.date");
    ASSERT_EQ(ae_msg_body(1, body, sizeof body), 12, "ae_msg_body(1, body, sizeof body)");
    ASSERT_STR(body, "hello\nthere\n", "body");
}

TEST(the_header_is_amiexpress_layout_byte_for_byte)
{
    unsigned char rec[AE_MSG_RECORD_SIZE];
    ae_msg_new msg;
    ae_file *f;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1600000000L;
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), 1, "ae_msg_write(&msg, \"x\n\", 2)");

    f = ae_dos_open(HEADERFILE, AE_DOS_READ);
    ASSERT_TRUE(f != 0, "f != 0");
    ASSERT_EQ(ae_dos_read_full(f, rec, AE_MSG_RECORD_SIZE), 1, "ae_dos_read_full(f, rec, AE_MSG_RECORD_S");
    ae_dos_close(f);

    /* The AmiExpress offsets, never the port's: number at 2, names at 6/37,
       subject at 68, date at 100, recv at 104. Writing the port layout here
       is what would make the board's own reader disagree with this one. */
    ASSERT_EQ(rec[0], (unsigned char)AE_MSG_PUBLIC, "rec[0]");
    ASSERT_EQ(ae_dos_get_long(rec + 2), 1, "ae_dos_get_long(rec + 2)");
    ASSERT_STR((char *)rec + 6, "EALL", "(char *)rec + 6");
    ASSERT_STR((char *)rec + 37, "spot", "(char *)rec + 37");
    ASSERT_STR((char *)rec + 68, "s", "(char *)rec + 68");
    ASSERT_EQ(ae_dos_get_long(rec + 100), 1600000000L, "ae_dos_get_long(rec + 100)");
    ASSERT_EQ(ae_dos_get_long(rec + 104), 0, "ae_dos_get_long(rec + 104)");   /* unread by its recipient */
}

TEST(the_next_number_comes_from_mailstats_not_the_count)
{
    unsigned char stats[18];
    ae_msg_new msg;
    ae_file *f;
    long n;

    empty_base();
    /* A base whose MailStats says the next number is 500, with no records to
       count. highMsgNum is the NEXT number, not the highest - getting this
       backwards makes the post truncate an existing body, which has cost this
       codebase data once already. */
    memset(stats, 0, sizeof stats);
    ae_dos_put_long(stats + 0, 400);
    ae_dos_put_long(stats + 4, 500);
    ae_dos_put_long(stats + 8, 400);
    f = ae_dos_open(MAILSTATS, AE_DOS_WRITE);
    ASSERT_TRUE(f != 0, "f != 0");
    ae_dos_write(f, stats, 18);
    ae_dos_close(f);

    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1L;
    n = ae_msg_write(&msg, "x\n", 2);
    ASSERT_EQ(n, 500, "n");

    f = ae_dos_open(MAILSTATS, AE_DOS_READ);
    ASSERT_TRUE(f != 0, "f != 0");
    ASSERT_EQ(ae_dos_read_full(f, stats, 18), 1, "ae_dos_read_full(f, stats, 18)");
    ae_dos_close(f);
    ASSERT_EQ(ae_dos_get_long(stats + 4), 501, "ae_dos_get_long(stats + 4)");   /* the next one is free */
    ASSERT_EQ(ae_dos_get_long(stats + 0), 400, "ae_dos_get_long(stats + 0)");   /* the floors are not ours to move */
    ASSERT_EQ(ae_dos_get_long(stats + 8), 400, "ae_dos_get_long(stats + 8)");
    ae_dos_delete("./500");
}

TEST(a_body_with_no_trailing_newline_gets_one)
{
    ae_msg_new msg;
    char body[64];

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1L;
    ASSERT_EQ(ae_msg_write(&msg, "no newline", 10), 1, "ae_msg_write(&msg, \"no newline\", 10)");

    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    ASSERT_EQ(ae_msg_body(1, body, sizeof body), 11, "ae_msg_body(1, body, sizeof body)");
    ASSERT_STR(body, "no newline\n", "body");
}

TEST(it_refuses_a_base_holding_port_records)
{
    ae_msg_new msg;

    /* The board copes with both layouts; this writer only adds one. Appending
       an AmiExpress record after port ones changes what the whole-file
       sequence pass concludes about their neighbours - a base that read fine
       before the post stops reading after it. */
    clear_base();
    ASSERT_TRUE(put_headers(port_records, sizeof port_records), "put_headers(port_records, sizeof port_records)");
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");

    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1L;
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), AE_MSG_ERR_MIXED, "ae_msg_write(&msg, \"x\n\", 2)");
}

TEST(it_appends_to_a_real_amiexpress_base)
{
    ae_msg_new msg;
    long before, n;
    ae_msg_stat st;

    clear_base();
    ASSERT_TRUE(put_headers(amiga_records, sizeof amiga_records), "put_headers(amiga_records, sizeof amiga_records)");
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 1, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 1, 0)");
    ASSERT_EQ(ae_msg_stat_read(&st), AE_MSG_OK, "ae_msg_stat_read(&st)");
    before = st.total;

    msg.to = "EALL"; msg.from = "spot"; msg.subject = "appended";
    msg.status = AE_MSG_PUBLIC; msg.date = 1600000000L;
    n = ae_msg_write(&msg, "x\n", 2);
    ASSERT_TRUE(n >= 1, "n >= 1");

    /* The real fixture still reads, and it now has one more. */
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 1, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 1, 0)");
    ASSERT_EQ(ae_msg_stat_read(&st), AE_MSG_OK, "ae_msg_stat_read(&st)");
    ASSERT_EQ(st.total, before + 1, "st.total");
    ASSERT_EQ(st.unreadable, 0, "st.unreadable");
}

/** Write `text` into ./MailLock, as another node's lock file. */
static void put_lock(const char *text)
{
    ae_file *f = ae_dos_open("./MailLock", AE_DOS_WRITE);
    long len = 0;
    while (text[len] != 0) len++;
    if (f != 0) {
        if (len > 0) ae_dos_write(f, text, len);
        ae_dos_close(f);
    }
}

TEST(a_held_lock_stops_a_second_write)
{
    ae_msg_new msg;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");

    /* Another node's lock, as a file - which is the only kind a different
       process can see - carrying the second it was taken at, which is what
       says the holder is still alive. */
    put_lock("1000");

    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1010L;    /* ten seconds later */
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), AE_MSG_ERR_LOCKED, "ae_msg_write(&msg, \"x\n\", 2)");

    /* And it did NOT free a lock it never took. */
    ae_msg_unlock();
    ASSERT_TRUE(ae_dos_exists("./MailLock"), "ae_dos_exists(\"./MailLock\")");
    ae_dos_delete("./MailLock");
}

/*
 * The live board's bug, 2026-09-22: "[INFO] Another task has the MsgBase
 * locked. Not posted." in SUBS, with nothing holding anything. A door killed
 * between take and unlock - the inactivity fuse, a dropped carrier, a node
 * restart - leaves MailLock on disk, and a lock read by EXISTENCE never
 * expires. Three conferences were refusing every post that way, one of them
 * for eight days.
 *
 * express.e does not read it that way: it holds an exclusive AmigaDOS Lock()
 * on the file and CREATES the file when it is missing (express.e:11944-11964),
 * so the file outliving its holder is normal there and harmless.
 */
TEST(a_lock_nobody_is_holding_does_not_block_for_ever)
{
    ae_msg_new msg;
    ae_msg_stat st;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");

    /* Exactly what was on the live volume: a lock file with nothing in it. */
    put_lock("");

    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1000L;
    ASSERT_TRUE(ae_msg_write(&msg, "x\n", 2) > 0, "ae_msg_write over an empty lock");
    ASSERT_EQ(ae_msg_stat_read(&st), AE_MSG_OK, "ae_msg_stat_read(&st)");
    ASSERT_EQ(st.total, 1, "st.total");
    ae_dos_delete("./MailLock");
}

TEST(a_lock_older_than_the_stale_window_is_taken)
{
    ae_msg_new msg;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");

    put_lock("1000");                                /* taken at second 1000 */
    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1031L;    /* 31 s later: gone */
    ASSERT_TRUE(ae_msg_write(&msg, "x\n", 2) > 0, "ae_msg_write over a stale lock");
    ae_dos_delete("./MailLock");
}

/*
 * A door that cannot read the board's clock cannot tell a live lock from a
 * dead one, and posting over a live holder corrupts the base. Refuse instead.
 */
TEST(without_a_clock_any_lock_is_respected)
{
    ae_msg_new msg;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");

    put_lock("1000");
    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 0L;       /* ae_now() would not say */
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), AE_MSG_ERR_LOCKED, "ae_msg_write with no clock");
    ae_dos_delete("./MailLock");
}

TEST(the_lock_is_released_after_a_write)
{
    ae_msg_new msg;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.status = AE_MSG_PUBLIC; msg.date = 1L;
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), 1, "ae_msg_write(&msg, \"x\n\", 2)");

    /* A lock left behind bricks the base for every node until somebody
       deletes it by hand. */
    ASSERT_TRUE(!ae_dos_exists("./MailLock"), "!ae_dos_exists(\"./MailLock\")");
    ASSERT_EQ(ae_msg_write(&msg, "y\n", 2), 2, "ae_msg_write(&msg, \"y\n\", 2)");
    ae_dos_delete("./2");
}

TEST(a_status_the_board_does_not_use_is_refused)
{
    ae_msg_new msg;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    msg.to = "EALL"; msg.from = "spot"; msg.subject = "s";
    msg.date = 1L;
    msg.status = 'Z';
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), AE_MSG_ERR_ARGS, "ae_msg_write(&msg, \"x\n\", 2)");
    msg.status = AE_MSG_DELETED;         /* writing a deleted message is nonsense */
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), AE_MSG_ERR_ARGS, "ae_msg_write(&msg, \"x\n\", 2)");
}

TEST(an_overlong_name_is_cut_not_overrun)
{
    ae_msg_new msg;
    ae_msg_row row;

    empty_base();
    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    msg.to = "EALL";
    msg.from = "a-name-far-longer-than-the-thirty-one-bytes-the-record-has";
    msg.subject = "also much much much too long to fit in the subject field here";
    msg.status = AE_MSG_PUBLIC; msg.date = 1L;
    ASSERT_EQ(ae_msg_write(&msg, "x\n", 2), 1, "ae_msg_write(&msg, \"x\n\", 2)");

    ASSERT_EQ(ae_msg_open(BASE_DIR, "spot", 0, 0), AE_MSG_OK, "ae_msg_open(BASE_DIR, \"spot\", 0, 0)");
    ASSERT_EQ(ae_msg_header(1, &row), AE_MSG_OK, "ae_msg_header(1, &row)");
    ASSERT_TRUE(strlen(row.from) <= 30, "strlen(row.from) <= 30");
    ASSERT_TRUE(strlen(row.subject) <= 30, "strlen(row.subject) <= 30");
}

int main(void)
{
    printf("\n====== Message Base Tests ======\n\n");

    if (!load_fixtures()) {
        printf("[FAIL] could not read the tracked fixtures at\n"
               "       %s\n"
               "       Run this from sdk/c (as `make test` does).\n\n",
               AMIGA_FIXTURE);
        return 1;
    }

    RUN_TEST(eall_reads_as_the_readers_own_name_all);
    RUN_TEST(a_real_amiga_headerfile_reads);
    RUN_TEST(a_real_port_written_headerfile_reads);
    RUN_TEST(one_file_holding_both_layouts_reads_both);
    RUN_TEST(a_record_with_no_number_anywhere_is_counted_not_guessed_at);
    RUN_TEST(deleted_messages_are_never_shown_to_anyone);
    RUN_TEST(private_mail_is_for_its_two_people_only);
    RUN_TEST(a_sysop_sees_private_mail_and_an_ordinary_caller_does_not);
    RUN_TEST(a_name_matches_whatever_case_it_was_typed_in);
    RUN_TEST(censored_and_public_are_both_public);
    RUN_TEST(new_is_measured_against_the_callers_scan_pointer);
    RUN_TEST(a_board_that_would_not_say_reports_nothing_new_rather_than_everything);
    RUN_TEST(mailstats_high_is_the_next_number_not_the_highest);
    RUN_TEST(a_base_with_no_mailstats_still_answers);
    RUN_TEST(a_negative_first_asks_for_the_newest_window);
    RUN_TEST(a_window_larger_than_the_conference_is_the_whole_conference);
    RUN_TEST(listing_from_a_number_starts_there);
    RUN_TEST(a_listing_never_writes_past_the_callers_array);
    RUN_TEST(a_body_is_read_from_the_file_named_after_the_message);
    RUN_TEST(a_header_with_no_body_file_is_not_an_error);
    RUN_TEST(a_body_the_caller_may_not_read_is_not_handed_over);
    RUN_TEST(a_body_stops_at_the_callers_buffer);
    RUN_TEST(a_conference_with_no_messages_yet_says_so);
    RUN_TEST(a_message_date_renders_the_way_the_board_renders_it);
    RUN_TEST(a_leap_day_is_not_off_by_one);
    RUN_TEST(nonsense_arguments_are_refused);

    RUN_TEST(a_written_message_reads_back);
    RUN_TEST(the_header_is_amiexpress_layout_byte_for_byte);
    RUN_TEST(the_next_number_comes_from_mailstats_not_the_count);
    RUN_TEST(a_body_with_no_trailing_newline_gets_one);
    RUN_TEST(it_refuses_a_base_holding_port_records);
    RUN_TEST(it_appends_to_a_real_amiexpress_base);
    RUN_TEST(a_held_lock_stops_a_second_write);
    RUN_TEST(a_lock_nobody_is_holding_does_not_block_for_ever);
    RUN_TEST(a_lock_older_than_the_stale_window_is_taken);
    RUN_TEST(without_a_clock_any_lock_is_respected);
    RUN_TEST(the_lock_is_released_after_a_write);
    RUN_TEST(a_status_the_board_does_not_use_is_refused);
    RUN_TEST(an_overlong_name_is_cut_not_overrun);

    clear_base();

    printf("\n%d run, %d passed, %d failed\n\n", tests_run, tests_passed, tests_failed);
    return tests_failed == 0 ? 0 : 1;
}
