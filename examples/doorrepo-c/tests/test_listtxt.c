/* test_listtxt.c - unit tests for the list.txt parser.
 *
 * C89. Run natively:
 *   cc -std=c89 -Wall -Wextra -pedantic \
 *       examples/doorrepo-c/listtxt.c examples/doorrepo-c/tests/test_listtxt.c \
 *       -o /tmp/test_listtxt && /tmp/test_listtxt
 *
 * Exits 0 and prints "ALL TESTS PASSED" if every assertion holds; exits 1
 * and prints which check failed otherwise.
 *
 * Fixtures: the header and the ABS-PLC2.LHA row below are REAL bytes -
 * not hand-guessed. The header's revision/count come from the live
 * capture recorded in docs/DOOR-REPO-API.md (section 2 and the /health
 * example, both captured against the running server on 2026-08-17,
 * doors:3301). The ABS-PLC2.LHA row was captured by running the actual
 * production door-repo-manifest.ts (buildManifest + renderListTxt)
 * against this checkout's real database.sqlite (the same 3301-row
 * door_catalog table the live site serves from - verified by matching
 * row count) filtered to door_type='DD', then hex-dumping the bytes; see
 * .superpowers/sdd/2026-08-17-doorrepo-c-client/task-2-report.md for the
 * exact capture transcript. Its description field is a real example of
 * the server's pipe-escaping rule: the raw catalog description contains
 * literal '|' characters (ASCII-art slashes), each replaced with '!'
 * before the row was assembled - this parser must NOT unescape them
 * back, so the '!' bytes below are expected to survive verbatim.
 *
 * The empty-md5, seven-field, malformed, oversized-field, and
 * trailing-CR fixtures are synthetic by necessity: the live 3301-row
 * catalog currently has no row with an empty digest, no seventh field
 * (append-only promise, not yet exercised), no malformed row, and no
 * field anywhere near this parser's destination buffer sizes (real
 * corpus max `name` length is 44 chars per the format doc) - these
 * fixtures exist to prove the parser's defensive behavior for shapes the
 * real catalog does not currently produce but the format contract
 * requires it to tolerate or reject.
 */

#include <stdio.h>
#include <string.h>
#include "../listtxt.h"

static int failures = 0;

#define CHECK(label, cond) \
    do { \
        if (cond) { \
            printf("PASS %s\n", label); \
        } else { \
            printf("FAIL %s\n", label); \
            failures++; \
        } \
    } while (0)

static void fill_char(char *buf, char c, unsigned long n)
{
    unsigned long i;
    for (i = 0; i < n; i++) {
        buf[i] = c;
    }
    buf[n] = '\0';
}

/* Real header line: DOORREPO|1|<revision>|<count>, revision and count
 * taken from the live capture in docs/DOOR-REPO-API.md. */
static void test_header_real(void)
{
    const char *line =
        "DOORREPO|1|a2d8b215ec846fc13b80cb037b9df0c541b848fc|3301";
    int format_version = -1;
    char revision[64];
    unsigned long count = 0;
    int rc;

    rc = listtxt_parse_header(line, &format_version, revision, sizeof(revision), &count);

    CHECK("header real: returns 0", rc == 0);
    CHECK("header real: format_version == 1", format_version == 1);
    CHECK("header real: revision matches",
          strcmp(revision, "a2d8b215ec846fc13b80cb037b9df0c541b848fc") == 0);
    CHECK("header real: count == 3301", count == 3301UL);
}

/* Synthetic: format_version and count are the header's own "authority
 * for what fields to expect" (DOOR-REPO-API.md section 3) and its row
 * count, not optional/best-effort data like archiveSize - a garbled
 * value here must fail the whole header, never silently become 0. Each
 * sub-case uses a syntactically-plausible but non-numeric or empty
 * field in the position under test, keeping the other three fields
 * valid so a failure can only be attributed to the field under test. */
