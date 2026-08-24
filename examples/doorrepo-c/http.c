/* http.c - streaming HTTP/1.1 client for the DoorRepo repo endpoints.
 * See http.h for the interface contract.
 *
 * Platform-neutral: this file must never contain "#ifdef AMIGA" (or any
 * other platform test) - all socket access goes through netio.h. See
 * netio.c for the one file that is allowed to branch by platform.
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 * Fixed-size buffers only; header parsing never overflows on a hostile or
 * absurdly long header line (see conn_read_line()).
 */

#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <errno.h>
#include "http.h"
#include "netio.h"

#define LINE_BUF_SIZE     512  /* one status/header line, including the field value */
#define READ_AHEAD_SIZE    512  /* socket read-ahead chunk used while scanning headers */
/* Socket read chunk once streaming the body.
 *
 * Every net_read() is a WaitSelect + recv pair across the bsdsocket boundary,
 * so this size decides how many round trips a body costs: the 3300-row
 * catalog is now ~620 KB, which at the original 512 bytes meant ~1200 reads
 * and at 4 KB still ~152 - measured as seconds of a cold start, because each
 * one crosses the emulator boundary twice. At 32 KB it is ~19. The buffer is
 * static rather than
 * automatic because the door's icon declares STACK=8192 - a 4 KB stack array
 * inside a function that also holds the request, line and connection buffers
 * would be a real risk of running the stack out on a real Amiga. Static is
 * safe here: this door is single-threaded and http_get() never recurses. */
#define BODY_CHUNK_SIZE  32768
/* The whole "<METHOD> <path> HTTP/1.1\r\nHost: ...\r\n...\r\n\r\n" header
 * block (method line through the blank line that ends the headers,
 * including any Content-Length line and any caller-supplied extra
 * headers) - NOT the request body, which is written separately straight
 * from the caller's buffer (see http_request()) rather than copied in
 * here first. */
#define REQUEST_BUF_SIZE   512

/* A buffered socket reader: net_read() is called in READ_AHEAD_SIZE-byte
 * chunks and lines are extracted from that buffer, so header parsing never
 * makes one syscall per byte. Whatever is left over in the buffer after
 * the last header line (the start of the body, if it arrived in the same
 * TCP segment as the headers) is drained to the sink before any further
 * net_read() call - no body byte is ever dropped or read twice. */
typedef struct {
    int fd;
    unsigned char buf[READ_AHEAD_SIZE];
    unsigned long len;
    unsigned long pos;
} http_conn;

static long conn_fill(http_conn *c)
{
    long n;
    c->pos = 0;
    c->len = 0;
    n = net_read(c->fd, c->buf, sizeof(c->buf));
    if (n > 0) {
        c->len = (unsigned long) n;
    }
    return n;
}

/* Reads one line (delimited by '\n'; any '\r' is stripped) into `out`,
 * bounded to outsize bytes including the NUL. Returns the line length on
 * success (0 for a blank line - the header/body separator), -1 on a
 * socket error or EOF before a '\n' was found, or -2 if the line was
 * longer than outsize bytes: in that case every byte up to and including
 * the '\n' is still consumed from the connection (via bounded
 * READ_AHEAD_SIZE-byte fills, never an unbounded buffer) so the caller
 * can report a clean error instead of desyncing or overflowing `out`. */
static long conn_read_line(http_conn *c, char *out, unsigned long outsize)
{
    unsigned long n = 0;
    int overflow = 0;

    for (;;) {
        int ch;
        if (c->pos >= c->len) {
            long r = conn_fill(c);
            if (r <= 0) {
                return -1;
            }
        }
        ch = c->buf[c->pos++];
        if (ch == '\n') {
            break;
        }
        if (ch == '\r') {
            continue;
        }
        if (n + 1 < outsize) {
            out[n++] = (char) ch;
        } else {
            overflow = 1;
        }
    }
    out[n] = '\0';
    return overflow ? -2 : (long) n;
}

static int parse_status_line(const char *line, int *status)
{
    const char *p = line;
    while (*p != '\0' && *p != ' ') {
        p++;
    }
    if (*p != ' ') {
        return -1;
    }
    p++;
    if (!isdigit((unsigned char) p[0]) || !isdigit((unsigned char) p[1]) || !isdigit((unsigned char) p[2])) {
        return -1;
    }
    *status = (p[0] - '0') * 100 + (p[1] - '0') * 10 + (p[2] - '0');
    return 0;
}

