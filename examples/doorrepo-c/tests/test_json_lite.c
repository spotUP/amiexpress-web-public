/* test_json_lite.c - tests for json_lite.c/h: the narrow JSON extractor
 * used against the DoorRepo admin API (login token, submissions list).
 *
 * The adversarial/malformed-input cases in this file matter more than the
 * happy-path ones: json_lite.c's own file header explains why (this is
 * the same "unbounded response body" risk class documented in README.md's
 * Security section, replayed against a new parser). Every truncation
 * case below is checked with valgrind-free reasoning in mind - a clean,
 * bounded failure return, never a crash and never an infinite scan. No
 * blessed/door/network dependencies - links only json_lite.c.
 */

#include <stdio.h>
#include <string.h>
#include "../json_lite.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-55s ", #name); fflush(stdout); test_##name(); } while (0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((got) == (expected)) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got %ld, expected %ld)\n", msg, (long) (got), (long) (expected)); \
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

/* ---------------------------------------------------------------------
 * json_extract_string - happy path
 * ------------------------------------------------------------------- */

TEST(extract_string_finds_token_in_wellformed_login_response)
{
    char out[64];
    int rc = json_extract_string(
        "{\"token\":\"abc123XYZ\",\"userId\":42}", "token", out, sizeof(out));
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_STR_EQ(out, "abc123XYZ", "extracted token");
}

TEST(extract_string_finds_field_in_shallow_nested_object)
{
    char out[64];
    /* Not a shape this door needs today, but the contract promises "flat
     * or nested" scanning without depth tracking - a unique key still
     * has to be found regardless of what wraps it. */
    int rc = json_extract_string(
        "{\"meta\":{\"archiveName\":\"AETRIV10.LHA\"}}", "archiveName", out, sizeof(out));
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_STR_EQ(out, "AETRIV10.LHA", "extracted archiveName");
}

TEST(extract_string_empty_value_succeeds)
{
    char out[16];
    int rc = json_extract_string("{\"note\":\"\"}", "note", out, sizeof(out));
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_STR_EQ(out, "", "empty string value");
}

TEST(extract_string_handles_basic_escapes)
{
    char out[64];
    int rc = json_extract_string(
        "{\"desc\":\"a\\\"b\\\\c\\/d\\ne\\tf\\rg\"}", "desc", out, sizeof(out));
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_STR_EQ(out, "a\"b\\c/d\ne\tf\rg", "all six escapes decoded");
}

TEST(extract_string_handles_u_escape_low_byte)
{
    char out[16];
    /* \u0041 == 'A'; this door treats a \uXXXX code point above 0xFF as
     * truncated to its low byte (Latin-1-everywhere assumption - see
     * json_lite.h), so this only exercises the in-range case. */
    int rc = json_extract_string("{\"k\":\"\\u0041BC\"}", "k", out, sizeof(out));
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_STR_EQ(out, "ABC", "\\u0041 decoded to 'A'");
}

/* ---------------------------------------------------------------------
 * json_extract_string - absent key / wrong type
 * ------------------------------------------------------------------- */