static void test_header_malformed(void)
{
    int format_version;
    char revision[64];
    unsigned long count;
    int rc;

    format_version = -1;
    count = 0;
    rc = listtxt_parse_header("DOORREPO|abc|somerev|3301", &format_version,
                               revision, sizeof(revision), &count);
    CHECK("header malformed: non-numeric format_version returns non-zero", rc != 0);

    format_version = -1;
    count = 0;
    rc = listtxt_parse_header("DOORREPO||somerev|3301", &format_version,
                               revision, sizeof(revision), &count);
    CHECK("header malformed: empty format_version returns non-zero", rc != 0);

    format_version = -1;
    count = 0;
    rc = listtxt_parse_header("DOORREPO|1|somerev|notanumber", &format_version,
                               revision, sizeof(revision), &count);
    CHECK("header malformed: non-numeric count returns non-zero", rc != 0);

    format_version = -1;
    count = 0;
    rc = listtxt_parse_header("DOORREPO|1|somerev|", &format_version,
                               revision, sizeof(revision), &count);
    CHECK("header malformed: empty count returns non-zero", rc != 0);

    format_version = -1;
    count = 0;
    rc = listtxt_parse_header("DOORREPO|1x|somerev|3301", &format_version,
                               revision, sizeof(revision), &count);
    CHECK("header malformed: format_version with trailing garbage ('1x') returns non-zero", rc != 0);
}

/* Real data row, captured as described in the file header comment.
 * Exercises: every field decodes correctly (including size as a
 * number), AND the description's '!' bytes (server-escaped pipes) stay
 * literal - this parser never unescapes them. */
static void test_row_real(void)
{
    const char *line =
        "ABS-PLC2.LHA|DD|28272|715de1907a9cb4a3fadd3aea6bbd875f|_______________.--:_________________-zS!|.___\\    .   /___   / !   / .   /  .   /___. \246    \\___! _/  !/ _/  ! _/  !__/__ !__/_   ! !     / \\! \254\\_ !\\ \254\\_ \267 \254\\____";
    const char *expected_desc =
        ".___\\    .   /___   / !   / .   /  .   /___. \246    \\___! _/  !/ _/  ! _/  !__/__ !__/_   ! !     / \\! \254\\_ !\\ \254\\_ \267 \254\\____";
    dr_entry e;
    int rc;

    memset(&e, 0xAA, sizeof(e));
    rc = listtxt_parse_row(line, &e);

    CHECK("row real: returns 0", rc == 0);
    CHECK("row real: archive", strcmp(e.archive, "ABS-PLC2.LHA") == 0);
    CHECK("row real: type", strcmp(e.type, "DD") == 0);
    CHECK("row real: size == 28272", e.size == 28272UL);
    CHECK("row real: md5", strcmp(e.md5, "715de1907a9cb4a3fadd3aea6bbd875f") == 0);
    CHECK("row real: name",
          strcmp(e.name, "_______________.--:_________________-zS!") == 0);
    CHECK("row real: desc (120 bytes, escaped '!' preserved literally)",
          strcmp(e.desc, expected_desc) == 0);
    CHECK("row real: desc length is exactly 120 (the server's cap)",
          strlen(e.desc) == 120UL);
    /* The escaped-pipe positions must read '!', never an unescaped '|' -
     * confirms this parser performs no unescaping of its own. */
    CHECK("row real: desc contains the escaped '!' literally",
          strstr(e.desc, "___! _/") != (char *) 0);
    CHECK("row real: desc contains no raw '|' (unescape or mis-split bug)",
          strchr(e.desc, '|') == (char *) 0);
}

/* Synthetic: an empty md5 field is a documented valid state (the format
 * doc's "Digest freshness" note - a row still appears in the listing
 * with md5 empty when no digest has been recorded). The live 3301-row
 * catalog has no such row today, so this fixture is necessarily
 * constructed. */
