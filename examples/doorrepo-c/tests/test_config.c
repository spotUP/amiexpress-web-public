#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "../config.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-50s ", #name); fflush(stdout); test_##name(); } while(0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((got) == (expected)) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got %d, expected %d)\n", msg, got, expected); \
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

TEST(defaults_applied)
{
    dr_config cfg;
    config_defaults(&cfg);
    ASSERT_STR_EQ(cfg.host, "bbs.uprough.net", "default host");
}

TEST(missing_file_returns_zero)
{
    dr_config cfg;
    int result = config_load(&cfg, "/tmp/nonexistent_doorrepo_config_xyz", NULL);
    ASSERT_EQ(result, 0, "missing file should return 0");
}

TEST(missing_file_preserves_defaults)
{
    dr_config cfg;
    dr_config original;
    config_defaults(&cfg);
    memcpy(&original, &cfg, sizeof(dr_config));
    config_load(&cfg, "/tmp/nonexistent_doorrepo_config_xyz", NULL);
    ASSERT_STR_EQ(cfg.host, original.host, "host unchanged");
    ASSERT_EQ(cfg.port, original.port, "port unchanged");
    ASSERT_STR_EQ(cfg.path, original.path, "path unchanged");
    ASSERT_STR_EQ(cfg.download_dir, original.download_dir, "download_dir unchanged");
    ASSERT_EQ(cfg.page_size, original.page_size, "page_size unchanged");
    ASSERT_EQ(cfg.timeout_secs, original.timeout_secs, "timeout_secs unchanged");
    ASSERT_STR_EQ(cfg.lha_command, original.lha_command, "lha_command unchanged");
    ASSERT_EQ(cfg.extract_after_download, original.extract_after_download, "extract_after_download unchanged");
    ASSERT_STR_EQ(cfg.log_file, original.log_file, "log_file unchanged");
}

TEST(parse_host)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_host.cfg", "w");
    fprintf(f, "RepoHost=example.com\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_host.cfg", NULL);
    ASSERT_STR_EQ(cfg.host, "example.com", "RepoHost parsed");
    unlink("/tmp/test_config_host.cfg");
}

TEST(parse_port)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_port.cfg", "w");
    fprintf(f, "RepoPort=8080\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_port.cfg", NULL);
    ASSERT_EQ(cfg.port, 8080, "RepoPort parsed");
    unlink("/tmp/test_config_port.cfg");
}

TEST(parse_path)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_path.cfg", "w");
    fprintf(f, "RepoPath=/api/v1/doors\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_path.cfg", NULL);
    ASSERT_STR_EQ(cfg.path, "/api/v1/doors", "RepoPath parsed");
    unlink("/tmp/test_config_path.cfg");
}

TEST(parse_download_dir)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_dl.cfg", "w");
    fprintf(f, "DownloadDir=RAM:\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_dl.cfg", NULL);
    ASSERT_STR_EQ(cfg.download_dir, "RAM:", "DownloadDir parsed");
    unlink("/tmp/test_config_dl.cfg");
}

TEST(parse_page_size)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_ps.cfg", "w");
    fprintf(f, "PageSize=50\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_ps.cfg", NULL);
    ASSERT_EQ(cfg.page_size, 50, "PageSize parsed");
    unlink("/tmp/test_config_ps.cfg");
}

TEST(parse_timeout)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_timeout.cfg", "w");
    fprintf(f, "TimeoutSecs=60\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_timeout.cfg", NULL);
    ASSERT_EQ(cfg.timeout_secs, 60, "TimeoutSecs parsed");
    unlink("/tmp/test_config_timeout.cfg");
}

TEST(parse_lha_command)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_lha.cfg", "w");
    fprintf(f, "LhaCommand=7z\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_lha.cfg", NULL);
    ASSERT_STR_EQ(cfg.lha_command, "7z", "LhaCommand parsed");
    unlink("/tmp/test_config_lha.cfg");
}

TEST(parse_extract_yes)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_ex_yes.cfg", "w");
    fprintf(f, "ExtractAfterDownload=yes\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_ex_yes.cfg", NULL);
    ASSERT_EQ(cfg.extract_after_download, 1, "ExtractAfterDownload=yes -> 1");
    unlink("/tmp/test_config_ex_yes.cfg");
}

TEST(parse_extract_no)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_ex_no.cfg", "w");
    fprintf(f, "ExtractAfterDownload=no\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_ex_no.cfg", NULL);
    ASSERT_EQ(cfg.extract_after_download, 0, "ExtractAfterDownload=no -> 0");
    unlink("/tmp/test_config_ex_no.cfg");
}

TEST(keep_failed_downloads_defaults_to_off)
{
    dr_config cfg;
    config_defaults(&cfg);
    ASSERT_EQ(cfg.keep_failed_downloads, 0, "a door must not hoard corrupt archives unasked");
}

TEST(keep_failed_downloads_yes_is_parsed)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_keepbad.cfg", "w");
    fprintf(f, "KeepFailedDownloads=yes\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_keepbad.cfg", NULL);
    ASSERT_EQ(cfg.keep_failed_downloads, 1, "KeepFailedDownloads=yes -> 1");
    unlink("/tmp/test_config_keepbad.cfg");
}

TEST(parse_extract_1)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_ex_1.cfg", "w");
    fprintf(f, "ExtractAfterDownload=1\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_ex_1.cfg", NULL);
    ASSERT_EQ(cfg.extract_after_download, 1, "ExtractAfterDownload=1 -> 1");
    unlink("/tmp/test_config_ex_1.cfg");
}

