/* flow.c - pure decision logic extracted from doorrepo.c. See flow.h for
 * the interface contract and the reasoning behind each decision.
 *
 * C89. No platform I/O of any kind - every function here is a plain
 * deterministic transform over its arguments.
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "flow.h"

void flow_compute_page(unsigned long total_rows, int page_size,
                        int page_number, flow_page_info *out)
{
    unsigned long page_count;
    unsigned long pn;
    unsigned long remaining;
    unsigned long size;

    if (page_size < 1) {
        page_size = 1;
    }
    size = (unsigned long) page_size;

    if (total_rows == 0) {
        out->start_index = 0;
        out->row_count = 0;
        out->page_count = 0;
        out->page_number = 0;
        return;
    }

    page_count = (total_rows + size - 1) / size;

    if (page_number < 1) {
        pn = 1;
    } else if ((unsigned long) page_number > page_count) {
        pn = page_count;
    } else {
        pn = (unsigned long) page_number;
    }

    out->start_index = (pn - 1) * size;
    remaining = total_rows - out->start_index;
    out->row_count = (remaining < size) ? remaining : size;
    out->page_count = page_count;
    out->page_number = pn;
}

flow_verify_outcome flow_next_verify_outcome(int attempt_number, int digest_matches)
{
    if (digest_matches) {
        return FLOW_VERIFY_OK;
    }
    if (attempt_number <= 1) {
        return FLOW_VERIFY_RETRY;
    }
    return FLOW_VERIFY_ABORT;
}

static int is_unreserved(unsigned char c)
{
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
        return 1;
    }
    if (c == '-' || c == '.' || c == '_' || c == '~') {
        return 1;
    }
    return 0;
}

int flow_url_encode(const char *in, char *out, unsigned long outsize)
{
    static const char hexdigits[] = "0123456789ABCDEF";
    unsigned long pos = 0;
    const unsigned char *p;

    if (in == (const char *) 0 || out == (char *) 0 || outsize == 0) {
        return -1;
    }

    for (p = (const unsigned char *) in; *p != '\0'; p++) {
        if (is_unreserved(*p)) {
            if (pos + 1 >= outsize) {
                return -1;
            }
            out[pos++] = (char) *p;
        } else {
            if (pos + 3 >= outsize) {
                return -1;
            }
            out[pos++] = '%';
            out[pos++] = hexdigits[(*p >> 4) & 0x0F];
            out[pos++] = hexdigits[*p & 0x0F];
        }
    }
    out[pos] = '\0';
    return (int) pos;
}

int flow_build_list_query(char *out, unsigned long outsize,
                           const char *type_filter, const char *search_term)
{
    static const char type_prefix[] = "type=";
    static const char q_prefix[] = "q=";
    unsigned long pos = 0;
    int has_type;
    int has_q;
    char encoded[256];
    int enc_len = 0;
    unsigned long plen;
    unsigned long tlen;

    if (out == (char *) 0 || outsize == 0) {
        return -1;
    }

    has_type = (type_filter != (const char *) 0 && type_filter[0] != '\0');
    has_q = (search_term != (const char *) 0 && search_term[0] != '\0');

    if (!has_type && !has_q) {
        out[0] = '\0';
        return 0;
    }

    if (has_q) {
        enc_len = flow_url_encode(search_term, encoded, sizeof(encoded));
        if (enc_len < 0) {
            return -1;
        }
    }

    if (pos + 1 >= outsize) {
        return -1;
    }
    out[pos++] = '?';

    if (has_type) {
        plen = (unsigned long) (sizeof(type_prefix) - 1);
        tlen = (unsigned long) strlen(type_filter);
        if (pos + plen + tlen >= outsize) {
            return -1;
        }
        memcpy(out + pos, type_prefix, plen);
        pos += plen;
        memcpy(out + pos, type_filter, tlen);
        pos += tlen;
    }

    if (has_q) {
        if (has_type) {
            if (pos + 1 >= outsize) {
                return -1;
            }
            out[pos++] = '&';
        }
        plen = (unsigned long) (sizeof(q_prefix) - 1);
        if (pos + plen + (unsigned long) enc_len >= outsize) {
            return -1;
        }
        memcpy(out + pos, q_prefix, plen);
        pos += plen;
        memcpy(out + pos, encoded, (unsigned long) enc_len);
        pos += (unsigned long) enc_len;
    }

    out[pos] = '\0';
    return (int) pos;
}

/* Shared by flow_build_archive_path() and flow_build_diz_path(): the two
 * differ only in the middle path segment, so the bounds checking and
 * concatenation live in one place rather than being copied. */
