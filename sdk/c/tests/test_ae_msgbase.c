/* test_ae_msgbase.c - the public-feed client, against a board played by this
 * file.
 *
 * ae_transport_native.c is the host backend; its ae_field_exchange delegates
 * to whatever ae_native_set_exchange() installed, and answers NOTHING when
 * nothing is installed. So "a classic AmiExpress, which does not have this
 * command" is the DEFAULT case here rather than one somebody has to remember
 * to arrange - which is the case a door is most likely to get wrong, because
 * an empty list and a board that cannot answer look identical on screen.
 *
 * No emulator, no BBS, no network. C89.
 */

#include <stdio.h>
#include <string.h>

#include "../include/ae_msgbase.h"
#include "../include/ae_transport_native.h"

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
#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s\n", msg); } \
    tests_run++; \
} while (0)

/* ------------------------------------------------------------ the board */

/**
 * A board that answers from a script: one canned reply per LIST/BODY chunk,
 * handed out in order, plus one STAT line.
 */
typedef struct {
    const char *stat;
    const char *const *pages;   /* NUL-terminated list of LIST answers */
    int page_count;
    int page_at;
    const char *const *body;    /* NUL-terminated list of BODY chunks */
    int body_count;
    int body_at;
    int carrier;                /* 0 = the line is gone */
    int asked;
    char last_request[64];
} fake_board;

static int fake_exchange(void *ctx, int field, const char *request, char *out, int cap)
{
    fake_board *b = (fake_board *)ctx;
    const char *answer = 0;
    int len;

    (void)field;
    b->asked++;
    strncpy(b->last_request, request, sizeof b->last_request - 1);
    b->last_request[sizeof b->last_request - 1] = '\0';

    if (!b->carrier) return -1;

    if (strncmp(request, "STAT", 4) == 0) {
        answer = b->stat;
    } else if (strncmp(request, "LIST", 4) == 0) {
        answer = (b->page_at < b->page_count) ? b->pages[b->page_at++] : "";
    } else if (strncmp(request, "BODY", 4) == 0) {
        answer = (b->body_at < b->body_count) ? b->body[b->body_at++] : "";
    }

    if (answer == 0) answer = "";
    for (len = 0; len < cap - 1 && answer[len] != '\0'; len++) out[len] = answer[len];
    out[len] = '\0';
    return len;
}

static fake_board board;

static void a_board_that_answers(void)
{
    memset(&board, 0, sizeof board);
    board.carrier = 1;
    board.stat = "47|2|103|Amiga Chat";
    ae_native_set_exchange(fake_exchange, &board);
}

static void a_classic_board(void)
{
    memset(&board, 0, sizeof board);
    ae_native_set_exchange(0, 0);
}

/* ------------------------------------------------------------- the rows */

TEST(a_row_splits_into_its_five_fields)
{
    char line[] = "103|Spot|Anyone still cracking?|08Sep26|N";
    ae_msg_row row;

    ASSERT_EQ(ae_msg_split_row(line, &row), AE_MSG_OK, "the row parsed");
    ASSERT_EQ(row.number, 103, "the message number");
    ASSERT_TRUE(strcmp(row.from, "Spot") == 0, "the sender");
    ASSERT_TRUE(strcmp(row.subject, "Anyone still cracking?") == 0, "the subject");
    ASSERT_TRUE(strcmp(row.date, "08Sep26") == 0, "the date");
    ASSERT_EQ(row.flag, 'N', "the flag");
}

TEST(a_row_with_a_sixth_field_still_parses)
{
    /* The format is APPEND-ONLY: a board that grows a field must not break a
     * door built before it. Keep the first five, ignore the rest, never
     * reject the row. */
    char line[] = "104|Rebel|Forty cols|07Sep26|-|somethingnew|andanother";
    ae_msg_row row;

    ASSERT_EQ(ae_msg_split_row(line, &row), AE_MSG_OK, "the row still parsed");
    ASSERT_EQ(row.number, 104, "the message number survived");
    ASSERT_EQ(row.flag, '-', "the flag survived");
}

TEST(a_row_missing_fields_is_refused_rather_than_half_read)
{
    char line[] = "105|Spot";
    ae_msg_row row;

    ASSERT_EQ(ae_msg_split_row(line, &row), AE_MSG_ERR_ARGS, "a short row is refused");
}

