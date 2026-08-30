/* test_flow.c - tests for the pure decision logic extracted from
 * doorrepo.c into flow.h/flow.c: pagination maths, the download
 * verification retry state machine, and query-string/URL-path
 * construction. No blessed/door/network dependencies - links only flow.c.
 */

#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include "../flow.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-55s ", #name); fflush(stdout); test_##name(); } while(0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((got) == (expected)) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got %ld, expected %ld)\n", msg, (long)(got), (long)(expected)); \
    } \
    tests_run++; \
} while(0)

#define ASSERT_STR_EQ(got, expected, msg) do { \
    if (strcmp((got), (expected)) == 0) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got '%s', expected '%s')\n", msg, got, expected); \
    } \
    tests_run++; \
} while(0)

#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s\n", msg); \
    } \
    tests_run++; \
} while(0)

/* ---------------------------------------------------------------------
 * Pagination maths
 * ------------------------------------------------------------------- */

TEST(page_first_page_full)
{
    flow_page_info info;
    flow_compute_page(45, 20, 1, &info);
    ASSERT_EQ(info.start_index, 0UL, "start_index");
    ASSERT_EQ(info.row_count, 20UL, "row_count");
    ASSERT_EQ(info.page_count, 3UL, "page_count");
    ASSERT_EQ(info.page_number, 1UL, "page_number");
}

TEST(page_middle_page_full)
{
    flow_page_info info;
    flow_compute_page(45, 20, 2, &info);
    ASSERT_EQ(info.start_index, 20UL, "start_index");
    ASSERT_EQ(info.row_count, 20UL, "row_count");
}

TEST(page_last_page_partial)
{
    flow_page_info info;
    flow_compute_page(45, 20, 3, &info);
    ASSERT_EQ(info.start_index, 40UL, "start_index");
    ASSERT_EQ(info.row_count, 5UL, "row_count (partial final page)");
    ASSERT_EQ(info.page_count, 3UL, "page_count");
}

TEST(page_exact_multiple_no_partial_page)
{
    flow_page_info info;
    flow_compute_page(40, 20, 2, &info);
    ASSERT_EQ(info.page_count, 2UL, "page_count (exact division)");
    ASSERT_EQ(info.start_index, 20UL, "start_index");
    ASSERT_EQ(info.row_count, 20UL, "row_count");
}

TEST(page_size_one)
{
    flow_page_info info;
    flow_compute_page(5, 1, 3, &info);
    ASSERT_EQ(info.start_index, 2UL, "start_index");
    ASSERT_EQ(info.row_count, 1UL, "row_count");
    ASSERT_EQ(info.page_count, 5UL, "page_count");
}

TEST(page_empty_catalog)
{
    flow_page_info info;
    flow_compute_page(0, 20, 1, &info);
    ASSERT_EQ(info.start_index, 0UL, "start_index");
    ASSERT_EQ(info.row_count, 0UL, "row_count");
    ASSERT_EQ(info.page_count, 0UL, "page_count");
    ASSERT_EQ(info.page_number, 0UL, "page_number");
}

TEST(page_number_clamped_above_range)
{
    flow_page_info info;
    flow_compute_page(45, 20, 99, &info);
    ASSERT_EQ(info.page_number, 3UL, "clamped to last page");
    ASSERT_EQ(info.start_index, 40UL, "start_index");
    ASSERT_EQ(info.row_count, 5UL, "row_count");
}

TEST(page_number_clamped_below_range)
{
    flow_page_info info;
    flow_compute_page(45, 20, 0, &info);
    ASSERT_EQ(info.page_number, 1UL, "clamped to first page");
    ASSERT_EQ(info.start_index, 0UL, "start_index");

    flow_compute_page(45, 20, -5, &info);
    ASSERT_EQ(info.page_number, 1UL, "negative page number clamped to first page");
}

TEST(page_size_defensively_treated_as_one)
{
    flow_page_info info;
    flow_compute_page(10, 0, 1, &info);
    ASSERT_EQ(info.page_count, 10UL, "page_count with size<1 treated as 1");
    ASSERT_EQ(info.row_count, 1UL, "row_count");
}

/* ---------------------------------------------------------------------
 * Download verification retry state machine
 * ------------------------------------------------------------------- */

TEST(verify_match_first_attempt_is_ok)
{
    ASSERT_EQ(flow_next_verify_outcome(1, 1), FLOW_VERIFY_OK, "match on attempt 1");
}

TEST(verify_mismatch_first_attempt_retries)
{
    ASSERT_EQ(flow_next_verify_outcome(1, 0), FLOW_VERIFY_RETRY, "mismatch on attempt 1");
}

TEST(verify_mismatch_second_attempt_aborts)
{
    ASSERT_EQ(flow_next_verify_outcome(2, 0), FLOW_VERIFY_ABORT, "mismatch on attempt 2");
}

TEST(verify_match_second_attempt_after_retry_is_ok)
{
    ASSERT_EQ(flow_next_verify_outcome(2, 1), FLOW_VERIFY_OK, "match on attempt 2 (retry succeeded)");
}

TEST(verify_third_attempt_mismatch_still_aborts)
{
    ASSERT_EQ(flow_next_verify_outcome(3, 0), FLOW_VERIFY_ABORT, "defensive: never retried a third time");
}

/* ---------------------------------------------------------------------
 * URL-encoding / query-string / archive-path construction
 * ------------------------------------------------------------------- */

TEST(encode_plain_alnum_untouched)
{
    char out[64];
    int n = flow_url_encode("hello123", out, sizeof(out));
    ASSERT_EQ(n, 8, "encoded length");
    ASSERT_STR_EQ(out, "hello123", "unreserved chars pass through");
}

TEST(encode_unreserved_punctuation_untouched)
{
    char out[64];
    flow_url_encode("-._~", out, sizeof(out));
    ASSERT_STR_EQ(out, "-._~", "RFC 3986 unreserved punctuation");
}

TEST(encode_space_becomes_percent20)
{
    char out[64];
    flow_url_encode("foo bar", out, sizeof(out));
    ASSERT_STR_EQ(out, "foo%20bar", "space encoded");
}

TEST(encode_ampersand_and_equals)
{
    char out[64];
    flow_url_encode("a&b=c", out, sizeof(out));
    ASSERT_STR_EQ(out, "a%26b%3Dc", "query-delimiter chars encoded");
}

TEST(encode_too_small_buffer_returns_error)
{
    char out[3];
    int n = flow_url_encode("hello", out, sizeof(out));
    ASSERT_TRUE(n < 0, "buffer too small must fail, not truncate");
}

TEST(build_query_type_only)
{
    char out[128];
    int n = flow_build_list_query(out, sizeof(out), "XIM", (const char *) 0);
    ASSERT_TRUE(n > 0, "non-negative length");
    ASSERT_STR_EQ(out, "?type=XIM", "type-only query");
}

TEST(build_query_search_only)
{
    char out[128];
    flow_build_list_query(out, sizeof(out), (const char *) 0, "my door");
    ASSERT_STR_EQ(out, "?q=my%20door", "search-only query, term encoded");
}

TEST(build_query_both_type_and_search)
{
    char out[128];
    flow_build_list_query(out, sizeof(out), "DD", "a&b");
    ASSERT_STR_EQ(out, "?type=DD&q=a%26b", "both filters, & in search term encoded");
}

TEST(build_query_neither_filter_is_empty_string)
{
    char out[128];
    int n = flow_build_list_query(out, sizeof(out), (const char *) 0, (const char *) 0);
    ASSERT_EQ(n, 0, "zero length");
    ASSERT_STR_EQ(out, "", "no filters yields empty string, not a bare '?'");

    flow_build_list_query(out, sizeof(out), "", "");
    ASSERT_STR_EQ(out, "", "empty-string filters treated the same as NULL");
}

TEST(build_archive_path_ampersand_left_unencoded)
{
    char out[128];
    flow_build_archive_path(out, sizeof(out), "/api/door-repo", "BR&IB20.LHA");
    ASSERT_STR_EQ(out, "/api/door-repo/archive/BR&IB20.LHA", "& left literal per API doc section 5");
    ASSERT_TRUE(strstr(out, "%26") == (char *) 0, "must not have been percent-encoded");
}

TEST(build_archive_path_caret_left_unencoded)
{
    char out[128];
    flow_build_archive_path(out, sizeof(out), "/api/door-repo", "5D^AMU20.LHA");
    ASSERT_STR_EQ(out, "/api/door-repo/archive/5D^AMU20.LHA", "^ left literal per API doc section 5");
}

TEST(build_archive_path_too_small_buffer_returns_error)
{
    char out[10];
    int n = flow_build_archive_path(out, sizeof(out), "/api/door-repo", "SOMELONGARCHIVE.LHA");
    ASSERT_TRUE(n < 0, "buffer too small must fail, not truncate");
}

TEST(build_admin_login_path_basic)
{
    char out[128];
    int n = flow_build_admin_login_path(out, sizeof(out), "/api/door-repo");
    ASSERT_STR_EQ(out, "/api/door-repo/admin/login", "admin login path built");
    ASSERT_EQ(n, (int) strlen("/api/door-repo/admin/login"), "return length matches");
}

TEST(build_admin_login_path_too_small_buffer_returns_error)
{
    char out[10];
    int n = flow_build_admin_login_path(out, sizeof(out), "/api/door-repo");
    ASSERT_TRUE(n < 0, "buffer too small must fail, not truncate");
}

/* ---------------------------------------------------------------------
 * Shell-metacharacter rejection (the config.c / doorrepo.c shared
 * validator - see flow.h for the full vulnerability writeup)
 * ------------------------------------------------------------------- */

TEST(shell_char_ordinary_amiga_path_is_safe)
{
    ASSERT_TRUE(!flow_contains_forbidden_shell_char("Work:Doors/Downloads/"), "ordinary AmigaDOS path is safe");
    ASSERT_TRUE(!flow_contains_forbidden_shell_char("AETRIV10.LHA"), "ordinary archive name is safe");
    ASSERT_TRUE(!flow_contains_forbidden_shell_char("lha"), "ordinary command name is safe");
}

TEST(shell_char_exact_reported_injection_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("INJECTDIR\" ; touch /tmp/PWNED_BY_DOORREPO ; echo \""),
                "the exact reported injection string is rejected");
}

TEST(shell_char_double_quote_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo\"bar"), "double quote rejected");
}

TEST(shell_char_single_quote_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo'bar"), "single quote rejected");
}

TEST(shell_char_backtick_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo`bar"), "backtick rejected");
}

TEST(shell_char_dollar_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo$bar"), "dollar sign rejected (real catalog archive names contain '$')");
}

TEST(shell_char_semicolon_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo;bar"), "semicolon rejected");
}

TEST(shell_char_backslash_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo\\bar"), "backslash rejected");
}

TEST(shell_char_pipe_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo|bar"), "pipe rejected");
}

TEST(shell_char_ampersand_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo&bar"), "ampersand rejected (real catalog archive names contain '&')");
}

TEST(shell_char_less_than_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo<bar"), "less-than rejected");
}

TEST(shell_char_greater_than_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo>bar"), "greater-than rejected");
}

TEST(shell_char_carriage_return_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo\rbar"), "embedded carriage return rejected");
}

TEST(shell_char_newline_is_unsafe)
{
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo\nbar"), "embedded newline rejected");
}

TEST(shell_char_empty_string_is_safe)
{
    ASSERT_TRUE(!flow_contains_forbidden_shell_char(""), "empty string has nothing to reject");
}

TEST(shell_char_hash_is_unsafe)
{
    /* Added after the "#"-comment bypass (LhaCommand="touch ... #") -
     * this test is for the DENYLIST's use on DownloadDir/LogFile/RepoPath/
     * archive names, which sit inside double quotes; LhaCommand itself is
     * now allowlisted, not denylisted - see the flow_is_valid_command_token
     * tests below for that value's own "#" coverage. */
    ASSERT_TRUE(flow_contains_forbidden_shell_char("foo#bar"), "hash/comment marker rejected");
}

/* ---------------------------------------------------------------------
 * flow_is_valid_command_token() - the LhaCommand allowlist. Replaces the
 * denylist for this one field after two rounds of live bypass (see
 * flow.h's block comment for the full history): cfg->lha_command is
 * interpolated UNQUOTED into the system() command line, so no denylist
 * can defend it - only an allowlist that expresses zero shell semantics.
 * ------------------------------------------------------------------- */

#define LHA_MAXLEN 128UL

TEST(command_token_plain_name_is_valid)
{
    ASSERT_TRUE(flow_is_valid_command_token("lha", LHA_MAXLEN), "the documented default is valid");
}

TEST(command_token_amiga_path_is_valid)
{
    ASSERT_TRUE(flow_is_valid_command_token("Work:c/lha", LHA_MAXLEN), "an AmigaDOS assign+directory path is valid");
}

TEST(command_token_dashes_dots_underscores_valid)
{
    ASSERT_TRUE(flow_is_valid_command_token("a-b_c.d", LHA_MAXLEN), "-, _, . are all allowed");
}

TEST(command_token_empty_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("", LHA_MAXLEN), "empty command is invalid");
}

TEST(command_token_null_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token((const char *) 0, LHA_MAXLEN), "NULL is invalid, not a crash");
}

TEST(command_token_too_long_is_invalid)
{
    char big[200];
    unsigned long i;
    for (i = 0; i < sizeof(big) - 1; i++) {
        big[i] = 'a';
    }
    big[sizeof(big) - 1] = '\0';
    ASSERT_TRUE(!flow_is_valid_command_token(big, LHA_MAXLEN), "a token longer than maxlen is invalid");
}

TEST(command_token_exact_reported_hash_comment_payload_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("touch /tmp/PWNED_HASH_COMMENT #", LHA_MAXLEN),
                "the exact reported '#'-comment bypass payload is rejected (spaces and '#' both forbidden)");
}

TEST(command_token_whitespace_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("7z x", LHA_MAXLEN), "any whitespace makes a multi-token value invalid");
    ASSERT_TRUE(!flow_is_valid_command_token("lha\t", LHA_MAXLEN), "a trailing tab is invalid");
}

TEST(command_token_semicolon_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("lha;rm", LHA_MAXLEN), "semicolon is invalid");
}

TEST(command_token_percent_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("lha%test", LHA_MAXLEN), "percent is invalid");
}

TEST(command_token_tilde_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("~/lha", LHA_MAXLEN), "tilde is invalid");
}

TEST(command_token_caret_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("lha^test", LHA_MAXLEN), "caret is invalid");
}

TEST(command_token_parens_are_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("lha()", LHA_MAXLEN), "parentheses are invalid");
}

TEST(command_token_hash_is_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("lha#comment", LHA_MAXLEN), "hash/comment marker is invalid");
}

TEST(command_token_quote_chars_are_invalid)
{
    ASSERT_TRUE(!flow_is_valid_command_token("lha\"", LHA_MAXLEN), "double quote is invalid");
    ASSERT_TRUE(!flow_is_valid_command_token("lha'", LHA_MAXLEN), "single quote is invalid");
    ASSERT_TRUE(!flow_is_valid_command_token("lha`", LHA_MAXLEN), "backtick is invalid");
}

/* ---------------------------------------------------------------------
 * flow_is_safe_archive_filename() - path-traversal defense (CWE-22) for
 * server-supplied archive names. Regression coverage for a real,
 * demonstrated vulnerability: a catalog row named
 * "../../../../../../../tmp/doorrepo_traversal_out/PWNED_TRAVERSAL.lha"
 * wrote a file OUTSIDE DownloadDir, logged as DOWNLOAD OK.
 * ------------------------------------------------------------------- */