static int build_entry_path(char *out, unsigned long outsize,
                            const char *base_path, const char *mid,
                            const char *archive_name)
{
    unsigned long blen;
    unsigned long mlen;
    unsigned long alen;
    unsigned long need;

    if (out == (char *) 0 || outsize == 0
        || base_path == (const char *) 0 || archive_name == (const char *) 0) {
        return -1;
    }

    blen = (unsigned long) strlen(base_path);
    mlen = (unsigned long) strlen(mid);
    alen = (unsigned long) strlen(archive_name);
    need = blen + mlen + alen;

    if (need + 1 > outsize) {
        return -1;
    }

    memcpy(out, base_path, blen);
    memcpy(out + blen, mid, mlen);
    memcpy(out + blen + mlen, archive_name, alen);
    out[need] = '\0';

    return (int) need;
}

int flow_build_archive_path(char *out, unsigned long outsize,
                             const char *base_path, const char *archive_name)
{
    return build_entry_path(out, outsize, base_path, "/archive/", archive_name);
}

int flow_build_diz_path(char *out, unsigned long outsize,
                        const char *base_path, const char *archive_name)
{
    return build_entry_path(out, outsize, base_path, "/diz/", archive_name);
}

int flow_build_files_path(char *out, unsigned long outsize,
                          const char *base_path, const char *archive_name)
{
    return build_entry_path(out, outsize, base_path, "/files/", archive_name);
}

int flow_build_doc_path(char *out, unsigned long outsize,
                        const char *base_path, const char *archive_name)
{
    return build_entry_path(out, outsize, base_path, "/doc/", archive_name);
}

int flow_contains_forbidden_shell_char(const char *value)
{
    /* "#" added after the Round 2 bypass (LhaCommand's trailing-comment
     * exploit) - it belongs here too even though LhaCommand itself moved
     * to an allowlist, since a "#" inside a double-quoted DownloadDir/
     * LogFile/RepoPath/archive-name value is still worth refusing on
     * general principle (it has no legitimate meaning in any of those). */
    static const char forbidden[] = "\"'`$;\\|&<>#\r\n";
    const char *p;

    if (value == (const char *) 0) {
        return 0;
    }

    for (p = value; *p != '\0'; p++) {
        if (strchr(forbidden, (int) *p) != (char *) 0) {
            return 1;
        }
    }
    return 0;
}

static int is_command_token_char(unsigned char c)
{
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
        || c == '_' || c == '.' || c == ':' || c == '/' || c == '-';
}

int flow_is_valid_command_token(const char *value, unsigned long maxlen)
{
    unsigned long len;
    const char *p;

    if (value == (const char *) 0 || value[0] == '\0') {
        return 0;
    }

    len = (unsigned long) strlen(value);
    if (len + 1 > maxlen) {
        return 0;
    }

    for (p = value; *p != '\0'; p++) {
        if (!is_command_token_char((unsigned char) *p)) {
            return 0;
        }
    }
    return 1;
}

int flow_is_safe_archive_filename(const char *name)
{
    const char *p;

    if (name == (const char *) 0 || name[0] == '\0') {
        return 0;
    }
    if (name[0] == '.') {
        return 0;
    }
    if (strstr(name, "..") != (char *) 0) {
        return 0;
    }
    for (p = name; *p != '\0'; p++) {
        unsigned char c = (unsigned char) *p;
        if (c == '/' || c == '\\' || c == ':') {
            return 0;
        }
        if (c < 0x20 || c == 0x7F) {
            return 0;
        }
    }
    return 1;
}

int flow_contains_dotdot_segment(const char *value)
{
    if (value == (const char *) 0) {
        return 0;
    }
    return strstr(value, "..") != (char *) 0;
}

int flow_build_local_path(char *out, unsigned long outsize,
                           const char *download_dir, const char *archive_name)
{
    unsigned long dlen;
    unsigned long alen;
    unsigned long need;
    int needs_separator;

    if (out == (char *) 0 || outsize == 0
        || download_dir == (const char *) 0 || archive_name == (const char *) 0) {
        return -1;
    }

    dlen = (unsigned long) strlen(download_dir);
    alen = (unsigned long) strlen(archive_name);

    needs_separator = (dlen > 0 && download_dir[dlen - 1] != ':' && download_dir[dlen - 1] != '/');

    need = dlen + (needs_separator ? 1 : 0) + alen;
    if (need + 1 > outsize) {
        return -1;
    }

    memcpy(out, download_dir, dlen);
    if (needs_separator) {
        out[dlen] = '/';
        dlen += 1;
    }
    memcpy(out + dlen, archive_name, alen);
    out[dlen + alen] = '\0';

    return (int) need;
}