/* Case-insensitive whole-string equality. */
static int ieq(const char *a, const char *b)
{
    while (*a != '\0' && *b != '\0') {
        unsigned char ca = (unsigned char) tolower((unsigned char) *a);
        unsigned char cb = (unsigned char) tolower((unsigned char) *b);
        if (ca != cb) {
            return 0;
        }
        a++;
        b++;
    }
    return *a == '\0' && *b == '\0';
}

/* Case-insensitive substring search (small inputs only - header values). */
static int icontains(const char *hay, const char *needle)
{
    unsigned long hn = (unsigned long) strlen(hay);
    unsigned long nn = (unsigned long) strlen(needle);
    unsigned long i;
    if (nn == 0) {
        return 1;
    }
    if (nn > hn) {
        return 0;
    }
    for (i = 0; i + nn <= hn; i++) {
        unsigned long j;
        int match = 1;
        for (j = 0; j < nn; j++) {
            if (tolower((unsigned char) hay[i + j]) != tolower((unsigned char) needle[j])) {
                match = 0;
                break;
            }
        }
        if (match) {
            return 1;
        }
    }
    return 0;
}

static void bounded_copy(char *dest, unsigned long destsize, const char *src)
{
    unsigned long len;
    if (destsize == 0) {
        return;
    }
    len = (unsigned long) strlen(src);
    if (len > destsize - 1) {
        len = destsize - 1;
    }
    memcpy(dest, src, (size_t) len);
    dest[len] = '\0';
}

/* Returns 1 if `s` is a non-empty string of ONLY decimal digits '0'-'9' -
 * no leading '-' (or '+'), no leading/trailing whitespace, nothing else.
 * This is a SYNTAX check only - it says nothing about MAGNITUDE, and a
 * string of digits that overflows unsigned long (e.g. a 20-digit value)
 * passes it just as a small one does. strtoul() alone is not a
 * sufficient guard for a Content-Length header even with this syntax
 * check in front of it: per the C standard, strtoul() accepts an
 * optional leading '-' and computes the value as if unsigned with the
 * sign then applied, so "Content-Length: -1" parses "successfully" as
 * ULONG_MAX rather than failing - a real, demonstrated bug (a caller
 * that then treats ULONG_MAX bytes as a legitimate declared length
 * loses the one soft signal it had that something was wrong). Called
 * before strtoul(), not instead of it, and the caller ALSO checks errno
 * after strtoul() for the separate overflow case a syntax check cannot
 * catch (see parse_header_line()'s Content-Length branch) - this
 * function alone only decides whether the header value is worth
 * attempting to parse at all. */
static int is_plain_nonneg_decimal(const char *s)
{
    if (*s == '\0') {
        return 0;
    }
    while (*s != '\0') {
        if (*s < '0' || *s > '9') {
            return 0;
        }
        s++;
    }
    return 1;
}

/* Parses one already-line-buffered header ("Name: value", no CRLF) into
 * `resp`. Modifies `line` in place (splits it at the colon) - safe, since
 * the caller owns a private stack buffer for it. Returns 1 if this header
 * is "Transfer-Encoding: chunked" (the caller must reject the response),
 * 0 otherwise (including for a malformed line with no colon, which is
 * simply ignored rather than failing the whole response). */