TEST(archive_filename_exact_reported_traversal_payload_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename(
        "../../../../../../../tmp/doorrepo_traversal_out/PWNED_TRAVERSAL.lha"),
        "the exact reported traversal payload is rejected");
}

TEST(archive_filename_amiga_bare_slash_traversal_is_unsafe)
{
    /* On real AmigaDOS a bare '/' is itself a parent-directory marker -
     * this payload contains no ".." substring at all, so a naive
     * "reject dotdot only" check would miss it; rejecting every '/'
     * unconditionally is what actually closes it. */
    ASSERT_TRUE(!flow_is_safe_archive_filename("//S/Startup-Sequence"),
                "AmigaDOS-style bare-slash traversal ('//S/Startup-Sequence') is rejected");
}

TEST(archive_filename_dotdot_segment_mid_string_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename("FOO..BAR.LHA"),
                "a '..' substring anywhere is rejected, even with no separator around it");
}

TEST(archive_filename_backslash_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename("foo\\bar.lha"), "backslash is rejected");
}

TEST(archive_filename_colon_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename("DF0:foo.lha"), "colon (AmigaDOS device separator) is rejected");
}

TEST(archive_filename_leading_dot_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename(".hidden.lha"), "a leading dot is rejected");
}

TEST(archive_filename_empty_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename(""), "an empty name is rejected");
}

TEST(archive_filename_null_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename((const char *) 0), "NULL is rejected, not a crash");
}

TEST(archive_filename_control_byte_is_unsafe)
{
    ASSERT_TRUE(!flow_is_safe_archive_filename("foo\x01" "bar.lha"), "an embedded control byte is rejected");
}

TEST(archive_filename_ordinary_name_is_safe)
{
    ASSERT_TRUE(flow_is_safe_archive_filename("AETRIV10.LHA"), "an ordinary catalog archive name is accepted");
}

TEST(archive_filename_real_catalog_punctuation_is_safe)
{
    /* Real, CURRENT catalog rows (docs/DOOR-REPO-API.md section 5) -
     * must NOT be rejected by the path-structure check, which is a
     * different concern from shell-safety. */
    ASSERT_TRUE(flow_is_safe_archive_filename("BR&IB20.LHA"), "'&' in a real archive name is accepted");
    ASSERT_TRUE(flow_is_safe_archive_filename("5D^AMU20.LHA"), "'^' in a real archive name is accepted");
    ASSERT_TRUE(flow_is_safe_archive_filename("$CP-BU01.LZX"), "'$' in a real archive name is accepted (not a leading dot, not a separator)");
    ASSERT_TRUE(flow_is_safe_archive_filename("!ALSTER.LHA"), "'!' in a real archive name is accepted");
}

/* ---------------------------------------------------------------------
 * flow_contains_dotdot_segment() - the narrower ".." check applied to
 * DownloadDir/LogFile/RepoPath, which legitimately need '/' and ':'.
 * ------------------------------------------------------------------- */

TEST(dotdot_segment_detected_with_slash)
{
    ASSERT_TRUE(flow_contains_dotdot_segment("../../../../tmp/x/"), "'..' with slashes is detected");
}

TEST(dotdot_segment_detected_amiga_style)
{
    ASSERT_TRUE(flow_contains_dotdot_segment("T:../../S/"), "'..' in an AmigaDOS-shaped path is detected");
}

TEST(dotdot_segment_ordinary_path_is_clean)
{
    ASSERT_TRUE(!flow_contains_dotdot_segment("Work:Doors/Downloads/"), "an ordinary path with no '..' is clean");
    ASSERT_TRUE(!flow_contains_dotdot_segment("T:"), "a bare device name is clean");
}

TEST(dotdot_segment_null_is_clean)
{
    ASSERT_TRUE(!flow_contains_dotdot_segment((const char *) 0), "NULL is clean, not a crash");
}

/* ---------------------------------------------------------------------
 * Local download path construction
 * ------------------------------------------------------------------- */

TEST(local_path_device_needs_no_separator)
{
    char out[128];
    flow_build_local_path(out, sizeof(out), "T:", "AETRIV10.LHA");
    ASSERT_STR_EQ(out, "T:AETRIV10.LHA", "device name already ends in ':'");
}

TEST(local_path_directory_with_trailing_slash_needs_no_separator)
{
    char out[128];
    flow_build_local_path(out, sizeof(out), "Work:Doors/Downloads/", "AETRIV10.LHA");
    ASSERT_STR_EQ(out, "Work:Doors/Downloads/AETRIV10.LHA", "trailing '/' already present");
}

TEST(local_path_bare_directory_gets_separator_inserted)
{
    char out[128];
    flow_build_local_path(out, sizeof(out), "Work:Doors/Downloads", "AETRIV10.LHA");
    ASSERT_STR_EQ(out, "Work:Doors/Downloads/AETRIV10.LHA", "bare dir name needs '/' inserted");
}

TEST(local_path_too_small_buffer_returns_error)
{
    char out[5];
    int n = flow_build_local_path(out, sizeof(out), "Work:Doors/Downloads", "AETRIV10.LHA");
    ASSERT_TRUE(n < 0, "buffer too small must fail, not truncate");
}

/* ---------------------------------------------------------------------
 * List navigation arithmetic
 * ------------------------------------------------------------------- */

TEST(nav_down_advances_one_and_stops_at_the_end)
{
    ASSERT_EQ(flow_nav_target(FLOW_NAV_DOWN, 0, 10, 5), 1UL, "down from the top");
    ASSERT_EQ(flow_nav_target(FLOW_NAV_DOWN, 9, 10, 5), 9UL, "down at the last row stays");
}

TEST(nav_up_retreats_one_and_stops_at_the_top)
{
    ASSERT_EQ(flow_nav_target(FLOW_NAV_UP, 4, 10, 5), 3UL, "up from the middle");
    ASSERT_EQ(flow_nav_target(FLOW_NAV_UP, 0, 10, 5), 0UL, "up at the first row stays");
}

TEST(nav_pages_clamp_at_both_ends)
{
    ASSERT_EQ(flow_nav_target(FLOW_NAV_PGDN, 0, 100, 20), 20UL, "page down");
    ASSERT_EQ(flow_nav_target(FLOW_NAV_PGDN, 95, 100, 20), 99UL, "page down near the end clamps");
    ASSERT_EQ(flow_nav_target(FLOW_NAV_PGUP, 50, 100, 20), 30UL, "page up");
    ASSERT_EQ(flow_nav_target(FLOW_NAV_PGUP, 5, 100, 20), 0UL, "page up near the top clamps");
}

TEST(nav_home_and_end_go_to_the_edges)
{
    ASSERT_EQ(flow_nav_target(FLOW_NAV_HOME, 55, 100, 20), 0UL, "home");
    ASSERT_EQ(flow_nav_target(FLOW_NAV_END, 5, 100, 20), 99UL, "end");
}

TEST(nav_on_an_empty_view_selects_nothing)
{
    /* An empty filter result must not produce an index into rows that are
     * not there - every caller uses the answer to subscript the view. */
    ASSERT_EQ(flow_nav_target(FLOW_NAV_DOWN, 0, 0, 20), 0UL, "down on empty");
    ASSERT_EQ(flow_nav_target(FLOW_NAV_END, 0, 0, 20), 0UL, "end on empty");
}

TEST(nav_repairs_a_selection_left_past_the_end)
{
    /* Filtering shrinks the view under a selection that was valid a moment
     * ago; the next key must land inside the new view, not off it. */
    ASSERT_EQ(flow_nav_target(FLOW_NAV_DOWN, 900, 10, 5), 9UL, "clamped into range");
}

TEST(nav_none_leaves_the_selection_alone)
{
    ASSERT_EQ(flow_nav_target(FLOW_NAV_NONE, 7, 100, 20), 7UL, "a non-navigation key moves nothing");
}

TEST(nav_treats_a_zero_page_as_one)
{
    ASSERT_EQ(flow_nav_target(FLOW_NAV_PGDN, 0, 100, 0), 1UL, "degenerate page size still advances");
}

/* ---------------------------------------------------------------------
 * flow_clamp_view() - re-anchoring selected/top_index after a mutation
 * shrinks the view out from under the cursor (Task 3 Step 3a: the clamp
 * installed_loop_ansi() needs after uninstalling a row, extracted so
 * browse_loop_ansi()'s equivalent per-pass clamp is the same tested code
 * rather than a second hand-written copy).
 * ------------------------------------------------------------------- */

TEST(clamp_view_leaves_a_still_valid_selection_alone)
{
    unsigned long selected = 3;
    unsigned long top_index = 0;
    flow_clamp_view(&selected, &top_index, 10, 5);
    ASSERT_EQ(selected, 3UL, "selected");
    ASSERT_EQ(top_index, 0UL, "top_index");
}

TEST(clamp_view_uninstalling_the_last_row_in_view_pulls_selected_back)
{
    /* The exact DOORMAN scenario (app.ts:627-628): 5 installed doors,
     * cursor on the last one (index 4); it gets uninstalled and the view
     * is rebuilt to 4 rows. Without the fix `selected` stays 4, one past
     * the new end (view.index[4] is out of range for a 4-row view). */
    unsigned long selected = 4;
    unsigned long top_index = 0;
    flow_clamp_view(&selected, &top_index, 4, 10);
    ASSERT_EQ(selected, 3UL, "selected lands on the new last row, not one past it");
    ASSERT_EQ(top_index, 0UL, "top_index unaffected - the new last row is still on screen");
}

TEST(clamp_view_uninstalling_the_only_row_empties_the_view)
{
    unsigned long selected = 0;
    unsigned long top_index = 0;
    flow_clamp_view(&selected, &top_index, 0, 10);
    ASSERT_EQ(selected, 0UL, "selected");
    ASSERT_EQ(top_index, 0UL, "top_index");
}

TEST(clamp_view_pulls_top_index_down_to_a_selection_that_scrolled_above_it)
{
    /* A deep scroll (top_index=15) whose selection then gets clamped by a
     * drastic shrink down to row 2 - top_index must follow it back up the
     * list, not leave the window stranded past the end of the new view. */
    unsigned long selected = 19;
    unsigned long top_index = 15;
    flow_clamp_view(&selected, &top_index, 3, 10);
    ASSERT_EQ(selected, 2UL, "selected");
    ASSERT_EQ(top_index, 2UL, "top_index follows selected back up");
}

TEST(clamp_view_pulls_top_index_up_when_selected_is_below_the_window)
{
    /* selected is already in range, but the window itself is stale (as if
     * caller only changed top_index) - the fourth branch, not reachable via
     * the other three, needs its own case. */
    unsigned long selected = 12;
    unsigned long top_index = 0;
    flow_clamp_view(&selected, &top_index, 20, 5);
    ASSERT_EQ(selected, 12UL, "selected");
    ASSERT_EQ(top_index, 8UL, "top_index advances so selected is the bottom visible row");
}

TEST(clamp_view_tolerates_a_zero_visible_rows)
{
    /* Geometry this degenerate never happens in practice (ui_compute_geometry
     * floors visible_rows at 1), but the function's own contract promises no
     * underflow here - unsigned arithmetic makes "0 - 1" a very large number
     * if the visible_rows>0 guard is ever dropped. */
    unsigned long selected = 5;
    unsigned long top_index = 0;
    flow_clamp_view(&selected, &top_index, 10, 0);
    ASSERT_EQ(selected, 5UL, "selected");
    ASSERT_EQ(top_index, 0UL, "top_index left alone - no window to keep in sync");
}

/* ---------------------------------------------------------------------
 * Quarantine path for a mismatching download (KeepFailedDownloads)
 * ------------------------------------------------------------------- */

TEST(info_temp_path_is_the_config_path_plus_new)
{
    char out[128];
    flow_build_info_temp_path(out, sizeof(out), "BBS:Commands/BBSCmd/ZIPPY.info");
    ASSERT_STR_EQ(out, "BBS:Commands/BBSCmd/ZIPPY.info.new",
                  "written here, then renamed onto the real name");
}

TEST(info_temp_path_stays_in_the_same_directory)
{
    /* The rename must be within one directory: that is what makes it atomic,
     * and what makes the directory's mtime change when the finished content
     * appears - which is the whole reason for the dance. */
    char out[128];
    flow_build_info_temp_path(out, sizeof(out), "BBSCmd/A.info");
    ASSERT_STR_EQ(out, "BBSCmd/A.info.new", "same directory as the target");
}

TEST(info_temp_path_too_small_buffer_returns_error)
{
    char out[8];
    int n = flow_build_info_temp_path(out, sizeof(out), "BBSCmd/A.info");
    ASSERT_TRUE(n < 0, "buffer too small must fail, not truncate");
}

TEST(info_temp_path_rejects_an_empty_target)
{
    char out[64];
    ASSERT_TRUE(flow_build_info_temp_path(out, sizeof(out), "") < 0, "nothing to rename onto");
}

TEST(bad_path_appends_suffix_to_the_local_path)
{
    char out[128];
    flow_build_bad_path(out, sizeof(out), "T:AETRIV10.LHA");
    ASSERT_STR_EQ(out, "T:AETRIV10.LHA.bad", "keeps the archive name, adds .bad");
}

TEST(bad_path_keeps_the_directory_the_download_went_to)
{
    char out[128];
    flow_build_bad_path(out, sizeof(out), "Work:Doors/Downloads/-D-CALC.LHA");
    ASSERT_STR_EQ(out, "Work:Doors/Downloads/-D-CALC.LHA.bad", "quarantine file stays beside the download");
}

TEST(bad_path_too_small_buffer_returns_error)
{
    /* One byte short of "T:X.bad" plus its NUL: it must fail rather than
     * truncate, because a truncated path would rename the download onto
     * some other file's name. */
    char out[7];
    int n = flow_build_bad_path(out, sizeof(out), "T:X.LHA");
    ASSERT_TRUE(n < 0, "buffer too small must fail, not truncate");
}

TEST(bad_path_rejects_an_empty_local_path)
{
    char out[128];
    int n = flow_build_bad_path(out, sizeof(out), "");
    ASSERT_TRUE(n < 0, "an empty path has no download to quarantine");
}

/* ---------------------------------------------------------------------
 * Catalog cache-reuse decision
 * ------------------------------------------------------------------- */

TEST(cache_reused_when_revisions_match)
{
    ASSERT_EQ(flow_should_use_cache("abc123", "abc123"), 1, "identical non-'unknown' revisions reuse cache");
}

TEST(cache_not_reused_when_revisions_differ)
{
    ASSERT_EQ(flow_should_use_cache("abc123", "def456"), 0, "changed revision forces refetch");
}

TEST(cache_not_reused_when_cached_empty)
{
    ASSERT_EQ(flow_should_use_cache("", "abc123"), 0, "no prior cache means no reuse");
}

TEST(cache_not_reused_when_server_revision_is_unknown)
{
    ASSERT_EQ(flow_should_use_cache("unknown", "unknown"), 0,
              "'unknown' dev-mode revision never trusted, even if it 'matches'");
}

/* ---------------------------------------------------------------------
 * Catalog row cap
 * ------------------------------------------------------------------- */

TEST(effective_row_count_under_cap)
{
    ASSERT_EQ(flow_effective_row_count(100, 4096), 100UL, "under cap: unchanged");
}

TEST(effective_row_count_over_cap)
{
    ASSERT_EQ(flow_effective_row_count(5000, 4096), 4096UL, "over cap: clamped");
}

TEST(declared_count_exceeds_cap_true)
{
    ASSERT_TRUE(flow_declared_count_exceeds_cap(5000, 4096), "5000 > 4096");
}

TEST(declared_count_exceeds_cap_false)
{
    ASSERT_TRUE(!flow_declared_count_exceeds_cap(3301, 4096), "3301 <= 4096");
}