unsigned long flow_nav_target(int action, unsigned long selected,
                              unsigned long count, unsigned long page)
{
    if (count == 0) {
        return 0;
    }
    if (page == 0) {
        page = 1;
    }
    if (selected >= count) {
        selected = count - 1;
    }

    switch (action) {
    case FLOW_NAV_UP:
        return (selected > 0) ? selected - 1 : 0;
    case FLOW_NAV_DOWN:
        return (selected + 1 < count) ? selected + 1 : count - 1;
    case FLOW_NAV_PGUP:
        return (selected > page) ? selected - page : 0;
    case FLOW_NAV_PGDN:
        return (selected + page < count) ? selected + page : count - 1;
    case FLOW_NAV_HOME:
        return 0;
    case FLOW_NAV_END:
        return count - 1;
    default:
        return selected;
    }
}

void flow_clamp_view(unsigned long *selected, unsigned long *top_index,
                      unsigned long count, unsigned long visible_rows)
{
    if (selected == (unsigned long *) 0 || top_index == (unsigned long *) 0) {
        return;
    }

    /* The row set shrank under `*selected` (or vanished entirely): pull it
     * back to the new last row, or 0 when there is none. `>=`, not `>` -
     * `*selected == count` is exactly "one past the new end", the DOORMAN
     * bug this mirrors the fix for. */
    if (count > 0 && *selected >= count) {
        *selected = count - 1;
    }
    if (count == 0) {
        *selected = 0;
    }

    /* Follow the window to wherever `*selected` ended up: pull it up if the
     * selection is now above it, or down if the selection is now below the
     * last visible row. visible_rows == 0 has no window to keep in sync. */
    if (*selected < *top_index) {
        *top_index = *selected;
    }
    if (visible_rows > 0 && *selected >= *top_index + visible_rows) {
        *top_index = *selected - visible_rows + 1;
    }
}

int flow_build_info_temp_path(char *out, unsigned long outsize, const char *info_path)
{
    static const char suffix[] = ".new";
    unsigned long plen;
    unsigned long slen;

    if (out == (char *) 0 || outsize == 0 || info_path == (const char *) 0) {
        return -1;
    }

    plen = (unsigned long) strlen(info_path);
    slen = (unsigned long) (sizeof(suffix) - 1);
    if (plen == 0) {
        return -1;
    }
    if (plen + slen + 1 > outsize) {
        return -1;
    }

    memcpy(out, info_path, plen);
    memcpy(out + plen, suffix, slen);
    out[plen + slen] = '\0';

    return (int) (plen + slen);
}

int flow_build_bad_path(char *out, unsigned long outsize, const char *local_path)
{
    static const char suffix[] = ".bad";
    unsigned long plen;
    unsigned long slen;

    if (out == (char *) 0 || outsize == 0 || local_path == (const char *) 0) {
        return -1;
    }

    plen = (unsigned long) strlen(local_path);
    slen = (unsigned long) (sizeof(suffix) - 1);
    if (plen == 0) {
        return -1;
    }
    if (plen + slen + 1 > outsize) {
        return -1;
    }

    memcpy(out, local_path, plen);
    memcpy(out + plen, suffix, slen);
    out[plen + slen] = '\0';

    return (int) (plen + slen);
}

int flow_should_use_cache(const char *cached_revision, const char *server_revision)
{
    if (cached_revision == (const char *) 0 || server_revision == (const char *) 0) {
        return 0;
    }
    if (cached_revision[0] == '\0' || server_revision[0] == '\0') {
        return 0;
    }
    if (strcmp(server_revision, "unknown") == 0) {
        return 0;
    }
    if (strcmp(cached_revision, server_revision) == 0) {
        return 1;
    }
    return 0;
}

unsigned long flow_effective_row_count(unsigned long declared_count, unsigned long cap)
{
    return (declared_count > cap) ? cap : declared_count;
}

int flow_declared_count_exceeds_cap(unsigned long declared_count, unsigned long cap)
{
    return declared_count > cap;
}