static void test_row_empty_md5(void)
{
    const char *line = "AETRIV10.LHA|XIM|52224||AE Trivia|A simple trivia door";
    dr_entry e;
    int rc;

    memset(&e, 0xAA, sizeof(e));
    rc = listtxt_parse_row(line, &e);

    CHECK("row empty md5: returns 0", rc == 0);
    CHECK("row empty md5: archive", strcmp(e.archive, "AETRIV10.LHA") == 0);
    CHECK("row empty md5: size == 52224", e.size == 52224UL);
    CHECK("row empty md5: md5[0] == '\\0'", e.md5[0] == '\0');
    CHECK("row empty md5: name still parses after the empty field",
          strcmp(e.name, "AE Trivia") == 0);
    CHECK("row empty md5: desc still parses after the empty field",
          strcmp(e.desc, "A simple trivia door") == 0);
}

/* Real six-field row (same fixture as test_row_real) with one synthetic
 * seventh field appended, simulating the append-only format-evolution
 * promise (DOOR-REPO-API.md section 3): "MUST split each data row on
 * '|' and read only the first six fields by position... MUST ignore any
 * trailing fields it does not recognize." */
static void test_row_seven_fields(void)
{
    const char *line =
        "ABS-PLC2.LHA|DD|28272|715de1907a9cb4a3fadd3aea6bbd875f|_______________.--:_________________-zS!|.___\\    .   /___   / !   / .   /  .   /___. \246    \\___! _/  !/ _/  ! _/  !__/__ !__/_   ! !     / \\! \254\\_ !\\ \254\\_ \267 \254\\____|EXTRA-FUTURE-FIELD";
    dr_entry e;
    int rc;

    memset(&e, 0xAA, sizeof(e));
    rc = listtxt_parse_row(line, &e);

    CHECK("row seven fields: returns 0 (extra field ignored, not a parse failure)", rc == 0);
    CHECK("row seven fields: archive still correct", strcmp(e.archive, "ABS-PLC2.LHA") == 0);
    CHECK("row seven fields: type still correct", strcmp(e.type, "DD") == 0);
    CHECK("row seven fields: size still correct", e.size == 28272UL);
    CHECK("row seven fields: md5 still correct",
          strcmp(e.md5, "715de1907a9cb4a3fadd3aea6bbd875f") == 0);
    CHECK("row seven fields: name still correct",
          strcmp(e.name, "_______________.--:_________________-zS!") == 0);
    CHECK("row seven fields: desc has NO trace of the seventh field",
          strstr(e.desc, "EXTRA-FUTURE-FIELD") == (char *) 0);
    CHECK("row seven fields: desc length unchanged by the extra field",
          strlen(e.desc) == 120UL);
}

/* Synthetic: non-numeric archiveSize. Unlike the header's
 * formatVersion/count (see test_header_malformed), archiveSize is a
 * genuinely optional data field where the format doc already uses 0 to
 * mean "unknown" - so this parser deliberately keeps the silent-0
 * fallback here rather than failing the row (see listtxt.h). This test
 * exists to pin that behavior down explicitly, not to demonstrate a new
 * failure mode. */
static void test_row_size_non_numeric(void)
{
    const char *line = "SMALL.LHA|XIM|notanumber|abc123|Small Door|A tiny door";
    dr_entry e;
    int rc;

    memset(&e, 0xAA, sizeof(e));
    rc = listtxt_parse_row(line, &e);

    CHECK("row size non-numeric: returns 0 (not a parse failure)", rc == 0);
    CHECK("row size non-numeric: size == 0 (silent fallback, not an error)", e.size == 0UL);
    CHECK("row size non-numeric: archive still correct", strcmp(e.archive, "SMALL.LHA") == 0);
    CHECK("row size non-numeric: fields after size still parse",
          strcmp(e.desc, "A tiny door") == 0);
}

