#ifndef CONFIG_H
#define CONFIG_H

typedef struct {
    char host[64];
    int port;
    char path[128];
    char download_dir[128];
    /* Where an installed door's files are put, and where its BBS command
     * config is written. Both are joined with the command name chosen at
     * install time: <doors_dir>/<CMD>/ and <bbscmd_dir>/<CMD>.info.
     * doors_dir is interpolated into the extraction system() command line,
     * so it gets the same shell-safety and '..' checks as download_dir;
     * bbscmd_dir is only ever fopen()ed, and is checked the same way for
     * consistency. */
    char doors_dir[128];
    char bbscmd_dir[128];
    int page_size;
    int timeout_secs;
    char lha_command[128];
    int extract_after_download;
    char log_file[128];
    /* Full-screen ANSI browser (default on). A sysop with a terminal that
     * cannot do CSI sequences sets Ansi=no and gets the original
     * line-at-a-time listing instead. */
    int ansi;
    int screen_rows;
    int screen_cols;
    /* Keep a download whose checksum did not match, as "<name>.bad", instead
     * of deleting it. Off by default; see flow.h's flow_build_bad_path() for
     * why the option exists at all and why it is not the default. */
    int keep_failed_downloads;
} dr_config;

void config_defaults(dr_config *cfg);
int config_load(dr_config *cfg, const char *path, int *skipped_lines);

/* Returns how many lines rejected by the MOST RECENT config_load() call
 * were rejected specifically because their value contained a forbidden
 * shell/control character (see flow.h's flow_contains_forbidden_shell_char()) -
 * a subset of, never more than, that call's *skipped_lines total. Reset
 * to 0 at the start of every config_load() call, mirroring the
 * net_last_error()-style "state describing the last call" pattern
 * already used in netio.c, rather than widening config_load()'s own
 * signature and forcing every one of its ~90 existing call sites
 * (production and test) to pass a new parameter for a distinction only
 * one caller (doorrepo.c's sysop-facing message) currently needs.
 *
 * DownloadDir, LhaCommand, LogFile and RepoPath are checked (RepoHost/
 * RepoPort/PageSize/TimeoutSecs/ExtractAfterDownload are not - they are
 * never interpolated into a shell command line or a raw HTTP request
 * line the way those four are). This exists because DownloadDir and
 * LhaCommand both flow, unescaped, into a system() command line built by
 * doorrepo.c for optional archive extraction - a config value containing
 * shell metacharacters is therefore a real command-injection path from
 * a config file, not merely a formatting concern. RepoPath and LogFile
 * are checked too: RepoPath is concatenated raw into an HTTP request
 * line by http.c, so a CR/LF in it could inject request-line/header
 * content; LogFile is opened directly rather than interpolated into a
 * shell command, but is included for the same defense-in-depth reason
 * the brief specifies it. */
int config_last_unsafe_value_count(void);

#endif