/* ---------------------------------------------------------------------
 * flow_archive_byte_ceiling() - the download byte ceiling. Regression
 * coverage for a real, demonstrated vulnerability: an archive row
 * declaring archiveSize=100 streamed 10 MiB to disk, logged DOWNLOAD OK.
 * ------------------------------------------------------------------- */

#define TEST_ABS_MAX (16UL * 1024UL * 1024UL)
#define TEST_SLACK_FLOOR (64UL * 1024UL)
#define TEST_SLACK_PERCENT 20UL

TEST(archive_ceiling_exact_reported_attack_bounded_far_below_10mb)
{
    /* declared archiveSize=100, attacker sent 10 MiB - the allowed
     * ceiling must land nowhere near that. */
    unsigned long ceiling = flow_archive_byte_ceiling(100, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT);
    ASSERT_TRUE(ceiling < (1UL * 1024UL * 1024UL), "a declared 100-byte archive is never allowed anywhere near 1 MiB, let alone 10 MiB");
    ASSERT_EQ(ceiling, 100UL + TEST_SLACK_FLOOR, "small declared size uses the flat 64 KiB slack floor, not the 20% formula (20 bytes < 64 KiB)");
}

TEST(archive_ceiling_uses_percent_slack_when_larger_than_floor)
{
    /* declared 1,000,000 bytes: 20% = 200,000, which is larger than the
     * 64 KiB (65,536) floor - the percentage should win. */
    unsigned long ceiling = flow_archive_byte_ceiling(1000000UL, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT);
    ASSERT_EQ(ceiling, 1000000UL + 200000UL, "20% slack used when it exceeds the flat floor");
}

TEST(archive_ceiling_zero_declared_size_uses_absolute_max)
{
    unsigned long ceiling = flow_archive_byte_ceiling(0, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT);
    ASSERT_EQ(ceiling, TEST_ABS_MAX, "declared size 0 ('unknown' per the format doc) falls back to the absolute ceiling");
}

TEST(archive_ceiling_implausibly_large_declared_size_uses_absolute_max)
{
    /* A declared size bigger than the absolute ceiling itself must NOT
     * be trusted as a license for an even bigger download. */
    unsigned long ceiling = flow_archive_byte_ceiling(TEST_ABS_MAX * 4UL, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT);
    ASSERT_EQ(ceiling, TEST_ABS_MAX, "an implausible declared size falls back to the absolute ceiling, not declared+slack");
}

TEST(archive_ceiling_declared_size_exactly_at_absolute_max_is_clamped)
{
    /* Fix-round-5 regression: a declared size exactly at the absolute
     * max is still "plausible" (passes declared_size <= absolute_max)
     * and gets slack computed on top of it, but the FINAL returned
     * ceiling must never exceed absolute_max - otherwise a hostile
     * catalog raises its own ceiling past the documented absolute
     * maximum just by declaring a size at the boundary. Reproduced live
     * before this fix: declared_size == ARCHIVE_ABSOLUTE_MAX_BYTES
     * (16,777,216 in the real doorrepo.c constants) yielded a real
     * enforced ceiling of 20,132,656 bytes - ~3.35 MiB past the stated
     * cap - and a body of exactly that size streamed in full. */
    unsigned long ceiling = flow_archive_byte_ceiling(TEST_ABS_MAX, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT);
    ASSERT_EQ(ceiling, TEST_ABS_MAX, "the enforced ceiling is clamped to exactly absolute_max, never past it");
}

TEST(archive_ceiling_never_exceeds_absolute_max_for_any_plausible_declared_size)
{
    /* Sweep several declared sizes at and near the boundary - none of
     * them may ever push the returned ceiling past absolute_max. */
    ASSERT_TRUE(flow_archive_byte_ceiling(TEST_ABS_MAX, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT) <= TEST_ABS_MAX,
                "declared size == absolute_max stays clamped");
    ASSERT_TRUE(flow_archive_byte_ceiling(TEST_ABS_MAX - 1UL, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT) <= TEST_ABS_MAX,
                "declared size one byte under absolute_max stays clamped");
    ASSERT_TRUE(flow_archive_byte_ceiling((TEST_ABS_MAX / 100UL) * 90UL, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT) <= TEST_ABS_MAX,
                "declared size at 90% of absolute_max (where 20% slack alone would overshoot) stays clamped");
}

TEST(archive_ceiling_real_catalog_max_size_is_reasonable)
{
    /* The real catalog's largest current archive (measured 2026-08-17)
     * is 1,867,128 bytes - the resulting ceiling must comfortably allow
     * it, with headroom, but stay far below the 16 MiB absolute max. */
    unsigned long ceiling = flow_archive_byte_ceiling(1867128UL, TEST_ABS_MAX, TEST_SLACK_FLOOR, TEST_SLACK_PERCENT);
    ASSERT_TRUE(ceiling > 1867128UL, "the real largest archive fits under its own ceiling");
    ASSERT_TRUE(ceiling < TEST_ABS_MAX, "the real largest archive's ceiling stays well under the absolute max");
}

/* ---------------------------------------------------------------------
 * flow_is_plain_alnum() - the type-filter validator.
 * ------------------------------------------------------------------- */

TEST(plain_alnum_accepts_real_door_types)
{
    ASSERT_TRUE(flow_is_plain_alnum("XIM"), "XIM is accepted");
    ASSERT_TRUE(flow_is_plain_alnum("DD"), "DD is accepted");
    ASSERT_TRUE(flow_is_plain_alnum("REXX"), "REXX is accepted");
    ASSERT_TRUE(flow_is_plain_alnum("abc123"), "mixed-case alphanumeric is accepted");
}

TEST(plain_alnum_rejects_query_injection_attempt)
{
    ASSERT_TRUE(!flow_is_plain_alnum("XIM&admin=1"), "'&' is rejected - would inject an extra query parameter");
    ASSERT_TRUE(!flow_is_plain_alnum("XIM=foo"), "'=' is rejected");
}

TEST(plain_alnum_rejects_empty_and_null)
{
    ASSERT_TRUE(!flow_is_plain_alnum(""), "empty string is rejected");
    ASSERT_TRUE(!flow_is_plain_alnum((const char *) 0), "NULL is rejected, not a crash");
}

TEST(plain_alnum_rejects_whitespace_and_punctuation)
{
    ASSERT_TRUE(!flow_is_plain_alnum("XI M"), "embedded space is rejected");
    ASSERT_TRUE(!flow_is_plain_alnum("XIM-1"), "hyphen is rejected");
    ASSERT_TRUE(!flow_is_plain_alnum("XIM."), "period is rejected");
}

/* ---------------------------------------------------------------------
 * flow_validate_access_level() - the M-key access-level editor's
 * validator. Allowlist (digits only), not denylist.
 * ------------------------------------------------------------------- */

TEST(validate_access_level_accepts_zero)   { long v; ASSERT_EQ(flow_validate_access_level("0", &v), 0, "0 is valid"); ASSERT_EQ(v, 0, "value is 0"); }
TEST(validate_access_level_accepts_max)    { long v; ASSERT_EQ(flow_validate_access_level("255", &v), 0, "255 is valid"); ASSERT_EQ(v, 255, "value is 255"); }
TEST(validate_access_level_rejects_over_max) { long v; ASSERT_TRUE(flow_validate_access_level("256", &v) != 0, "256 rejected"); }
TEST(validate_access_level_rejects_negative) { long v; ASSERT_TRUE(flow_validate_access_level("-1", &v) != 0, "-1 rejected (leading '-' not a digit)"); }
TEST(validate_access_level_rejects_empty)    { long v; ASSERT_TRUE(flow_validate_access_level("", &v) != 0, "empty rejected"); }
TEST(validate_access_level_rejects_garbage)  { long v; ASSERT_TRUE(flow_validate_access_level("12x", &v) != 0, "trailing garbage rejected"); }
TEST(validate_access_level_rejects_whitespace) { long v; ASSERT_TRUE(flow_validate_access_level(" 10", &v) != 0, "leading space rejected"); }
TEST(validate_access_level_rejects_overlong)  { long v; ASSERT_TRUE(flow_validate_access_level("1234", &v) != 0, "4+ digits rejected (over range anyway, but reject on length first)"); }
TEST(validate_access_level_rejects_leading_zero) { long v; ASSERT_TRUE(flow_validate_access_level("025", &v) != 0, "leading zero followed by more digits rejected per the documented contract"); }
TEST(validate_access_level_rejects_double_zero)  { long v; ASSERT_TRUE(flow_validate_access_level("00", &v) != 0, "\"00\" rejected - not a single \"0\""); }


/* ---------------------------------------------------------------------
 * flow_compute_prior_access() - Task 4's one-key disable/restore RULING,
 * exact 3 named cases plus the 2 unnamed sub-cases the controller's ruling
 * implies (a no-op edit, and retyping the already-disabled level). One test
 * per branch - see flow.h for the full rule text this mirrors.
 * ------------------------------------------------------------------- */

TEST(compute_prior_access_case1_first_disable_starts_tracking) {
    /* Not tracking, edit moves away from current: remember current as the
     * value to restore to. */
    ASSERT_EQ(flow_compute_prior_access(42, 100, 0, 0), 42,
              "not tracking + moved away => start tracking current_access");
}
TEST(compute_prior_access_noop_edit_stays_untracked) {
    /* Not tracking, edit matches current: nothing changed, nothing to
     * track - the unnamed trivial sub-case. */
    ASSERT_EQ(flow_compute_prior_access(42, 42, 0, 0), -1,
              "not tracking + no real change => stays untracked (-1)");
}
TEST(compute_prior_access_case2_restore_stops_tracking) {
    /* Tracking 42, currently disabled at 100, edit lands exactly back on
     * the tracked value: this IS the restore. */
    ASSERT_EQ(flow_compute_prior_access(100, 42, 1, 42), -1,
              "tracking + new == prior => restore, stop tracking (-1)");
}
TEST(compute_prior_access_case3_third_level_keeps_original_tracked) {
    /* Tracking 42, currently disabled at 100, edit goes to a THIRD level
     * (200): the tracked value must stay 42 (the door's ORIGINAL level),
     * not become 100 (the level it was most recently disabled at). */
    ASSERT_EQ(flow_compute_prior_access(100, 200, 1, 42), 42,
              "tracking + new is neither current nor prior => keep original tracked value");
}
TEST(compute_prior_access_resubmit_disabled_value_keeps_tracking) {
    /* Tracking 42, currently disabled at 100, edit resubmits the SAME
     * disabled value (100 again): not the restore (that requires landing
     * on the tracked 42), so tracking must continue - the unnamed
     * resubmit sub-case. */
    ASSERT_EQ(flow_compute_prior_access(100, 100, 1, 42), 42,
              "tracking + new == current (disabled value retyped) => keep tracking prior");
}


/* ---- Install support (2026-08-18) ---------------------------------- */

TEST(bbs_command_accepts_upper_alnum)
{
    ASSERT_TRUE(flow_is_valid_bbs_command("DOORREPO"), "plain upper-case name");
    ASSERT_TRUE(flow_is_valid_bbs_command("X"), "single character");
    ASSERT_TRUE(flow_is_valid_bbs_command("LORD2"), "digits allowed");
    ASSERT_TRUE(flow_is_valid_bbs_command("ABCDEFGHIJKL"), "exactly 12 characters");
}

TEST(bbs_command_rejects_everything_else)
{
    ASSERT_TRUE(!flow_is_valid_bbs_command(""), "empty");
    ASSERT_TRUE(!flow_is_valid_bbs_command("ABCDEFGHIJKLM"), "13 characters is too long");
    ASSERT_TRUE(!flow_is_valid_bbs_command("lower"), "lower case is rejected, not folded");
    ASSERT_TRUE(!flow_is_valid_bbs_command("MY DOOR"), "space");
    ASSERT_TRUE(!flow_is_valid_bbs_command("MY/DOOR"), "path separator");
    ASSERT_TRUE(!flow_is_valid_bbs_command("MY:DOOR"), "AmigaDOS device separator");
    ASSERT_TRUE(!flow_is_valid_bbs_command(".."), "traversal");
}

TEST(suggest_command_from_real_archive_names)
{
    char out[32];

    (void) flow_suggest_bbs_command("AETRIV10.LHA", out, sizeof(out));
    ASSERT_STR_EQ(out, "AETRIV10", "extension dropped");

    /* Real catalog names: scene releases are full of punctuation. */
    (void) flow_suggest_bbs_command("!ALSTER.LHA", out, sizeof(out));
    ASSERT_STR_EQ(out, "ALSTER", "leading '!' removed");

    (void) flow_suggest_bbs_command("$CP-PS12.LZX", out, sizeof(out));
    ASSERT_STR_EQ(out, "CPPS12", "'$' and '-' removed");

    (void) flow_suggest_bbs_command("abs-plc2.lha", out, sizeof(out));
    ASSERT_STR_EQ(out, "ABSPLC2", "lower case folded up");

    (void) flow_suggest_bbs_command("VERYLONGARCHIVENAME.LHA", out, sizeof(out));
    ASSERT_EQ((long) strlen(out), 12L, "truncated to the command-name limit");
}

TEST(suggest_command_fails_when_nothing_usable_remains)
{
    char out[32];

    ASSERT_EQ(flow_suggest_bbs_command("!!!.LHA", out, sizeof(out)), -1, "all punctuation");
    ASSERT_STR_EQ(out, "", "output emptied on failure");
}

TEST(install_paths_join_amigados_style)
{
    char out[128];

    (void) flow_build_install_dir(out, sizeof(out), "Doors/", "MYDOOR");
    ASSERT_STR_EQ(out, "Doors/MYDOOR/", "trailing separator already present");

    (void) flow_build_install_dir(out, sizeof(out), "Work:Doors", "MYDOOR");
    ASSERT_STR_EQ(out, "Work:Doors/MYDOOR/", "separator inserted for a bare directory");

    (void) flow_build_install_dir(out, sizeof(out), "RAM:", "MYDOOR");
    ASSERT_STR_EQ(out, "RAM:MYDOOR/", "device assign needs no separator");

    (void) flow_build_info_path(out, sizeof(out), "BBSCmd/", "MYDOOR");
    ASSERT_STR_EQ(out, "BBSCmd/MYDOOR.info", "info path");

    ASSERT_EQ(flow_build_install_dir(out, 8, "Doors/", "MYDOOR"), -1, "too small a buffer");
    ASSERT_EQ(flow_build_info_path(out, 8, "BBSCmd/", "MYDOOR"), -1, "too small a buffer");
}

TEST(info_content_matches_doormans_format)
{
    char out[256];

    (void) flow_build_info_content(out, sizeof(out), "XIM", "MYDOOR", "bin/MyDoor", 0, -1);
    ASSERT_STR_EQ(out,
                  "TYPE=XIM\nLOCATION=Doors:MYDOOR/bin/MyDoor\nSTACK=65536\nACCESS=0\n",
                  "byte-identical to buildDoorInfoContent()");

    (void) flow_build_info_content(out, sizeof(out), "", "MYDOOR", "MyDoor", 0, -1);
    ASSERT_STR_EQ(out,
                  "TYPE=XIM\nLOCATION=Doors:MYDOOR/MyDoor\nSTACK=65536\nACCESS=0\n",
                  "empty door type defaults to XIM");

    ASSERT_EQ(flow_build_info_content(out, 10, "XIM", "MYDOOR", "MyDoor", 0, -1), -1,
              "too small a buffer");
}

TEST(build_info_content_no_prior_access_omits_draccess)
{
    char out[320];
    flow_build_info_content(out, sizeof(out), "XIM", "GVS", "5D-GetVersion", 0, -1);
    ASSERT_TRUE(strstr(out, "DRACCESS") == (char *) 0, "no DRACCESS line when prior_access is -1");
    ASSERT_TRUE(strstr(out, "ACCESS=0") != (char *) 0, "ACCESS=0 still present");
}