unsigned long flow_archive_byte_ceiling(unsigned long declared_size,
                                         unsigned long absolute_max,
                                         unsigned long slack_floor,
                                         unsigned long slack_percent)
{
    unsigned long percent_slack;
    unsigned long slack;

    if (declared_size == 0 || declared_size > absolute_max) {
        return absolute_max;
    }

    percent_slack = (declared_size / 100UL) * slack_percent;
    slack = (percent_slack > slack_floor) ? percent_slack : slack_floor;

    /* declared_size <= absolute_max here (checked above), so this sum
     * stays small and safe from overflow for any sane absolute_max.
     *
     * Clamp to absolute_max: a declared_size right at (or just under)
     * absolute_max passes the plausibility check above and still gets
     * slack added on top of it - without this clamp, the returned
     * ceiling could exceed absolute_max by up to the slack amount,
     * which a hostile catalog could exploit by simply declaring a size
     * near the boundary. Reproduced live before this fix: declared_size
     * == absolute_max (16,777,216 with this door's real constants)
     * yielded an enforced ceiling of 20,132,656 - ~3.35 MiB past the
     * stated cap - and a body of exactly that size streamed in full. */
    if (declared_size + slack > absolute_max) {
        return absolute_max;
    }
    return declared_size + slack;
}

int flow_is_plain_alnum(const char *value)
{
    const char *p;

    if (value == (const char *) 0 || value[0] == '\0') {
        return 0;
    }
    for (p = value; *p != '\0'; p++) {
        unsigned char c = (unsigned char) *p;
        if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))) {
            return 0;
        }
    }
    return 1;
}

/* ---- Install support: command names, paths, .info content, file lists ----
 *
 * All pure string work, deliberately here rather than in doorrepo.c so it
 * can be tested without a server, a terminal or a filesystem. See flow.h
 * for what each one guarantees.
 */

int flow_is_valid_bbs_command(const char *cmd)
{
    unsigned long len;
    unsigned long i;

    if (cmd == (const char *) 0 || cmd[0] == '\0') {
        return 0;
    }
    len = (unsigned long) strlen(cmd);
    if (len > FLOW_MAX_BBS_COMMAND) {
        return 0;
    }
    for (i = 0; i < len; i++) {
        unsigned char c = (unsigned char) cmd[i];
        if (!((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))) {
            return 0;
        }
    }
    return 1;
}

int flow_suggest_bbs_command(const char *archive_name, char *out, unsigned long outsize)
{
    unsigned long n = 0;
    const char *p;

    if (out == (char *) 0 || outsize == 0) {
        return -1;
    }
    out[0] = '\0';
    if (archive_name == (const char *) 0) {
        return -1;
    }

    for (p = archive_name; *p != '\0'; p++) {
        unsigned char c = (unsigned char) *p;

        if (c == '.') {
            break; /* stop at the extension */
        }
        if (c >= 'a' && c <= 'z') {
            c = (unsigned char) (c - 'a' + 'A');
        }
        if (!((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))) {
            continue; /* scene names are full of !, $, -, & */
        }
        if (n + 1 >= outsize || n >= FLOW_MAX_BBS_COMMAND) {
            break;
        }
        out[n++] = (char) c;
    }
    out[n] = '\0';
    return (n > 0) ? (int) n : -1;
}

int flow_build_install_dir(char *out, unsigned long outsize,
                            const char *doors_dir, const char *cmd)
{
    int len = flow_build_local_path(out, outsize, doors_dir, cmd);

    if (len < 0) {
        return -1;
    }
    /* Trailing separator: this path is handed to the extractor as a
     * destination directory, and AmigaDOS and POSIX both accept the
     * trailing '/' while only one of them tolerates its absence in every
     * tool. */
    if ((unsigned long) len + 2 > outsize) {
        return -1;
    }
    out[len] = '/';
    out[len + 1] = '\0';
    return len + 1;
}

int flow_build_info_path(char *out, unsigned long outsize,
                          const char *bbscmd_dir, const char *cmd)
{
    int len = flow_build_local_path(out, outsize, bbscmd_dir, cmd);

    if (len < 0) {
        return -1;
    }
    if ((unsigned long) len + 6 > outsize) {
        return -1;
    }
    memcpy(out + len, ".info", 5);
    out[len + 5] = '\0';
    return len + 5;
}

