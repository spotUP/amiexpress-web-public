#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include "config.h"
#include "flow.h"

void config_defaults(dr_config *cfg)
{
    strncpy(cfg->host, "bbs.uprough.net", sizeof(cfg->host) - 1);
    cfg->host[sizeof(cfg->host) - 1] = '\0';
    cfg->port = 80;
    strncpy(cfg->path, "/api/door-repo", sizeof(cfg->path) - 1);
    cfg->path[sizeof(cfg->path) - 1] = '\0';
    strncpy(cfg->download_dir, "T:", sizeof(cfg->download_dir) - 1);
    cfg->download_dir[sizeof(cfg->download_dir) - 1] = '\0';
    cfg->page_size = 20;
    cfg->timeout_secs = 30;
    strncpy(cfg->lha_command, "lha", sizeof(cfg->lha_command) - 1);
    cfg->lha_command[sizeof(cfg->lha_command) - 1] = '\0';
    cfg->extract_after_download = 0;
    strncpy(cfg->log_file, "T:DoorRepo.log", sizeof(cfg->log_file) - 1);
    cfg->log_file[sizeof(cfg->log_file) - 1] = '\0';
}

static char *trim_leading(char *str)
{
    while (*str && (isspace((unsigned char)*str)))
        str++;
    return str;
}

static void trim_trailing(char *str)
{
    int len;
    len = strlen(str);
    while (len > 0 && isspace((unsigned char)str[len - 1])) {
        str[len - 1] = '\0';
        len--;
    }
}

static int str_icmp(const char *a, const char *b)
{
    while (*a && *b) {
        unsigned char ca = tolower((unsigned char)*a);
        unsigned char cb = tolower((unsigned char)*b);
        if (ca != cb)
            return ca - cb;
        a++;
        b++;
    }
    return tolower((unsigned char)*a) - tolower((unsigned char)*b);
}

static int parse_boolean(const char *value)
{
    if (str_icmp(value, "yes") == 0)
        return 1;
    if (str_icmp(value, "no") == 0)
        return 0;
    if (str_icmp(value, "1") == 0)
        return 1;
    if (str_icmp(value, "0") == 0)
        return 0;
    return 0;
}

static int is_valid_integer(const char *str, int *result)
{
    char *endptr;
    long val;

    if (!str || *str == '\0')
        return 0;

    val = strtol(str, &endptr, 10);

    if (*endptr != '\0')
        return 0;

    if (val < -2147483647 || val > 2147483647)
        return 0;

    *result = (int)val;
    return 1;
}

static int validate_port(const char *value)
{
    int port;
    if (!is_valid_integer(value, &port))
        return 0;
    if (port < 1 || port > 65535)
        return 0;
    return port;
}

static int validate_page_size(const char *value)
{
    int size;
    if (!is_valid_integer(value, &size))
        return 0;
    if (size < 1 || size > 9999)
        return 0;
    return size;
}

static int validate_timeout(const char *value)
{
    int timeout;
    if (!is_valid_integer(value, &timeout))
        return 0;
    if (timeout < 1 || timeout > 3600)
        return 0;
    return timeout;
}

/* Reset to 0 at the top of every config_load() call; incremented once per
 * line rejected by flow_contains_forbidden_shell_char() below. See
 * config.h's config_last_unsafe_value_count() for why this is a query
 * function rather than a config_load() out-parameter. */
static int g_last_unsafe_value_count = 0;

int config_last_unsafe_value_count(void)
{
    return g_last_unsafe_value_count;
}