/* Synthetic: malformed row with only two of the six required fields. */
static void test_row_malformed(void)
{
    const char *line = "ONLY|TWO";
    dr_entry e;
    int rc;

    memset(&e, 0xAA, sizeof(e));
    rc = listtxt_parse_row(line, &e);

    CHECK("row malformed: returns non-zero", rc != 0);
}

/* Synthetic: every field longer than its destination buffer. Must
 * truncate safely - NUL-terminated, no overflow - never reject the row
 * outright (truncation, not failure, per listtxt.h's contract). Run this
 * specific fixture under ASan too (see task-2-report.md) as the direct
 * proof that no destination array is ever overrun. */
static void test_row_oversized_fields(void)
{
    char archive_in[101];
    char type_in[21];
    char md5_in[51];
    char name_in[201];
    char desc_in[301];
    char line[700];
    dr_entry e;
    int rc;

    fill_char(archive_in, 'A', 100);
    fill_char(type_in, 'B', 20);
    fill_char(md5_in, 'C', 50);
    fill_char(name_in, 'D', 200);
    fill_char(desc_in, 'E', 300);

    strcpy(line, archive_in);
    strcat(line, "|");
    strcat(line, type_in);
    strcat(line, "|123456|");
    strcat(line, md5_in);
    strcat(line, "|");
    strcat(line, name_in);
    strcat(line, "|");
    strcat(line, desc_in);

    memset(&e, 0xAA, sizeof(e));
    rc = listtxt_parse_row(line, &e);

    CHECK("oversized: returns 0 (truncation is not a parse failure)", rc == 0);

    CHECK("oversized: archive truncated to 63 bytes", strlen(e.archive) == 63UL);
    CHECK("oversized: archive NUL-terminated", e.archive[63] == '\0');
    CHECK("oversized: archive content is the leading 'A's",
          e.archive[0] == 'A' && e.archive[62] == 'A');

    CHECK("oversized: type truncated to 7 bytes", strlen(e.type) == 7UL);
    CHECK("oversized: type NUL-terminated", e.type[7] == '\0');

    CHECK("oversized: size parses despite neighboring truncated fields",
          e.size == 123456UL);

    CHECK("oversized: md5 truncated to 32 bytes", strlen(e.md5) == 32UL);
    CHECK("oversized: md5 NUL-terminated", e.md5[32] == '\0');

    CHECK("oversized: name truncated to 63 bytes", strlen(e.name) == 63UL);
    CHECK("oversized: name NUL-terminated", e.name[63] == '\0');

    CHECK("oversized: desc truncated to 127 bytes", strlen(e.desc) == 127UL);
    CHECK("oversized: desc NUL-terminated", e.desc[127] == '\0');
}

/* Synthetic: a row whose trailing '\r' (CRLF line ending, minus the '\n'
 * a caller's line reader would already have stripped) must not survive
 * inside the last field. */
static void test_row_trailing_cr(void)
{
    const char *line = "SMALL.LHA|XIM|100|abc123|Small Door|A tiny door\r";
    dr_entry e;
    int rc;

    memset(&e, 0xAA, sizeof(e));
    rc = listtxt_parse_row(line, &e);

    CHECK("trailing CR: returns 0", rc == 0);
    CHECK("trailing CR: desc has no embedded '\\r'",
          strchr(e.desc, '\r') == (char *) 0);
    CHECK("trailing CR: desc is exactly the text before the CR",
          strcmp(e.desc, "A tiny door") == 0);
    CHECK("trailing CR: desc length excludes the CR",
          strlen(e.desc) == 11UL);
}

int main(void)
{
    test_header_real();
    test_header_malformed();
    test_row_real();
    test_row_empty_md5();
    test_row_seven_fields();
    test_row_size_non_numeric();
    test_row_malformed();
    test_row_oversized_fields();
    test_row_trailing_cr();

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }

    printf("%d TEST(S) FAILED\n", failures);
    return 1;
}
