/* test_flow.c - tests for the pure decision logic extracted from
 * doorrepo.c into flow.h/flow.c: pagination maths, the download
 * verification retry state machine, and query-string/URL-path
 * construction. No blessed/door/network dependencies - links only flow.c.
 */

#include <stdio.h>
#include <string.h>
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

int main(void)
{
    printf("====== flow (pure decision logic) Tests ======\n");

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

    RUN_TEST(local_path_device_needs_no_separator);
    RUN_TEST(local_path_directory_with_trailing_slash_needs_no_separator);
    RUN_TEST(local_path_bare_directory_gets_separator_inserted);
    RUN_TEST(local_path_too_small_buffer_returns_error);

    RUN_TEST(cache_reused_when_revisions_match);
    RUN_TEST(cache_not_reused_when_revisions_differ);
    RUN_TEST(cache_not_reused_when_cached_empty);
    RUN_TEST(cache_not_reused_when_server_revision_is_unknown);

    RUN_TEST(effective_row_count_under_cap);
    RUN_TEST(effective_row_count_over_cap);
    RUN_TEST(declared_count_exceeds_cap_true);
    RUN_TEST(declared_count_exceeds_cap_false);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return tests_failed > 0 ? 1 : 0;
}