/* Real, demonstrated vulnerability this guards: DownloadDir and
 * LhaCommand are interpolated, unescaped, into a system() command line
 * by doorrepo.c's optional lha-extraction step. A DownloadDir of
 * INJECTDIR" ; touch /tmp/PWNED_BY_DOORREPO ; echo " (a real value an
 * attacker-controlled or carelessly-copied DoorRepo.cfg could contain)
 * broke out of the surrounding double quotes and ran an arbitrary shell
 * command - confirmed by reproducing it end to end, not theorised.
 * RepoPath is also checked: it is concatenated raw into an HTTP request
 * line by http.c, so a CR/LF there could inject request-line/header
 * content. LogFile is checked for the same defense-in-depth reason even
 * though it is only ever passed to fopen(), never a shell.
 *
 * The actual character set and rejection logic live in flow.c
 * (flow_contains_forbidden_shell_char()) rather than a private copy
 * here, so there is exactly one definition of "unsafe" shared with
 * doorrepo.c's second, independent check immediately before the
 * system() call this whole guard exists to protect - defense in depth
 * is the same single-source-of-truth check applied at two points, not
 * two implementations that could quietly drift apart. */

int config_load(dr_config *cfg, const char *path, int *skipped_lines)
{
    FILE *f;
    char line[512];
    char *eq;
    char *key;
    char *value;
    int local_skipped = 0;
    int parsed_value;

    g_last_unsafe_value_count = 0;

    f = fopen(path, "r");
    if (!f)
        return 0;

    while (fgets(line, sizeof(line), f)) {
        int len;
        len = strlen(line);
        if (len > 0 && line[len - 1] == '\n')
            line[--len] = '\0';
        if (len > 0 && line[len - 1] == '\r')
            line[--len] = '\0';

        key = trim_leading(line);

        if (*key == '\0' || *key == '#')
            continue;

        eq = strchr(key, '=');
        if (!eq) {
            local_skipped++;
            continue;
        }

        *eq = '\0';
        value = eq + 1;

        trim_trailing(key);
        value = trim_leading(value);
        trim_trailing(value);

        if (str_icmp(key, "RepoHost") == 0) {
            strncpy(cfg->host, value, sizeof(cfg->host) - 1);
            cfg->host[sizeof(cfg->host) - 1] = '\0';
        } else if (str_icmp(key, "RepoPort") == 0) {
            parsed_value = validate_port(value);
            if (parsed_value > 0) {
                cfg->port = parsed_value;
            } else {
                local_skipped++;
            }
        } else if (str_icmp(key, "RepoPath") == 0) {
            if (flow_contains_forbidden_shell_char(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->path, value, sizeof(cfg->path) - 1);
                cfg->path[sizeof(cfg->path) - 1] = '\0';
            }
        } else if (str_icmp(key, "DownloadDir") == 0) {
            if (flow_contains_forbidden_shell_char(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->download_dir, value, sizeof(cfg->download_dir) - 1);
                cfg->download_dir[sizeof(cfg->download_dir) - 1] = '\0';
            }
        } else if (str_icmp(key, "PageSize") == 0) {
            parsed_value = validate_page_size(value);
            if (parsed_value > 0) {
                cfg->page_size = parsed_value;
            } else {
                local_skipped++;
            }
        } else if (str_icmp(key, "TimeoutSecs") == 0) {
            parsed_value = validate_timeout(value);
            if (parsed_value > 0) {
                cfg->timeout_secs = parsed_value;
            } else {
                local_skipped++;
            }
        } else if (str_icmp(key, "LhaCommand") == 0) {
            if (flow_contains_forbidden_shell_char(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->lha_command, value, sizeof(cfg->lha_command) - 1);
                cfg->lha_command[sizeof(cfg->lha_command) - 1] = '\0';
            }
        } else if (str_icmp(key, "ExtractAfterDownload") == 0) {
            cfg->extract_after_download = parse_boolean(value);
        } else if (str_icmp(key, "LogFile") == 0) {
            if (flow_contains_forbidden_shell_char(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->log_file, value, sizeof(cfg->log_file) - 1);
                cfg->log_file[sizeof(cfg->log_file) - 1] = '\0';
            }
        } else {
            local_skipped++;
        }
    }

    fclose(f);

    if (skipped_lines)
        *skipped_lines = local_skipped;

    return 0;
}
