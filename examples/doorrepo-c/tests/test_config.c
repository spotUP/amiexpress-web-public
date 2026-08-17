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
    RUN_TEST(ignore_comments);
    RUN_TEST(ignore_blank_lines);
    RUN_TEST(unknown_key_skipped);
    RUN_TEST(line_without_equals);
    RUN_TEST(leading_trailing_whitespace);
    RUN_TEST(value_truncation);
    RUN_TEST(case_insensitive_keys);
    RUN_TEST(all_keys_in_file);
    RUN_TEST(invalid_boolean_defaults_to_zero);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return (tests_failed == 0) ? EXIT_SUCCESS : EXIT_FAILURE;
}
