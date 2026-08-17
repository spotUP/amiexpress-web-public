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
 * 404), or one of the HTTP_ERR_* codes above. */
int http_get(const dr_config *cfg, const char *path_and_query,
             http_response *resp,
             int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
             void *ctx);

#endif /* DOORREPO_HTTP_H */
