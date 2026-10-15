/* http.c - DoorRepo's adapter over the SDK's ae_http. See http.h.
 *
 * Platform-neutral, like the client under it: no "#ifdef AMIGA" here.
 */

#include <string.h>
#include <ctype.h>
#include "http.h"

typedef struct {
    http_response *resp;
    int (*sink)(void *ctx, const unsigned char *buf, unsigned long len);
    void *ctx;
} dr_call;

/* Case-insensitive whole-string equality. */
static int ieq(const char *a, const char *b)
{
    while (*a != '\0' && *b != '\0') {
        if (tolower((unsigned char) *a) != tolower((unsigned char) *b)) {
            return 0;
        }
        a++;
        b++;
    }
    return *a == '\0' && *b == '\0';
}

static void bounded_copy(char *dest, unsigned long destsize, const char *src)
{
    unsigned long len = (unsigned long) strlen(src);
    if (len > destsize - 1) {
        len = destsize - 1;
    }
    memcpy(dest, src, (size_t) len);
    dest[len] = '\0';
}

/* The three headers the repo API adds. Anything else is not this door's. */
static int on_header(void *vcall, const char *name, const char *value)
{
    dr_call *call = (dr_call *) vcall;
    if (ieq(name, "X-Archive-MD5")) {
        bounded_copy(call->resp->md5, sizeof(call->resp->md5), value);
    } else if (ieq(name, "X-Archive-SHA256")) {
        bounded_copy(call->resp->sha256, sizeof(call->resp->sha256), value);
    } else if (ieq(name, "X-Door-Repo-Revision")) {
        bounded_copy(call->resp->revision, sizeof(call->resp->revision), value);
    }
    return 0;
}

static int on_body(void *vcall, const unsigned char *buf, unsigned long len)
{
    dr_call *call = (dr_call *) vcall;
    return call->sink(call->ctx, buf, len);
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
    ae_http_target target;
    ae_http_response sdk_resp;
    dr_call call;
    int rc;

    if (cfg == (const dr_config *) 0 || resp == (http_response *) 0 || sink == 0) {
        return HTTP_ERR_ARGS;
    }
    memset(resp, 0, sizeof(*resp));

    target.host = cfg->host;
    target.port = cfg->port;
    target.timeout_secs = cfg->timeout_secs;
    target.user_agent = DOORREPO_USER_AGENT;

    call.resp = resp;
    call.sink = sink;
    call.ctx = ctx;

    rc = ae_http_request(&target, method, path_and_query, body, body_len,
                         extra_headers, extra_header_count, &sdk_resp,
                         on_body, &call, on_header);

    resp->status = sdk_resp.status;
    resp->content_length = sdk_resp.content_length;
    resp->have_content_length = sdk_resp.have_content_length;
    return rc;
}
