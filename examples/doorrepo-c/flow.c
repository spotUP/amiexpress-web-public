/* flow.c - pure decision logic extracted from doorrepo.c. See flow.h for
 * the interface contract and the reasoning behind each decision.
 *
 * C89. No platform I/O of any kind - every function here is a plain
 * deterministic transform over its arguments.
 */

#include <string.h>
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

int flow_build_archive_path(char *out, unsigned long outsize,
                             const char *base_path, const char *archive_name)
{
    static const char mid[] = "/archive/";
    unsigned long blen;
    unsigned long mlen;
    unsigned long alen;
    unsigned long need;

    if (out == (char *) 0 || outsize == 0
        || base_path == (const char *) 0 || archive_name == (const char *) 0) {
        return -1;
    }

    blen = (unsigned long) strlen(base_path);
    mlen = (unsigned long) (sizeof(mid) - 1);
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