TEST(build_info_content_with_prior_access_appends_draccess)
{
    char out[320];
    flow_build_info_content(out, sizeof(out), "XIM", "GVS", "5D-GetVersion", 255, 20);
    ASSERT_TRUE(strstr(out, "ACCESS=255") != (char *) 0, "disabled sentinel written");
    ASSERT_TRUE(strstr(out, "DRACCESS=20") != (char *) 0, "prior access remembered");
}

TEST(build_info_content_preserves_type_location_stack_format)
{
    /* Byte-for-byte parity check against the pre-existing format, minus
     * the hardcoded ACCESS=0 - a regression here silently breaks every
     * door DoorRepo installs, not just the editor feature. */
    char out[320];
    flow_build_info_content(out, sizeof(out), "XIM", "GVS", "5D-GetVersion", 0, -1);
    ASSERT_STR_EQ(out, "TYPE=XIM\nLOCATION=Doors:GVS/5D-GetVersion\nSTACK=65536\nACCESS=0\n",
                  "format unchanged when access=0, prior_access=-1");
}

/* A real /files body: this is what GET /files/1OO-WALL.LHA returns, with
 * the ad file the indexer flagged. */
static const char FILES_BODY[] =
    "FILES|4|1\n"
    "1273|0|file_id.diz\n"
    "20984|0|PFiles/1oo/Wall/1oo_Wall\n"
    "3112|0|PFiles/1oo/Wall/1oo_Wall.doc\n"
    "412|1|PFiles/1oo/Wall/BBSAD.TXT\n";

TEST(files_rows_parse)
{
    const char *line = flow_files_next_line(FILES_BODY);
    unsigned long size = 0;
    int junk = -1;
    char path[128];

    ASSERT_EQ(flow_files_parse_row(line, &size, &junk, path, sizeof(path)), 0, "first row parses");
    ASSERT_EQ((long) size, 1273L, "size");
    ASSERT_EQ(junk, 0, "not junk");
    ASSERT_STR_EQ(path, "file_id.diz", "path");

    line = flow_files_next_line(line);
    line = flow_files_next_line(line);
    line = flow_files_next_line(line);
    ASSERT_EQ(flow_files_parse_row(line, &size, &junk, path, sizeof(path)), 0, "ad row parses");
    ASSERT_EQ(junk, 1, "flagged as junk");
    ASSERT_STR_EQ(path, "PFiles/1oo/Wall/BBSAD.TXT", "nested path");

    ASSERT_TRUE(flow_files_next_line(line) == (const char *) 0, "no line after the last");
    ASSERT_TRUE(flow_files_parse_row("garbage", &size, &junk, path, sizeof(path)) != 0,
                "a malformed row is rejected");
}

TEST(pick_binary_prefers_the_extensionless_file)
{
    char out[128];

    /* Nothing here is named after the archive, so the largest file with no
     * extension wins - and the ad file must not, even though .TXT files can
     * be large. */
    ASSERT_TRUE(flow_pick_door_binary(FILES_BODY, "1OO-WALL.LHA", "WALL",
                                       out, sizeof(out)) > 0, "found a binary");
    ASSERT_STR_EQ(out, "PFiles/1oo/Wall/1oo_Wall", "the extensionless file");
}

TEST(pick_binary_prefers_an_exact_name_match)
{
    static const char body[] =
        "FILES|3|0\n"
        "100|0|readme.txt\n"
        "9000|0|data/BIGBLOB\n"
        "500|0|AETRIV10\n";
    char out[128];

    /* The archive's own base name beats the bigger extensionless file. */
    (void) flow_pick_door_binary(body, "AETRIV10.LHA", "TRIVIA", out, sizeof(out));
    ASSERT_STR_EQ(out, "AETRIV10", "matched the archive base name");
}

TEST(pick_binary_gives_up_when_everything_has_an_extension)
{
    static const char body[] =
        "FILES|2|0\n"
        "100|0|readme.txt\n"
        "200|0|art.iff\n";
    char out[128];

    ASSERT_EQ(flow_pick_door_binary(body, "SOMEDOOR.LHA", "SOMEDOOR", out, sizeof(out)), -1,
              "no candidate - caller falls back to the command name");
}

TEST(pick_binary_ignores_ad_files)
{
    static const char body[] =
        "FILES|2|1\n"
        "50000|1|BBSAD\n"
        "100|0|realdoor\n";
    char out[128];

    /* An ad file with no extension and a huge size would otherwise win. */
    (void) flow_pick_door_binary(body, "X.LHA", "X", out, sizeof(out));
    ASSERT_STR_EQ(out, "realdoor", "junk rows are never candidates");
}


TEST(command_from_listing)
{
    char cmd[32];
    const char *listing;
    const char *lower;
    const char *none;
    const char *toolong;
    const char *piped;
    const char *nested;

    /* The archive's own registration names the command. */
    listing =
        "FILES|3|0\n"
        "950|0|Commands/BBSCmd/HACKCHECK.info\n"
        "12|0|Doors/HackCheck/HackCheck\n"
        "5|0|FILE_ID.DIZ\n";
    ASSERT_EQ(flow_command_from_listing(listing, cmd, sizeof(cmd)), 1,
              "the archive's own BBSCmd registration is found");
    ASSERT_STR_EQ(cmd, "HACKCHECK", "command name matches the .info stem");

    /* Case and separator variations still resolve. */
    lower =
        "FILES|1|0\n"
        "950|0|commands\\bbscmd\\ozone.info\n";
    ASSERT_EQ(flow_command_from_listing(lower, cmd, sizeof(cmd)), 1,
              "lower-case names and backslash separators still resolve");
    ASSERT_STR_EQ(cmd, "OZONE", "command name is upper-cased");

    /* No registration in the archive. */
    none =
        "FILES|2|0\n"
        "950|0|Ozone/Ozone\n"
        "5|0|FILE_ID.DIZ\n";
    ASSERT_EQ(flow_command_from_listing(none, cmd, sizeof(cmd)), 0,
              "no Commands/BBSCmd entry means no command named");

    /* A name too long for a BBS command is not a command. */
    toolong =
        "FILES|1|0\n"
        "950|0|Commands/BBSCmd/THISNAMEISWAYTOOLONG.info\n";
    cmd[0] = 'X'; cmd[1] = '\0'; /* poison, so a false pass can't hide behind a stale empty buffer */
    ASSERT_EQ(flow_command_from_listing(toolong, cmd, sizeof(cmd)), 0,
              "a stem over FLOW_MAX_BBS_COMMAND is refused, not truncated");
    ASSERT_STR_EQ(cmd, "", "a 0 return always leaves out empty, never a rejected candidate");

    /* The path may contain the separator: everything after the SECOND
     * '|' is the path, which is what the server promises (and what the
     * TypeScript client already does, Doors/door-manager/repo-client.ts's
     * parts.slice(2).join('|')) - the path is never itself a delimited
     * field. Before this fix, a naive field-based split truncated the
     * path at this embedded '|', the match silently failed, and
     * install_door() fell back to naming the door from the archive
     * filename instead of from its own registration - exactly the
     * silent, input-shape-dependent wrong-naming this task exists to
     * remove. Once the WHOLE path ("Commands/BBSCmd/HACK|CHECK.info") is
     * seen, the stem is "HACK|CHECK" - correctly rejected, since '|' is
     * not a usable BBS command character, not silently dropped from a
     * truncated field. */
    piped =
        "FILES|1|0\n"
        "950|0|Commands/BBSCmd/HACK|CHECK.info\n";
    cmd[0] = 'X'; cmd[1] = '\0';
    ASSERT_EQ(flow_command_from_listing(piped, cmd, sizeof(cmd)), 0,
              "the whole path is seen, and HACK|CHECK is not a usable BBS command");
    ASSERT_STR_EQ(cmd, "", "the rejected pipe-bearing candidate is not left in out");

    /* Same guarantee, the other direction: once the whole path is taken
     * (rather than truncated at the embedded '|' inside the "ODD|PATH"
     * directory segment), the .info still resolves as sitting under
     * Commands/BBSCmd/ - nested one directory deeper - and the command
     * name is the FINAL path segment's stem, not everything between the
     * matched prefix and the extension. */
    nested =
        "FILES|1|0\n"
        "950|0|Commands/BBSCmd/ODD|PATH/HACKCHECK.info\n";
    ASSERT_EQ(flow_command_from_listing(nested, cmd, sizeof(cmd)), 1,
              "a subdirectory under Commands/BBSCmd/ still resolves via the final path segment");
    ASSERT_STR_EQ(cmd, "HACKCHECK", "the command name is the .info's own basename, not the whole tail");
}


TEST(eof_key_ends_the_session)
{
    /* ae_key() returns -1 at EOF / carrier loss. Every other value is a
     * keystroke, including 0 and the synthetic codes ui_read_key() uses
     * for the cursor keys (>= 1000). */
    ASSERT_TRUE(flow_key_ends_session(-1), "-1 ends the session");
    ASSERT_TRUE(!flow_key_ends_session(0), "0 is a keystroke, not an ending");
    ASSERT_TRUE(!flow_key_ends_session('q'), "an ordinary key does not end it");
    ASSERT_TRUE(!flow_key_ends_session(1000), "a synthetic cursor-key code does not end it");
}


TEST(index_line_round_trips)
{
    char line[192];
    char archive[64];
    char cmd[16];

    ASSERT_TRUE(flow_index_format_line(line, sizeof(line), "TELSER40.LHA", "TELSER40") > 0,
                "formats");
    ASSERT_STR_EQ(line, "TELSER40.LHA|TELSER40\n", "exact line format");

    ASSERT_EQ(flow_index_parse_line(line, archive, sizeof(archive), cmd, sizeof(cmd)), 0,
              "parses back");
    ASSERT_STR_EQ(archive, "TELSER40.LHA", "archive survives the round trip");
    ASSERT_STR_EQ(cmd, "TELSER40", "command survives the round trip");
}

TEST(index_line_handles_real_archive_names)
{
    char line[192];
    char archive[64];
    char cmd[16];

    /* Scene names carry '$', '!', '&' and '-'; none of them may break the
     * one-record-per-line rule. */
    (void) flow_index_format_line(line, sizeof(line), "$CP-PS12.LZX", "CPPS12");
    (void) flow_index_parse_line(line, archive, sizeof(archive), cmd, sizeof(cmd));
    ASSERT_STR_EQ(archive, "$CP-PS12.LZX", "punctuation-heavy archive name");
    ASSERT_STR_EQ(cmd, "CPPS12", "command beside it");
}

TEST(index_line_rejects_what_it_cannot_represent)
{
    char line[192];

    ASSERT_EQ(flow_index_format_line(line, sizeof(line), "", "CMD"), -1, "empty archive");
    ASSERT_EQ(flow_index_format_line(line, sizeof(line), "A.LHA", ""), -1, "empty command");
    ASSERT_EQ(flow_index_format_line(line, sizeof(line), "A|B.LHA", "CMD"), -1,
              "a pipe in the archive would make the line unparseable");
    ASSERT_EQ(flow_index_format_line(line, 8, "TELSER40.LHA", "TELSER40"), -1,
              "buffer too small");
}

TEST(index_parse_rejects_half_records)
{
    char archive[64];
    char cmd[16];

    ASSERT_TRUE(flow_index_parse_line("no-separator-here", archive, sizeof(archive),
                                       cmd, sizeof(cmd)) != 0, "no separator");
    ASSERT_TRUE(flow_index_parse_line("|CMD", archive, sizeof(archive),
                                       cmd, sizeof(cmd)) != 0, "empty archive field");
    ASSERT_TRUE(flow_index_parse_line("A.LHA|", archive, sizeof(archive),
                                       cmd, sizeof(cmd)) != 0, "empty command field");
    /* Both outputs must be emptied on failure, so a caller cannot act on
     * half a record. */
    ASSERT_STR_EQ(archive, "", "archive emptied on failure");
    ASSERT_STR_EQ(cmd, "", "command emptied on failure");
}

TEST(index_parse_tolerates_crlf_and_long_fields)
{
    char archive[64];
    char cmd[16];

    ASSERT_EQ(flow_index_parse_line("A.LHA|MYDOOR\r\n", archive, sizeof(archive),
                                     cmd, sizeof(cmd)), 0, "CRLF line ending");
    ASSERT_STR_EQ(cmd, "MYDOOR", "no CR left on the command");

    ASSERT_EQ(flow_index_parse_line("A.LHA|ABCDEFGHIJKLMNOP", archive, sizeof(archive),
                                     cmd, sizeof(cmd)), 0, "over-long command truncates");
    ASSERT_EQ((long) strlen(cmd), (long) (sizeof(cmd) - 1), "truncated to the buffer");
}

TEST(index_path_sits_in_the_download_dir)
{
    char out[128];

    (void) flow_build_index_path(out, sizeof(out), "T:");
    ASSERT_STR_EQ(out, "T:DoorRepo.idx", "AmigaDOS assign needs no separator");

    (void) flow_build_index_path(out, sizeof(out), "Work:Downloads");
    ASSERT_STR_EQ(out, "Work:Downloads/DoorRepo.idx", "separator inserted");
}

/* ---- flow_parse_tooltype_line / flow_read_door_info ----------------------
 *
 * The reader half of install_door()'s .info writer (flow_build_info_content
 * above). flow_parse_tooltype_line is the pure per-line parser, unit-tested
 * directly; flow_read_door_info is the thin fopen/fgets wrapper around it,
 * exercised here against real temp files the same way test_config.c drives
 * config_load().
 */

TEST(parse_tooltype_line_basic)
{
    char key[32], value[64];
    int rc = flow_parse_tooltype_line("ACCESS=10\n", key, sizeof(key), value, sizeof(value));
    ASSERT_EQ(rc, 0, "parses ACCESS=10");
    ASSERT_STR_EQ(key, "ACCESS", "key is ACCESS");
    ASSERT_STR_EQ(value, "10", "value is 10");
}

TEST(parse_tooltype_line_strips_crlf)
{
    char key[32], value[64];
    flow_parse_tooltype_line("ACCESS=10\r\n", key, sizeof(key), value, sizeof(value));
    ASSERT_STR_EQ(value, "10", "CRLF stripped from value");
}

TEST(parse_tooltype_line_no_equals_fails)
{
    char key[32], value[64];
    int rc = flow_parse_tooltype_line("GARBAGE LINE\n", key, sizeof(key), value, sizeof(value));
    ASSERT_TRUE(rc != 0, "no '=' is malformed");
    ASSERT_STR_EQ(key, "", "key left empty on failure");
}

TEST(parse_tooltype_line_empty_key_fails)
{
    char key[32], value[64];
    int rc = flow_parse_tooltype_line("=10\n", key, sizeof(key), value, sizeof(value));
    ASSERT_TRUE(rc != 0, "empty key is malformed");
}

TEST(parse_tooltype_line_too_long_for_buffer_fails)
{
    char key[32], value[8];
    int rc = flow_parse_tooltype_line("LOCATION=Doors:SOMELONGCMD/some/very/long/path\n",
                                       key, sizeof(key), value, sizeof(value));
    ASSERT_TRUE(rc != 0, "value too long for the caller's buffer is malformed, not truncated");
    ASSERT_STR_EQ(key, "", "key left empty on failure");
    ASSERT_STR_EQ(value, "", "value left empty on failure");
}