TEST(parse_extract_0)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_ex_0.cfg", "w");
    fprintf(f, "ExtractAfterDownload=0\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_ex_0.cfg", NULL);
    ASSERT_EQ(cfg.extract_after_download, 0, "ExtractAfterDownload=0 -> 0");
    unlink("/tmp/test_config_ex_0.cfg");
}

TEST(parse_log_file)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_log.cfg", "w");
    fprintf(f, "LogFile=RAM:DoorRepo.log\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_log.cfg", NULL);
    ASSERT_STR_EQ(cfg.log_file, "RAM:DoorRepo.log", "LogFile parsed");
    unlink("/tmp/test_config_log.cfg");
}

TEST(defaults_admin_credentials_empty)
{
    /* "Absent config = feature off" - see config.h's field comment and
     * owner_auth.h: no AdminUsername=/AdminPassword= means owner mode's
     * O key never even appears. */
    dr_config cfg;
    config_defaults(&cfg);
    ASSERT_STR_EQ(cfg.admin_username, "", "admin_username empty by default");
    ASSERT_STR_EQ(cfg.admin_password, "", "admin_password empty by default");
}

TEST(parse_admin_username)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_admin_user.cfg", "w");
    fprintf(f, "AdminUsername=spot\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_admin_user.cfg", NULL);
    ASSERT_STR_EQ(cfg.admin_username, "spot", "AdminUsername parsed");
    unlink("/tmp/test_config_admin_user.cfg");
}

TEST(parse_admin_password)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_admin_pass.cfg", "w");
    fprintf(f, "AdminPassword=hunter2\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_admin_pass.cfg", NULL);
    ASSERT_STR_EQ(cfg.admin_password, "hunter2", "AdminPassword parsed");
    unlink("/tmp/test_config_admin_pass.cfg");
}

/* REGRESSION GUARD (controller ruling, progress.md item #3): the plan's
 * original text prescribed running AdminUsername/AdminPassword through
 * flow_contains_forbidden_shell_char() - the SAME denylist DownloadDir/
 * LhaCommand/RepoPath/LogFile get. That was overridden: these two fields
 * are never shell-interpolated, so the denylist would only reject strong
 * real passwords for no security benefit. This test proves every
 * character that denylist WOULD reject (see the reject_downloaddir_*
 * tests above and flow.c's flow_contains_forbidden_shell_char()) is
 * accepted here instead - if someone "fixes" config.c by copying the
 * DownloadDir pattern onto AdminPassword, this fails. */
TEST(admin_password_accepts_every_shell_metacharacter_the_denylist_would_reject)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_config_admin_pass_special.cfg", "w");
    /* One password exercising every byte flow_contains_forbidden_shell_char()
     * denies: " ' ` $ ; | & < > # and backslash. */
    fprintf(f, "AdminPassword=p\"a'ss`w$o;r|d&<n>a#me\\end\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_admin_pass_special.cfg", &skipped);
    ASSERT_STR_EQ(cfg.admin_password, "p\"a'ss`w$o;r|d&<n>a#me\\end",
                  "password with shell metacharacters accepted verbatim, not rejected");
    ASSERT_EQ(skipped, 0, "not counted as a skipped line");
    ASSERT_EQ(config_last_unsafe_value_count(), 0, "not counted as an unsafe-value rejection");
    unlink("/tmp/test_config_admin_pass_special.cfg");
}

TEST(admin_username_accepts_every_shell_metacharacter_the_denylist_would_reject)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_config_admin_user_special.cfg", "w");
    fprintf(f, "AdminUsername=us\"er'na`me$;|&<>#\\end\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_admin_user_special.cfg", &skipped);
    ASSERT_STR_EQ(cfg.admin_username, "us\"er'na`me$;|&<>#\\end",
                  "username with shell metacharacters accepted verbatim, not rejected");
    ASSERT_EQ(skipped, 0, "not counted as a skipped line");
    ASSERT_EQ(config_last_unsafe_value_count(), 0, "not counted as an unsafe-value rejection");
    unlink("/tmp/test_config_admin_user_special.cfg");
}

TEST(admin_password_truncated_and_null_terminated_when_too_long)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_admin_pass_trunc.cfg", "w");
    char long_value[256];
    int i;
    for (i = 0; i < 200; i++)
        long_value[i] = 'P';
    long_value[200] = '\0';
    fprintf(f, "AdminPassword=%s\n", long_value);
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_admin_pass_trunc.cfg", NULL);
    ASSERT_TRUE(strlen(cfg.admin_password) == 127 && cfg.admin_password[127] == '\0',
                "password truncated to buffer size and NUL-terminated, not overrun");
    unlink("/tmp/test_config_admin_pass_trunc.cfg");
}

TEST(admin_username_password_case_insensitive_keys)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_admin_case.cfg", "w");
    fprintf(f, "adminusername=spot\n");
    fprintf(f, "ADMINPASSWORD=hunter2\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_admin_case.cfg", NULL);
    ASSERT_STR_EQ(cfg.admin_username, "spot", "lowercase adminusername matched");
    ASSERT_STR_EQ(cfg.admin_password, "hunter2", "uppercase ADMINPASSWORD matched");
    unlink("/tmp/test_config_admin_case.cfg");
}

