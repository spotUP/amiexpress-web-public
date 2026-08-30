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
    strncpy(cfg->doors_dir, "Doors/", sizeof(cfg->doors_dir) - 1);
    cfg->doors_dir[sizeof(cfg->doors_dir) - 1] = '\0';
    strncpy(cfg->bbscmd_dir, "BBSCmd/", sizeof(cfg->bbscmd_dir) - 1);
    cfg->bbscmd_dir[sizeof(cfg->bbscmd_dir) - 1] = '\0';
    strncpy(cfg->lha_command, "lha", sizeof(cfg->lha_command) - 1);
    cfg->lha_command[sizeof(cfg->lha_command) - 1] = '\0';
    cfg->extract_after_download = 0;
    cfg->keep_failed_downloads = 0;
    /* 80x24 is the universal BBS terminal geometry and what AmiExpress
     * assumes throughout; the keys exist so a sysop on a taller window can
     * use it rather than because the default is in doubt. */
    cfg->ansi = 1;
    cfg->screen_rows = 24;
    cfg->screen_cols = 80;
    strncpy(cfg->log_file, "T:DoorRepo.log", sizeof(cfg->log_file) - 1);
    cfg->log_file[sizeof(cfg->log_file) - 1] = '\0';
    /* Absent by default - see config.h's field comment. */
    cfg->admin_username[0] = '\0';
    cfg->admin_password[0] = '\0';
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

static int validate_screen_rows(const char *value)
{
    int rows;
    if (!is_valid_integer(value, &rows))
        return 0;
    /* 10 rows is the least the header/list/footer layout can occupy without
     * the list collapsing to nothing; 200 is far past any real terminal. */
    if (rows < 10 || rows > 200)
        return 0;
    return rows;
}