static int parse_header_line(char *line, http_response *resp)
{
    char *colon;
    char *name;
    char *value;
    char *e;

    colon = strchr(line, ':');
    if (colon == (char *) 0) {
        return 0;
    }
    *colon = '\0';
    name = line;
    value = colon + 1;
    while (*value == ' ' || *value == '\t') {
        value++;
    }
    e = colon - 1;
    while (e >= name && (*e == ' ' || *e == '\t')) {
        *e = '\0';
        e--;
    }

    if (ieq(name, "Content-Length")) {
        /* Only trust a plain non-negative decimal string that ALSO does
         * not overflow unsigned long - see is_plain_nonneg_decimal()'s
         * comment for the "-1" wraparound bug the syntax check guards
         * against, and the errno check just below for the separate
         * magnitude case a syntax check cannot catch (a 20-digit
         * all-digit string is syntactically fine but overflows
         * strtoul(), which per the C standard saturates to ULONG_MAX and
         * sets errno to ERANGE rather than failing outright - checked
         * here explicitly since strtoul()'s return value alone cannot be
         * told apart from a genuine, valid ULONG_MAX). Either failure is
         * treated exactly like an ABSENT Content-Length header
         * (have_content_length stays 0, from http_get()'s initial
         * memset(resp, 0, ...)) - the body then falls back to the
         * documented Connection: close EOF-terminated framing, rather
         * than trusting a garbaged or overflowed length. */
        if (is_plain_nonneg_decimal(value)) {
            unsigned long parsed;
            errno = 0;
            parsed = strtoul(value, (char **) 0, 10);
            if (errno != ERANGE) {
                resp->content_length = parsed;
                resp->have_content_length = 1;
            }
        }
    } else if (ieq(name, "Transfer-Encoding")) {
        /* Substring match, not exact equality: deliberately fine against
         * THIS API - docs/DOOR-REPO-API.md states this endpoint never
         * chunks, so any Transfer-Encoding value present at all is
         * unexpected and worth rejecting outright, and a real chunked
         * response is always exactly "chunked" or a comma list ending in
         * it (e.g. "gzip, chunked") per RFC 7230 6.1, which this still
         * catches. Caveat if this parser is ever reused against a less
         * disciplined server: a substring match would also reject a
         * hypothetical encoding token that merely CONTAINS "chunked" as
         * a substring without being the chunked encoding (none exist in
         * the IANA registry today, but a private/nonstandard token
         * could) - an exact per-comma-separated-token comparison would
         * be the more correct general-purpose parse. */
        if (icontains(value, "chunked")) {
            return 1;
        }
    } else if (ieq(name, "X-Archive-MD5")) {
        bounded_copy(resp->md5, sizeof(resp->md5), value);
    } else if (ieq(name, "X-Archive-SHA256")) {
        bounded_copy(resp->sha256, sizeof(resp->sha256), value);
    } else if (ieq(name, "X-Door-Repo-Revision")) {
        bounded_copy(resp->revision, sizeof(resp->revision), value);
    }
    return 0;
}

/* Formats ":<port>" (or an empty string for port 80, the default HTTP
 * port that never needs a Host: suffix) into `out` (at least 12 bytes).
 * Avoids sprintf(): C89 has no snprintf, and this is the only
 * numeric-to-string conversion http.c needs. */
static void format_port_suffix(char *out, int port)
{
    char tmp[12];
    int i = 0;
    unsigned int v;

    if (port == 80) {
        out[0] = '\0';
        return;
    }
    *out++ = ':';
    v = (unsigned int) port;
    if (v == 0) {
        out[0] = '0';
        out[1] = '\0';
        return;
    }
    while (v > 0) {
        tmp[i++] = (char) ('0' + (v % 10));
        v /= 10;
    }
    while (i > 0) {
        *out++ = tmp[--i];
    }
    *out = '\0';
}

/* Formats `v` in decimal (no leading zeros, "0" for v == 0) into `out`,
 * NUL-terminated, bounded to outsize bytes including the NUL. Returns the
 * number of digit characters written (excluding the NUL), or 0 if it
 * would not fit - at most 10 digits are ever needed for a 32-bit unsigned
 * long, so this only matters for a pathologically small buffer. Avoids
 * sprintf(): C89 has no snprintf. */
static unsigned long format_ulong(char *out, unsigned long outsize, unsigned long v)
{
    char tmp[24];
    unsigned long i = 0;
    unsigned long n;

    if (v == 0) {
        tmp[i++] = '0';
    } else {
        while (v > 0) {
            tmp[i++] = (char) ('0' + (v % 10));
            v /= 10;
        }
    }
    n = i;
    if (n + 1 > outsize) {
        return 0;
    }
    while (i > 0) {
        i--;
        *out++ = tmp[i];
    }
    *out = '\0';
    return n;
}

/* Writes exactly `len` bytes from `buf` to `fd`, looping over short
 * net_write()s the same way http_get() always has. Returns 0 on success,
 * -1 on the first write error (net_write() returning <= 0). */
static int write_all(int fd, const char *buf, unsigned long len)
{
    unsigned long written = 0;
    while (written < len) {
        long n = net_write(fd, buf + written, len - written);
        if (n <= 0) {
            return -1;
        }
        written += (unsigned long) n;
    }
    return 0;
}