TEST(ignore_comments)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_config_comments.cfg", "w");
    fprintf(f, "# This is a comment\n");
    fprintf(f, "RepoHost=test.com\n");
    fprintf(f, "# Another comment\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_comments.cfg", &skipped);
    ASSERT_STR_EQ(cfg.host, "test.com", "host set correctly");
    ASSERT_EQ(skipped, 0, "comments not counted as skipped");
    unlink("/tmp/test_config_comments.cfg");
}

TEST(ignore_blank_lines)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_config_blanks.cfg", "w");
    fprintf(f, "\n");
    fprintf(f, "RepoHost=test.com\n");
    fprintf(f, "\n");
    fprintf(f, "\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_blanks.cfg", &skipped);
    ASSERT_STR_EQ(cfg.host, "test.com", "host set correctly");
    ASSERT_EQ(skipped, 0, "blank lines not counted as skipped");
    unlink("/tmp/test_config_blanks.cfg");
}

TEST(unknown_key_skipped)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_config_unknown.cfg", "w");
    fprintf(f, "UnknownKey=value\n");
    fprintf(f, "RepoHost=test.com\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_unknown.cfg", &skipped);
    ASSERT_STR_EQ(cfg.host, "test.com", "host set correctly");
    ASSERT_EQ(skipped, 1, "unknown key counted as skipped");
    unlink("/tmp/test_config_unknown.cfg");
}

TEST(line_without_equals)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_config_noeq.cfg", "w");
    fprintf(f, "InvalidLine\n");
    fprintf(f, "RepoHost=test.com\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_noeq.cfg", &skipped);
    ASSERT_STR_EQ(cfg.host, "test.com", "host set correctly");
    ASSERT_EQ(skipped, 1, "line without = counted as skipped");
    unlink("/tmp/test_config_noeq.cfg");
}

TEST(leading_trailing_whitespace)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_ws.cfg", "w");
    fprintf(f, "  RepoHost  =  test.com  \n");
    fprintf(f, "\tRepoPort\t=\t9000\t\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_ws.cfg", NULL);
    ASSERT_STR_EQ(cfg.host, "test.com", "whitespace trimmed from value");
    ASSERT_EQ(cfg.port, 9000, "whitespace trimmed from numeric value");
    unlink("/tmp/test_config_ws.cfg");
}

TEST(value_truncation)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_trunc.cfg", "w");
    char long_value[256];
    int i;
    for (i = 0; i < 200; i++)
        long_value[i] = 'A';
    long_value[200] = '\0';
    fprintf(f, "RepoHost=%s\n", long_value);
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_trunc.cfg", NULL);
    ASSERT_TRUE(strlen(cfg.host) == 63 && cfg.host[63] == '\0', "host truncated and NUL-terminated");
    unlink("/tmp/test_config_trunc.cfg");
}

TEST(case_insensitive_keys)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_case.cfg", "w");
    fprintf(f, "repohost=test1.com\n");
    fprintf(f, "REPOPORT=9001\n");
    fprintf(f, "RePoPath=/test\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_case.cfg", NULL);
    ASSERT_STR_EQ(cfg.host, "test1.com", "lowercase repohost matched");
    ASSERT_EQ(cfg.port, 9001, "uppercase REPOPORT matched");
    ASSERT_STR_EQ(cfg.path, "/test", "mixed case RePoPath matched");
    unlink("/tmp/test_config_case.cfg");
}

TEST(all_keys_in_file)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_all.cfg", "w");
    fprintf(f, "RepoHost=host1.com\n");
    fprintf(f, "RepoPort=7777\n");
    fprintf(f, "RepoPath=/api/test\n");
    fprintf(f, "DownloadDir=RAM:\n");
    fprintf(f, "PageSize=100\n");
    fprintf(f, "TimeoutSecs=120\n");
    fprintf(f, "LhaCommand=arc\n");
    fprintf(f, "ExtractAfterDownload=yes\n");
    fprintf(f, "LogFile=CON:\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_all.cfg", NULL);
    ASSERT_STR_EQ(cfg.host, "host1.com", "RepoHost");
    ASSERT_EQ(cfg.port, 7777, "RepoPort");
    ASSERT_STR_EQ(cfg.path, "/api/test", "RepoPath");
    ASSERT_STR_EQ(cfg.download_dir, "RAM:", "DownloadDir");
    ASSERT_EQ(cfg.page_size, 100, "PageSize");
    ASSERT_EQ(cfg.timeout_secs, 120, "TimeoutSecs");
    ASSERT_STR_EQ(cfg.lha_command, "arc", "LhaCommand");
    ASSERT_EQ(cfg.extract_after_download, 1, "ExtractAfterDownload");
    ASSERT_STR_EQ(cfg.log_file, "CON:", "LogFile");
    unlink("/tmp/test_config_all.cfg");
}

TEST(invalid_boolean_defaults_to_zero)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_config_invalid_bool.cfg", "w");
    fprintf(f, "ExtractAfterDownload=invalid\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_config_invalid_bool.cfg", NULL);
    ASSERT_EQ(cfg.extract_after_download, 0, "invalid boolean defaults to 0");
    unlink("/tmp/test_config_invalid_bool.cfg");
}

TEST(port_non_numeric)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_port_non_numeric.cfg", "w");
    fprintf(f, "RepoPort=abc\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_port_non_numeric.cfg", &skipped);
    ASSERT_EQ(cfg.port, 80, "port keeps default on non-numeric");
    ASSERT_EQ(skipped, 1, "non-numeric port counted as skipped");
    unlink("/tmp/test_port_non_numeric.cfg");
}