TEST(read_door_info_missing_file_returns_zero)
{
    dr_info_fields fields;
    int rc;

    unlink("/tmp/test_flow_info_missing.info");
    rc = flow_read_door_info("/tmp/test_flow_info_missing.info", &fields);
    ASSERT_EQ(rc, 0, "fopen failure returns 0");
    ASSERT_EQ(fields.type_found, 0, "type not found");
    ASSERT_EQ(fields.location_found, 0, "location not found");
    ASSERT_EQ(fields.stack_found, 0, "stack not found");
    ASSERT_EQ(fields.access_found, 0, "access not found");
    ASSERT_EQ(fields.prior_access_found, 0, "prior_access not found");
}

TEST(read_door_info_parses_a_real_installed_info)
{
    dr_info_fields fields;
    int rc;
    FILE *f = fopen("/tmp/test_flow_info_basic.info", "w");
    fprintf(f, "TYPE=XIM\nLOCATION=Doors:MYDOOR/mydoor\nSTACK=65536\nACCESS=0\n");
    fclose(f);

    rc = flow_read_door_info("/tmp/test_flow_info_basic.info", &fields);
    ASSERT_EQ(rc, 1, "file opened");
    ASSERT_EQ(fields.type_found, 1, "TYPE found");
    ASSERT_STR_EQ(fields.type, "XIM", "TYPE value");
    ASSERT_EQ(fields.location_found, 1, "LOCATION found");
    ASSERT_STR_EQ(fields.location, "Doors:MYDOOR/mydoor", "LOCATION value");
    ASSERT_EQ(fields.stack_found, 1, "STACK found");
    ASSERT_EQ(fields.stack, 65536, "STACK value");
    ASSERT_EQ(fields.access_found, 1, "ACCESS found");
    ASSERT_EQ(fields.access, 0, "ACCESS value");
    ASSERT_EQ(fields.prior_access_found, 0, "DRACCESS absent, not found");
    unlink("/tmp/test_flow_info_basic.info");
}

TEST(read_door_info_reads_draccess_when_present)
{
    dr_info_fields fields;
    FILE *f = fopen("/tmp/test_flow_info_draccess.info", "w");
    fprintf(f, "TYPE=XIM\nLOCATION=Doors:MYDOOR/mydoor\nSTACK=65536\nACCESS=10\nDRACCESS=5\n");
    fclose(f);

    (void) flow_read_door_info("/tmp/test_flow_info_draccess.info", &fields);
    ASSERT_EQ(fields.prior_access_found, 1, "DRACCESS found");
    ASSERT_EQ(fields.prior_access, 5, "DRACCESS value");
    unlink("/tmp/test_flow_info_draccess.info");
}

TEST(read_door_info_missing_stack_leaves_other_fields_intact)
{
    dr_info_fields fields;
    FILE *f = fopen("/tmp/test_flow_info_nostack.info", "w");
    fprintf(f, "TYPE=AIM\nLOCATION=Doors:MYDOOR/mydoor\nACCESS=20\n");
    fclose(f);

    (void) flow_read_door_info("/tmp/test_flow_info_nostack.info", &fields);
    ASSERT_EQ(fields.type_found, 1, "TYPE still found");
    ASSERT_EQ(fields.location_found, 1, "LOCATION still found");
    ASSERT_EQ(fields.access_found, 1, "ACCESS still found");
    ASSERT_EQ(fields.access, 20, "ACCESS value");
    ASSERT_EQ(fields.stack_found, 0, "a hand-edited .info missing STACK doesn't fail the whole read");
    unlink("/tmp/test_flow_info_nostack.info");
}

TEST(read_door_info_rejects_negative_access)
{
    dr_info_fields fields;
    FILE *f = fopen("/tmp/test_flow_info_negaccess.info", "w");
    fprintf(f, "TYPE=XIM\nACCESS=-5\n");
    fclose(f);

    (void) flow_read_door_info("/tmp/test_flow_info_negaccess.info", &fields);
    ASSERT_EQ(fields.access_found, 0, "negative ACCESS is rejected, not stored");
    unlink("/tmp/test_flow_info_negaccess.info");
}

TEST(read_door_info_tolerates_a_malformed_line)
{
    dr_info_fields fields;
    FILE *f = fopen("/tmp/test_flow_info_malformed.info", "w");
    fprintf(f, "TYPE=XIM\nGARBAGE LINE WITH NO EQUALS\nACCESS=15\n");
    fclose(f);

    (void) flow_read_door_info("/tmp/test_flow_info_malformed.info", &fields);
    ASSERT_EQ(fields.type_found, 1, "TYPE before the bad line still parses");
    ASSERT_EQ(fields.access_found, 1, "ACCESS after the bad line still parses");
    ASSERT_EQ(fields.access, 15, "ACCESS value");
    unlink("/tmp/test_flow_info_malformed.info");
}

/* ---- flow_rewrite_access_lines() -----------------------------------------
 *
 * The whole-branch final review's Critical finding: do_edit_access() used
 * to rebuild a .info from flow_build_info_content()'s fixed 4-5 tooltype
 * template, silently deleting BBSCMD/NAME/DESCRIPTION/MULTINODE/PRIORITY/
 * CATEGORY/a custom STACK - every tooltype this door does not itself read
 * back. This is the pure in-place line editor that replaces that rebuild:
 * copy every line byte-for-byte except ACCESS (value replaced) and
 * DRACCESS (added/replaced/removed). Pure string-in/string-out, no file
 * I/O, so every case is a literal here - no /tmp fixtures needed. */

TEST(rewrite_access_lines_preserves_unknown_tooltypes_through_an_access_edit)
{
    /* Modeled directly on this repo's own Commands/BBSCmd/DOORREPO.info -
     * the exact scenario the finding named as broken: a real production
     * .info with tooltypes this door has never read (BBSCMD, NAME,
     * DESCRIPTION, MULTINODE, PRIORITY) and a non-default STACK, disabled
     * via the M key (255 -> 0, tracking 255 to restore later). */
    const char *content =
        "BBSCMD=DOORREPO\n"
        "NAME=DoorRepo v1.0\n"
        "TYPE=XIM\n"
        "LOCATION=Doors:DoorRepo/doorrepo.amiga\n"
        "DESCRIPTION=Browse, download and install doors from the DoorRepo catalog (sysop only)\n"
        "ACCESS=255\n"
        "MULTINODE=YES\n"
        "PRIORITY=SAME\n"
        "STACK=8192\n";
    char out[512];
    int len;

    len = flow_rewrite_access_lines(content, out, sizeof(out), 0, 255);

    ASSERT_TRUE(len > 0, "rewrite succeeds");
    ASSERT_TRUE(strstr(out, "BBSCMD=DOORREPO\n") != (char *) 0, "BBSCMD preserved");
    ASSERT_TRUE(strstr(out, "NAME=DoorRepo v1.0\n") != (char *) 0, "NAME preserved");
    ASSERT_TRUE(strstr(out, "TYPE=XIM\n") != (char *) 0, "TYPE preserved");
    ASSERT_TRUE(strstr(out, "LOCATION=Doors:DoorRepo/doorrepo.amiga\n") != (char *) 0,
                "LOCATION preserved byte-for-byte, not reconstructed");
    ASSERT_TRUE(strstr(out, "DESCRIPTION=Browse, download and install doors from the DoorRepo catalog (sysop only)\n") != (char *) 0,
                "DESCRIPTION preserved");
    ASSERT_TRUE(strstr(out, "MULTINODE=YES\n") != (char *) 0,
                "MULTINODE preserved - this is the exact tooltype the finding named as silently reverted");
    ASSERT_TRUE(strstr(out, "PRIORITY=SAME\n") != (char *) 0, "PRIORITY preserved");
    ASSERT_TRUE(strstr(out, "STACK=8192\n") != (char *) 0,
                "custom STACK preserved, NOT reset to the hardcoded 65536 default");
    ASSERT_TRUE(strstr(out, "STACK=65536") == (char *) 0,
                "the old rebuild-from-template default never appears");
    ASSERT_TRUE(strstr(out, "ACCESS=0\n") != (char *) 0, "ACCESS updated to the new value");
    /* "\nACCESS=255\n" rather than bare "ACCESS=255\n" - the latter is
     * also a substring of the (correctly present) "DRACCESS=255\n" line,
     * which would make this assertion a false failure, not a real one. */
    ASSERT_TRUE(strstr(out, "\nACCESS=255\n") == (char *) 0, "old ACCESS value gone");
    ASSERT_TRUE(strstr(out, "DRACCESS=255\n") != (char *) 0, "DRACCESS added, remembering the pre-disable level");
}

TEST(rewrite_access_lines_adds_draccess_when_none_existed)
{
    const char *content = "TYPE=XIM\nACCESS=0\nSTACK=65536\n";
    char out[256];

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 50, 0);

    ASSERT_TRUE(strstr(out, "ACCESS=50\n") != (char *) 0, "ACCESS updated");
    ASSERT_TRUE(strstr(out, "DRACCESS=0\n") != (char *) 0, "DRACCESS inserted");
    ASSERT_TRUE(strstr(out, "TYPE=XIM\n") != (char *) 0, "TYPE preserved");
    ASSERT_TRUE(strstr(out, "STACK=65536\n") != (char *) 0, "STACK preserved");
}

TEST(rewrite_access_lines_removes_draccess_on_restore)
{
    const char *content = "TYPE=XIM\nACCESS=50\nDRACCESS=0\nSTACK=65536\n";
    char out[256];

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 0, -1);

    ASSERT_TRUE(strstr(out, "ACCESS=0\n") != (char *) 0, "ACCESS restored");
    ASSERT_TRUE(strstr(out, "DRACCESS") == (char *) 0, "DRACCESS line gone entirely, not just its value");
    ASSERT_TRUE(strstr(out, "TYPE=XIM\n") != (char *) 0, "TYPE preserved");
    ASSERT_TRUE(strstr(out, "STACK=65536\n") != (char *) 0, "STACK preserved");
}

TEST(rewrite_access_lines_updates_existing_draccess_without_duplicating_it)
{
    /* A further edit to a THIRD level while already disabled -
     * flow_compute_prior_access() keeps the ORIGINAL tracked value (0),
     * not the most recently disabled one (50) - this test only checks the
     * line-rewrite honors whatever prior_access it's given exactly once. */
    const char *content = "ACCESS=50\nDRACCESS=0\nTYPE=XIM\n";
    char out[256];
    char *first;
    char *second;

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 200, 0);

    ASSERT_TRUE(strstr(out, "ACCESS=200\n") != (char *) 0, "ACCESS updated to the third level");
    first = strstr(out, "DRACCESS=0\n");
    ASSERT_TRUE(first != (char *) 0, "DRACCESS kept at its original value");
    /* Guarded: a NULL `first` (a regression that drops DRACCESS entirely)
     * must fail the assertion above, not crash this test by dereferencing
     * NULL + 1 below - a segfault would abort the whole binary and hide
     * every later test's result, not just this one's. */
    second = (first != (char *) 0) ? strstr(first + 1, "DRACCESS=0\n") : (char *) 0;
    ASSERT_TRUE(second == (char *) 0, "DRACCESS appears exactly once, not duplicated");
}

TEST(rewrite_access_lines_appends_access_when_missing)
{
    /* do_edit_access()'s "no ACCESS line - defaulting to 0" case: the
     * .info genuinely has none, and the edit must still add one. */
    const char *content = "TYPE=XIM\nSTACK=65536\n";
    char out[256];

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 10, -1);

    ASSERT_STR_EQ(out, "TYPE=XIM\nSTACK=65536\nACCESS=10\n",
                  "ACCESS appended at the end, everything else untouched");
}

TEST(rewrite_access_lines_appends_access_after_a_final_line_missing_its_newline)
{
    /* The intersection the two tests above each miss individually: ACCESS
     * is absent (so it must be appended) AND the file's last line has no
     * trailing \n (so a naive append would merge into it). Without the
     * newline guard this produced "STACK=8192ACCESS=100\n" - one corrupted
     * tooltype and no ACCESS line at all, which the backend's parser would
     * read as "no ACCESS key", silently undoing whatever the sysop just
     * set. */
    const char *content = "TYPE=XIM\nSTACK=8192";
    char out[256];

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 100, -1);

    ASSERT_STR_EQ(out, "TYPE=XIM\nSTACK=8192\nACCESS=100\n",
                  "a newline separates the appended ACCESS from the prior unterminated line");
    ASSERT_TRUE(strstr(out, "8192ACCESS") == (char *) 0,
                 "STACK's value never merges with the appended ACCESS line");
}

TEST(rewrite_access_lines_drops_a_duplicate_access_line)
{
    /* A hand-edited or corrupted .info with two ACCESS lines - the result
     * must never carry two, or the BBS's tooltype parser (last-wins,
     * matching amiga-command-parser.util.ts) would silently take whichever
     * happens to sort last, contradicting whatever do_edit_access() told
     * the sysop it changed the level to. */
    const char *content = "ACCESS=1\nTYPE=XIM\nACCESS=2\n";
    char out[256];
    char *first;
    char *second;

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 99, -1);

    first = strstr(out, "ACCESS=99\n");
    ASSERT_TRUE(first != (char *) 0, "the new value is present");
    /* Guarded the same way as the DRACCESS-duplicate test above - a NULL
     * `first` must fail the assertion, not crash the test binary. */
    second = (first != (char *) 0) ? strstr(first + 1, "ACCESS=99\n") : (char *) 0;
    ASSERT_TRUE(second == (char *) 0, "ACCESS appears exactly once, the duplicate is dropped");
    ASSERT_TRUE(strstr(out, "TYPE=XIM\n") != (char *) 0, "the line between the duplicates is preserved");
}

TEST(rewrite_access_lines_preserves_crlf_of_untouched_lines)
{
    /* A .info copied through a CRLF-preserving transfer (or edited on a
     * non-Amiga machine): untouched lines keep whatever line ending they
     * arrived with; the ACCESS line this function itself emits always
     * uses this door's own canonical LF-only format. */
    const char *content = "TYPE=XIM\r\nACCESS=5\r\n";
    char out[256];

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 10, -1);

    ASSERT_TRUE(strstr(out, "TYPE=XIM\r\n") != (char *) 0,
                "the untouched line's original CRLF is preserved byte-for-byte");
    ASSERT_TRUE(strstr(out, "ACCESS=10\n") != (char *) 0,
                "the rewritten ACCESS line uses this door's own LF-only format");
    ASSERT_TRUE(strstr(out, "ACCESS=10\r\n") == (char *) 0,
                "the rewritten line does not inherit the old line's CR");
}

TEST(rewrite_access_lines_handles_a_final_line_with_no_trailing_newline)
{
    /* The file's last line (here, ACCESS itself) has no trailing \n at
     * all - a common way a hand-edited file ends. */
    const char *content = "TYPE=XIM\nACCESS=5";
    char out[256];

    (void) flow_rewrite_access_lines(content, out, sizeof(out), 9, -1);

    ASSERT_TRUE(strstr(out, "TYPE=XIM\n") != (char *) 0, "preceding line preserved");
    ASSERT_TRUE(strstr(out, "ACCESS=9\n") != (char *) 0,
                "ACCESS rewritten with a trailing newline even though the original had none");
}

TEST(rewrite_access_lines_too_many_lines_is_refused)
{
    /* FLOW_INFO_MAX_LINES is 32 - one more line than that must be refused,
     * the same defense flow_read_door_info() already applies to its own
     * read, so a hand-edited or corrupted .info can't turn this into an
     * unbounded loop. */
    char content[64 * 40];
    char out[4096];
    int i;

    content[0] = '\0';
    for (i = 0; i < 33; i++) {
        strcat(content, "X=1\n");
    }

    ASSERT_TRUE(flow_rewrite_access_lines(content, out, sizeof(out), 1, -1) < 0,
                "33 lines (one past FLOW_INFO_MAX_LINES) is refused");
}

