/* test_ae_dos.c - the file layer, on the host backend.
 *
 * Two things are being pinned here, and only one of them is "does reading a
 * file work".
 *
 * The first is BYTE ORDER. AmiExpress writes big-endian because the machine
 * that wrote it was big-endian, and on 68K a struct cast would read those
 * bytes correctly by accident. That accident is the dangerous case: code that
 * casts passes on the target and fails on the host, or - worse - is only ever
 * exercised on the host, passes there for a different accidental reason, and
 * puts the wrong person's name on somebody's message on the board. So the
 * accessors are tested against BYTES SPELLED OUT IN HEX, which have exactly
 * one correct interpretation on every machine.
 *
 * The second is the three-way answer of a read. "Nothing left" and "half a
 * record left" are different facts about a file: the first ends a walk, the
 * second means the file is truncated. A 110-byte record store cannot tell them
 * apart from a byte count alone, so ae_dos_read_full answers 1/0/-1 and this
 * file holds it to that.
 *
 * No emulator, no BBS. C89.
 */

#include <stdio.h>
#include <string.h>

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
#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s\n", msg); } \
    tests_run++; \
} while (0)

/* The scratch file is a bare name, so it lands in whatever directory the test
 * is run from and the run does not depend on one. `build/ae_dos_scratch.bin`
 * was the first attempt and it only works when the cwd is sdk/c - which is
 * true under `make test` and false when a developer runs the binary directly,
 * where it produced seventeen failures that all said "write the scratch file"
 * and none of which were about the code under test.
 *
 * It is removed at the end of main() whether or not tests failed: a test that
 * leaves files behind makes the next run's result depend on this one's. */
static const char *SCRATCH = "ae_dos_scratch.bin";
static const char *ABSENT  = "ae_dos_definitely_not_here.bin";

static int put_file(const char *path, const unsigned char *bytes, long n)
{
    ae_file *f = ae_dos_open(path, AE_DOS_WRITE);
    long put;
    if (f == 0) return 0;
    put = ae_dos_write(f, bytes, n);
    ae_dos_close(f);
    return put == n;
}

/* ---- byte order -------------------------------------------------------- */

TEST(a_big_endian_long_reads_the_same_on_every_machine)
{
    /* 0x00010203 == 66051. On a little-endian host a struct cast would give
     * 0x03020100 == 50462976, which is the bug this test exists to catch. */
    unsigned char b[4];
    b[0] = 0x00; b[1] = 0x01; b[2] = 0x02; b[3] = 0x03;
    ASSERT_EQ(ae_dos_get_long(b), 66051L, "big-endian long");
}

TEST(a_negative_long_survives_a_64_bit_long)
{
    /* 0xFFFFFFFF is -1 as a 32-bit value. `long` is 64 bits on the host, so
     * without explicit sign extension this reads 4294967295 - a message date
     * that would sort after every other message forever. */
    unsigned char b[4];
    b[0] = 0xFF; b[1] = 0xFF; b[2] = 0xFF; b[3] = 0xFF;
    ASSERT_EQ(ae_dos_get_long(b), -1L, "sign-extended long");
}

TEST(a_big_endian_word_reads_the_same_on_every_machine)
{
    unsigned char b[2];
    b[0] = 0x01; b[1] = 0x02;
    ASSERT_EQ(ae_dos_get_word(b), 258, "big-endian word");
}

TEST(a_negative_word_survives)
{
    unsigned char b[2];
    b[0] = 0xFF; b[1] = 0xFE;
    ASSERT_EQ(ae_dos_get_word(b), -2, "sign-extended word");
}

TEST(what_is_written_is_what_is_read_back)
{
    unsigned char b[4];
    ae_dos_put_long(b, 123456789L);
    ASSERT_EQ(ae_dos_get_long(b), 123456789L, "long round trip");
}

TEST(a_written_long_is_big_endian_on_the_wire)
{
    /* Round-tripping through our own accessors proves consistency, not
     * correctness - a pair of functions that were both wrong the same way
     * would pass that. So the BYTES are checked. */
    unsigned char b[4];
    ae_dos_put_long(b, 66051L);
    ASSERT_TRUE(b[0] == 0x00 && b[1] == 0x01 && b[2] == 0x02 && b[3] == 0x03,
                "put_long must emit big-endian bytes");
}

TEST(a_written_word_is_big_endian_on_the_wire)
{
    unsigned char b[2];
    ae_dos_put_word(b, 258);
    ASSERT_TRUE(b[0] == 0x01 && b[1] == 0x02, "put_word must emit big-endian bytes");
}

/* ---- files ------------------------------------------------------------- */