TEST(port_empty_value)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_port_empty.cfg", "w");
    fprintf(f, "RepoPort=\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_port_empty.cfg", &skipped);
    ASSERT_EQ(cfg.port, 80, "port keeps default on empty value");
    ASSERT_EQ(skipped, 1, "empty port counted as skipped");
    unlink("/tmp/test_port_empty.cfg");
}

TEST(port_zero)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_port_zero.cfg", "w");
    fprintf(f, "RepoPort=0\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_port_zero.cfg", &skipped);
    ASSERT_EQ(cfg.port, 80, "port keeps default on zero");
    ASSERT_EQ(skipped, 1, "zero port counted as skipped");
    unlink("/tmp/test_port_zero.cfg");
}

TEST(port_negative)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_port_negative.cfg", "w");
    fprintf(f, "RepoPort=-1\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_port_negative.cfg", &skipped);
    ASSERT_EQ(cfg.port, 80, "port keeps default on negative");
    ASSERT_EQ(skipped, 1, "negative port counted as skipped");
    unlink("/tmp/test_port_negative.cfg");
}

TEST(port_out_of_range)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_port_out_of_range.cfg", "w");
    fprintf(f, "RepoPort=70000\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_port_out_of_range.cfg", &skipped);
    ASSERT_EQ(cfg.port, 80, "port keeps default on out of range");
    ASSERT_EQ(skipped, 1, "out of range port counted as skipped");
    unlink("/tmp/test_port_out_of_range.cfg");
}

TEST(page_size_non_numeric)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_page_size_non_numeric.cfg", "w");
    fprintf(f, "PageSize=abc\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_page_size_non_numeric.cfg", &skipped);
    ASSERT_EQ(cfg.page_size, 20, "page_size keeps default on non-numeric");
    ASSERT_EQ(skipped, 1, "non-numeric page_size counted as skipped");
    unlink("/tmp/test_page_size_non_numeric.cfg");
}

TEST(page_size_empty_value)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_page_size_empty.cfg", "w");
    fprintf(f, "PageSize=\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_page_size_empty.cfg", &skipped);
    ASSERT_EQ(cfg.page_size, 20, "page_size keeps default on empty value");
    ASSERT_EQ(skipped, 1, "empty page_size counted as skipped");
    unlink("/tmp/test_page_size_empty.cfg");
}

TEST(page_size_zero)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_page_size_zero.cfg", "w");
    fprintf(f, "PageSize=0\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_page_size_zero.cfg", &skipped);
    ASSERT_EQ(cfg.page_size, 20, "page_size keeps default on zero");
    ASSERT_EQ(skipped, 1, "zero page_size counted as skipped");
    unlink("/tmp/test_page_size_zero.cfg");
}

TEST(page_size_negative)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_page_size_negative.cfg", "w");
    fprintf(f, "PageSize=-5\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_page_size_negative.cfg", &skipped);
    ASSERT_EQ(cfg.page_size, 20, "page_size keeps default on negative");
    ASSERT_EQ(skipped, 1, "negative page_size counted as skipped");
    unlink("/tmp/test_page_size_negative.cfg");
}

TEST(page_size_out_of_range)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_page_size_out_of_range.cfg", "w");
    fprintf(f, "PageSize=10000\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_page_size_out_of_range.cfg", &skipped);
    ASSERT_EQ(cfg.page_size, 20, "page_size keeps default on out of range");
    ASSERT_EQ(skipped, 1, "out of range page_size counted as skipped");
    unlink("/tmp/test_page_size_out_of_range.cfg");
}

TEST(timeout_non_numeric)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_timeout_non_numeric.cfg", "w");
    fprintf(f, "TimeoutSecs=abc\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_timeout_non_numeric.cfg", &skipped);
    ASSERT_EQ(cfg.timeout_secs, 30, "timeout_secs keeps default on non-numeric");
    ASSERT_EQ(skipped, 1, "non-numeric timeout_secs counted as skipped");
    unlink("/tmp/test_timeout_non_numeric.cfg");
}

TEST(timeout_empty_value)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_timeout_empty.cfg", "w");
    fprintf(f, "TimeoutSecs=\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_timeout_empty.cfg", &skipped);
    ASSERT_EQ(cfg.timeout_secs, 30, "timeout_secs keeps default on empty value");
    ASSERT_EQ(skipped, 1, "empty timeout_secs counted as skipped");
    unlink("/tmp/test_timeout_empty.cfg");
}

TEST(timeout_zero)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_timeout_zero.cfg", "w");
    fprintf(f, "TimeoutSecs=0\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_timeout_zero.cfg", &skipped);
    ASSERT_EQ(cfg.timeout_secs, 30, "timeout_secs keeps default on zero");
    ASSERT_EQ(skipped, 1, "zero timeout_secs counted as skipped");
    unlink("/tmp/test_timeout_zero.cfg");
}

TEST(timeout_negative)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_timeout_negative.cfg", "w");
    fprintf(f, "TimeoutSecs=-10\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_timeout_negative.cfg", &skipped);
    ASSERT_EQ(cfg.timeout_secs, 30, "timeout_secs keeps default on negative");
    ASSERT_EQ(skipped, 1, "negative timeout_secs counted as skipped");
    unlink("/tmp/test_timeout_negative.cfg");
}