static int validate_screen_cols(const char *value)
{
    int cols;
    if (!is_valid_integer(value, &cols))
        return 0;
    /* Below 40 the two-pane layout cannot be drawn at all. */
    if (cols < 40 || cols > 250)
        return 0;
    return cols;
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
 * LhaCommand are interpolated into a system() command line by
 * doorrepo.c's optional lha-extraction step. Two live rounds of
 * exploitation (a DownloadDir quote-breakout, then an LhaCommand
 * "#"-comment bypass after round 1 shipped) proved a denylist cannot
 * defend cfg->lha_command, which sits UNQUOTED in that command line -
 * see flow.h's block comment for the full history and the two-primitive
 * fix: DownloadDir/RepoPath/LogFile (all inside double quotes) keep the
 * denylist (flow_contains_forbidden_shell_char()); LhaCommand (unquoted)
 * is now allowlisted (flow_is_valid_command_token()) instead. RepoPath is
 * checked because it is concatenated raw into an HTTP request line by
 * http.c, so a CR/LF there could inject request-line/header content.
 * LogFile is checked for the same defense-in-depth reason even though it
 * is only ever passed to fopen(), never a shell.
 *
 * Both check functions live in flow.c rather than private copies here,
 * so there is exactly one definition of each shared with doorrepo.c's
 * second, independent check immediately before the system() call this
 * whole guard exists to protect - defense in depth is the same
 * single-source-of-truth checks applied at two points, not
 * implementations that could quietly drift apart. */

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
            if (flow_contains_forbidden_shell_char(value) || flow_contains_dotdot_segment(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->path, value, sizeof(cfg->path) - 1);
                cfg->path[sizeof(cfg->path) - 1] = '\0';
            }
        } else if (str_icmp(key, "DownloadDir") == 0) {
            /* Rejects a ".." segment too (see flow_contains_dotdot_segment()
             * in flow.h) - lower severity than the archive-name traversal
             * fix in this same round, since setting DownloadDir already
             * requires local config-file write access (equivalent trust to
             * setting it to any absolute path directly - a sysop who can
             * edit DoorRepo.cfg does not gain new capability from '..'
             * specifically, they could type a sensitive absolute path
             * instead). Rejected anyway: it defends against a config file
             * copy-pasted from an untrusted source containing an
             * accidental or malicious relative-traversal value, which is
             * a more realistic incident than a sysop deliberately
             * choosing a destructive absolute path themselves, and it
             * keeps this door from treating DownloadDir/RepoPath/LogFile
             * inconsistently with each other for no reason. */
            if (flow_contains_forbidden_shell_char(value) || flow_contains_dotdot_segment(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->download_dir, value, sizeof(cfg->download_dir) - 1);
                cfg->download_dir[sizeof(cfg->download_dir) - 1] = '\0';
            }
        } else if (str_icmp(key, "DoorsDir") == 0) {
            /* Same checks as DownloadDir, and for the stronger of its two
             * reasons: this value is interpolated (inside quotes) into the
             * extraction system() command line. */
            if (flow_contains_forbidden_shell_char(value) || flow_contains_dotdot_segment(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->doors_dir, value, sizeof(cfg->doors_dir) - 1);
                cfg->doors_dir[sizeof(cfg->doors_dir) - 1] = '\0';
            }
        } else if (str_icmp(key, "BBSCmdDir") == 0) {
            if (flow_contains_forbidden_shell_char(value) || flow_contains_dotdot_segment(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->bbscmd_dir, value, sizeof(cfg->bbscmd_dir) - 1);
                cfg->bbscmd_dir[sizeof(cfg->bbscmd_dir) - 1] = '\0';
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
            /* Allowlisted, not denylisted - see flow.h's block comment
             * for why: cfg->lha_command sits UNQUOTED in the system()
             * command line doorrepo.c builds, and a denylist was proven
             * (twice) unable to defend an unquoted position. */
            if (flow_is_valid_command_token(value, sizeof(cfg->lha_command))) {
                strncpy(cfg->lha_command, value, sizeof(cfg->lha_command) - 1);
                cfg->lha_command[sizeof(cfg->lha_command) - 1] = '\0';
            } else {
                local_skipped++;
                g_last_unsafe_value_count++;
            }
        } else if (str_icmp(key, "Ansi") == 0) {
            cfg->ansi = parse_boolean(value);
        } else if (str_icmp(key, "ScreenRows") == 0) {
            parsed_value = validate_screen_rows(value);
            if (parsed_value > 0) {
                cfg->screen_rows = parsed_value;
            } else {
                local_skipped++;
            }
        } else if (str_icmp(key, "ScreenCols") == 0) {
            parsed_value = validate_screen_cols(value);
            if (parsed_value > 0) {
                cfg->screen_cols = parsed_value;
            } else {
                local_skipped++;
            }
        } else if (str_icmp(key, "ExtractAfterDownload") == 0) {
            cfg->extract_after_download = parse_boolean(value);
        } else if (str_icmp(key, "KeepFailedDownloads") == 0) {
            cfg->keep_failed_downloads = parse_boolean(value);
        } else if (str_icmp(key, "LogFile") == 0) {
            if (flow_contains_forbidden_shell_char(value) || flow_contains_dotdot_segment(value)) {
                local_skipped++;
                g_last_unsafe_value_count++;
            } else {
                strncpy(cfg->log_file, value, sizeof(cfg->log_file) - 1);
                cfg->log_file[sizeof(cfg->log_file) - 1] = '\0';
            }
        } else if (str_icmp(key, "AdminUsername") == 0) {
            /* Bounded copy ONLY - no denylist. See config.h's field comment
             * and owner_auth.h's file header: these values are never
             * shell-interpolated, so flow_contains_forbidden_shell_char()
             * does not apply here (controller ruling; the plan's original
             * text prescribing that check was wrong for this field). */
            strncpy(cfg->admin_username, value, sizeof(cfg->admin_username) - 1);
            cfg->admin_username[sizeof(cfg->admin_username) - 1] = '\0';
        } else if (str_icmp(key, "AdminPassword") == 0) {
            /* Same bounded-copy-only rule as AdminUsername above - and this
             * line's value is NEVER logged even when LogFile records other
             * skipped/invalid config lines, because this branch never
             * rejects a value (any password parses), so no log_line() call
             * on this path can ever be reached with `value` in scope. */
            strncpy(cfg->admin_password, value, sizeof(cfg->admin_password) - 1);
            cfg->admin_password[sizeof(cfg->admin_password) - 1] = '\0';
        } else {
            local_skipped++;
        }
    }

    fclose(f);

    if (skipped_lines)
        *skipped_lines = local_skipped;

    return 0;
}

int config_read_token(const dr_config *cfg, char *out, unsigned long outlen)
{
    char tokenpath[512];
    FILE *f;
    unsigned long len;

    if (out != (char *) 0 && outlen > 0) {
        out[0] = '\0';
    }

    if (cfg == (const dr_config *) 0 || out == (char *) 0 || outlen == 0) {
        return 0;
    }

    /* Joined with flow_build_local_path() rather than a bare sprintf("%s/...")
     * so a doors_dir already ending in ':' or '/' (the default, "Doors/")
     * never produces a doubled separator - the same join every other
     * doors_dir-relative path in this door already goes through (see
     * flow_build_install_dir()). */
    if (flow_build_local_path(tokenpath, sizeof(tokenpath), cfg->doors_dir,
                               "DoorRepo/DoorRepo.token") < 0) {
        return 0;
    }

    f = fopen(tokenpath, "rb");
    if (f == (FILE *) 0) {
        return 0;
    }

    if (fgets(out, (int) outlen, f) == (char *) 0) {
        fclose(f);
        return 0;
    }
    fclose(f);

    len = (unsigned long) strlen(out);
    while (len > 0 && (out[len - 1] == '\n' || out[len - 1] == '\r' || out[len - 1] == ' ')) {
        out[--len] = '\0';
    }
    return len > 0 ? 1 : 0;
}