int flow_build_info_content(char *out, unsigned long outsize,
                             const char *door_type, const char *cmd,
                             const char *binary_rel)
{
    unsigned long need;
    const char *type = (door_type != (const char *) 0 && door_type[0] != '\0')
        ? door_type : "XIM";

    if (out == (char *) 0 || outsize == 0
        || cmd == (const char *) 0 || binary_rel == (const char *) 0) {
        return -1;
    }

    need = (unsigned long) (strlen("TYPE=\nLOCATION=Doors:/\nSTACK=65536\nACCESS=0\n")
                            + strlen(type) + strlen(cmd) + strlen(binary_rel));
    if (need + 1 > outsize) {
        out[0] = '\0';
        return -1;
    }

    /* Byte-identical to DOORMAN's buildDoorInfoContent() (app.ts) - the
     * BBS reads these four tooltypes, and a door installed by either
     * client must be indistinguishable to it. LOCATION is always the
     * "Doors:" assign, never the sysop's DoorsDir spelling, because that
     * is what the BBS resolves against. */
    strcpy(out, "TYPE=");
    strcat(out, type);
    strcat(out, "\nLOCATION=Doors:");
    strcat(out, cmd);
    strcat(out, "/");
    strcat(out, binary_rel);
    strcat(out, "\nSTACK=65536\nACCESS=0\n");
    return (int) need;
}

/* Copies field `index` (0-based, '|'-delimited) of `line` into `out`.
 * Returns 0 on success, non-zero when the line has no such field. */
static int files_field(const char *line, int index, char *out, unsigned long outsize)
{
    const char *p = line;
    int i;

    if (outsize == 0) {
        return 1;
    }
    out[0] = '\0';

    for (i = 0; i < index; i++) {
        while (*p != '\0' && *p != '|' && *p != '\n' && *p != '\r') {
            p++;
        }
        if (*p != '|') {
            return 1;
        }
        p++;
    }
    {
        unsigned long n = 0;
        while (*p != '\0' && *p != '|' && *p != '\n' && *p != '\r') {
            if (n + 1 < outsize) {
                out[n++] = *p;
            }
            p++;
        }
        out[n] = '\0';
    }
    return 0;
}

const char *flow_files_next_line(const char *p)
{
    if (p == (const char *) 0) {
        return (const char *) 0;
    }
    while (*p != '\0' && *p != '\n') {
        p++;
    }
    while (*p == '\n' || *p == '\r') {
        p++;
    }
    return (*p == '\0') ? (const char *) 0 : p;
}

int flow_files_parse_row(const char *line, unsigned long *size, int *is_junk,
                          char *path_out, unsigned long path_outsize)
{
    char sizebuf[32];
    char junkbuf[8];

    if (line == (const char *) 0 || path_out == (char *) 0) {
        return 1;
    }
    if (files_field(line, 0, sizebuf, sizeof(sizebuf)) != 0
        || files_field(line, 1, junkbuf, sizeof(junkbuf)) != 0
        || files_field(line, 2, path_out, path_outsize) != 0) {
        return 1;
    }
    if (path_out[0] == '\0') {
        return 1;
    }
    if (size != (unsigned long *) 0) {
        *size = strtoul(sizebuf, (char **) 0, 10);
    }
    if (is_junk != (int *) 0) {
        *is_junk = (junkbuf[0] == '1');
    }
    return 0;
}

/* Basename of an archive-internal path, i.e. everything after the last
 * '/' (the /files listing always uses '/' regardless of the archive's own
 * separator). */
static const char *files_basename(const char *path)
{
    const char *slash = strrchr(path, '/');

    return (slash != (const char *) 0) ? slash + 1 : path;
}

static int name_has_extension(const char *name)
{
    return strchr(name, '.') != (const char *) 0;
}

/* Non-zero when `name` ends in ".rexx", case-insensitively. The suffix must
 * be the last thing in the name - "notes.rexxdoc" is not a script. */
static int name_is_rexx(const char *name)
{
    unsigned long len;
    const char *suffix;

    if (name == (const char *) 0) {
        return 0;
    }
    len = (unsigned long) strlen(name);
    if (len < 5) {
        return 0;
    }
    suffix = name + (len - 5);
    return (suffix[0] == '.')
        && (suffix[1] == 'r' || suffix[1] == 'R')
        && (suffix[2] == 'e' || suffix[2] == 'E')
        && (suffix[3] == 'x' || suffix[3] == 'X')
        && (suffix[4] == 'x' || suffix[4] == 'X');
}

/* Case-insensitive comparison against "XIM", the only catalog type
 * flow_effective_door_type() is willing to override. */