TEST(timeout_out_of_range)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_timeout_out_of_range.cfg", "w");
    fprintf(f, "TimeoutSecs=10000\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_timeout_out_of_range.cfg", &skipped);
    ASSERT_EQ(cfg.timeout_secs, 30, "timeout_secs keeps default on out of range");
    ASSERT_EQ(skipped, 1, "out of range timeout_secs counted as skipped");
    unlink("/tmp/test_timeout_out_of_range.cfg");
}

/* ---------------------------------------------------------------------
 * Shell-metacharacter rejection for DownloadDir/LhaCommand/LogFile/
 * RepoPath. Regression coverage for a real, demonstrated vulnerability:
 * a DownloadDir of INJECTDIR" ; touch /tmp/PWNED_BY_DOORREPO ; echo "
 * survived config_load() unfiltered and, once interpolated into
 * doorrepo.c's system() extraction command, executed an arbitrary shell
 * command. Every test below drives the REAL config_load() entry point
 * against a real temp file - not an isolated call to the internal
 * validator - so these are true reachability tests of the actual parse
 * boundary an attacker-controlled DoorRepo.cfg goes through.
 * ------------------------------------------------------------------- */

TEST(reject_downloaddir_exact_reported_injection)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_inject_exact.cfg", "w");
    fprintf(f, "DownloadDir=INJECTDIR\" ; touch /tmp/PWNED_BY_DOORREPO ; echo \"\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_exact.cfg", &skipped);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "DownloadDir keeps default on the exact reported injection string");
    ASSERT_EQ(skipped, 1, "the injection line is counted as skipped");
    ASSERT_EQ(config_last_unsafe_value_count(), 1, "counted specifically as an unsafe-character rejection");
    unlink("/tmp/test_inject_exact.cfg");
}

TEST(reject_downloaddir_double_quote)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_dq.cfg", "w");
    fprintf(f, "DownloadDir=foo\"bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_dq.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "double quote rejected");
    unlink("/tmp/test_inject_dq.cfg");
}

TEST(reject_downloaddir_single_quote)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_sq.cfg", "w");
    fprintf(f, "DownloadDir=foo'bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_sq.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "single quote rejected");
    unlink("/tmp/test_inject_sq.cfg");
}

TEST(reject_downloaddir_backtick)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_bt.cfg", "w");
    fprintf(f, "DownloadDir=foo`bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_bt.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "backtick rejected");
    unlink("/tmp/test_inject_bt.cfg");
}

TEST(reject_downloaddir_dollar)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_dollar.cfg", "w");
    fprintf(f, "DownloadDir=foo$bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_dollar.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "dollar sign rejected");
    unlink("/tmp/test_inject_dollar.cfg");
}

TEST(reject_downloaddir_semicolon)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_semi.cfg", "w");
    fprintf(f, "DownloadDir=foo;bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_semi.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "semicolon rejected");
    unlink("/tmp/test_inject_semi.cfg");
}

TEST(reject_downloaddir_backslash)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_bs.cfg", "w");
    fprintf(f, "DownloadDir=foo\\bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_bs.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "backslash rejected");
    unlink("/tmp/test_inject_bs.cfg");
}

TEST(reject_downloaddir_pipe)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_pipe.cfg", "w");
    fprintf(f, "DownloadDir=foo|bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_pipe.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "pipe rejected");
    unlink("/tmp/test_inject_pipe.cfg");
}

TEST(reject_downloaddir_ampersand)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_amp.cfg", "w");
    fprintf(f, "DownloadDir=foo&bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_amp.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "ampersand rejected");
    unlink("/tmp/test_inject_amp.cfg");
}

TEST(reject_downloaddir_less_than)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_lt.cfg", "w");
    fprintf(f, "DownloadDir=foo<bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_lt.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "less-than rejected");
    unlink("/tmp/test_inject_lt.cfg");
}

TEST(reject_downloaddir_greater_than)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_gt.cfg", "w");
    fprintf(f, "DownloadDir=foo>bar\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_gt.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "greater-than rejected");
    unlink("/tmp/test_inject_gt.cfg");
}

TEST(reject_downloaddir_embedded_carriage_return)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_cr.cfg", "w");
    /* A CR embedded MID-value (not at the line's own end, which
     * config_load() already strips as line-ending noise) - written raw
     * via fputc so libc's text-mode newline translation cannot interfere,
     * proving the check catches an embedded CR the line-ending strip
     * does not remove. */
    fputs("DownloadDir=foo", f);
    fputc('\r', f);
    fputs("bar\n", f);
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_cr.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "embedded carriage return rejected");
    unlink("/tmp/test_inject_cr.cfg");
}

TEST(reject_lhacommand_semicolon)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_lha.cfg", "w");
    fprintf(f, "LhaCommand=lha; rm -rf /\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_lha.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.lha_command, "lha", "LhaCommand keeps default when it contains a semicolon");
    unlink("/tmp/test_inject_lha.cfg");
}

/* ---------------------------------------------------------------------
 * LhaCommand's ALLOWLIST (flow_is_valid_command_token()), replacing the
 * denylist after a live bypass: LhaCommand="touch /tmp/PWNED_HASH_COMMENT #"
 * ran arbitrary code because "#" was not yet denylisted AND cfg->lha_command
 * is interpolated UNQUOTED into the system() command line, so a trailing
 * "#" comments out the rest regardless of what any denylist rejects. Every
 * test below drives the real config_load() entry point.
 * ------------------------------------------------------------------- */

