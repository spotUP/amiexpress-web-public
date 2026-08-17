/* test_aedoor_native.c - regression tests for the stdio (native) backend of
 * the AmiExpress door I/O layer. See ../aedoor.h and ../aedoor_native.c.
 *
 * Captures stdout/stdin through real files (dup()/dup2() around fd 1 and
 * fd 0) so ae_put()'s actual byte stream and ae_get()/ae_key()'s actual
 * fgets()/getchar() reads are exercised exactly as a caller would see them
 * -- no mock layer between the test and the functions under test.
 *
 * C89. ASCII only.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>
#include "../aedoor.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-50s ", #name); fflush(stdout); test_##name(); } while (0)

#define ASSERT_EQ(got, expected, msg) do { \
    if ((got) == (expected)) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got %d, expected %d)\n", msg, (int)(got), (int)(expected)); \
    } \
    tests_run++; \
} while (0)

#define ASSERT_STR_EQ(got, expected, msg) do { \
    if (strcmp((got), (expected)) == 0) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got '%s', expected '%s')\n", msg, got, expected); \
    } \
    tests_run++; \
} while (0)

#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s\n", msg); \
    } \
    tests_run++; \
} while (0)

/* ---- stdout/stdin capture helpers ---------------------------------- */

#define CAPTURE_PATH "/tmp/test_aedoor_stdout_capture.txt"
#define STDIN_FEED_PATH "/tmp/test_aedoor_stdin_feed.txt"
#define CAPTURE_BUFSIZE 4096

static int saved_stdout_fd = -1;
static int saved_stdin_fd = -1;
static char capture_buf[CAPTURE_BUFSIZE];

/* Redirects stdout (fd 1) to CAPTURE_PATH, keeping a duplicate of the
 * original fd so it can be restored afterward. */
static void capture_stdout_begin(void)
{
    fflush(stdout);
    saved_stdout_fd = dup(fileno(stdout));
    freopen(CAPTURE_PATH, "w+", stdout);
}

/* Restores stdout to its original destination and fills capture_buf with
 * whatever was written to CAPTURE_PATH in between. */
static char *capture_stdout_end(void)
{
    long n;
    FILE *rf;

    fflush(stdout);
    dup2(saved_stdout_fd, fileno(stdout));
    close(saved_stdout_fd);
    saved_stdout_fd = -1;

    n = 0;
    rf = fopen(CAPTURE_PATH, "r");
    if (rf != NULL) {
        n = (long)fread(capture_buf, 1, (size_t)(CAPTURE_BUFSIZE - 1), rf);
        fclose(rf);
    }
    capture_buf[n] = '\0';
    return capture_buf;
}

/* Redirects stdin (fd 0) to read from a file preloaded with content. */
static void feed_stdin(const char *content)
{
    FILE *wf;

    wf = fopen(STDIN_FEED_PATH, "w");
    if (wf != NULL) {
        fwrite(content, 1, strlen(content), wf);
        fclose(wf);
    }

    fflush(stdin);
    saved_stdin_fd = dup(fileno(stdin));
    freopen(STDIN_FEED_PATH, "r", stdin);
}

static void restore_stdin(void)
{
    dup2(saved_stdin_fd, fileno(stdin));
    close(saved_stdin_fd);
    saved_stdin_fd = -1;
    clearerr(stdin);
}

/* ---- tests ----------------------------------------------------------- */

TEST(put_without_newline_emits_exact_text)
{
    char *out;
    capture_stdout_begin();
    ae_put("hello", 0);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, "hello", "no-newline put should not append a break");
}

TEST(put_with_newline_appends_break)
{
    char *out;
    capture_stdout_begin();
    ae_put("hello", 1);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, "hello\n", "newline put should append exactly one break");
}

TEST(put_empty_string_without_newline_emits_nothing)
{
    char *out;
    capture_stdout_begin();
    ae_put("", 0);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, "", "empty text, no newline, should emit nothing");
}

TEST(put_empty_string_with_newline_emits_break_only)
{
    char *out;
    capture_stdout_begin();
    ae_put("", 1);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, "\n", "empty text with newline should emit just the break");
}