TEST(rewrite_access_lines_output_buffer_too_small_is_refused)
{
    const char *content = "ACCESS=1\n";
    char out[4];

    ASSERT_TRUE(flow_rewrite_access_lines(content, out, sizeof(out), 99, -1) < 0,
                "an output buffer too small for even one line is refused, not truncated");
}

/* ---- flow_is_installed_row / the installed-only view's walk -------------
 *
 * ui_view_rebuild_installed() (doorrepo.c) walks cat->rows[] once, keeping
 * a row when flow_is_installed_row() says its archive is in the known-
 * installed set built from g_index[], and separately counts distinct known
 * archives that never matched any row (a door installed but no longer
 * present in the catalog - an orphan). doorrepo.c itself has no unit-test
 * target (it needs a real dr_catalog/g_index and index_load()'s file I/O),
 * so this local walker mirrors that exact algorithm over plain arrays,
 * exercising it entirely through flow_is_installed_row() - the split the
 * brief calls for. INDEX_MAX_ENTRIES itself is doorrepo.c's; 256 is
 * hardcoded here to match it for the boundary case below. */

#define TEST_INDEX_MAX_ENTRIES 256

static void rebuild_installed_view(const char *catalog[], int catalog_count,
                                    const char *known_archives[], int known_count,
                                    int *count_out, int *orphan_count_out)
{
    int matched[TEST_INDEX_MAX_ENTRIES];
    int i;
    int kept = 0;
    int matched_total = 0;

    for (i = 0; i < known_count; i++) {
        matched[i] = 0;
    }

    for (i = 0; i < catalog_count; i++) {
        if (flow_is_installed_row(catalog[i], known_archives, known_count)) {
            int j;
            kept++;
            for (j = 0; j < known_count; j++) {
                if (known_archives[j] != (const char *) 0
                    && strcmp(known_archives[j], catalog[i]) == 0) {
                    matched[j] = 1;
                    break;
                }
            }
        }
    }

    for (i = 0; i < known_count; i++) {
        if (matched[i]) {
            matched_total++;
        }
    }

    *count_out = kept;
    *orphan_count_out = known_count - matched_total;
}

TEST(installed_view_empty_index_keeps_nothing)
{
    const char *catalog[] = { "A.LHA", "B.LHA", "C.LHA" };
    const char *known[1];
    int count = -1;
    int orphans = -1;

    rebuild_installed_view(catalog, 3, known, 0, &count, &orphans);
    ASSERT_EQ(count, 0, "nothing kept when nothing is installed");
    ASSERT_EQ(orphans, 0, "no orphans when nothing is installed");
}

TEST(installed_view_one_match_is_kept)
{
    const char *catalog[] = { "A.LHA", "B.LHA", "C.LHA" };
    const char *known[] = { "B.LHA" };
    int count = -1;
    int orphans = -1;

    rebuild_installed_view(catalog, 3, known, 1, &count, &orphans);
    ASSERT_EQ(count, 1, "the one installed archive is kept");
    ASSERT_EQ(orphans, 0, "it was found, so it is not an orphan");
}

TEST(installed_view_one_orphan_is_counted_not_kept)
{
    const char *catalog[] = { "A.LHA", "B.LHA", "C.LHA" };
    const char *known[] = { "GONE.LHA" };
    int count = -1;
    int orphans = -1;

    rebuild_installed_view(catalog, 3, known, 1, &count, &orphans);
    ASSERT_EQ(count, 0, "an installed archive absent from the catalog is not shown");
    ASSERT_EQ(orphans, 1, "it counts as one orphan");
}

TEST(installed_view_mixed_matches_and_orphans_split_correctly)
{
    const char *catalog[] = { "A.LHA", "B.LHA", "C.LHA" };
    const char *known[] = { "A.LHA", "GONE1.LHA", "C.LHA", "GONE2.LHA" };
    int count = -1;
    int orphans = -1;

    rebuild_installed_view(catalog, 3, known, 4, &count, &orphans);
    ASSERT_EQ(count, 2, "A.LHA and C.LHA are both kept");
    ASSERT_EQ(orphans, 2, "GONE1.LHA and GONE2.LHA are both orphans");
}

TEST(installed_view_256_entries_all_matching_does_not_overflow)
{
    static char names[TEST_INDEX_MAX_ENTRIES][16];
    static const char *catalog[TEST_INDEX_MAX_ENTRIES];
    static const char *known[TEST_INDEX_MAX_ENTRIES];
    int i;
    int count = -1;
    int orphans = -1;

    for (i = 0; i < TEST_INDEX_MAX_ENTRIES; i++) {
        sprintf(names[i], "D%03d.LHA", i);
        catalog[i] = names[i];
        known[i] = names[i];
    }

    rebuild_installed_view(catalog, TEST_INDEX_MAX_ENTRIES, known, TEST_INDEX_MAX_ENTRIES,
                            &count, &orphans);
    ASSERT_EQ(count, TEST_INDEX_MAX_ENTRIES, "all 256 installed entries are kept");
    ASSERT_EQ(orphans, 0, "none of them are orphans");
}

TEST(is_installed_row_rejects_a_null_row_archive)
{
    const char *known[] = { "A.LHA" };

    ASSERT_TRUE(!flow_is_installed_row((const char *) 0, known, 1),
                "a NULL row archive never matches");
}

TEST(is_installed_row_is_case_sensitive_like_index_lookup)
{
    const char *known[] = { "A.LHA" };

    ASSERT_TRUE(!flow_is_installed_row("a.lha", known, 1),
                "differently-cased archive name does not match");
    ASSERT_TRUE(flow_is_installed_row("A.LHA", known, 1),
                "exact case matches");
}


/* ---- flow_build_extract_command ----
 *
 * The archiver is reached differently on each target and the command SHAPE
 * differs with it, which is exactly the kind of thing that is wrong for
 * months without anyone noticing: nothing here can be checked by reading
 * the door's output, because a wrong command still prints "Extracting...".
 */

TEST(extract_command_amiga_form_puts_the_destination_last)
{
    char out[600];
    ASSERT_TRUE(flow_build_extract_command(out, sizeof(out), "LhA",
                                           "PROGDIR:downloads/5D!DP002.LHA",
                                           "Doors:5DD/", 1) > 0,
                "amiga form builds");
    ASSERT_STR_EQ(out, "\"LhA\" x \"PROGDIR:downloads/5D!DP002.LHA\" \"Doors:5DD/\"",
                  "AmigaDOS LhA takes the destination as a third argument");
}

TEST(extract_command_native_form_uses_xw_because_lha_reads_arg_three_as_a_filter)
{
    char out[600];
    ASSERT_TRUE(flow_build_extract_command(out, sizeof(out), "lha",
                                           "/tmp/dl/A.LHA",
                                           "/tmp/doors/A/", 0) > 0,
                "native form builds");
    ASSERT_STR_EQ(out, "\"lha\" xw=\"/tmp/doors/A/\" \"/tmp/dl/A.LHA\"",
                  "Unix lha needs xw= or it extracts nothing");
}

TEST(extract_command_rejects_a_quote_in_any_value)
{
    char out[600];
    ASSERT_EQ(flow_build_extract_command(out, sizeof(out), "LhA",
                                         "T:evil\" ; rm -rf /", "Doors:X/", 0), -1,
              "a value carrying a double quote cannot be quoted safely");
    ASSERT_EQ(flow_build_extract_command(out, sizeof(out), "l\"ha",
                                         "T:A.LHA", "Doors:X/", 1), -1,
              "the archiver name is checked too");
}

TEST(extract_command_too_small_buffer_returns_error)
{
    char out[16];
    ASSERT_EQ(flow_build_extract_command(out, sizeof(out), "LhA",
                                         "PROGDIR:downloads/5D!DP002.LHA",
                                         "Doors:5DD/", 1), -1,
              "does not half-build a command");
}

TEST(extract_command_rejects_null_and_empty_arguments)
{
    char out[600];
    ASSERT_EQ(flow_build_extract_command(out, sizeof(out), (const char *) 0,
                                         "A.LHA", "Doors:X/", 1), -1, "null archiver");
    ASSERT_EQ(flow_build_extract_command(out, sizeof(out), "LhA",
                                         "", "Doors:X/", 1), -1, "empty archive path");
    ASSERT_EQ(flow_build_extract_command(out, sizeof(out), "LhA",
                                         "A.LHA", "", 1), -1, "empty destination");
}


/* ---- flow_install_verdict ----
 *
 * The reported bug in one line: the archiver reported success, not one
 * file had been written, and the door installed anyway. The BBS then
 * answered "No such command" for a door its own command config named.
 *
 * "The archiver said it worked" is the weakest of the three signals here
 * and the only one that was being trusted.
 */

TEST(verdict_refuses_when_the_listing_names_files_and_none_arrived)
{
    /* The live case: Execute()/system() reported success, the destination
     * directory was never created, every listed file is absent. */
    ASSERT_EQ(flow_install_verdict(1, 1, 0, 6, 0), FLOW_INSTALL_REFUSE_NOTHING_EXTRACTED,
              "archiver success is not evidence a file exists");
}

TEST(verdict_refuses_when_the_archiver_failed_and_the_program_is_missing)
{
    ASSERT_EQ(flow_install_verdict(0, 1, 0, 6, 3), FLOW_INSTALL_REFUSE_ARCHIVER_AND_MISSING,
              "two independent signals pointing the same way");
}

TEST(verdict_keeps_installing_when_only_the_protection_bits_hide_the_program)
{
    /* TELSER40.LHA: bin/telser IS on disk, fopen() cannot open it. Other
     * members of the same archive opened fine, which is what tells the two
     * cases apart. */
    ASSERT_EQ(flow_install_verdict(1, 1, 0, 6, 5), FLOW_INSTALL_WARN_PROGRAM_UNREADABLE,
              "an unreadable program among readable siblings is a warning");
}

TEST(verdict_installs_cleanly_when_the_program_is_there)
{
    ASSERT_EQ(flow_install_verdict(1, 1, 1, 6, 6), FLOW_INSTALL_OK, "nothing to report");
}

TEST(verdict_trusts_a_readable_program_over_a_useless_file_census)
{
    /* If the program itself opened, the install worked whatever the row
     * sampling made of the rest. */
    ASSERT_EQ(flow_install_verdict(1, 1, 1, 6, 0), FLOW_INSTALL_OK,
              "a readable program settles it");
}

TEST(verdict_warns_rather_than_refuses_when_there_is_no_listing_to_check)
{
    ASSERT_EQ(flow_install_verdict(1, 0, 0, 0, 0), FLOW_INSTALL_WARN_NO_LISTING,
              "absent evidence is not contradicting evidence");
}

TEST(verdict_warns_when_the_archiver_complained_but_the_program_extracted)
{
    ASSERT_EQ(flow_install_verdict(0, 1, 1, 6, 6), FLOW_INSTALL_WARN_ARCHIVER_ERROR,
              "Amiga archives routinely fail one member and extract the rest");
}

TEST(verdict_does_not_refuse_when_no_row_could_be_checked)
{
    /* listed_checked == 0 means the sampling itself found nothing to test,
     * not that the destination is empty. */
    ASSERT_EQ(flow_install_verdict(1, 1, 0, 0, 0), FLOW_INSTALL_WARN_PROGRAM_UNREADABLE,
              "no census taken is not a failed census");
}


/* ---- AREXX doors ----
 *
 * ACC-V103.LHA contains no executable at all: its program is
 * Account/AccEd.Rexx, and every other member carries a .TXT/.Doc/.snd
 * suffix. Both existing rules came up empty, so the install fell back to
 * the command name and wrote LOCATION=Doors:ACC/ACC - a path guaranteed
 * not to exist. The BBS then said "Door executable not found".
 */

static const char *ACC_LISTING =
    "FILES|16|5\n"
    "1025|0|2Nodez.TXT\n"
    "868|1|7TH_HEAVEN.NFO\n"
    "15220|0|Account/AccEd.Doc\n"
    "2458|0|Account/AccEd.History\n"
    "640|0|Account/AccEd.Presets\n"
    "25552|0|Account/AccEd.Rexx\n"
    "396|0|Account/VTL_ECC1.snd\n"
    "12431|0|Account/VTL_ECC1.txt\n"
    "4034|1|CONSOL.DISPLAYME\n"
    "1025|0|DiGital.TXT\n"
    "1060|0|Dream-Machine-team.TXT\n"
    "1000|0|FREEDL.txt\n"
    "28|0|File_Id.Diz\n"
    "671|1|TBRAD.TXT.DISPLAYME\n"
    "1346|1|TC.displayme\n"
    "851|1|TSLAD.TXT.DISPLAYME\n";

TEST(picker_finds_the_rexx_script_when_there_is_no_executable)
{
    char out[160];
    ASSERT_TRUE(flow_pick_door_binary(ACC_LISTING, "ACC-V103.LHA", "ACC",
                                      out, sizeof(out)) > 0,
                "a door whose program is a script is still a door");
    ASSERT_STR_EQ(out, "Account/AccEd.Rexx", "the .rexx is the program");
}

TEST(picker_still_prefers_a_real_executable_over_a_script)
{
    /* An AmigaDOS executable carries no suffix. When one is present it is
     * the program, and any .rexx beside it is a helper. */
    static const char *mixed =
        "FILES|3|0\n"
        "40000|0|BbsDoor\n"
        "25552|0|Install.rexx\n"
        "800|0|BbsDoor.doc\n";
    char out[160];
    flow_pick_door_binary(mixed, "SOMEDOOR.LHA", "SOMEDOOR", out, sizeof(out));
    ASSERT_STR_EQ(out, "BbsDoor", "extension-less beats .rexx");
}

TEST(picker_still_prefers_an_exact_name_match_over_a_script)
{
    static const char *mixed =
        "FILES|2|0\n"
        "25552|0|Setup.rexx\n"
        "9000|0|bin/SOMEDOOR\n";
    char out[160];
    flow_pick_door_binary(mixed, "SOMEDOOR.LHA", "SOMEDOOR", out, sizeof(out));
    ASSERT_STR_EQ(out, "bin/SOMEDOOR", "an exact name match wins outright");
}

TEST(picker_takes_the_largest_rexx_when_several_are_present)
{
    static const char *several =
        "FILES|3|0\n"
        "300|0|Small.rexx\n"
        "25552|0|Account/AccEd.Rexx\n"
        "1200|0|Other.REXX\n";
    char out[160];
    flow_pick_door_binary(several, "X.LHA", "X", out, sizeof(out));
    ASSERT_STR_EQ(out, "Account/AccEd.Rexx", "size is the only signal available");
}


TEST(effective_type_makes_a_rexx_program_an_AIM_door)
{
    /* express.e:4272-4276: DOORTYPE_AIM runs "REXXDOOR <node> <cmd>", which
     * is how AmiExpress runs an ARexx door. XIM (express.e:4278) executes
     * the LOCATION file as a program, which a script is not - so a catalog
     * entry calling ACC-V103.LHA an XIM door would fail on a real node. */
    ASSERT_STR_EQ(flow_effective_door_type("XIM", "Account/AccEd.Rexx"), "AIM",
                  "an ARexx script is an AIM door");
    ASSERT_STR_EQ(flow_effective_door_type("xim", "Account/acced.rexx"), "AIM",
                  "case-insensitive both sides");
    ASSERT_STR_EQ(flow_effective_door_type("", "Setup.rexx"), "AIM",
                  "an empty catalog type is the default XIM, so override it too");
}

