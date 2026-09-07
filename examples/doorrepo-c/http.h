/* http.h - DoorRepo's view of the SDK's HTTP client.
 *
 * The client itself lives in the SDK now: sdk/c/include/ae_http.h, lifted
 * from this directory on 2026-09-07 (backlog 4.11). What stays here is what
 * is DoorRepo's and not every door's: the config supplies the target, the
 * User-Agent names this client, and the three headers the repo API adds to
 * an archive response arrive as fields rather than through a callback.
 * Every caller in this door is unchanged; the bytes on the wire are too.
 *
 * The error codes ARE the SDK's, under the names this door has always used.
 */
#ifndef DOORREPO_HTTP_H
#define DOORREPO_HTTP_H

#include "config.h"
#include "ae_http.h"

#define HTTP_OK                     AE_HTTP_OK
#define HTTP_ERR_ARGS               AE_HTTP_ERR_ARGS
#define HTTP_ERR_CONNECT            AE_HTTP_ERR_CONNECT
#define HTTP_ERR_WRITE              AE_HTTP_ERR_WRITE
#define HTTP_ERR_READ               AE_HTTP_ERR_READ
#define HTTP_ERR_STATUS_LINE        AE_HTTP_ERR_STATUS_LINE
#define HTTP_ERR_HEADER_TOO_LONG    AE_HTTP_ERR_HEADER_TOO_LONG
#define HTTP_ERR_CHUNKED            AE_HTTP_ERR_CHUNKED
#define HTTP_ERR_LENGTH_MISMATCH    AE_HTTP_ERR_LENGTH_MISMATCH
#define HTTP_ERR_SINK_ABORT         AE_HTTP_ERR_SINK_ABORT
#define HTTP_ERR_REQUEST_TOO_LONG   AE_HTTP_ERR_REQUEST_TOO_LONG

/* What this client says it is, on every request. */
#define DOORREPO_USER_AGENT "DoorRepo-C-Client/1.0"

typedef struct {
    int status;                    /* HTTP status code, e.g. 200, 404 */
    unsigned long content_length;  /* only meaningful when have_content_length != 0 */
    int have_content_length;       /* 1 if a Content-Length header was present */
    char md5[33];                  /* X-Archive-MD5: 32 lowercase hex + NUL */
    char sha256[65];               /* X-Archive-SHA256: 64 lowercase hex + NUL */
    char revision[48];             /* X-Door-Repo-Revision */
} http_response;

/* GET path_and_query from cfg->host:cfg->port and stream the body to sink.
 * See ae_http_get() for the contract; the three X- headers land in resp. */
int http_get(const dr_config *cfg, const char *path_and_query,
             http_response *resp,
             int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
             void *ctx);

/* The general form; see ae_http_request(). */
int http_request(const dr_config *cfg, const char *method,
                  const char *path_and_query,
                  const char *body, unsigned long body_len,
                  const char * const *extra_headers, int extra_header_count,
                  http_response *resp,
                  int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
                  void *ctx);

#endif /* DOORREPO_HTTP_H */
