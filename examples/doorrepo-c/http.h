/* http.h - streaming HTTP/1.1 GET client for the DoorRepo repo endpoints.
 *
 * Binding contract: docs/DOOR-REPO-API.md, sections 3 (list.txt) and 5
 * (archive download). Talks only through netio.h - see netio.h/.c for the
 * one file that touches real sockets.
 *
 * The response body is streamed through a caller-supplied `sink` callback
 * as it arrives, never buffered whole in RAM: a 68020 door client cannot
 * afford to hold a multi-megabyte archive in memory before writing it out.
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 */

#ifndef DOORREPO_HTTP_H
#define DOORREPO_HTTP_H

#include "config.h"

/* http_get() return codes. 0 (HTTP_OK) means the request/response cycle
 * completed and `resp` is fully populated; every negative value is a
 * distinct failure reason so a caller (and a test) can tell them apart
 * without string-matching an error message. */
#define HTTP_OK                     0
#define HTTP_ERR_ARGS               -1  /* NULL cfg/path/resp/sink */
#define HTTP_ERR_CONNECT            -2  /* net_open() failed; see net_last_error() */
#define HTTP_ERR_WRITE              -3  /* could not send the request */
#define HTTP_ERR_READ               -4  /* socket read failed or EOF mid-response */
#define HTTP_ERR_STATUS_LINE        -5  /* status line missing/malformed/too long */
#define HTTP_ERR_HEADER_TOO_LONG    -6  /* a header line exceeded the fixed line buffer */
#define HTTP_ERR_CHUNKED            -7  /* Transfer-Encoding: chunked (never sent, per the API doc; rejected rather than mis-parsed) */
#define HTTP_ERR_LENGTH_MISMATCH    -8  /* Content-Length promised more bytes than the server actually sent */
#define HTTP_ERR_SINK_ABORT         -9  /* sink() returned non-zero */
#define HTTP_ERR_REQUEST_TOO_LONG   -10 /* host/path did not fit the fixed request buffer */

/* Headers captured from the response. Every char[] field is always
 * NUL-terminated, even when the source header value is longer than the
 * field (truncated, never overrun) or the header was absent (left as an
 * empty string by memset in http_get()). */
typedef struct {
    int status;                    /* HTTP status code, e.g. 200, 404 */
    unsigned long content_length;  /* only meaningful when have_content_length != 0 */
    int have_content_length;       /* 1 if a Content-Length header was present */
    char md5[33];                  /* X-Archive-MD5: 32 lowercase hex + NUL */
    char sha256[65];               /* X-Archive-SHA256: 64 lowercase hex + NUL */
    char revision[48];             /* X-Door-Repo-Revision */
} http_response;

/* Issues "GET <path_and_query> HTTP/1.1" against cfg->host:cfg->port
 * (Host: header, Connection: close, a User-Agent naming this client), and
 * streams the response body through `sink` exactly as it arrives off the
 * socket - `sink` may be called any number of times with any chunk sizes,
 * including zero times for an empty body.
 *
 * `sink(ctx, buf, len)` must return 0 to keep receiving, or non-zero to
 * abort the transfer immediately; http_get() then returns
 * HTTP_ERR_SINK_ABORT without reading any further from the socket.
 *
 * Body framing: if a Content-Length header was present, exactly that many
 * bytes are delivered and verified - the server closing the connection
 * early (fewer bytes than promised) is reported as
 * HTTP_ERR_LENGTH_MISMATCH, not silent success. If Content-Length was
 * absent, the body is everything read up to EOF (the documented
 * Connection: close framing). A Transfer-Encoding: chunked response is
 * rejected as HTTP_ERR_CHUNKED as soon as the header is seen - the
 * DoorRepo API documents that this endpoint never chunks, so this client
 * does not attempt to parse chunk framing at all.
 *
 * Returns HTTP_OK (0) on a fully-received response (regardless of HTTP
 * status - a 404 with a well-formed body is HTTP_OK with resp->status ==
 * 404), or one of the HTTP_ERR_* codes above.
 *
 * Implemented as a thin wrapper around http_request() (see below) - this
 * signature, and every byte http_get() puts on the wire or hands to
 * `sink`, is unchanged from before http_request() existed. */