/* Builds "<method> <path_and_query> HTTP/1.1\r\nHost: <host>[:<port>]\r\n
 * Connection: close\r\nUser-Agent: ...\r\n[Content-Length: <body_len>\r\n]
 * [<extra_headers[i]>...]\r\n" into `out` - the full header block up to
 * and including the blank line that ends it, but NOT the body (written
 * separately by the caller, straight from its own buffer). Never uses an
 * unbounded string function on caller-supplied text: the total length is
 * computed first and checked against outsize before any byte is copied,
 * so an oversized host/path/headers is a clean -1 (HTTP_ERR_REQUEST_TOO_LONG
 * to the caller) rather than a buffer overrun. Returns the header block
 * length, or -1 if it would not fit.
 *
 * Every entry in extra_headers[0..extra_header_count) must already be
 * non-NULL by the time this function is called - http_request() validates
 * that (returning the distinct HTTP_ERR_ARGS, not this function's single
 * -1 "too long" sentinel) before ever calling build_request(), so this
 * function does not re-check it. */
static int build_request(char *out, unsigned long outsize, const char *method,
                          const char *host, int port, const char *path_and_query,
                          int have_body, unsigned long body_len,
                          const char * const *extra_headers, int extra_header_count)
{
    static const char p2[] = " HTTP/1.1\r\nHost: ";
    static const char p3[] = "\r\nConnection: close\r\nUser-Agent: DoorRepo-C-Client/1.0\r\n";
    static const char cl_prefix[] = "Content-Length: ";
    char portbuf[16];
    char cl_value[24];
    unsigned long cl_value_len = 0;
    unsigned long need;
    unsigned long pos;
    unsigned long lm, l2, l3, lh, lp, lport;
    int i;

    format_port_suffix(portbuf, port);

    lm = (unsigned long) strlen(method);
    l2 = (unsigned long) (sizeof(p2) - 1);
    l3 = (unsigned long) (sizeof(p3) - 1);
    lh = (unsigned long) strlen(host);
    lp = (unsigned long) strlen(path_and_query);
    lport = (unsigned long) strlen(portbuf);

    need = lm + 1 /* space between method and path */ + lp + l2 + lh + lport + l3;

    if (have_body) {
        cl_value_len = format_ulong(cl_value, sizeof(cl_value), body_len);
        need += (unsigned long) (sizeof(cl_prefix) - 1) + cl_value_len + 2 /* \r\n */;
    }
    for (i = 0; i < extra_header_count; i++) {
        need += (unsigned long) strlen(extra_headers[i]);
    }
    need += 2; /* the blank line that ends the header block */

    if (need + 1 > outsize) {
        return -1;
    }

    pos = 0;
    memcpy(out + pos, method, lm); pos += lm;
    out[pos++] = ' ';
    memcpy(out + pos, path_and_query, lp); pos += lp;
    memcpy(out + pos, p2, l2); pos += l2;
    memcpy(out + pos, host, lh); pos += lh;
    memcpy(out + pos, portbuf, lport); pos += lport;
    memcpy(out + pos, p3, l3); pos += l3;
    if (have_body) {
        memcpy(out + pos, cl_prefix, sizeof(cl_prefix) - 1); pos += sizeof(cl_prefix) - 1;
        memcpy(out + pos, cl_value, cl_value_len); pos += cl_value_len;
        out[pos++] = '\r'; out[pos++] = '\n';
    }
    for (i = 0; i < extra_header_count; i++) {
        unsigned long hl = (unsigned long) strlen(extra_headers[i]);
        memcpy(out + pos, extra_headers[i], hl); pos += hl;
    }
    out[pos++] = '\r'; out[pos++] = '\n';
    out[pos] = '\0';

    return (int) pos;
}

int http_get(const dr_config *cfg, const char *path_and_query,
             http_response *resp,
             int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
             void *ctx)
{
    return http_request(cfg, "GET", path_and_query, (const char *) 0, 0,
                         (const char * const *) 0, 0, resp, sink, ctx);
}