TEST(effective_type_never_second_guesses_a_deliberate_type)
{
    /* AEM is the other ARexx spelling (REXXEXEC, express.e:4298-4302). A
     * catalog that already says AEM, or AIM, or anything else specific,
     * chose that on purpose. */
    ASSERT_STR_EQ(flow_effective_door_type("AEM", "Account/AccEd.Rexx"), "AEM",
                  "REXXEXEC doors are left alone");
    ASSERT_STR_EQ(flow_effective_door_type("AIM", "x.rexx"), "AIM", "already right");
    ASSERT_STR_EQ(flow_effective_door_type("TIM", "x.rexx"), "TIM", "not ours to change");
}

TEST(effective_type_leaves_a_real_executable_alone)
{
    ASSERT_STR_EQ(flow_effective_door_type("XIM", "Bull"), "XIM", "a binary keeps XIM");
    ASSERT_STR_EQ(flow_effective_door_type("", "prog"), "", "empty stays empty for the caller to default");
    ASSERT_STR_EQ(flow_effective_door_type("XIM", "notes.rexxdoc"), "XIM",
                  "only a real .rexx suffix counts");
}


/* ---- Footer bar builder (2026-08-24) --------------------------------
 *
 * flow_build_footer_bar() exists because ui_draw_footer()'s strcat chain
 * plus L=Installed overflows 80 columns on real rows and ui_draw_bar()'s
 * truncation drops the tail - which is where "Q=Quit" lives. See flow.h
 * for the full contract. */

TEST(footer_bar_fits_everything_when_there_is_room)
{
    const char *optional[3];
    char out[160];
    int len;

    optional[0] = "A=Archive";
    optional[1] = "F=Find";
    optional[2] = "C=System";

    len = flow_build_footer_bar(out, sizeof(out), 80, "ENTER/R=Get  I=Install",
                                optional, 3, "Q=Quit");

    ASSERT_STR_EQ(out, "ENTER/R=Get  I=Install  A=Archive  F=Find  C=System  Q=Quit",
                  "everything present, nothing dropped, when it all fits");
    ASSERT_EQ(len, (int) strlen(out), "returned length matches what was written");
}

TEST(footer_bar_drops_one_low_priority_part_to_fit)
{
    /* Sized so every part but the last (lowest priority) fits alongside
     * the mandatory prefix+suffix. */
    const char *optional[3];
    char out[160];
    int len;

    optional[0] = "A=Archive";
    optional[1] = "F=Find";
    optional[2] = "C=System";

    len = flow_build_footer_bar(out, sizeof(out), 52, "ENTER/R=Get  I=Install",
                                optional, 3, "Q=Quit");

    ASSERT_STR_EQ(out, "ENTER/R=Get  I=Install  A=Archive  F=Find  Q=Quit",
                  "lowest-priority part (C=System) dropped, the rest kept");
    ASSERT_TRUE(len <= 52, "result fits the column budget");
    ASSERT_TRUE(strstr(out, "Q=Quit") != (char *) 0, "suffix still present");
}

TEST(footer_bar_drops_several_parts_to_fit)
{
    const char *optional[3];
    char out[160];
    int len;

    optional[0] = "A=Archive";
    optional[1] = "F=Find";
    optional[2] = "C=System";

    /* Only room for the mandatory prefix+suffix - none of the three
     * optional parts fit. */
    len = flow_build_footer_bar(out, sizeof(out), 30, "ENTER/R=Get  I=Install",
                                optional, 3, "Q=Quit");

    ASSERT_STR_EQ(out, "ENTER/R=Get  I=Install  Q=Quit",
                  "every optional part dropped; mandatory prefix+suffix survive intact");
    ASSERT_TRUE(len == (int) strlen("ENTER/R=Get  I=Install  Q=Quit"), "length matches");
}

TEST(footer_bar_never_drops_the_suffix_even_when_prefix_and_suffix_alone_overflow)
{
    /* The "never silently drop the one documented way out" guarantee: a
     * pathological/tiny `cols` still gets the FULL prefix and FULL suffix
     * back, never a shorter string that cuts Q. */
    const char *optional[1];
    char out[160];
    int len;

    optional[0] = "A=Archive";

    len = flow_build_footer_bar(out, sizeof(out), 10, "ENTER/R=Get  U=Uninstall",
                                optional, 1, "Q=Quit");

    ASSERT_STR_EQ(out, "ENTER/R=Get  U=Uninstall  Q=Quit",
                  "prefix and suffix both survive untruncated past the cols budget");
    ASSERT_TRUE(len > 10, "the pathological case is allowed to exceed cols - dropping Q is not");
    ASSERT_TRUE(strstr(out, "Q=Quit") != (char *) 0, "the one documented way out is still there");
}

TEST(footer_bar_reproduces_the_real_94_char_overflow_case_at_80_cols)
{
    /* The exact real-world case from the finding: ui_draw_footer()'s
     * prefix for an installed row with ads and documentation, plus all
     * SEVEN optional parts (M=Access added by Task 4) in the browser's
     * real priority order, at the default ScreenCols=80. Unfixed (pre-
     * flow_build_footer_bar()), the equivalent strcat chain is 104
     * characters and would truncate mid-word past col 80, cutting
     * Q=Quit entirely - flow_build_footer_bar() exists so that never
     * happens, regardless of how many optional parts there are. */
    const char *optional[7];
    char out[160];
    int len;
    char raw[160];

    optional[0] = "S=Strip ads";
    optional[1] = "M=Access";
    optional[2] = "A=Archive";
    optional[3] = "V=Doc";
    optional[4] = "F=Find";
    optional[5] = "C=System";
    optional[6] = "L=Installed";

    strcpy(raw, "ENTER/R=Get  U=Uninstall");
    strcat(raw, "  S=Strip ads");
    strcat(raw, "  M=Access");
    strcat(raw, "  A=Archive");
    strcat(raw, "  V=Doc");
    strcat(raw, "  F=Find  C=System  L=Installed  Q=Quit");
    ASSERT_EQ((int) strlen(raw), 104, "sanity: the unfixed strcat chain really is 104 bytes with all 7 parts");

    len = flow_build_footer_bar(out, sizeof(out), 80, "ENTER/R=Get  U=Uninstall",
                                optional, 7, "Q=Quit");

    ASSERT_TRUE(len <= 80, "fixed bar fits the real 80-column screen");
    ASSERT_TRUE(strlen(out) >= 6
                && strcmp(out + strlen(out) - 6, "Q=Quit") == 0,
                "bar always ends with the full, unmangled Q=Quit");
    ASSERT_TRUE(strstr(out, "L=Ins ") == (char *) 0 || strstr(out, "L=Installed") != (char *) 0,
                "L=Installed never appears cut mid-word");
}

TEST(footer_bar_seven_parts_at_80_cols_drops_find_that_six_parts_fit)
{
    /* Documents a real, INTENTIONAL trade-off from adding M=Access
     * (Task 4's whole-branch review, Important #5): with 6 optional parts
     * (pre-M), F=Find fit at the default 80 columns on an installed row
     * with both ads and documentation. With M added as the 7th, ahead of
     * F/C/L in priority (a deliberate, kept decision - M and S/A/V all act
     * on the one selected door, F/C/L are screen-level), the budget is
     * tight enough that F=Find (and C=System, L=Installed, which were
     * already being dropped even before M) is now the one part that
     * crosses from "fits" to "dropped". Verified empirically against the
     * real function, not computed by hand - this test is that proof, kept
     * as a permanent regression check so a future change to any part's
     * wording notices if the trade-off shifts again. */
    const char *optional6[6];
    const char *optional7[7];
    char out6[160];
    char out7[160];

    optional6[0] = "S=Strip ads";
    optional6[1] = "A=Archive";
    optional6[2] = "V=Doc";
    optional6[3] = "F=Find";
    optional6[4] = "C=System";
    optional6[5] = "L=Installed";

    optional7[0] = "S=Strip ads";
    optional7[1] = "M=Access";
    optional7[2] = "A=Archive";
    optional7[3] = "V=Doc";
    optional7[4] = "F=Find";
    optional7[5] = "C=System";
    optional7[6] = "L=Installed";

    (void) flow_build_footer_bar(out6, sizeof(out6), 80, "ENTER/R=Get  U=Uninstall",
                                 optional6, 6, "Q=Quit");
    (void) flow_build_footer_bar(out7, sizeof(out7), 80, "ENTER/R=Get  U=Uninstall",
                                 optional7, 7, "Q=Quit");

    ASSERT_TRUE(strstr(out6, "F=Find") != (char *) 0,
                "sanity: without M, F=Find used to fit at 80 cols on this row");
    ASSERT_TRUE(strstr(out7, "M=Access") != (char *) 0,
                "M=Access itself always fits - it outranks F/C/L");
    ASSERT_TRUE(strstr(out7, "F=Find") == (char *) 0,
                "with M added, F=Find is now the part that gets dropped at 80 cols");
    ASSERT_TRUE(strlen(out7) >= 6 && strcmp(out7 + strlen(out7) - 6, "Q=Quit") == 0,
                "Q=Quit is still never the one that gets cut");
}

TEST(footer_bar_installed_screen_real_parts_fit_at_80_cols)
{
    /* Mirrors ui_draw_footer_installed()'s real part set. U=Uninstall is
     * folded into the mandatory prefix (the screen's core action, same as
     * ENTER/R=Get); A=Archive is now an OPTIONAL part, lowest priority
     * (last), because folding it into the mandatory prefix too was itself
     * the residual bug this test's cols=40 sibling below exists to catch -
     * see footer_bar_installed_screen_fits_the_documented_cols_40_floor.
     * At 80 cols nothing needs to be dropped either way; this test locks
     * in that "everything fits, nothing silently dropped" case, ahead of
     * two more sibling plans about to add to this footer too. */
    const char *optional[3];
    char out[160];
    int len;

    optional[0] = "V=Doc";
    optional[1] = "S=Strip";
    optional[2] = "A=Archive";

    len = flow_build_footer_bar(out, sizeof(out), 80,
                                "ENTER/R=Get  U=Uninstall",
                                optional, 3, "Q=Back");

    ASSERT_STR_EQ(out, "ENTER/R=Get  U=Uninstall  V=Doc  S=Strip  A=Archive  Q=Back",
                  "every real part present, all fits comfortably under 80 cols");
    ASSERT_TRUE(len <= 80, "fits the real 80-column screen");
}

TEST(footer_bar_installed_screen_fits_the_documented_cols_40_floor)
{
    /* config.c's validate_screen_cols() accepts ScreenCols as low as 40 -
     * "below 40 the two-pane layout cannot be drawn at all" - so 40 is a
     * REAL, sysop-settable, supported floor, not a pathological edge case
     * (unlike footer_bar_never_drops_the_suffix_even_when_prefix_and_
     * suffix_alone_overflow's synthetic cols=10, which IS pathological).
     *
     * The residual bug this pins down: before this test's fix,
     * ui_draw_footer_installed()'s mandatory prefix folded in BOTH
     * A=Archive and U=Uninstall - "ENTER/R=Get  A=Archive  U=Uninstall"
     * plus the "  Q=Back" suffix is 43 bytes, already past 40 before any
     * optional part is even considered. flow_build_footer_bar()'s "never
     * drop the suffix" guarantee only covers ITS OWN return value (the
     * suffix really is always appended in full); it cannot rescue a
     * caller whose MANDATORY portion alone already exceeds `cols`,
     * because ui_draw_bar()'s render-layer truncation (ansi_center(),
     * first `cols` bytes) still cuts the tail off whatever this function
     * returns. At cols=40 that truncated the real screen to
     * "ENTER/R=Get  A=Archive  U=Uninstall  Q=" - "Back" gone entirely,
     * on any sysop's ScreenCols=40 config, independent of which optional
     * parts were or were not present.
     *
     * The fix: A=Archive reclassified out of the mandatory prefix into
     * the optional parts, lowest priority (dropped first under budget
     * pressure) - it is a secondary lookup a sysop can still reach after
     * ENTER/R, unlike U=Uninstall, the screen's core action, which stays
     * mandatory. That drops the mandatory-only total from 43 to 32,
     * comfortably under the 40-col floor. */
    const char *optional[3];
    char out[160];
    int len;

    optional[0] = "V=Doc";
    optional[1] = "S=Strip";
    optional[2] = "A=Archive";

    len = flow_build_footer_bar(out, sizeof(out), 40,
                                "ENTER/R=Get  U=Uninstall",
                                optional, 3, "Q=Back");

    ASSERT_STR_EQ(out, "ENTER/R=Get  U=Uninstall  V=Doc  Q=Back",
                  "at the 40-col floor, S=Strip and A=Archive are dropped (lowest priority) "
                  "but V=Doc and the full Q=Back survive");
    ASSERT_TRUE(len <= 40, "fits the documented cols=40 floor");
    ASSERT_TRUE(strlen(out) >= 6 && strcmp(out + strlen(out) - 6, "Q=Back") == 0,
                "bar always ends with the full, unmangled Q=Back at the 40-col floor");
}

TEST(footer_bar_browse_screen_fits_the_documented_cols_40_floor)
{
    /* Symmetry check requested alongside the installed-screen fix above:
     * ui_draw_footer() (the main browse screen) never folded A=Archive
     * into its mandatory prefix in the first place - only S=Strip ads,
     * M=Access, A=Archive, V=Doc, F=Find, C=System and L=Installed are
     * optional there (M added by Task 4, right after S - both act on the
     * one selected, already-installed door), so its mandatory-only total
     * (worst case, the "installed" prefix: "ENTER/R=Get  U=Uninstall" +
     * "  Q=Quit" = 32 bytes) already fit the 40-col floor before this fix
     * and needed no change. Locked in here so a future edit to
     * ui_draw_footer()'s prefix gets the same regression coverage the
     * installed screen just needed. */
    const char *optional[7];
    char out[160];
    int len;

    optional[0] = "S=Strip ads";
    optional[1] = "M=Access";
    optional[2] = "A=Archive";
    optional[3] = "V=Doc";
    optional[4] = "F=Find";
    optional[5] = "C=System";
    optional[6] = "L=Installed";

    len = flow_build_footer_bar(out, sizeof(out), 40, "ENTER/R=Get  U=Uninstall",
                                optional, 7, "Q=Quit");

    ASSERT_TRUE(len <= 40, "fits the documented cols=40 floor");
    ASSERT_TRUE(strlen(out) >= 6 && strcmp(out + strlen(out) - 6, "Q=Quit") == 0,
                "bar always ends with the full, unmangled Q=Quit at the 40-col floor");

    /* Same check for the not-installed prefix (shorter mandatory portion,
     * so strictly easier to fit - covered for completeness). */
    len = flow_build_footer_bar(out, sizeof(out), 40, "ENTER/R=Get  I=Install",
                                optional, 6, "Q=Quit");

    ASSERT_TRUE(len <= 40, "not-installed prefix also fits the documented cols=40 floor");
    ASSERT_TRUE(strlen(out) >= 6 && strcmp(out + strlen(out) - 6, "Q=Quit") == 0,
                "bar always ends with the full, unmangled Q=Quit (not-installed prefix)");
}

TEST(footer_bar_empty_list_case_is_just_the_suffix)
{
    /* installed_loop_ansi()'s empty-state footer: no prefix at all (none
     * of the row-dependent keys do anything with nothing installed), just
     * the one documented way out. */
    char out[160];
    int len;

    len = flow_build_footer_bar(out, sizeof(out), 80, "",
                                (const char *const *) 0, 0, "Q=Back");

    ASSERT_STR_EQ(out, "Q=Back", "no stray leading separator when the prefix is empty");
    ASSERT_EQ(len, 6, "length is just strlen(\"Q=Back\")");
}

TEST(footer_bar_too_small_buffer_returns_error)
{
    char out[8];
    const char *optional[1];
    int len;

    optional[0] = "A=Archive";

    len = flow_build_footer_bar(out, sizeof(out), 80, "ENTER/R=Get  U=Uninstall",
                                optional, 1, "Q=Quit");

    ASSERT_EQ(len, -1, "outcap too small for even the mandatory parts returns -1");
}