TEST(put_exactly_max_line_is_not_truncated)
{
    char text[AE_MAX_LINE + 1];
    char *out;
    int i;

    for (i = 0; i < AE_MAX_LINE; i++) {
        text[i] = (char)('A' + (i % 26));
    }
    text[AE_MAX_LINE] = '\0';

    capture_stdout_begin();
    ae_put(text, 0);
    out = capture_stdout_end();

    ASSERT_EQ((int)strlen(out), AE_MAX_LINE, "exact-boundary string length");
    ASSERT_STR_EQ(out, text, "exact-boundary string content");
}

TEST(put_long_string_over_boundary_emitted_in_full)
{
    /* > AE_MAX_LINE (198) and > the old, wrong 200-char field size, to
     * prove ae_put splits at AE_MAX_LINE across multiple sends rather than
     * truncating at either boundary. */
    char text[513];
    char *out;
    int i;

    for (i = 0; i < 512; i++) {
        text[i] = (char)('a' + (i % 26));
    }
    text[512] = '\0';

    capture_stdout_begin();
    ae_put(text, 1);
    out = capture_stdout_end();

    ASSERT_EQ((int)strlen(out), 513, "512-char text plus trailing newline, in full");
    ASSERT_TRUE(strncmp(out, text, 512) == 0, "full body matches before the trailing newline");
    ASSERT_EQ(out[512], '\n', "exactly one trailing newline, not embedded mid-stream");
}

TEST(put_null_text_is_a_safe_no_op)
{
    char *out;
    capture_stdout_begin();
    ae_put(NULL, 0);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, "", "NULL text must not crash and must emit nothing");
}

TEST(put_bbs_prefix_is_escaped_to_avoid_file_display_reroute)
{
    /* A sysop can legitimately set DownloadDir=bbs:doors/, so this is a
     * real status line, not a contrived one. Without the guard the BBS
     * (io.ts:657-666) would trim, lowercase, and reroute this to file
     * display instead of printing it. */
    char *out;
    capture_stdout_begin();
    ae_put("bbs:doors/FOO.LHA saved", 1);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, ".bbs:doors/FOO.LHA saved\n",
        "leading 'bbs:' gets a guard byte so the line still prints, visibly");
}

TEST(put_bbs_prefix_case_insensitive_is_escaped)
{
    char *out;
    capture_stdout_begin();
    ae_put("BBS:doors/FOO.LHA", 0);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, ".BBS:doors/FOO.LHA",
        "uppercase BBS: matches the emulator's case-insensitive check too");
}

TEST(put_bbs_substring_mid_line_is_untouched)
{
    char *out;
    capture_stdout_begin();
    ae_put("saved to bbs:doors/FOO.LHA", 1);
    out = capture_stdout_end();
    ASSERT_STR_EQ(out, "saved to bbs:doors/FOO.LHA\n",
        "'bbs:' NOT at the start of the line needs no guard");
}

TEST(put_bbs_prefix_at_second_chunk_boundary_is_escaped)
{
    /* Constructed so chunk 1 (offset 0, length AE_MAX_LINE=198) does NOT
     * itself start with "bbs:" -- it is correctly left unguarded and
     * consumes the full 198-byte budget -- and chunk 2 begins EXACTLY at
     * offset 198 with "bbs:doors/FOO.LHA". "bbs:" lands at a LATER
     * physical JH_SM message's own start offset, not the caller's logical
     * string start. The BBS's reroute check (io.ts:657-666) runs on each
     * message independently, so that chunk needs its own guard byte even
     * though the string as a whole does not start with "bbs:".
     *
     * This is deliberately built to discriminate a real per-chunk
     * implementation from a whole-string-only check: a whole-string check
     * sees text[0] == 'x', concludes "no guard needed anywhere", and
     * leaves chunk 2 unguarded -- against that (the previous, buggy)
     * implementation this test fails (see report for the RED run).
     * Asserting the exact byte AT the chunk-boundary offset -- not just
     * "output contains bbs: somewhere" -- is what makes this a test of
     * chunk boundaries rather than a restatement of the single-chunk
     * case; a native stdout capture cannot observe separate protocol
     * messages, but this implementation's chunk math is identical to the
     * Amiga backend's, so the guard byte's position in the byte stream is
     * exactly where a live emulator would see it in the second message. */
    char text[220];
    char expected[222];
    char *out;
    int i;
    int n;
    int k;
    const char *tail;

    for (i = 0; i < AE_MAX_LINE; i++) {
        text[i] = 'x';
    }
    n = AE_MAX_LINE;
    tail = "bbs:doors/FOO.LHA";
    for (i = 0; tail[i] != '\0'; i++) {
        text[n++] = tail[i];
    }
    text[n] = '\0';

    k = 0;
    for (i = 0; i < AE_MAX_LINE; i++) {
        expected[k++] = 'x';
    }
    expected[k++] = '.';
    for (i = 0; tail[i] != '\0'; i++) {
        expected[k++] = tail[i];
    }
    expected[k++] = '\n';
    expected[k] = '\0';

    capture_stdout_begin();
    ae_put(text, 1);
    out = capture_stdout_end();

    ASSERT_EQ((int)strlen(out), (int)strlen(expected), "output length includes exactly one inserted guard byte");
    ASSERT_TRUE(out[AE_MAX_LINE] == '.', "guard byte lands exactly at the second chunk's start offset (198)");
    ASSERT_STR_EQ(out, expected, "chunk 1 unguarded, chunk 2 guarded, full content intact");
}