TEST(an_over_long_subject_is_cut_not_overflowed)
{
    char line[] = "106|Nark|"
        "0123456789012345678901234567890123456789012345678901234567890123456789"
        "|08Sep26|-";
    ae_msg_row row;

    ASSERT_EQ(ae_msg_split_row(line, &row), AE_MSG_OK, "the row parsed");
    ASSERT_TRUE(strlen(row.subject) == AE_MSG_SUBJECT_MAX - 1, "the subject is cut to fit");
    ASSERT_TRUE(strcmp(row.date, "08Sep26") == 0, "and the fields after it are still right");
}

/* ------------------------------------------------------------- the stat */

TEST(stat_reads_the_four_numbers)
{
    ae_msg_stat stat;
    a_board_that_answers();

    ASSERT_EQ(ae_msg_stat_read(&stat), AE_MSG_OK, "the board answered");
    ASSERT_EQ(stat.total, 47, "the public total");
    ASSERT_EQ(stat.unread, 2, "new for this caller");
    ASSERT_EQ(stat.pointer, 103, "his pointer");
    ASSERT_TRUE(strcmp(stat.conf, "Amiga Chat") == 0, "the conference name");
}

TEST(a_board_that_answers_nothing_is_not_an_empty_conference)
{
    ae_msg_stat stat;
    a_classic_board();

    /* The whole point of this distinction: an empty list and a board without
     * the command look the same on screen, and they need two different
     * sentences. */
    ASSERT_EQ(ae_msg_stat_read(&stat), AE_MSG_ERR_NOHOST, "a classic board says so");
    ASSERT_EQ(stat.total, 0, "and leaves nothing to misread");
}

TEST(a_dropped_carrier_is_told_apart_from_a_quiet_board)
{
    ae_msg_stat stat;
    a_board_that_answers();
    board.carrier = 0;

    ASSERT_EQ(ae_msg_stat_read(&stat), AE_MSG_ERR_CARRIER, "the line is gone");
}

/* ------------------------------------------------------------- the list */

static const char *const two_pages[] = {
    "1|Spot|First one|01Sep26|-\n2|Rebel|Second one|02Sep26|-\n",
    "3|Nark|Third one|03Sep26|N\n",
};

TEST(list_pages_until_the_board_runs_out)
{
    ae_msg_row rows[8];
    int got;

    a_board_that_answers();
    board.pages = two_pages;
    board.page_count = 2;

    got = ae_msg_list(0, rows, 8);
    ASSERT_EQ(got, 3, "three rows across two pages");
    ASSERT_EQ(rows[0].number, 1, "ascending, first");
    ASSERT_EQ(rows[2].number, 3, "ascending, last");
    ASSERT_TRUE(strcmp(rows[2].subject, "Third one") == 0, "the last row's subject");
    /* Three round trips: two that answered, one that said "nothing more". */
    ASSERT_EQ(board.asked, 3, "it stopped when the board did");
}

TEST(a_negative_first_asks_the_board_for_the_tail)
{
    ae_msg_row rows[8];

    a_board_that_answers();
    board.pages = two_pages;
    board.page_count = 2;

    ASSERT_EQ(ae_msg_list(-1, rows, 8), 3, "the tail window filled");
    /* The FIRST request carries the negative verbatim - the board is the only
     * thing that knows where the tail starts, because message numbers are
     * sparse. Everything after it pages forward from a real number, which is
     * what the LAST request proves. */
    ASSERT_TRUE(strcmp(board.last_request, "LIST 4 5") == 0,
                "later trips page forward from the last row seen");
}

TEST(an_empty_answer_is_no_rows_and_not_an_error)
{
    ae_msg_row rows[4];
    a_board_that_answers();
    board.pages = 0;
    board.page_count = 0;

    ASSERT_EQ(ae_msg_list(0, rows, 4), 0, "nothing to show is not a failure");
}

TEST(list_never_writes_past_the_caller_s_array)
{
    ae_msg_row rows[2];
    int got;

    a_board_that_answers();
    board.pages = two_pages;
    board.page_count = 2;

    got = ae_msg_list(0, rows, 2);
    ASSERT_EQ(got, 2, "exactly what was asked for");
    ASSERT_EQ(rows[1].number, 2, "and the right two");
}