static int str_type_is_xim(const char *type)
{
    return (type[0] == 'X' || type[0] == 'x')
        && (type[1] == 'I' || type[1] == 'i')
        && (type[2] == 'M' || type[2] == 'm')
        && type[3] == '\0';
}

int flow_pick_door_binary(const char *files_body, const char *archive_name,
                          const char *cmd, char *out, unsigned long outsize)
{
    char base[64];
    const char *line;
    char best[160];
    unsigned long best_size = 0;
    unsigned long script_size = 0;
    int best_is_script = 0;
    int found_exact = 0;

    if (out == (char *) 0 || outsize == 0) {
        return -1;
    }
    out[0] = '\0';
    best[0] = '\0';

    /* The archive's own base name, upper-cased: "AETRIV10.LHA" -> the
     * executable is very often "AETRIV10". */
    (void) flow_suggest_bbs_command(archive_name, base, sizeof(base));

    line = files_body;
    /* Skip the "FILES|<count>|<junk>" header line. */
    if (line != (const char *) 0 && strncmp(line, "FILES|", 6) == 0) {
        line = flow_files_next_line(line);
    }

    while (line != (const char *) 0 && !found_exact) {
        char path[160];
        unsigned long size = 0;
        int junk = 0;

        if (flow_files_parse_row(line, &size, &junk, path, sizeof(path)) == 0 && !junk) {
            const char *name = files_basename(path);
            unsigned long len = (unsigned long) strlen(name);

            if (len > 0 && path[strlen(path) - 1] != '/') {
                char upper[64];
                unsigned long i;

                for (i = 0; i < len && i + 1 < sizeof(upper); i++) {
                    char c = name[i];
                    if (c >= 'a' && c <= 'z') {
                        c = (char) (c - 'a' + 'A');
                    }
                    upper[i] = c;
                }
                upper[(i < sizeof(upper)) ? i : sizeof(upper) - 1] = '\0';

                /* 1. Exact match on the archive base name or the chosen
                 *    BBS command - as good an answer as this can get. */
                if ((base[0] != '\0' && strcmp(upper, base) == 0)
                    || (cmd != (const char *) 0 && cmd[0] != '\0' && strcmp(upper, cmd) == 0)) {
                    strncpy(best, path, sizeof(best) - 1);
                    best[sizeof(best) - 1] = '\0';
                    found_exact = 1;
                } else if (!name_has_extension(name) && size > best_size) {
                    /* 2. Otherwise the largest extension-less file: Amiga
                     *    executables conventionally have no suffix, while
                     *    the .doc/.txt/.info files around them do. */
                    strncpy(best, path, sizeof(best) - 1);
                    best[sizeof(best) - 1] = '\0';
                    best_size = size;
                    best_is_script = 0;
                } else if (name_is_rexx(name)
                           && (best[0] == '\0' || best_is_script)
                           && size > script_size) {
                    /* 3. A .rexx script, but only while no real executable
                     *    has been seen: a script beside a binary is an
                     *    installer, a script alone is the door. */
                    strncpy(best, path, sizeof(best) - 1);
                    best[sizeof(best) - 1] = '\0';
                    script_size = size;
                    best_is_script = 1;
                }
            }
        }
        line = flow_files_next_line(line);
    }

    if (best[0] == '\0') {
        return -1;
    }
    if ((unsigned long) strlen(best) + 1 > outsize) {
        return -1;
    }
    strcpy(out, best);
    return (int) strlen(out);
}

int flow_key_ends_session(int key)
{
    return (key < 0) ? 1 : 0;
}

/* ---- Install index -----------------------------------------------------
 *
 * See flow.h for why this file exists at all. Pure line formatting and
 * parsing only; doorrepo.c owns the file I/O and the in-memory table.
 */

int flow_index_format_line(char *out, unsigned long outsize,
                            const char *archive, const char *cmd)
{
    unsigned long need;

    if (out == (char *) 0 || outsize == 0
        || archive == (const char *) 0 || cmd == (const char *) 0
        || archive[0] == '\0' || cmd[0] == '\0') {
        if (out != (char *) 0 && outsize > 0) {
            out[0] = '\0';
        }
        return -1;
    }
    /* A '|' in either field would make the line unparseable. archive names
     * come from the catalog, which the format doc says may contain almost
     * anything except a pipe (the server escapes those to '!'), and cmd is
     * A-Z0-9 by flow_is_valid_bbs_command. Checked anyway: this file is
     * read back and acted on, and a malformed line would silently point an
     * uninstall at the wrong directory. */
    if (strchr(archive, '|') != (const char *) 0 || strchr(cmd, '|') != (const char *) 0) {
        out[0] = '\0';
        return -1;
    }

    need = (unsigned long) (strlen(archive) + 1 + strlen(cmd) + 1);
    if (need + 1 > outsize) {
        out[0] = '\0';
        return -1;
    }
    strcpy(out, archive);
    strcat(out, "|");
    strcat(out, cmd);
    strcat(out, "\n");
    return (int) need;
}