TEST(put_ansi_escape_straddling_chunk_boundary_is_not_corrupted)
{
    /* An ANSI SGR escape sequence deliberately straddles the AE_MAX_LINE
     * (198) chunk boundary: it starts at byte 195 and its final 'm' lands
     * at byte 201, three bytes past the split point. Chunking is dumb
     * byte-splitting with no escape-sequence awareness by design (the
     * protocol layer only knows about a 198-byte payload limit, not
     * terminal semantics) -- this must reassemble byte-identical to the
     * input regardless of where the split falls. */
    char text[240];
    char *out;
    int i;
    int n;

    n = 0;
    for (i = 0; i < 195; i++) {
        text[n++] = (char)('a' + (i % 26));
    }
    text[n++] = 0x1B;
    text[n++] = '[';
    text[n++] = '1';
    text[n++] = ';';
    text[n++] = '3';
    text[n++] = '3';
    text[n++] = 'm';
    {
        const char *word = "Hello";
        for (i = 0; word[i] != '\0'; i++) {
            text[n++] = word[i];
        }
    }
    text[n++] = 0x1B;
    text[n++] = '[';
    text[n++] = '0';
    text[n++] = 'm';
    for (i = 0; i < 20; i++) {
        text[n++] = (char)('A' + (i % 26));
    }
    text[n] = '\0';

    capture_stdout_begin();
    ae_put(text, 0);
    out = capture_stdout_end();

    ASSERT_EQ((int)strlen(out), n, "full length preserved across the chunk split");
    ASSERT_TRUE(strcmp(out, text) == 0, "byte-identical output: escape sequence not corrupted by the 198-byte split");
}

TEST(get_truncates_safely_at_maxlen)
{
    char buf[12];
    int i;

    for (i = 0; i < 12; i++) {
        buf[i] = (char)0x7F;
    }

    feed_stdin("this line is much longer than the ten-byte buffer\n");
    ae_get(buf, 10);
    restore_stdin();

    ASSERT_TRUE(strlen(buf) <= 9, "result fits within maxlen-1 chars");
    ASSERT_EQ((unsigned char)buf[10], 0x7F, "byte past the buffer untouched");
    ASSERT_EQ((unsigned char)buf[11], 0x7F, "byte past the buffer untouched");
}

TEST(get_drains_overlong_line_so_next_get_starts_clean)
{
    /* Without draining the unread remainder of a truncated line, the NEXT
     * ae_get() would read that leftover instead of the following prompt's
     * real answer -- desynchronising every prompt after the first
     * over-long input. */
    char first[8];
    char second[64];

    feed_stdin("this line is way too long for an eight byte buffer\nnext line\n");
    ae_get(first, sizeof(first));
    ae_get(second, sizeof(second));
    restore_stdin();

    ASSERT_TRUE(strlen(first) <= 7, "first read truncated safely");
    ASSERT_STR_EQ(second, "next line", "second read gets the NEXT line, not leftovers from the first");
}