TEST(a_classic_board_is_told_apart_from_an_empty_list)
{
    ae_msg_row rows[4];
    a_classic_board();

    ASSERT_EQ(ae_msg_list(0, rows, 4), AE_MSG_ERR_NOHOST, "not zero rows - no host");
}

/* ------------------------------------------------------------- the body */

static const char *const three_chunks[] = {
    "The first hundred and ninety bytes, roughly. ",
    "Then the middle, which the door must place immediately after it. ",
    "And the end.",
};

TEST(a_body_reassembles_across_three_chunks_byte_for_byte)
{
    char body[512];
    long len;

    a_board_that_answers();
    board.body = three_chunks;
    board.body_count = 3;

    len = ae_msg_body(103, body, sizeof body);
    ASSERT_TRUE(len > 0, "the body came back");
    ASSERT_TRUE(strcmp(body,
        "The first hundred and ninety bytes, roughly. "
        "Then the middle, which the door must place immediately after it. "
        "And the end.") == 0, "in order, with nothing lost between chunks");
    ASSERT_EQ((long)strlen(body), len, "the length is what was written");
}

TEST(a_body_stops_at_the_caller_s_buffer_rather_than_running_over)
{
    char body[32];
    long len;

    a_board_that_answers();
    board.body = three_chunks;
    board.body_count = 3;

    len = ae_msg_body(103, body, sizeof body);
    ASSERT_TRUE(len <= 31, "it never wrote past the buffer");
    ASSERT_EQ((long)strlen(body), len, "and terminated what it did write");
}

TEST(a_message_the_board_will_not_serve_is_no_bytes_not_a_hang)
{
    char body[128];
    a_board_that_answers();
    board.body = 0;
    board.body_count = 0;

    ASSERT_EQ(ae_msg_body(2, body, sizeof body), 0, "nothing, and it returned");
    ASSERT_TRUE(body[0] == '\0', "with an empty string a door can print");
}

TEST(bad_arguments_are_refused_before_any_round_trip)
{
    char body[8];
    a_board_that_answers();

    ASSERT_EQ(ae_msg_stat_read(0), AE_MSG_ERR_ARGS, "no output for the stat");
    ASSERT_EQ(ae_msg_list(0, 0, 4), AE_MSG_ERR_ARGS, "no array for the list");
    ASSERT_EQ(ae_msg_body(0, body, sizeof body), AE_MSG_ERR_ARGS, "no message number");
    ASSERT_EQ(board.asked, 0, "and the board was never troubled");
}

int main(void)
{
    printf("\n====== Public Message Feed Tests ======\n\n");

    RUN_TEST(a_row_splits_into_its_five_fields);
    RUN_TEST(a_row_with_a_sixth_field_still_parses);
    RUN_TEST(a_row_missing_fields_is_refused_rather_than_half_read);
    RUN_TEST(an_over_long_subject_is_cut_not_overflowed);
    RUN_TEST(stat_reads_the_four_numbers);
    RUN_TEST(a_board_that_answers_nothing_is_not_an_empty_conference);
    RUN_TEST(a_dropped_carrier_is_told_apart_from_a_quiet_board);
    RUN_TEST(list_pages_until_the_board_runs_out);
    RUN_TEST(a_negative_first_asks_the_board_for_the_tail);
    RUN_TEST(an_empty_answer_is_no_rows_and_not_an_error);
    RUN_TEST(list_never_writes_past_the_caller_s_array);
    RUN_TEST(a_classic_board_is_told_apart_from_an_empty_list);
    RUN_TEST(a_body_reassembles_across_three_chunks_byte_for_byte);
    RUN_TEST(a_body_stops_at_the_caller_s_buffer_rather_than_running_over);
    RUN_TEST(a_message_the_board_will_not_serve_is_no_bytes_not_a_hang);
    RUN_TEST(bad_arguments_are_refused_before_any_round_trip);

    printf("\n%d run, %d passed, %d failed\n\n", tests_run, tests_passed, tests_failed);
    return tests_failed == 0 ? 0 : 1;
}