TEST(extract_string_key_absent_returns_failure)
{
    char out[16] = "unchanged";
    int rc = json_extract_string("{\"id\":1,\"ok\":true}", "token", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero on absent key");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(extract_string_key_name_inside_unrelated_value_does_not_falsematch)
{
    char out[32] = "unchanged";
    /* "token" appears only INSIDE the note field's own string content -
     * this must not be mistaken for a real "token" key. */
    int rc = json_extract_string(
        "{\"note\":\"the token field matters\",\"status\":\"pending\"}",
        "token", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: token is not a real key here");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(extract_string_refuses_non_string_value_type)
{
    char out[16] = "unchanged";
    /* "ok" is a bare boolean, not a string - json_extract_string must
     * refuse rather than hand back "true" as if it were quoted text. */
    int rc = json_extract_string("{\"ok\":true}", "ok", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: value is not a JSON string");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

/* ---------------------------------------------------------------------
 * json_extract_string - truncated / malformed adversarial input
 * ------------------------------------------------------------------- */

TEST(extract_string_truncated_mid_value_fails_cleanly)
{
    char out[16] = "unchanged";
    /* Cut in the middle of the value, no closing quote at all. */
    int rc = json_extract_string("{\"token\":\"abc", "token", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: truncated mid-value");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(extract_string_truncated_mid_object_fails_cleanly)
{
    char out[16] = "unchanged";
    /* Cut in the middle of the KEY name itself - no closing quote for
     * the key, so json_find_value() must report "not found", not crash
     * scanning past the truncation. */
    int rc = json_extract_string("{\"id\":1,\"archiveNam", "archiveName", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: truncated mid-object");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(extract_string_unterminated_string_before_key_fails_cleanly)
{
    char out[16] = "unchanged";
    /* An unterminated string appears BEFORE the key being searched for -
     * the scanner must not spin past end-of-input trying to close it. */
    int rc = json_extract_string("{\"junk\":\"never closes", "token", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: unterminated string upstream of the key");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(extract_string_truncated_escape_sequence_fails_cleanly)
{
    char out[16] = "unchanged";
    /* Value cut off immediately after a lone backslash. */
    int rc = json_extract_string("{\"token\":\"abc\\", "token", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: truncated escape");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(extract_string_truncated_u_escape_fails_cleanly)
{
    char out[16] = "unchanged";
    int rc = json_extract_string("{\"token\":\"abc\\u12", "token", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: truncated \\u escape");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(extract_string_refuses_when_value_would_not_fit_outcap)
{
    char out[4] = "xyz";
    int rc = json_extract_string("{\"token\":\"abcdefgh\"}", "token", out, sizeof(out));
    ASSERT_TRUE(rc != 0, "non-zero: value longer than outcap");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure, never truncated");
}

TEST(extract_string_refuses_null_args)
{
    char out[16] = "unchanged";
    ASSERT_TRUE(json_extract_string((const char *) 0, "k", out, sizeof(out)) != 0, "NULL json");
    ASSERT_TRUE(json_extract_string("{}", (const char *) 0, out, sizeof(out)) != 0, "NULL key");
    ASSERT_TRUE(json_extract_string("{}", "k", (char *) 0, sizeof(out)) != 0, "NULL out");
    ASSERT_TRUE(json_extract_string("{}", "k", out, 0) != 0, "zero outcap");
}

/* ---------------------------------------------------------------------
 * json_extract_bool
 * ------------------------------------------------------------------- */

TEST(extract_bool_true_reads_as_one)
{
    int out = -1;
    int rc = json_extract_bool("{\"ok\":true}", "ok", &out);
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_EQ(out, 1, "true -> 1");
}

TEST(extract_bool_false_reads_as_zero)
{
    int out = -1;
    int rc = json_extract_bool("{\"ok\":false}", "ok", &out);
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_EQ(out, 0, "false -> 0");
}

TEST(extract_bool_reads_bare_numeric_field)
{
    int out = -1;
    int rc = json_extract_bool("{\"archiveName\":\"X\",\"size\":12345}", "size", &out);
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_EQ(out, 12345, "numeric field value");
}

TEST(extract_bool_reads_negative_number)
{
    int out = 0;
    int rc = json_extract_bool("{\"delta\":-7}", "delta", &out);
    ASSERT_EQ(rc, 0, "return code");
    ASSERT_EQ(out, -7, "negative numeric field value");
}

TEST(extract_bool_key_absent_fails)
{
    int out = -99;
    int rc = json_extract_bool("{\"other\":1}", "ok", &out);
    ASSERT_TRUE(rc != 0, "non-zero on absent key");
    ASSERT_EQ(out, -99, "*out left untouched on failure");
}

TEST(extract_bool_rejects_string_value)
{
    int out = -99;
    int rc = json_extract_bool("{\"ok\":\"true\"}", "ok", &out);
    ASSERT_TRUE(rc != 0, "non-zero: a quoted string is not a bool/number");
    ASSERT_EQ(out, -99, "*out left untouched on failure");
}

TEST(extract_bool_rejects_garbled_token)
{
    int out = -99;
    /* "trueish" must not be read as boolean true via a prefix match. */
    int rc = json_extract_bool("{\"ok\":trueish}", "ok", &out);
    ASSERT_TRUE(rc != 0, "non-zero: not the literal token true/false");
    ASSERT_EQ(out, -99, "*out left untouched on failure");
}

TEST(extract_bool_rejects_number_with_trailing_garbage)
{
    int out = -99;
    int rc = json_extract_bool("{\"size\":123abc}", "size", &out);
    ASSERT_TRUE(rc != 0, "non-zero: not a clean numeric token");
    ASSERT_EQ(out, -99, "*out left untouched on failure");
}

/* ---------------------------------------------------------------------
 * json_next_array_object
 * ------------------------------------------------------------------- */

TEST(array_zero_rows_returns_end_immediately)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    int rc = json_next_array_object("{\"rows\":[]}", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: empty array has no objects");
}

/* --- Important #2 (task review): anchoring to array_key, not the first
 * array-of-objects found anywhere in the document --- */

TEST(array_key_anchors_to_named_array_not_first_array_in_document)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    char row[64];
    int id_val = -1;
    int rc;

    /* A "filters" array of objects appears BEFORE "rows" - the fix must
     * anchor to "rows" specifically, not to the first array-of-objects
     * found anywhere in the document (a prior draft of this function
     * would have returned {"a":1} here instead of the real row). */
    rc = json_next_array_object(
        "{\"filters\":[{\"a\":1}],\"rows\":[{\"id\":42}]}",
        "rows", &cursor, &obj_start, &obj_len);
    ASSERT_EQ(rc, 0, "finds the row inside \"rows\", not \"filters\"");
    if (rc == 0) {
        memcpy(row, obj_start, (size_t) obj_len);
        row[obj_len] = '\0';
        ASSERT_EQ(json_extract_bool(row, "id", &id_val), 0, "id extracted");
        ASSERT_EQ(id_val, 42, "id is the \"rows\" row's id, not \"filters\"'s");
    }
}

TEST(array_key_absent_fails_cleanly)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    int rc = json_next_array_object(
        "{\"other\":[{\"a\":1}]}", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: array_key not present in the document");
}

TEST(array_key_present_but_not_an_array_fails_cleanly)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    int rc = json_next_array_object(
        "{\"rows\":\"not an array\"}", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: array_key's value is not a JSON array");
}

/* --- Important #1 (task review): refuse rather than guess when the
 * replay pass cannot fully reconstruct context within the scan cap --- */

TEST(array_cursor_past_scan_cap_refuses_rather_than_guessing)
{
    /* This door's own real catalog is documented at ~442KB, well over
     * JSON_LITE_MAX_SCAN_BYTES (64KB) - build an array with enough
     * padding rows before the target that resuming at a cursor near the
     * scan-cap boundary requires the replay pass to reconstruct more
     * context than its budget allows, and confirm the function REFUSES
     * at exactly that boundary instead of silently proceeding with a
     * bracket-depth reconstruction that never finished (the failure mode
     * a prior review round found: memory-safe, but capable of
     * mis-identifying a row - and a sysop approving/rejecting a
     * submission by the wrong id).
     *
     * Uses two adjacent row indices straddling the exact boundary
     * (found empirically against this fixture and asserted precisely
     * rather than loosely, so a regression in the cap's off-by-one
     * behaviour is caught): row 7281 (replay length 65529 bytes, just
     * inside JSON_LITE_MAX_SCAN_BYTES) still succeeds and returns
     * correct data; row 7282 (replay length 65538, just past it)
     * refuses. Both cursors are handed in directly, exactly as a real
     * caller resuming from an earlier successful call's returned cursor
     * would. */
    static char big[90000];
    unsigned long pos;
    int i;
    unsigned long cursor;
    const char *obj_start;
    unsigned long obj_len;
    int rc;
    char row[16];

    strcpy(big, "{\"rows\":[");
    pos = (unsigned long) strlen(big);
    /* 8000 * 9 bytes == 72000 bytes of padding rows, comfortably
     * straddling the 64KB scan-cap boundary before the array closes. */
    for (i = 0; i < 8000; i++) {
        memcpy(big + pos, "{\"id\":1},", 9);
        pos += 9;
    }
    strcpy(big + pos, "{\"id\":999}]}");

    /* Row 7281 starts at byte 9 + 9*7281 = 65538 - still within budget. */
    cursor = 65538UL;
    rc = json_next_array_object(big, "rows", &cursor, &obj_start, &obj_len);
    ASSERT_EQ(rc, 0, "row just inside the scan-cap boundary still succeeds");
    if (rc == 0) {
        ASSERT_TRUE(obj_len < sizeof(row), "row fits scratch buffer");
        memcpy(row, obj_start, (size_t) obj_len);
        row[obj_len] = '\0';
        ASSERT_STR_EQ(row, "{\"id\":1}", "returns the CORRECT row, not garbage");
    }

    /* Row 7282 starts at byte 9 + 9*7282 = 65547 - one row further, now
     * requiring the replay pass to reconstruct past the scan cap. */
    cursor = 65547UL;
    rc = json_next_array_object(big, "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0,
                "non-zero: refuses rather than reconstructing depth past the scan cap");
}

TEST(array_one_row_fields_extracted_and_scan_ends)
{
    static const char *json =
        "{\"rows\":[{\"id\":1,\"archiveName\":\"AETRIV10.LHA\",\"size\":4096,"
        "\"md5\":\"deadbeef\",\"note\":\"ok\"}]}";
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    char row[256];
    char field[64];
    int size_val = -1;
    int rc;

    rc = json_next_array_object(json, "rows", &cursor, &obj_start, &obj_len);
    ASSERT_EQ(rc, 0, "first call finds the one row");
    if (rc == 0) {
        /* obj_start/obj_len are only meaningful when rc == 0 - this
         * harness records a failed ASSERT_EQ and keeps running the rest
         * of the test function, so guard every later use of them on the
         * call that actually produced them (a real crash caught while
         * proving this test fails against a stub implementation - see
         * task-4-report.md's TDD/RED section). */
        ASSERT_TRUE(obj_len < sizeof(row), "row fits the test's scratch buffer");
        memcpy(row, obj_start, (size_t) obj_len);
        row[obj_len] = '\0';

        ASSERT_EQ(json_extract_string(row, "archiveName", field, sizeof(field)), 0,
                  "archiveName extracted from the row slice");
        ASSERT_STR_EQ(field, "AETRIV10.LHA", "archiveName value");
        ASSERT_EQ(json_extract_string(row, "md5", field, sizeof(field)), 0,
                  "md5 extracted from the row slice");
        ASSERT_STR_EQ(field, "deadbeef", "md5 value");
        ASSERT_EQ(json_extract_bool(row, "size", &size_val), 0,
                  "size extracted from the row slice");
        ASSERT_EQ(size_val, 4096, "size value");
    }

    /* Second call: no more rows. */
    rc = json_next_array_object(json, "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: no second row");
}

TEST(array_three_rows_cursor_advances_correctly)
{
    static const char *json =
        "{\"rows\":["
        "{\"id\":1},"
        "{\"id\":2},"
        "{\"id\":3}"
        "]}";
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    char row[64];
    int id_val;
    int i;
    int expected[3];
    expected[0] = 1;
    expected[1] = 2;
    expected[2] = 3;

    for (i = 0; i < 3; i++) {
        int rc = json_next_array_object(json, "rows", &cursor, &obj_start, &obj_len);
        ASSERT_EQ(rc, 0, "row found");
        if (rc != 0) {
            break; /* obj_start/obj_len are not meaningful on failure */
        }
        ASSERT_TRUE(obj_len < sizeof(row), "row fits scratch buffer");
        memcpy(row, obj_start, (size_t) obj_len);
        row[obj_len] = '\0';
        id_val = -1;
        ASSERT_EQ(json_extract_bool(row, "id", &id_val), 0, "id extracted");
        ASSERT_EQ(id_val, expected[i], "id value in order");
    }

    {
        int rc = json_next_array_object(json, "rows", &cursor, &obj_start, &obj_len);
        ASSERT_TRUE(rc != 0, "non-zero: exactly three rows, no fourth");
    }
}

TEST(array_nested_derived_object_does_not_end_row_early)
{
    static const char *json =
        "{\"rows\":["
        "{\"id\":1,\"derived\":{\"x\":1,\"nested\":{\"y\":2}},\"archiveName\":\"A.LHA\"},"
        "{\"id\":2,\"archiveName\":\"B.LHA\"}"
        "]}";
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    char row[256];
    char field[64];
    int rc;

    /* First row: the nested "derived" object (itself carrying a further
     * nested object) must be walked through, not mistaken for the row's
     * own closing brace. */
    rc = json_next_array_object(json, "rows", &cursor, &obj_start, &obj_len);
    ASSERT_EQ(rc, 0, "first row found");
    if (rc == 0) {
        memcpy(row, obj_start, (size_t) obj_len);
        row[obj_len] = '\0';
        ASSERT_EQ(json_extract_string(row, "archiveName", field, sizeof(field)), 0,
                  "archiveName survives past the nested derived object");
        ASSERT_STR_EQ(field, "A.LHA", "first row's archiveName");
    }

    /* The cursor must land on the object AFTER the nested-brace row, not
     * somewhere inside it. */
    rc = json_next_array_object(json, "rows", &cursor, &obj_start, &obj_len);
    ASSERT_EQ(rc, 0, "second row found, cursor advanced past the nested row cleanly");
    if (rc == 0) {
        memcpy(row, obj_start, (size_t) obj_len);
        row[obj_len] = '\0';
        ASSERT_EQ(json_extract_string(row, "archiveName", field, sizeof(field)), 0,
                  "archiveName extracted from second row");
        ASSERT_STR_EQ(field, "B.LHA", "second row's archiveName");
    }

    rc = json_next_array_object(json, "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: no third row");
}

TEST(array_truncated_mid_object_fails_cleanly)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    /* Cut off partway through the first row, no closing brace anywhere. */
    int rc = json_next_array_object(
        "{\"rows\":[{\"id\":1,\"archiveNam", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: truncated mid-object, not a crash or hang");
}

TEST(array_unterminated_string_inside_row_fails_cleanly)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    int rc = json_next_array_object(
        "{\"rows\":[{\"id\":1,\"note\":\"never closes}]}", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: unterminated string, not a crash or hang");
}

TEST(array_mismatched_brackets_fail_cleanly)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    int rc;
    /* '[' closed with '}' instead of ']' - malformed on purpose. The one
     * complete row still parses on the first call (the mismatch sits
     * further out, past the row's own closing brace); it is the SECOND
     * call, reaching the array's own bad closer, that must fail. */
    rc = json_next_array_object("{\"rows\":[{\"id\":1}}", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_EQ(rc, 0, "first call still finds the one well-formed row");

    rc = json_next_array_object("{\"rows\":[{\"id\":1}}", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: second call hits the mismatched bracket");
}

TEST(array_cursor_past_end_of_buffer_fails_cleanly)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 999;
    int rc = json_next_array_object("{\"rows\":[]}", "rows", &cursor, &obj_start, &obj_len);
    ASSERT_TRUE(rc != 0, "non-zero: cursor beyond the buffer's own length");
}

TEST(array_refuses_null_args)
{
    const char *obj_start;
    unsigned long obj_len;
    unsigned long cursor = 0;
    ASSERT_TRUE(json_next_array_object(
                    (const char *) 0, "rows", &cursor, &obj_start, &obj_len) != 0,
                "NULL json");
    ASSERT_TRUE(json_next_array_object(
                    "{}", (const char *) 0, &cursor, &obj_start, &obj_len) != 0,
                "NULL array_key");
    ASSERT_TRUE(json_next_array_object("{}", "", &cursor, &obj_start, &obj_len) != 0,
                "empty array_key");
    ASSERT_TRUE(json_next_array_object(
                    "{}", "rows", (unsigned long *) 0, &obj_start, &obj_len) != 0,
                "NULL cursor");
    ASSERT_TRUE(json_next_array_object(
                    "{}", "rows", &cursor, (const char **) 0, &obj_len) != 0,
                "NULL obj_start");
    ASSERT_TRUE(json_next_array_object(
                    "{}", "rows", &cursor, &obj_start, (unsigned long *) 0) != 0,
                "NULL obj_len");
}

/* ---------------------------------------------------------------------
 * "derived" sub-object collision (Important #3, task review) - the
 * danger json_lite.h documents, and the required caller mitigation.
 * ------------------------------------------------------------------- */

TEST(extract_bool_derived_subobject_can_shadow_a_same_named_field_without_mitigation)
{
    /* Demonstrates the exact collision documented in json_lite.h: with no
     * mitigation applied, a row whose "derived" sub-object happens to
     * carry its own "size" field (plausible real content - metadata
     * about a derived/processed version of the archive) shadows the
     * row's own top-level "size", because "derived" appears earlier in
     * this row's text and json_extract_bool() does not track nesting.
     * This test is NOT proving correct behaviour - it is proving the
     * documented danger is real, so the mitigation test right after it
     * means something. */
    static const char *row =
        "{\"id\":1,\"derived\":{\"size\":999},\"size\":4096}";
    int size_val = -1;
    int rc = json_extract_bool(row, "size", &size_val);
    ASSERT_EQ(rc, 0, "return code (a match IS found - just the wrong one)");
    ASSERT_EQ(size_val, 999,
              "WITHOUT mitigation, derived's size wins - this is the danger, not the fix");
}

TEST(extract_bool_derived_subobject_mitigation_recovers_safely)
{
    /* The documented mitigation from json_lite.h: locate "derived" in the
     * row's own copied buffer and truncate there before extracting -
     * proving the guidance actually works when followed. The truncated
     * slice no longer contains ANY of derived's own fields, so the
     * dangerous wrong-value match from the test above becomes a clean
     * "absent" instead - fail-safe (unreadable) rather than fail-unsafe
     * (silently wrong), which is the actual property this mitigation is
     * required to provide. */
    char row[128] = "{\"id\":1,\"derived\":{\"size\":999},\"size\":4096}";
    char *derived_marker = strstr(row, "\"derived\"");
    int size_val = -1;
    int rc;
    int id_val = -1;
    int id_rc;

    ASSERT_TRUE(derived_marker != (char *) 0, "test fixture actually contains \"derived\"");
    if (derived_marker != (char *) 0) {
        *derived_marker = '\0'; /* truncate the row slice right there */
    }

    rc = json_extract_bool(row, "size", &size_val);
    ASSERT_TRUE(rc != 0,
                "non-zero: \"size\" (which lived inside derived's shadow) is now absent, not wrong");

    /* "id" appears BEFORE "derived" in this row, so the mitigation must
     * not have thrown away fields the row actually needs. */
    id_rc = json_extract_bool(row, "id", &id_val);
    ASSERT_EQ(id_rc, 0, "id still extractable after truncation");
    ASSERT_EQ(id_val, 1, "id value survives the truncation");
}

/* ---------------------------------------------------------------------
 * json_build_login_body
 * ------------------------------------------------------------------- */

TEST(build_login_body_basic_shape)
{
    char out[128];
    int n = json_build_login_body(out, sizeof(out), "sysop", "hunter2");
    ASSERT_TRUE(n > 0, "positive length returned");
    ASSERT_STR_EQ(out, "{\"username\":\"sysop\",\"password\":\"hunter2\"}", "built body");
    ASSERT_EQ((unsigned long) n, strlen(out), "returned length matches strlen(out)");
}

TEST(build_login_body_escapes_quote_and_backslash)
{
    char out[128];
    int n = json_build_login_body(out, sizeof(out), "us\"er", "pa\\ss");
    ASSERT_TRUE(n > 0, "positive length returned");
    ASSERT_STR_EQ(out, "{\"username\":\"us\\\"er\",\"password\":\"pa\\\\ss\"}",
                  "quote and backslash escaped");
}

TEST(build_login_body_roundtrips_through_extract_string)
{
    char out[128];
    char decoded_user[32];
    char decoded_pass[32];
    int n;

    /* The exact adversarial pairing the brief calls out: a password
     * containing BOTH a double quote and a backslash must survive a
     * build -> extract round trip byte-for-byte - proving the escape and
     * the unescape are actually inverse operations, not just each
     * "looking right" in isolation. */
    n = json_build_login_body(out, sizeof(out), "a\"b\\c", "p\\\"w\"o\\rd");
    ASSERT_TRUE(n > 0, "positive length returned");

    ASSERT_EQ(json_extract_string(out, "username", decoded_user, sizeof(decoded_user)), 0,
              "username decodes back out");
    ASSERT_STR_EQ(decoded_user, "a\"b\\c", "username round-trips exactly");

    ASSERT_EQ(json_extract_string(out, "password", decoded_pass, sizeof(decoded_pass)), 0,
              "password decodes back out");
    ASSERT_STR_EQ(decoded_pass, "p\\\"w\"o\\rd", "password round-trips exactly");
}

TEST(build_login_body_refuses_when_buffer_too_small)
{
    char out[8] = "xyz";
    int n = json_build_login_body(out, sizeof(out), "sysop", "hunter2");
    ASSERT_TRUE(n < 0, "negative: does not fit outcap");
    ASSERT_STR_EQ(out, "", "out cleared to empty on failure");
}

TEST(build_login_body_refuses_null_args)
{
    char out[64] = "xyz";
    ASSERT_TRUE(json_build_login_body((char *) 0, sizeof(out), "a", "b") < 0, "NULL out");
    ASSERT_TRUE(json_build_login_body(out, sizeof(out), (const char *) 0, "b") < 0, "NULL username");
    ASSERT_STR_EQ(out, "", "out cleared even for the NULL-username case");
    ASSERT_TRUE(json_build_login_body(out, sizeof(out), "a", (const char *) 0) < 0, "NULL password");
}

int main(void)
{
    RUN_TEST(extract_string_finds_token_in_wellformed_login_response);
    RUN_TEST(extract_string_finds_field_in_shallow_nested_object);
    RUN_TEST(extract_string_empty_value_succeeds);
    RUN_TEST(extract_string_handles_basic_escapes);
    RUN_TEST(extract_string_handles_u_escape_low_byte);

    RUN_TEST(extract_string_key_absent_returns_failure);
    RUN_TEST(extract_string_key_name_inside_unrelated_value_does_not_falsematch);
    RUN_TEST(extract_string_refuses_non_string_value_type);

    RUN_TEST(extract_string_truncated_mid_value_fails_cleanly);
    RUN_TEST(extract_string_truncated_mid_object_fails_cleanly);
    RUN_TEST(extract_string_unterminated_string_before_key_fails_cleanly);
    RUN_TEST(extract_string_truncated_escape_sequence_fails_cleanly);
    RUN_TEST(extract_string_truncated_u_escape_fails_cleanly);
    RUN_TEST(extract_string_refuses_when_value_would_not_fit_outcap);
    RUN_TEST(extract_string_refuses_null_args);

    RUN_TEST(extract_bool_true_reads_as_one);
    RUN_TEST(extract_bool_false_reads_as_zero);
    RUN_TEST(extract_bool_reads_bare_numeric_field);
    RUN_TEST(extract_bool_reads_negative_number);
    RUN_TEST(extract_bool_key_absent_fails);
    RUN_TEST(extract_bool_rejects_string_value);
    RUN_TEST(extract_bool_rejects_garbled_token);
    RUN_TEST(extract_bool_rejects_number_with_trailing_garbage);

    RUN_TEST(array_zero_rows_returns_end_immediately);
    RUN_TEST(array_key_anchors_to_named_array_not_first_array_in_document);
    RUN_TEST(array_key_absent_fails_cleanly);
    RUN_TEST(array_key_present_but_not_an_array_fails_cleanly);
    RUN_TEST(array_cursor_past_scan_cap_refuses_rather_than_guessing);
    RUN_TEST(array_one_row_fields_extracted_and_scan_ends);
    RUN_TEST(array_three_rows_cursor_advances_correctly);
    RUN_TEST(array_nested_derived_object_does_not_end_row_early);
    RUN_TEST(array_truncated_mid_object_fails_cleanly);
    RUN_TEST(array_unterminated_string_inside_row_fails_cleanly);
    RUN_TEST(array_mismatched_brackets_fail_cleanly);
    RUN_TEST(array_cursor_past_end_of_buffer_fails_cleanly);
    RUN_TEST(array_refuses_null_args);

    RUN_TEST(extract_bool_derived_subobject_can_shadow_a_same_named_field_without_mitigation);
    RUN_TEST(extract_bool_derived_subobject_mitigation_recovers_safely);

    RUN_TEST(build_login_body_basic_shape);
    RUN_TEST(build_login_body_escapes_quote_and_backslash);
    RUN_TEST(build_login_body_roundtrips_through_extract_string);
    RUN_TEST(build_login_body_refuses_when_buffer_too_small);
    RUN_TEST(build_login_body_refuses_null_args);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return tests_failed > 0 ? 1 : 0;
}