TEST(get_returns_full_short_line_without_newline)
{
    char buf[64];
    feed_stdin("short answer\n");
    ae_get(buf, sizeof(buf));
    restore_stdin();
    ASSERT_STR_EQ(buf, "short answer", "newline stripped, content intact");
}

TEST(get_on_eof_yields_empty_string)
{
    char buf[16];
    buf[0] = 'X';
    feed_stdin("");
    ae_get(buf, sizeof(buf));
    restore_stdin();
    ASSERT_STR_EQ(buf, "", "immediate EOF yields an empty, NUL-terminated string");
}

TEST(key_reads_single_char)
{
    int key;
    feed_stdin("A");
    key = ae_key();
    restore_stdin();
    ASSERT_EQ(key, (int)'A', "single keypress value");
}

TEST(key_returns_minus1_on_eof)
{
    int key;
    feed_stdin("");
    key = ae_key();
    restore_stdin();
    ASSERT_EQ(key, -1, "EOF on stdin reports as carrier loss (-1)");
}

TEST(check_is_always_zero_natively)
{
    ASSERT_EQ(ae_check(), 0, "native ae_check never asks the caller to stop");
}

TEST(start_returns_zero)
{
    ASSERT_EQ(ae_start(5), 0, "native ae_start is a no-op success");
}

TEST(shutdown_returns_to_caller)
{
    /* If this were NOT a no-op (e.g. if it called exit()), the RUN_TEST
     * macro below would never print [OK] and tests_run would stop
     * incrementing after this test -- the assertion after it is the
     * observable proof that control returned. */
    ae_shutdown();
    ASSERT_TRUE(1, "control returned after ae_shutdown()");
}

TEST(fatal_exits_process_with_given_code)
{
    pid_t pid;
    int status;

    pid = fork();
    if (pid == 0) {
        /* child: silence its stdout, then call the function under test */
        FILE *devnull = freopen("/dev/null", "w", stdout);
        (void)devnull;
        ae_fatal(7);
        _exit(99); /* unreachable if ae_fatal behaves */
    }

    waitpid(pid, &status, 0);
    ASSERT_TRUE(WIFEXITED(status), "child exited normally, not by signal");
    ASSERT_EQ(WEXITSTATUS(status), 7, "ae_fatal's code reaches the process exit status");
}

int main(void)
{
    printf("\n====== aedoor_native Tests ======\n\n");

    RUN_TEST(put_without_newline_emits_exact_text);
    RUN_TEST(put_with_newline_appends_break);
    RUN_TEST(put_empty_string_without_newline_emits_nothing);
    RUN_TEST(put_empty_string_with_newline_emits_break_only);
    RUN_TEST(put_exactly_max_line_is_not_truncated);
    RUN_TEST(put_long_string_over_boundary_emitted_in_full);
    RUN_TEST(put_null_text_is_a_safe_no_op);
    RUN_TEST(put_bbs_prefix_is_escaped_to_avoid_file_display_reroute);
    RUN_TEST(put_bbs_prefix_case_insensitive_is_escaped);
    RUN_TEST(put_bbs_substring_mid_line_is_untouched);
    RUN_TEST(put_bbs_prefix_at_second_chunk_boundary_is_escaped);
    RUN_TEST(put_ansi_escape_straddling_chunk_boundary_is_not_corrupted);
    RUN_TEST(get_truncates_safely_at_maxlen);
    RUN_TEST(get_drains_overlong_line_so_next_get_starts_clean);
    RUN_TEST(get_returns_full_short_line_without_newline);
    RUN_TEST(get_on_eof_yields_empty_string);
    RUN_TEST(key_reads_single_char);
    RUN_TEST(key_returns_minus1_on_eof);
    RUN_TEST(check_is_always_zero_natively);
    RUN_TEST(start_returns_zero);
    RUN_TEST(shutdown_returns_to_caller);
    RUN_TEST(fatal_exits_process_with_given_code);

    unlink(CAPTURE_PATH);
    unlink(STDIN_FEED_PATH);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return (tests_failed == 0) ? EXIT_SUCCESS : EXIT_FAILURE;
}