int flow_index_parse_line(const char *line, char *archive_out, unsigned long archive_size,
                           char *cmd_out, unsigned long cmd_size)
{
    const char *bar;
    const char *end;

    if (line == (const char *) 0 || archive_out == (char *) 0 || cmd_out == (char *) 0
        || archive_size == 0 || cmd_size == 0) {
        return 1;
    }
    archive_out[0] = '\0';
    cmd_out[0] = '\0';

    bar = strchr(line, '|');
    if (bar == (const char *) 0 || bar == line) {
        return 1;
    }
    {
        unsigned long alen = (unsigned long) (bar - line);
        unsigned long n = (alen > archive_size - 1) ? archive_size - 1 : alen;
        memcpy(archive_out, line, (size_t) n);
        archive_out[n] = '\0';
    }

    end = bar + 1;
    while (*end != '\0' && *end != '\n' && *end != '\r') {
        end++;
    }
    {
        unsigned long clen = (unsigned long) (end - (bar + 1));
        unsigned long n = (clen > cmd_size - 1) ? cmd_size - 1 : clen;
        memcpy(cmd_out, bar + 1, (size_t) n);
        cmd_out[n] = '\0';
    }

    if (cmd_out[0] == '\0') {
        archive_out[0] = '\0';
        return 1;
    }
    return 0;
}

int flow_build_index_path(char *out, unsigned long outsize, const char *download_dir)
{
    return flow_build_local_path(out, outsize, download_dir, FLOW_INDEX_FILENAME);
}

/* ---- Installed-only view -------------------------------------------------
 *
 * See flow.h for why this lives here rather than next to g_index in
 * doorrepo.c. Pure array scan only; doorrepo.c owns building
 * `known_archives` from g_index[] and walking the catalog.
 */

int flow_is_installed_row(const char *row_archive,
                          const char *known_archives[], int known_count)
{
    int i;

    if (row_archive == (const char *) 0) {
        return 0;
    }
    for (i = 0; i < known_count; i++) {
        if (known_archives[i] != (const char *) 0
            && strcmp(row_archive, known_archives[i]) == 0) {
            return 1;
        }
    }
    return 0;
}

/* Quotes are the only character this refuses; see flow.h for why escaping
 * is not attempted. */
static int extract_arg_ok(const char *value)
{
    if (value == (const char *) 0 || value[0] == '\0') {
        return 0;
    }
    return strchr(value, '"') == (char *) 0;
}

int flow_build_extract_command(char *out, unsigned long outsize,
                                const char *lha_command,
                                const char *archive_path,
                                const char *dest_dir,
                                int amiga_form)
{
    unsigned long need;

    if (out == (char *) 0 || outsize == 0) {
        return -1;
    }
    if (!extract_arg_ok(lha_command) || !extract_arg_ok(archive_path)
        || !extract_arg_ok(dest_dir)) {
        return -1;
    }

    /* Both shapes carry 2 quotes per value (6). The Amiga form adds " x "
     * (3) and the space before the destination (1); the native one adds
     * " xw=" (4) and the space before the archive (1). */
    need = (unsigned long) (strlen(lha_command) + strlen(archive_path)
                            + strlen(dest_dir) + 6);
    need += amiga_form ? 4 : 5;
    if (need + 1 > outsize) {
        return -1;
    }

    if (amiga_form) {
        sprintf(out, "\"%s\" x \"%s\" \"%s\"", lha_command, archive_path, dest_dir);
    } else {
        sprintf(out, "\"%s\" xw=\"%s\" \"%s\"", lha_command, dest_dir, archive_path);
    }

    return (int) need;
}