TEST(reject_lhacommand_exact_reported_hash_comment_payload)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_lha_hash.cfg", "w");
    fprintf(f, "LhaCommand=touch /tmp/PWNED_HASH_COMMENT #\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_lha_hash.cfg", &skipped);
    ASSERT_STR_EQ(cfg.lha_command, "lha", "LhaCommand keeps default on the exact reported '#'-comment payload");
    ASSERT_EQ(skipped, 1, "the payload line is counted as skipped");
    ASSERT_EQ(config_last_unsafe_value_count(), 1, "counted as an unsafe-value rejection");
    unlink("/tmp/test_lha_hash.cfg");
}

TEST(reject_lhacommand_whitespace)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_lha_ws.cfg", "w");
    fprintf(f, "LhaCommand=7z x\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_lha_ws.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.lha_command, "lha", "a multi-token LhaCommand (whitespace) is rejected, not silently truncated");
    unlink("/tmp/test_lha_ws.cfg");
}

TEST(reject_lhacommand_percent)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_lha_percent.cfg", "w");
    fprintf(f, "LhaCommand=lha%%test\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_lha_percent.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.lha_command, "lha", "'%' is outside the allowlist and rejected");
    unlink("/tmp/test_lha_percent.cfg");
}

TEST(reject_lhacommand_tilde)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_lha_tilde.cfg", "w");
    fprintf(f, "LhaCommand=~/lha\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_lha_tilde.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.lha_command, "lha", "'~' is outside the allowlist and rejected");
    unlink("/tmp/test_lha_tilde.cfg");
}

TEST(reject_lhacommand_caret)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_lha_caret.cfg", "w");
    fprintf(f, "LhaCommand=lha^test\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_lha_caret.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.lha_command, "lha", "'^' is outside the allowlist and rejected");
    unlink("/tmp/test_lha_caret.cfg");
}

TEST(reject_lhacommand_parens)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_lha_parens.cfg", "w");
    fprintf(f, "LhaCommand=lha()\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_lha_parens.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.lha_command, "lha", "'(' and ')' are outside the allowlist and rejected");
    unlink("/tmp/test_lha_parens.cfg");
}

TEST(accept_lhacommand_amiga_assign_path)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_lha_amiga_path.cfg", "w");
    fprintf(f, "LhaCommand=Work:c/lha\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_lha_amiga_path.cfg", &skipped);
    ASSERT_STR_EQ(cfg.lha_command, "Work:c/lha", "a real AmigaDOS assign+directory path is accepted");
    ASSERT_EQ(skipped, 0, "a legitimate path is never skipped");
    unlink("/tmp/test_lha_amiga_path.cfg");
}

/* ---------------------------------------------------------------------
 * DownloadDir/LogFile/RepoPath ".." rejection (fix-round-3, item 4):
 * lower severity than the archive-name traversal fix (needs local
 * config-file access), but the same root gap - see config.c's
 * DownloadDir comment for the full reasoning on why it's rejected anyway.
 * ------------------------------------------------------------------- */

TEST(reject_downloaddir_exact_reported_dotdot_payload)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_dl_dotdot.cfg", "w");
    fprintf(f, "DownloadDir=../../../../tmp/x/\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_dl_dotdot.cfg", &skipped);
    ASSERT_STR_EQ(cfg.download_dir, "T:", "DownloadDir keeps default on the exact reported '..' payload");
    ASSERT_EQ(skipped, 1, "the payload line is counted as skipped");
    ASSERT_EQ(config_last_unsafe_value_count(), 1, "counted as an unsafe-value rejection");
    unlink("/tmp/test_dl_dotdot.cfg");
}

TEST(reject_logfile_dotdot)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_log_dotdot.cfg", "w");
    fprintf(f, "LogFile=T:../../S/Startup-Sequence\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_log_dotdot.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.log_file, "T:DoorRepo.log", "LogFile keeps default when it contains '..'");
    unlink("/tmp/test_log_dotdot.cfg");
}

TEST(reject_repopath_dotdot)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_path_dotdot.cfg", "w");
    fprintf(f, "RepoPath=/api/../admin\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_path_dotdot.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.path, "/api/door-repo", "RepoPath keeps default when it contains '..'");
    unlink("/tmp/test_path_dotdot.cfg");
}

TEST(accept_downloaddir_with_ordinary_slashes)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_dl_ordinary.cfg", "w");
    fprintf(f, "DownloadDir=Work:Doors/Downloads/\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_dl_ordinary.cfg", &skipped);
    ASSERT_STR_EQ(cfg.download_dir, "Work:Doors/Downloads/", "an ordinary path with '/' and ':' but no '..' is accepted");
    ASSERT_EQ(skipped, 0, "a legitimate path is never skipped");
    unlink("/tmp/test_dl_ordinary.cfg");
}

TEST(reject_logfile_backtick)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_log.cfg", "w");
    fprintf(f, "LogFile=T:`whoami`.log\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_log.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.log_file, "T:DoorRepo.log", "LogFile keeps default when it contains a backtick");
    unlink("/tmp/test_inject_log.cfg");
}

TEST(reject_repopath_semicolon)
{
    dr_config cfg;
    FILE *f = fopen("/tmp/test_inject_path.cfg", "w");
    fprintf(f, "RepoPath=/api/door-repo;rm\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_path.cfg", (int *) 0);
    ASSERT_STR_EQ(cfg.path, "/api/door-repo", "RepoPath keeps default when it contains a semicolon");
    unlink("/tmp/test_inject_path.cfg");
}