int http_request(const dr_config *cfg, const char *method,
                  const char *path_and_query,
                  const char *body, unsigned long body_len,
                  const char * const *extra_headers, int extra_header_count,
                  http_response *resp,
                  int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
                  void *ctx)
{
    int fd;
    char request[REQUEST_BUF_SIZE];
    int req_len;
    int have_body;
    http_conn conn;
    char line[LINE_BUF_SIZE];
    long linelen;
    int result;
    unsigned long total;
    unsigned long avail;
    static unsigned char bodybuf[BODY_CHUNK_SIZE];

    if (cfg == (const dr_config *) 0 || method == (const char *) 0 || path_and_query == (const char *) 0
        || resp == (http_response *) 0 || sink == 0) {
        return HTTP_ERR_ARGS;
    }
    if (extra_header_count < 0 || (extra_header_count > 0 && extra_headers == (const char * const *) 0)) {
        return HTTP_ERR_ARGS;
    }
    {
        int i;
        for (i = 0; i < extra_header_count; i++) {
            if (extra_headers[i] == (const char *) 0) {
                return HTTP_ERR_ARGS;
            }
        }
    }
    if (body_len > 0 && body == (const char *) 0) {
        return HTTP_ERR_ARGS;
    }
    memset(resp, 0, sizeof(*resp));

    have_body = (body != (const char *) 0);

    req_len = build_request(request, sizeof(request), method, cfg->host, cfg->port, path_and_query,
                             have_body, body_len, extra_headers, extra_header_count);
    if (req_len < 0) {
        return HTTP_ERR_REQUEST_TOO_LONG;
    }

    fd = net_open(cfg->host, cfg->port, cfg->timeout_secs);
    if (fd < 0) {
        return HTTP_ERR_CONNECT;
    }

    if (write_all(fd, request, (unsigned long) req_len) != 0) {
        net_close(fd);
        return HTTP_ERR_WRITE;
    }

    if (have_body && body_len > 0) {
        if (write_all(fd, body, body_len) != 0) {
            net_close(fd);
            return HTTP_ERR_WRITE;
        }
    }

    conn.fd = fd;
    conn.len = 0;
    conn.pos = 0;

    linelen = conn_read_line(&conn, line, sizeof(line));
    if (linelen < 0) {
        net_close(fd);
        return (linelen == -2) ? HTTP_ERR_STATUS_LINE : HTTP_ERR_READ;
    }
    if (parse_status_line(line, &resp->status) != 0) {
        net_close(fd);
        return HTTP_ERR_STATUS_LINE;
    }

    result = HTTP_OK;
    for (;;) {
        linelen = conn_read_line(&conn, line, sizeof(line));
        if (linelen < 0) {
            result = (linelen == -2) ? HTTP_ERR_HEADER_TOO_LONG : HTTP_ERR_READ;
            goto cleanup;
        }
        if (linelen == 0) {
            break; /* blank line: end of headers, body follows */
        }
        if (parse_header_line(line, resp) != 0) {
            result = HTTP_ERR_CHUNKED;
            goto cleanup;
        }
    }

    total = 0;

    /* Drain whatever body bytes were already read ahead into conn.buf
     * while scanning headers, before making any further net_read() call. */
    avail = conn.len - conn.pos;
    if (resp->have_content_length && avail > resp->content_length) {
        avail = resp->content_length;
    }
    if (avail > 0) {
        if (sink(ctx, conn.buf + conn.pos, avail) != 0) {
            result = HTTP_ERR_SINK_ABORT;
            goto cleanup;
        }
        total += avail;
        conn.pos += avail;
    }

    for (;;) {
        long n;
        if (resp->have_content_length && total >= resp->content_length) {
            break;
        }
        n = net_read(fd, bodybuf, sizeof(bodybuf));
        if (n < 0) {
            result = HTTP_ERR_READ;
            goto cleanup;
        }
        if (n == 0) {
            break; /* clean EOF: the Connection: close body-end signal */
        }
        if (resp->have_content_length && total + (unsigned long) n > resp->content_length) {
            n = (long) (resp->content_length - total);
        }
        if (sink(ctx, bodybuf, (unsigned long) n) != 0) {
            result = HTTP_ERR_SINK_ABORT;
            goto cleanup;
        }
        total += (unsigned long) n;
    }

    if (resp->have_content_length && total != resp->content_length) {
        result = HTTP_ERR_LENGTH_MISMATCH;
    }

cleanup:
    net_close(fd);
    return result;
}