TEST(a_file_round_trips_byte_for_byte)
{
    unsigned char out[8];
    unsigned char in[8];
    ae_file *f;
    long got;
    int i;

    for (i = 0; i < 8; i++) out[i] = (unsigned char)(i * 37);
    ASSERT_TRUE(put_file(SCRATCH, out, 8), "write the scratch file");

    f = ae_dos_open(SCRATCH, AE_DOS_READ);
    got = ae_dos_read(f, in, 8);
    ae_dos_close(f);

    ASSERT_EQ(got, 8L, "read back all 8 bytes");
    ASSERT_TRUE(memcmp(out, in, 8) == 0, "bytes must be identical");
}

TEST(size_does_not_move_the_position)
{
    /* The message reader asks for the size to count records, THEN reads record
     * zero. A size call that left the position at the end would silently make
     * the first record read come from the middle of the file. */
    unsigned char out[110];
    unsigned char first;
    ae_file *f;
    long size;

    memset(out, 0, sizeof out);
    out[0] = 'P';
    out[100] = 'X';
    put_file(SCRATCH, out, 110);

    f = ae_dos_open(SCRATCH, AE_DOS_READ);
    size = ae_dos_size(f);
    ASSERT_EQ(size, 110L, "size of a one-record file");
    ASSERT_EQ(ae_dos_tell(f), 0L, "position unchanged by size");
    ae_dos_read(f, &first, 1);
    ae_dos_close(f);
    ASSERT_EQ(first, 'P', "still reading from the start");
}

TEST(seek_reaches_a_record_by_index)
{
    /* This is exactly how the header walk addresses record N. */
    unsigned char out[330];
    unsigned char tag;
    ae_file *f;

    memset(out, 0, sizeof out);
    out[0] = 'a'; out[110] = 'b'; out[220] = 'c';
    put_file(SCRATCH, out, 330);

    f = ae_dos_open(SCRATCH, AE_DOS_READ);
    ASSERT_EQ(ae_dos_seek(f, 2 * 110, AE_DOS_SET), 0, "seek to record 2");
    ae_dos_read(f, &tag, 1);
    ae_dos_close(f);
    ASSERT_EQ(tag, 'c', "record 2 is where the arithmetic says");
}

TEST(seek_from_the_end_works)
{
    unsigned char out[10];
    unsigned char tag;
    ae_file *f;

    memset(out, 0, sizeof out);
    out[9] = 'z';
    put_file(SCRATCH, out, 10);

    f = ae_dos_open(SCRATCH, AE_DOS_READ);
    ASSERT_EQ(ae_dos_seek(f, -1, AE_DOS_END), 0, "seek one back from the end");
    ae_dos_read(f, &tag, 1);
    ae_dos_close(f);
    ASSERT_EQ(tag, 'z', "last byte");
}

TEST(read_full_reports_a_clean_end_of_file_as_zero)
{
    unsigned char out[4];
    unsigned char in[4];
    ae_file *f;
    int rc;

    memset(out, 1, sizeof out);
    put_file(SCRATCH, out, 4);

    f = ae_dos_open(SCRATCH, AE_DOS_READ);
    ASSERT_EQ(ae_dos_read_full(f, in, 4), 1, "the one whole record");
    rc = ae_dos_read_full(f, in, 4);   /* nothing left at all */
    ae_dos_close(f);
    ASSERT_EQ(rc, 0, "a clean end of file is 0, not an error");
}

TEST(read_full_reports_a_truncated_record_as_an_error)
{
    /* Six bytes where a four-byte record store expects a multiple of four:
     * the second read gets two bytes and must NOT report a record. */
    unsigned char out[6];
    unsigned char in[4];
    ae_file *f;
    int rc;

    memset(out, 2, sizeof out);
    put_file(SCRATCH, out, 6);

    f = ae_dos_open(SCRATCH, AE_DOS_READ);
    ae_dos_read_full(f, in, 4);
    rc = ae_dos_read_full(f, in, 4);
    ae_dos_close(f);
    ASSERT_EQ(rc, -1, "half a record is truncation, not an ending");
}

TEST(append_extends_rather_than_overwrites)
{
    /* The append bug that would eat a HeaderFile: MODE_READWRITE opens at the
     * START on AmigaOS, so a backend that forgot to seek would write the new
     * header over message one. */
    unsigned char out[4];
    unsigned char in[8];
    ae_file *f;

    out[0] = 'A'; out[1] = 'B'; out[2] = 'C'; out[3] = 'D';
    put_file(SCRATCH, out, 4);

    f = ae_dos_open(SCRATCH, AE_DOS_APPEND);
    ASSERT_TRUE(f != 0, "open for append");
    ae_dos_write(f, "EFGH", 4);
    ae_dos_close(f);

    f = ae_dos_open(SCRATCH, AE_DOS_READ);
    ae_dos_read(f, in, 8);
    ae_dos_close(f);
    ASSERT_TRUE(memcmp(in, "ABCDEFGH", 8) == 0, "append must not overwrite");
}

TEST(opening_something_that_is_not_there_is_null_not_a_crash)
{
    ASSERT_TRUE(ae_dos_open(ABSENT, AE_DOS_READ) == 0,
                "a missing file opens as NULL");
}