int main(void)
{
    printf("====== flow (pure decision logic) Tests ======\n");

    RUN_TEST(index_line_round_trips);
    RUN_TEST(index_line_handles_real_archive_names);
    RUN_TEST(index_line_rejects_what_it_cannot_represent);
    RUN_TEST(index_parse_rejects_half_records);
    RUN_TEST(index_parse_tolerates_crlf_and_long_fields);
    RUN_TEST(index_path_sits_in_the_download_dir);

    RUN_TEST(parse_tooltype_line_basic);
    RUN_TEST(parse_tooltype_line_strips_crlf);
    RUN_TEST(parse_tooltype_line_no_equals_fails);
    RUN_TEST(parse_tooltype_line_empty_key_fails);
    RUN_TEST(parse_tooltype_line_too_long_for_buffer_fails);
    RUN_TEST(read_door_info_missing_file_returns_zero);
    RUN_TEST(read_door_info_parses_a_real_installed_info);
    RUN_TEST(read_door_info_reads_draccess_when_present);
    RUN_TEST(read_door_info_missing_stack_leaves_other_fields_intact);
    RUN_TEST(read_door_info_rejects_negative_access);
    RUN_TEST(read_door_info_tolerates_a_malformed_line);

    RUN_TEST(rewrite_access_lines_preserves_unknown_tooltypes_through_an_access_edit);
    RUN_TEST(rewrite_access_lines_adds_draccess_when_none_existed);
    RUN_TEST(rewrite_access_lines_removes_draccess_on_restore);
    RUN_TEST(rewrite_access_lines_updates_existing_draccess_without_duplicating_it);
    RUN_TEST(rewrite_access_lines_appends_access_when_missing);
    RUN_TEST(rewrite_access_lines_appends_access_after_a_final_line_missing_its_newline);
    RUN_TEST(rewrite_access_lines_drops_a_duplicate_access_line);
    RUN_TEST(rewrite_access_lines_preserves_crlf_of_untouched_lines);
    RUN_TEST(rewrite_access_lines_handles_a_final_line_with_no_trailing_newline);
    RUN_TEST(rewrite_access_lines_too_many_lines_is_refused);
    RUN_TEST(rewrite_access_lines_output_buffer_too_small_is_refused);

    RUN_TEST(installed_view_empty_index_keeps_nothing);
    RUN_TEST(installed_view_one_match_is_kept);
    RUN_TEST(installed_view_one_orphan_is_counted_not_kept);
    RUN_TEST(installed_view_mixed_matches_and_orphans_split_correctly);
    RUN_TEST(installed_view_256_entries_all_matching_does_not_overflow);
    RUN_TEST(is_installed_row_rejects_a_null_row_archive);
    RUN_TEST(is_installed_row_is_case_sensitive_like_index_lookup);
    RUN_TEST(eof_key_ends_the_session);
    RUN_TEST(bbs_command_accepts_upper_alnum);
    RUN_TEST(bbs_command_rejects_everything_else);
    RUN_TEST(suggest_command_from_real_archive_names);
    RUN_TEST(suggest_command_fails_when_nothing_usable_remains);
    RUN_TEST(install_paths_join_amigados_style);
    RUN_TEST(info_content_matches_doormans_format);
    RUN_TEST(build_info_content_no_prior_access_omits_draccess);
    RUN_TEST(build_info_content_with_prior_access_appends_draccess);
    RUN_TEST(build_info_content_preserves_type_location_stack_format);
    RUN_TEST(files_rows_parse);
    RUN_TEST(pick_binary_prefers_the_extensionless_file);
    RUN_TEST(pick_binary_prefers_an_exact_name_match);
    RUN_TEST(pick_binary_gives_up_when_everything_has_an_extension);
    RUN_TEST(pick_binary_ignores_ad_files);
    RUN_TEST(command_from_listing);

    RUN_TEST(page_first_page_full);
    RUN_TEST(page_middle_page_full);
    RUN_TEST(page_last_page_partial);
    RUN_TEST(page_exact_multiple_no_partial_page);
    RUN_TEST(page_size_one);
    RUN_TEST(page_empty_catalog);
    RUN_TEST(page_number_clamped_above_range);
    RUN_TEST(page_number_clamped_below_range);
    RUN_TEST(page_size_defensively_treated_as_one);

    RUN_TEST(verify_match_first_attempt_is_ok);
    RUN_TEST(verify_mismatch_first_attempt_retries);
    RUN_TEST(verify_mismatch_second_attempt_aborts);
    RUN_TEST(verify_match_second_attempt_after_retry_is_ok);
    RUN_TEST(verify_third_attempt_mismatch_still_aborts);

    RUN_TEST(encode_plain_alnum_untouched);
    RUN_TEST(encode_unreserved_punctuation_untouched);
    RUN_TEST(encode_space_becomes_percent20);
    RUN_TEST(encode_ampersand_and_equals);
    RUN_TEST(encode_too_small_buffer_returns_error);
    RUN_TEST(build_query_type_only);
    RUN_TEST(build_query_search_only);
    RUN_TEST(build_query_both_type_and_search);
    RUN_TEST(build_query_neither_filter_is_empty_string);
    RUN_TEST(build_archive_path_ampersand_left_unencoded);
    RUN_TEST(build_archive_path_caret_left_unencoded);
    RUN_TEST(build_archive_path_too_small_buffer_returns_error);
    RUN_TEST(build_admin_login_path_basic);
    RUN_TEST(build_admin_login_path_too_small_buffer_returns_error);

    RUN_TEST(shell_char_ordinary_amiga_path_is_safe);
    RUN_TEST(shell_char_exact_reported_injection_is_unsafe);
    RUN_TEST(shell_char_double_quote_is_unsafe);
    RUN_TEST(shell_char_single_quote_is_unsafe);
    RUN_TEST(shell_char_backtick_is_unsafe);
    RUN_TEST(shell_char_dollar_is_unsafe);
    RUN_TEST(shell_char_semicolon_is_unsafe);
    RUN_TEST(shell_char_backslash_is_unsafe);
    RUN_TEST(shell_char_pipe_is_unsafe);
    RUN_TEST(shell_char_ampersand_is_unsafe);
    RUN_TEST(shell_char_less_than_is_unsafe);
    RUN_TEST(shell_char_greater_than_is_unsafe);
    RUN_TEST(shell_char_carriage_return_is_unsafe);
    RUN_TEST(shell_char_newline_is_unsafe);
    RUN_TEST(shell_char_empty_string_is_safe);
    RUN_TEST(shell_char_hash_is_unsafe);

    RUN_TEST(command_token_plain_name_is_valid);
    RUN_TEST(command_token_amiga_path_is_valid);
    RUN_TEST(command_token_dashes_dots_underscores_valid);
    RUN_TEST(command_token_empty_is_invalid);
    RUN_TEST(command_token_null_is_invalid);
    RUN_TEST(command_token_too_long_is_invalid);
    RUN_TEST(command_token_exact_reported_hash_comment_payload_is_invalid);
    RUN_TEST(command_token_whitespace_is_invalid);
    RUN_TEST(command_token_semicolon_is_invalid);
    RUN_TEST(command_token_percent_is_invalid);
    RUN_TEST(command_token_tilde_is_invalid);
    RUN_TEST(command_token_caret_is_invalid);
    RUN_TEST(command_token_parens_are_invalid);
    RUN_TEST(command_token_hash_is_invalid);
    RUN_TEST(command_token_quote_chars_are_invalid);

    RUN_TEST(archive_filename_exact_reported_traversal_payload_is_unsafe);
    RUN_TEST(archive_filename_amiga_bare_slash_traversal_is_unsafe);
    RUN_TEST(archive_filename_dotdot_segment_mid_string_is_unsafe);
    RUN_TEST(archive_filename_backslash_is_unsafe);
    RUN_TEST(archive_filename_colon_is_unsafe);
    RUN_TEST(archive_filename_leading_dot_is_unsafe);
    RUN_TEST(archive_filename_empty_is_unsafe);
    RUN_TEST(archive_filename_null_is_unsafe);
    RUN_TEST(archive_filename_control_byte_is_unsafe);
    RUN_TEST(archive_filename_ordinary_name_is_safe);
    RUN_TEST(archive_filename_real_catalog_punctuation_is_safe);

    RUN_TEST(dotdot_segment_detected_with_slash);
    RUN_TEST(dotdot_segment_detected_amiga_style);
    RUN_TEST(dotdot_segment_ordinary_path_is_clean);
    RUN_TEST(dotdot_segment_null_is_clean);

    RUN_TEST(local_path_device_needs_no_separator);
    RUN_TEST(local_path_directory_with_trailing_slash_needs_no_separator);
    RUN_TEST(local_path_bare_directory_gets_separator_inserted);
    RUN_TEST(local_path_too_small_buffer_returns_error);
    RUN_TEST(nav_down_advances_one_and_stops_at_the_end);
    RUN_TEST(nav_up_retreats_one_and_stops_at_the_top);
    RUN_TEST(nav_pages_clamp_at_both_ends);
    RUN_TEST(nav_home_and_end_go_to_the_edges);
    RUN_TEST(nav_on_an_empty_view_selects_nothing);
    RUN_TEST(nav_repairs_a_selection_left_past_the_end);
    RUN_TEST(nav_none_leaves_the_selection_alone);
    RUN_TEST(nav_treats_a_zero_page_as_one);

    RUN_TEST(clamp_view_leaves_a_still_valid_selection_alone);
    RUN_TEST(clamp_view_uninstalling_the_last_row_in_view_pulls_selected_back);
    RUN_TEST(clamp_view_uninstalling_the_only_row_empties_the_view);
    RUN_TEST(clamp_view_pulls_top_index_down_to_a_selection_that_scrolled_above_it);
    RUN_TEST(clamp_view_pulls_top_index_up_when_selected_is_below_the_window);
    RUN_TEST(clamp_view_tolerates_a_zero_visible_rows);
    RUN_TEST(info_temp_path_is_the_config_path_plus_new);
    RUN_TEST(info_temp_path_stays_in_the_same_directory);
    RUN_TEST(info_temp_path_too_small_buffer_returns_error);
    RUN_TEST(info_temp_path_rejects_an_empty_target);
    RUN_TEST(bad_path_appends_suffix_to_the_local_path);
    RUN_TEST(bad_path_keeps_the_directory_the_download_went_to);
    RUN_TEST(bad_path_too_small_buffer_returns_error);
    RUN_TEST(bad_path_rejects_an_empty_local_path);

    RUN_TEST(cache_reused_when_revisions_match);
    RUN_TEST(cache_not_reused_when_revisions_differ);
    RUN_TEST(cache_not_reused_when_cached_empty);
    RUN_TEST(cache_not_reused_when_server_revision_is_unknown);

    RUN_TEST(effective_row_count_under_cap);
    RUN_TEST(effective_row_count_over_cap);
    RUN_TEST(declared_count_exceeds_cap_true);
    RUN_TEST(declared_count_exceeds_cap_false);

    RUN_TEST(archive_ceiling_exact_reported_attack_bounded_far_below_10mb);
    RUN_TEST(archive_ceiling_uses_percent_slack_when_larger_than_floor);
    RUN_TEST(archive_ceiling_zero_declared_size_uses_absolute_max);
    RUN_TEST(archive_ceiling_implausibly_large_declared_size_uses_absolute_max);
    RUN_TEST(archive_ceiling_declared_size_exactly_at_absolute_max_is_clamped);
    RUN_TEST(archive_ceiling_never_exceeds_absolute_max_for_any_plausible_declared_size);
    RUN_TEST(archive_ceiling_real_catalog_max_size_is_reasonable);

    RUN_TEST(effective_type_makes_a_rexx_program_an_AIM_door);
    RUN_TEST(effective_type_never_second_guesses_a_deliberate_type);
    RUN_TEST(effective_type_leaves_a_real_executable_alone);
    RUN_TEST(picker_finds_the_rexx_script_when_there_is_no_executable);
    RUN_TEST(picker_still_prefers_a_real_executable_over_a_script);
    RUN_TEST(picker_still_prefers_an_exact_name_match_over_a_script);
    RUN_TEST(picker_takes_the_largest_rexx_when_several_are_present);

    RUN_TEST(verdict_refuses_when_the_listing_names_files_and_none_arrived);
    RUN_TEST(verdict_refuses_when_the_archiver_failed_and_the_program_is_missing);
    RUN_TEST(verdict_keeps_installing_when_only_the_protection_bits_hide_the_program);
    RUN_TEST(verdict_installs_cleanly_when_the_program_is_there);
    RUN_TEST(verdict_trusts_a_readable_program_over_a_useless_file_census);
    RUN_TEST(verdict_warns_rather_than_refuses_when_there_is_no_listing_to_check);
    RUN_TEST(verdict_warns_when_the_archiver_complained_but_the_program_extracted);
    RUN_TEST(verdict_does_not_refuse_when_no_row_could_be_checked);

    RUN_TEST(extract_command_amiga_form_puts_the_destination_last);
    RUN_TEST(extract_command_native_form_uses_xw_because_lha_reads_arg_three_as_a_filter);
    RUN_TEST(extract_command_rejects_a_quote_in_any_value);
    RUN_TEST(extract_command_too_small_buffer_returns_error);
    RUN_TEST(extract_command_rejects_null_and_empty_arguments);

    RUN_TEST(plain_alnum_accepts_real_door_types);
    RUN_TEST(plain_alnum_rejects_query_injection_attempt);
    RUN_TEST(plain_alnum_rejects_empty_and_null);
    RUN_TEST(plain_alnum_rejects_whitespace_and_punctuation);

    RUN_TEST(validate_access_level_accepts_zero);
    RUN_TEST(validate_access_level_accepts_max);
    RUN_TEST(validate_access_level_rejects_over_max);
    RUN_TEST(validate_access_level_rejects_negative);
    RUN_TEST(validate_access_level_rejects_empty);
    RUN_TEST(validate_access_level_rejects_garbage);
    RUN_TEST(validate_access_level_rejects_whitespace);
    RUN_TEST(validate_access_level_rejects_overlong);
    RUN_TEST(validate_access_level_rejects_leading_zero);
    RUN_TEST(validate_access_level_rejects_double_zero);

    RUN_TEST(compute_prior_access_case1_first_disable_starts_tracking);
    RUN_TEST(compute_prior_access_noop_edit_stays_untracked);
    RUN_TEST(compute_prior_access_case2_restore_stops_tracking);
    RUN_TEST(compute_prior_access_case3_third_level_keeps_original_tracked);
    RUN_TEST(compute_prior_access_resubmit_disabled_value_keeps_tracking);

    RUN_TEST(footer_bar_fits_everything_when_there_is_room);
    RUN_TEST(footer_bar_drops_one_low_priority_part_to_fit);
    RUN_TEST(footer_bar_drops_several_parts_to_fit);
    RUN_TEST(footer_bar_never_drops_the_suffix_even_when_prefix_and_suffix_alone_overflow);
    RUN_TEST(footer_bar_reproduces_the_real_94_char_overflow_case_at_80_cols);
    RUN_TEST(footer_bar_seven_parts_at_80_cols_drops_find_that_six_parts_fit);
    RUN_TEST(footer_bar_installed_screen_real_parts_fit_at_80_cols);
    RUN_TEST(footer_bar_installed_screen_fits_the_documented_cols_40_floor);
    RUN_TEST(footer_bar_browse_screen_fits_the_documented_cols_40_floor);
    RUN_TEST(footer_bar_empty_list_case_is_just_the_suffix);
    RUN_TEST(footer_bar_too_small_buffer_returns_error);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return tests_failed > 0 ? 1 : 0;
}