int flow_install_verdict(int extract_ok, int have_listing, int program_readable,
                         int listed_checked, int listed_present)
{
    /* A program that opens settles the question: the archive unpacked and
     * LOCATION points at something real. */
    if (program_readable) {
        if (!extract_ok) {
            return FLOW_INSTALL_WARN_ARCHIVER_ERROR;
        }
        return have_listing ? FLOW_INSTALL_OK : FLOW_INSTALL_WARN_NO_LISTING;
    }

    /* Two independent signals pointing the same way: the archiver
     * complained AND the program is not there. */
    if (!extract_ok) {
        return FLOW_INSTALL_REFUSE_ARCHIVER_AND_MISSING;
    }

    /* The archiver claims success, so if the listing named files and not
     * one of them arrived, the claim is false and nothing was unpacked. */
    if (listed_checked > 0 && listed_present == 0) {
        return FLOW_INSTALL_REFUSE_NOTHING_EXTRACTED;
    }

    if (!have_listing) {
        return FLOW_INSTALL_WARN_NO_LISTING;
    }

    return FLOW_INSTALL_WARN_PROGRAM_UNREADABLE;
}

const char *flow_effective_door_type(const char *catalog_type,
                                     const char *binary_rel)
{
    const char *type = (catalog_type != (const char *) 0) ? catalog_type : "";

    if (binary_rel == (const char *) 0 || !name_is_rexx(binary_rel)) {
        return type;
    }
    if (type[0] == '\0' || str_type_is_xim(type)) {
        return "AIM";
    }
    return type;
}

/* ---- Footer bar builder --------------------------------------------------
 * See flow.h for the full contract. */

int flow_build_footer_bar(char *out, unsigned long outcap, int cols,
                           const char *mandatory_prefix,
                           const char *const *optional_parts, int optional_count,
                           const char *mandatory_suffix)
{
    unsigned long pos;
    unsigned long prefix_len;
    unsigned long suffix_len;
    int i;

    if (out == (char *) 0 || outcap == 0) {
        return -1;
    }
    if (mandatory_prefix == (const char *) 0) {
        mandatory_prefix = "";
    }
    if (mandatory_suffix == (const char *) 0) {
        mandatory_suffix = "";
    }
    if (optional_parts == (const char *const *) 0) {
        optional_count = 0;
    }
    if (cols < 0) {
        cols = 0;
    }

    prefix_len = (unsigned long) strlen(mandatory_prefix);
    suffix_len = (unsigned long) strlen(mandatory_suffix);
    pos = 0;

    if (prefix_len > 0) {
        if (prefix_len + 1 > outcap) {
            return -1;
        }
        memcpy(out, mandatory_prefix, prefix_len);
        pos = prefix_len;
    }

    /* Optional parts, highest priority first. Each is tried against the
     * `cols` budget with room for its own leading separator AND the
     * separator+suffix that must still follow it - so a part is only ever
     * added when the suffix is still guaranteed to fit afterwards. The
     * first part that would not fit stops the loop outright: lower-
     * priority parts are not tried in its place, since the array's order
     * IS the priority (a later, shorter part appearing where an earlier,
     * longer one was dropped would invert that ordering). */
    for (i = 0; i < optional_count; i++) {
        const char *part = optional_parts[i];
        unsigned long part_len;
        unsigned long sep_len;
        unsigned long tail_len;
        unsigned long candidate_cols;

        if (part == (const char *) 0 || part[0] == '\0') {
            continue;
        }
        part_len = (unsigned long) strlen(part);
        sep_len = (pos > 0) ? 2UL : 0UL;
        tail_len = (suffix_len > 0) ? 2UL + suffix_len : 0UL;
        candidate_cols = pos + sep_len + part_len + tail_len;

        if (candidate_cols > (unsigned long) cols) {
            break;
        }
        if (pos + sep_len + part_len + 1 > outcap) {
            break; /* outcap is generous in every real caller; defensive only */
        }

        if (sep_len > 0) {
            memcpy(out + pos, "  ", 2);
            pos += 2;
        }
        memcpy(out + pos, part, part_len);
        pos += part_len;
    }

    /* The suffix is appended unconditionally from here - never gated on
     * `cols`. This is the "never silently drop Q" guarantee: the only way
     * this function returns without the full suffix is running out of
     * `outcap` (a genuinely undersized buffer), never running out of
     * `cols` (a narrow screen). */
    if (suffix_len > 0) {
        unsigned long sep_len = (pos > 0) ? 2UL : 0UL;

        if (pos + sep_len + suffix_len + 1 > outcap) {
            return -1;
        }
        if (sep_len > 0) {
            memcpy(out + pos, "  ", 2);
            pos += 2;
        }
        memcpy(out + pos, mandatory_suffix, suffix_len);
        pos += suffix_len;
    }

    out[pos] = '\0';
    return (int) pos;
}