TEST(exists_answers_for_both_cases)
{
    unsigned char b = 1;
    put_file(SCRATCH, &b, 1);
    ASSERT_TRUE(ae_dos_exists(SCRATCH), "an existing file exists");
    ASSERT_TRUE(!ae_dos_exists(ABSENT), "a missing one does not");
}

TEST(the_handle_table_runs_out_rather_than_growing)
{
    /* Nothing allocates, so the fifth concurrent open must fail cleanly. A
     * door that leaks handles finds out here rather than on an Amiga with no
     * free memory. */
    ae_file *held[AE_DOS_MAX_OPEN];
    ae_file *one_too_many;
    unsigned char b = 1;
    int i;

    put_file(SCRATCH, &b, 1);
    for (i = 0; i < AE_DOS_MAX_OPEN; i++) held[i] = ae_dos_open(SCRATCH, AE_DOS_READ);
    one_too_many = ae_dos_open(SCRATCH, AE_DOS_READ);
    ASSERT_TRUE(one_too_many == 0, "the table is finite and says so");

    for (i = 0; i < AE_DOS_MAX_OPEN; i++) ae_dos_close(held[i]);
    /* And a slot is genuinely returned, not merely marked. */
    one_too_many = ae_dos_open(SCRATCH, AE_DOS_READ);
    ASSERT_TRUE(one_too_many != 0, "closing frees the slot again");
    ae_dos_close(one_too_many);
}

TEST(a_failed_open_does_not_consume_a_slot)
{
    ae_file *held[AE_DOS_MAX_OPEN];
    unsigned char b = 1;
    int i;

    put_file(SCRATCH, &b, 1);
    for (i = 0; i < AE_DOS_MAX_OPEN + 3; i++) {
        ae_dos_open(ABSENT, AE_DOS_READ);
    }
    /* If a failed open had taken a slot, this would already be empty. */
    for (i = 0; i < AE_DOS_MAX_OPEN; i++) held[i] = ae_dos_open(SCRATCH, AE_DOS_READ);
    ASSERT_TRUE(held[AE_DOS_MAX_OPEN - 1] != 0, "all four slots still available");
    for (i = 0; i < AE_DOS_MAX_OPEN; i++) ae_dos_close(held[i]);
}

TEST(null_and_nonsense_arguments_are_refused_not_dereferenced)
{
    unsigned char b[4];
    ASSERT_TRUE(ae_dos_open(0, AE_DOS_READ) == 0, "NULL path");
    ASSERT_TRUE(ae_dos_open("build/x", 99) == 0, "unknown mode");
    ASSERT_EQ(ae_dos_read(0, b, 4), -1L, "read from NULL");
    ASSERT_EQ(ae_dos_write(0, b, 4), -1L, "write to NULL");
    ASSERT_EQ(ae_dos_seek(0, 0, AE_DOS_SET), -1, "seek on NULL");
    ASSERT_EQ(ae_dos_size(0), -1L, "size of NULL");
    ASSERT_EQ(ae_dos_read_full(0, b, 4), -1, "read_full from NULL");
    ae_dos_close(0);   /* must simply return */
    ASSERT_TRUE(1, "closing NULL is harmless");
}

int main(void)
{
    printf("\n====== File Layer Tests ======\n\n");

    RUN_TEST(a_big_endian_long_reads_the_same_on_every_machine);
    RUN_TEST(a_negative_long_survives_a_64_bit_long);
    RUN_TEST(a_big_endian_word_reads_the_same_on_every_machine);
    RUN_TEST(a_negative_word_survives);
    RUN_TEST(what_is_written_is_what_is_read_back);
    RUN_TEST(a_written_long_is_big_endian_on_the_wire);
    RUN_TEST(a_written_word_is_big_endian_on_the_wire);
    RUN_TEST(a_file_round_trips_byte_for_byte);
    RUN_TEST(size_does_not_move_the_position);
    RUN_TEST(seek_reaches_a_record_by_index);
    RUN_TEST(seek_from_the_end_works);
    RUN_TEST(read_full_reports_a_clean_end_of_file_as_zero);
    RUN_TEST(read_full_reports_a_truncated_record_as_an_error);
    RUN_TEST(append_extends_rather_than_overwrites);
    RUN_TEST(opening_something_that_is_not_there_is_null_not_a_crash);
    RUN_TEST(exists_answers_for_both_cases);
    RUN_TEST(the_handle_table_runs_out_rather_than_growing);
    RUN_TEST(a_failed_open_does_not_consume_a_slot);
    RUN_TEST(null_and_nonsense_arguments_are_refused_not_dereferenced);

    ae_dos_delete(SCRATCH);

    printf("\n%d run, %d passed, %d failed\n\n", tests_run, tests_passed, tests_failed);
    return tests_failed == 0 ? 0 : 1;
}