int http_get(const dr_config *cfg, const char *path_and_query,
             http_response *resp,
             int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
             void *ctx);

/* Generalizes http_get(): any method, an optional request body, and extra
 * headers beyond Host/Connection/User-Agent (Authorization, Content-Type,
 * ...). http_get() is exactly the thin wrapper:
 *   http_get(cfg, path, resp, sink, ctx) ==
 *     http_request(cfg, "GET", path, (const char *) 0, 0,
 *                  (const char * const *) 0, 0, resp, sink, ctx)
 * so every existing caller and every existing test of http_get() needed
 * no changes when this function was added.
 *
 * `method` is sent verbatim as the request line's method token (e.g.
 * "GET", "POST", "PATCH") - not validated against a fixed set, since this
 * module only assembles bytes, it does not know which methods the admin
 * API accepts.
 *
 * `body`/`body_len`: when `body` is non-NULL, a "Content-Length:
 * <body_len>" header is sent (even if body_len is 0) and exactly
 * `body_len` bytes from `body` are written after the header block, before
 * any response byte is read - the same buffered-write discipline
 * http_get() already used for the request line, just followed by a
 * second write for the body. When `body` is NULL, no Content-Length
 * header is added and nothing is written after the headers - this is
 * exactly http_get()'s original wire format.
 *
 * `extra_headers` is an array of `extra_header_count` already-formatted
 * "Name: value\r\n" strings (the caller assembles
 * "Authorization: Bearer <token>\r\n", "Content-Type: application/json\r\n",
 * etc.) inserted into the header block after the fixed
 * Host/Connection/User-Agent/Content-Length headers and before the blank
 * line that ends it. Pass (const char * const *) 0 and 0 for none. This
 * module deliberately has no generic header-map type - C89 has no good
 * container for one, and every other part of this module already prefers
 * the caller doing string assembly while http.c does only transport.
 *
 * Response handling - status line, header parsing, Content-Length/EOF
 * body framing, the chunked rejection, the byte-cap discipline in
 * conn_read_line()/the fixed body-chunk buffer - is entirely unchanged
 * and shared with http_get(): all of it runs exactly once per call,
 * regardless of which entry point was used.
 *
 * Response-size ceiling: http_request() does NOT itself cap how many
 * response bytes `sink` receives beyond what http_get() already enforced
 * (Content-Length framing when present; otherwise EOF-terminated, chunked
 * transfer bounded only by conn_read_line()'s per-line cap on header
 * lines). It stays transport-generic on purpose: a JSON-specific ceiling
 * (e.g. capping an admin login/submissions-list/PATCH-acknowledgment
 * response's *accumulation buffer* to a fixed size like 16 KB) belongs in
 * the `sink` callback a future admin-API caller writes, the same way this
 * door's other unbounded-response defences already live at the call site
 * that actually buffers the data (see README.md's "Security" section,
 * vulnerability class #4) rather than in this generic streaming client.
 *
 * Returns HTTP_OK (0) or one of the HTTP_ERR_* codes above, exactly like
 * http_get() - plus HTTP_ERR_ARGS if `method` is NULL, if
 * extra_header_count is negative, if extra_header_count > 0 but
 * extra_headers is NULL (or contains a NULL entry), or if body_len > 0
 * but body is NULL. */
int http_request(const dr_config *cfg, const char *method,
                  const char *path_and_query,
                  const char *body, unsigned long body_len,
                  const char * const *extra_headers, int extra_header_count,
                  http_response *resp,
                  int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
                  void *ctx);

#endif /* DOORREPO_HTTP_H */