TEST(unsafe_value_count_excludes_ordinary_invalid_values)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_inject_mixed.cfg", "w");
    fprintf(f, "DownloadDir=foo;bar\nPageSize=99999\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_mixed.cfg", &skipped);
    ASSERT_EQ(skipped, 2, "both an unsafe value and an out-of-range number are skipped");
    ASSERT_EQ(config_last_unsafe_value_count(), 1, "only the unsafe-character line is counted as unsafe");
    unlink("/tmp/test_inject_mixed.cfg");
}

TEST(unsafe_value_count_resets_each_call)
{
    dr_config cfg;
    FILE *f1 = fopen("/tmp/test_inject_reset1.cfg", "w");
    fprintf(f1, "DownloadDir=foo;bar\n");
    fclose(f1);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_inject_reset1.cfg", (int *) 0);
    ASSERT_EQ(config_last_unsafe_value_count(), 1, "first call recorded one unsafe value");

    {
        FILE *f2 = fopen("/tmp/test_inject_reset2.cfg", "w");
        fprintf(f2, "DownloadDir=RAM:\n");
        fclose(f2);
        config_defaults(&cfg);
        config_load(&cfg, "/tmp/test_inject_reset2.cfg", (int *) 0);
        ASSERT_EQ(config_last_unsafe_value_count(), 0, "a later clean call resets the count to zero");
    }

    unlink("/tmp/test_inject_reset1.cfg");
    unlink("/tmp/test_inject_reset2.cfg");
}

TEST(legitimate_amiga_paths_are_not_rejected)
{
    dr_config cfg;
    int skipped = -1;
    FILE *f = fopen("/tmp/test_legit_paths.cfg", "w");
    fprintf(f, "DownloadDir=Work:Doors/Downloads/\nLhaCommand=lha\nLogFile=RAM:DoorRepo.log\nRepoPath=/api/door-repo\n");
    fclose(f);
    config_defaults(&cfg);
    config_load(&cfg, "/tmp/test_legit_paths.cfg", &skipped);
    ASSERT_STR_EQ(cfg.download_dir, "Work:Doors/Downloads/", "ordinary AmigaDOS directory path accepted");
    ASSERT_STR_EQ(cfg.lha_command, "lha", "ordinary command name accepted");
    ASSERT_STR_EQ(cfg.log_file, "RAM:DoorRepo.log", "ordinary AmigaDOS device path accepted");
    ASSERT_STR_EQ(cfg.path, "/api/door-repo", "ordinary URL path accepted");
    ASSERT_EQ(skipped, 0, "no legitimate line is skipped");
    ASSERT_EQ(config_last_unsafe_value_count(), 0, "no legitimate line is flagged as unsafe");
    unlink("/tmp/test_legit_paths.cfg");
}

/* ---------------------------------------------------------------------
 * config_read_token - the per-launch token the BBS writes to
 * <doors_dir>/DoorRepo/DoorRepo.token, read back by doorrepo.c's
 * install-report call to /api/door-admin/installed. Absent-file is the
 * expected "this BBS does not offer the management API" case, not an
 * error - covered explicitly below, not just as a side effect of the
 * happy path.
 * ------------------------------------------------------------------- */

TEST(read_token)
{
    dr_config cfg;
    char token[128];
    FILE *f;

    memset(&cfg, 0, sizeof(cfg));
    strcpy(cfg.doors_dir, "build-test-tokendir");
    (void) system("mkdir -p build-test-tokendir/DoorRepo");
    f = fopen("build-test-tokendir/DoorRepo/DoorRepo.token", "wb");
    ASSERT_TRUE(f != (FILE *) 0, "token file created for the test");
    fputs("abc123\n", f);
    fclose(f);

    ASSERT_EQ(config_read_token(&cfg, token, sizeof(token)), 1, "token file present: returns 1");
    ASSERT_STR_EQ(token, "abc123", "trailing newline trimmed from token");

    (void) system("rm -rf build-test-tokendir");
    ASSERT_EQ(config_read_token(&cfg, token, sizeof(token)), 0, "no token file: returns 0, not an error");
    ASSERT_STR_EQ(token, "", "out left empty when the token file is absent");
}

TEST(read_token_trims_carriage_return_and_trailing_spaces)
{
    dr_config cfg;
    char token[128];
    FILE *f;

    memset(&cfg, 0, sizeof(cfg));
    strcpy(cfg.doors_dir, "build-test-tokendir2");
    (void) system("mkdir -p build-test-tokendir2/DoorRepo");
    f = fopen("build-test-tokendir2/DoorRepo/DoorRepo.token", "wb");
    ASSERT_TRUE(f != (FILE *) 0, "token file created for the test");
    fputs("tok-with-crlf  \r\n", f);
    fclose(f);

    ASSERT_EQ(config_read_token(&cfg, token, sizeof(token)), 1, "token read despite CRLF and trailing spaces");
    ASSERT_STR_EQ(token, "tok-with-crlf", "CR, LF and trailing spaces all trimmed");

    (void) system("rm -rf build-test-tokendir2");
}

TEST(read_token_empty_file_returns_zero)
{
    dr_config cfg;
    char token[128];
    FILE *f;

    memset(&cfg, 0, sizeof(cfg));
    strcpy(cfg.doors_dir, "build-test-tokendir3");
    (void) system("mkdir -p build-test-tokendir3/DoorRepo");
    f = fopen("build-test-tokendir3/DoorRepo/DoorRepo.token", "wb");
    ASSERT_TRUE(f != (FILE *) 0, "token file created for the test");
    fclose(f);

    ASSERT_EQ(config_read_token(&cfg, token, sizeof(token)), 0, "an empty token file is treated as absent");
    ASSERT_STR_EQ(token, "", "out left empty for an empty token file");

    (void) system("rm -rf build-test-tokendir3");
}

TEST(read_token_refuses_null_args)
{
    dr_config cfg;
    char token[128] = "xyz";

    memset(&cfg, 0, sizeof(cfg));
    strcpy(cfg.doors_dir, "build-test-tokendir4");

    ASSERT_EQ(config_read_token((const dr_config *) 0, token, sizeof(token)), 0, "NULL cfg refused");
    ASSERT_EQ(config_read_token(&cfg, (char *) 0, sizeof(token)), 0, "NULL out refused");
    ASSERT_EQ(config_read_token(&cfg, token, 0), 0, "zero outlen refused");
}

int main(void)
{
    printf("\n====== Config Module Tests ======\n\n");

    RUN_TEST(defaults_applied);
    RUN_TEST(missing_file_returns_zero);
    RUN_TEST(missing_file_preserves_defaults);
    RUN_TEST(parse_host);
    RUN_TEST(parse_port);
    RUN_TEST(parse_path);
    RUN_TEST(parse_download_dir);
    RUN_TEST(parse_page_size);
    RUN_TEST(parse_timeout);
    RUN_TEST(parse_lha_command);
    RUN_TEST(parse_extract_yes);
    RUN_TEST(parse_extract_no);
    RUN_TEST(parse_extract_1);
    RUN_TEST(parse_extract_0);
    RUN_TEST(parse_log_file);
    RUN_TEST(defaults_admin_credentials_empty);
    RUN_TEST(parse_admin_username);
    RUN_TEST(parse_admin_password);
    RUN_TEST(admin_password_accepts_every_shell_metacharacter_the_denylist_would_reject);
    RUN_TEST(admin_username_accepts_every_shell_metacharacter_the_denylist_would_reject);
    RUN_TEST(admin_password_truncated_and_null_terminated_when_too_long);
    RUN_TEST(admin_username_password_case_insensitive_keys);
    RUN_TEST(ignore_comments);
    RUN_TEST(ignore_blank_lines);
    RUN_TEST(unknown_key_skipped);
    RUN_TEST(line_without_equals);
    RUN_TEST(leading_trailing_whitespace);
    RUN_TEST(value_truncation);
    RUN_TEST(case_insensitive_keys);
    RUN_TEST(all_keys_in_file);
    RUN_TEST(invalid_boolean_defaults_to_zero);
    RUN_TEST(port_non_numeric);
    RUN_TEST(port_empty_value);
    RUN_TEST(port_zero);
    RUN_TEST(port_negative);
    RUN_TEST(port_out_of_range);
    RUN_TEST(page_size_non_numeric);
    RUN_TEST(page_size_empty_value);
    RUN_TEST(page_size_zero);
    RUN_TEST(page_size_negative);
    RUN_TEST(page_size_out_of_range);
    RUN_TEST(timeout_non_numeric);
    RUN_TEST(timeout_empty_value);
    RUN_TEST(timeout_zero);
    RUN_TEST(timeout_negative);
    RUN_TEST(timeout_out_of_range);

    RUN_TEST(reject_downloaddir_exact_reported_injection);
    RUN_TEST(reject_downloaddir_double_quote);
    RUN_TEST(reject_downloaddir_single_quote);
    RUN_TEST(reject_downloaddir_backtick);
    RUN_TEST(reject_downloaddir_dollar);
    RUN_TEST(reject_downloaddir_semicolon);
    RUN_TEST(reject_downloaddir_backslash);
    RUN_TEST(reject_downloaddir_pipe);
    RUN_TEST(reject_downloaddir_ampersand);
    RUN_TEST(reject_downloaddir_less_than);
    RUN_TEST(reject_downloaddir_greater_than);
    RUN_TEST(reject_downloaddir_embedded_carriage_return);
    RUN_TEST(reject_lhacommand_semicolon);
    RUN_TEST(reject_lhacommand_exact_reported_hash_comment_payload);
    RUN_TEST(reject_lhacommand_whitespace);
    RUN_TEST(reject_lhacommand_percent);
    RUN_TEST(reject_lhacommand_tilde);
    RUN_TEST(reject_lhacommand_caret);
    RUN_TEST(reject_lhacommand_parens);
    RUN_TEST(accept_lhacommand_amiga_assign_path);
    RUN_TEST(reject_downloaddir_exact_reported_dotdot_payload);
    RUN_TEST(reject_logfile_dotdot);
    RUN_TEST(reject_repopath_dotdot);
    RUN_TEST(accept_downloaddir_with_ordinary_slashes);
    RUN_TEST(reject_logfile_backtick);
    RUN_TEST(reject_repopath_semicolon);
    RUN_TEST(unsafe_value_count_excludes_ordinary_invalid_values);
    RUN_TEST(unsafe_value_count_resets_each_call);
    RUN_TEST(legitimate_amiga_paths_are_not_rejected);
    RUN_TEST(keep_failed_downloads_defaults_to_off);
    RUN_TEST(keep_failed_downloads_yes_is_parsed);

    RUN_TEST(read_token);
    RUN_TEST(read_token_trims_carriage_return_and_trailing_spaces);
    RUN_TEST(read_token_empty_file_returns_zero);
    RUN_TEST(read_token_refuses_null_args);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return (tests_failed == 0) ? EXIT_SUCCESS : EXIT_FAILURE;
}
