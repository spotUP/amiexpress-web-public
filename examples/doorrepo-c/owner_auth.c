/* owner_auth.c - see owner_auth.h. */

#include <stdio.h>
#include <string.h>
#include "owner_auth.h"
#include "flow.h"
#include "json_lite.h"

/* Worst-case json_build_login_body() output: every byte of both
 * cfg->admin_username (63 usable chars) and cfg->admin_password (127
 * usable chars) escaped as \u00XX (6 bytes each, json_lite.c's own
 * worst case for a control byte) plus the fixed
 * {"username":"","password":""} literal (~29 bytes). (63+127)*6+29 =
 * 1169; sized with headroom. */
#define OWNER_AUTH_LOGIN_BODY_MAX 1536

/* Bounds how many response bytes owner_auth_login()'s sink will ever
 * accumulate before refusing outright - the JSON-specific ceiling
 * http_request()'s own doc comment says belongs at the call site that
 * buffers the data (see README.md's Security section, vulnerability
 * class #4). A real login response ({"token":"...","user":{...}}) is a
 * few hundred bytes; this is generous without being unbounded. */
#define OWNER_AUTH_RESPONSE_CAP 4096

void owner_auth_reset(owner_auth_state *state)
{
    if (state == (owner_auth_state *) 0) {
        return;
    }
    memset(state->token, 0, sizeof(state->token));
    state->have_token = 0;
}

int owner_auth_classify_login(int http_rc, int status, const char *body,
                               char *token_out, unsigned long token_out_cap,
                               char *error_out, unsigned long error_out_cap)
{
    if (token_out != (char *) 0 && token_out_cap > 0) {
        token_out[0] = '\0';
    }
    if (error_out != (char *) 0 && error_out_cap > 0) {
        error_out[0] = '\0';
    }

    if (http_rc != HTTP_OK) {
        return OWNER_AUTH_ERR_TRANSPORT;
    }
    if (body == (const char *) 0) {
        return OWNER_AUTH_ERR_BAD_RESPONSE;
    }

    if (status == 200) {
        if (json_extract_string(body, "token", token_out, token_out_cap) == 0
            && token_out != (char *) 0 && token_out[0] != '\0') {
            return OWNER_AUTH_OK;
        }
        return OWNER_AUTH_ERR_BAD_RESPONSE;
    }

    /* Every failure branch below tries to recover the server's own
     * "error" text for the caller to report - never anything derived
     * from the password, which this server never echoes back anyway
     * (see admin-routes.ts: 401 is the SAME "invalid credentials" answer
     * for both "no such account" and "wrong password"). */
    (void) json_extract_string(body, "error", error_out, error_out_cap);

    if (status == 401) {
        return OWNER_AUTH_ERR_INVALID_CREDS;
    }
    if (status == 429) {
        return OWNER_AUTH_ERR_LOCKED_OUT;
    }
    if (status == 503) {
        return OWNER_AUTH_ERR_SERVER_DISABLED;
    }
    return OWNER_AUTH_ERR_BAD_RESPONSE;
}

int owner_auth_should_retry(int attempt, int status)
{
    return (attempt == 1 && status == 401) ? 1 : 0;
}

/* Accumulates a login response body into a fixed buffer, refusing
 * (sink-abort) rather than silently truncating once OWNER_AUTH_RESPONSE_CAP
 * is reached - see the constant's own comment. Always kept NUL-terminated
 * as bytes arrive, so it can be handed straight to
 * owner_auth_classify_login() as a C string. */
typedef struct {
    char data[OWNER_AUTH_RESPONSE_CAP];
    unsigned long len;
    int truncated;
} login_capture_ctx;

static void login_capture_init(login_capture_ctx *c)
{
    c->data[0] = '\0';
    c->len = 0;
    c->truncated = 0;
}

static int login_capture_sink(void *vctx, const unsigned char *buf, unsigned long len)
{
    login_capture_ctx *c = (login_capture_ctx *) vctx;
    if (c->len + len >= sizeof(c->data)) {
        c->truncated = 1;
        return 1; /* abort: http_request() returns HTTP_ERR_SINK_ABORT */
    }
    memcpy(c->data + c->len, buf, len);
    c->len += len;
    c->data[c->len] = '\0';
    return 0;
}

int owner_auth_login(const dr_config *cfg, owner_auth_state *state,
                      char *error_out, unsigned long error_out_cap)
{
    char path[160];
    char body[OWNER_AUTH_LOGIN_BODY_MAX];
    int body_len;
    const char *extra_headers[1];
    http_response resp;
    login_capture_ctx capture;
    int http_rc;
    int outcome;
    char token[OWNER_AUTH_TOKEN_MAX];

    if (error_out != (char *) 0 && error_out_cap > 0) {
        error_out[0] = '\0';
    }

    if (cfg == (const dr_config *) 0 || state == (owner_auth_state *) 0) {
        return OWNER_AUTH_ERR_ARGS;
    }
    /* "Absent config = feature off" - see config.h's field comment. */
    if (cfg->admin_username[0] == '\0' || cfg->admin_password[0] == '\0') {
        return OWNER_AUTH_ERR_ARGS;
    }

    if (flow_build_admin_login_path(path, sizeof(path), cfg->path) < 0) {
        return OWNER_AUTH_ERR_ARGS;
    }

    body_len = json_build_login_body(body, sizeof(body), cfg->admin_username, cfg->admin_password);
    if (body_len < 0) {
        memset(body, 0, sizeof(body));
        return OWNER_AUTH_ERR_ARGS;
    }

    extra_headers[0] = "Content-Type: application/json\r\n";

    login_capture_init(&capture);
    http_rc = http_request(cfg, "POST", path, body, (unsigned long) body_len,
                            extra_headers, 1, &resp, login_capture_sink, &capture);

    /* The plaintext password only ever lived in `body` (and briefly on the
     * wire) - wipe it from the stack the instant the HTTP exchange is
     * over, rather than leaving it to linger for the rest of this
     * function or in a stale stack frame afterwards. */
    memset(body, 0, sizeof(body));

    if (capture.truncated) {
        /* Oversized response refused outright, never partially trusted -
         * see login_capture_sink(). Not classified as OWNER_AUTH_ERR_TRANSPORT
         * even though http_rc is HTTP_ERR_SINK_ABORT here: that code means
         * something more specific (this response was too large to be a
         * real login response), worth distinguishing from a network-level
         * failure. */
        memset(capture.data, 0, sizeof(capture.data));
        return OWNER_AUTH_ERR_BAD_RESPONSE;
    }

    outcome = owner_auth_classify_login(http_rc, resp.status, capture.data,
                                         token, sizeof(token), error_out, error_out_cap);

    /* capture.data held the raw response body, including the JWT on
     * success - wipe it from the stack now that classify_login() has
     * pulled out of it everything it needs, the same discipline `body`
     * and `token` already get above/below. */
    memset(capture.data, 0, sizeof(capture.data));

    if (outcome == OWNER_AUTH_OK) {
        strncpy(state->token, token, sizeof(state->token) - 1);
        state->token[sizeof(state->token) - 1] = '\0';
        state->have_token = 1;
    } else {
        owner_auth_reset(state);
    }

    memset(token, 0, sizeof(token));
    return outcome;
}

int owner_auth_call(const dr_config *cfg, owner_auth_state *state,
                     const char *method, const char *path_and_query,
                     const char *body, unsigned long body_len,
                     const char * const *extra_headers, int extra_header_count,
                     http_response *resp,
                     int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
                     void *ctx,
                     void (*reset_ctx)(void *ctx))
{
    char auth_header[OWNER_AUTH_TOKEN_MAX + 32];
    const char *combined[OWNER_AUTH_MAX_CALLER_HEADERS + 1];
    int combined_count;
    int attempt;
    int http_rc;
    int i;

    if (cfg == (const dr_config *) 0 || state == (owner_auth_state *) 0
        || method == (const char *) 0 || path_and_query == (const char *) 0
        || resp == (http_response *) 0 || sink == 0) {
        return OWNER_AUTH_ERR_ARGS;
    }
    if (extra_header_count < 0 || extra_header_count > OWNER_AUTH_MAX_CALLER_HEADERS) {
        return OWNER_AUTH_ERR_ARGS;
    }
    if (extra_header_count > 0 && extra_headers == (const char * const *) 0) {
        return OWNER_AUTH_ERR_ARGS;
    }

    if (!state->have_token) {
        int login_rc = owner_auth_login(cfg, state, (char *) 0, 0);
        if (login_rc != OWNER_AUTH_OK) {
            return login_rc;
        }
    }

    for (attempt = 1; attempt <= 2; attempt++) {
        /* Defensive, not merely trusting owner_auth_reset()/owner_auth_login()
         * to have left state->token NUL-terminated within OWNER_AUTH_TOKEN_MAX
         * bytes - a caller that sets state->token/have_token by hand (as
         * this module's own test suite does) could otherwise hand sprintf()
         * an unterminated buffer. state is non-const, so forcing this is
         * safe and cheap. */
        state->token[sizeof(state->token) - 1] = '\0';
        sprintf(auth_header, "Authorization: Bearer %s\r\n", state->token);

        combined_count = 0;
        combined[combined_count++] = auth_header;
        for (i = 0; i < extra_header_count; i++) {
            combined[combined_count++] = extra_headers[i];
        }

        http_rc = http_request(cfg, method, path_and_query, body, body_len,
                                combined, combined_count, resp, sink, ctx);

        memset(auth_header, 0, sizeof(auth_header));

        if (http_rc != HTTP_OK) {
            return OWNER_AUTH_ERR_TRANSPORT;
        }

        if (!owner_auth_should_retry(attempt, resp->status)) {
            break;
        }

        /* 401 on the first attempt: the token looked expired or was
         * revoked server-side. Re-login once and retry the SAME call
         * exactly once - see owner_auth_should_retry()'s doc comment. */
        {
            int login_rc = owner_auth_login(cfg, state, (char *) 0, 0);
            if (login_rc != OWNER_AUTH_OK) {
                return login_rc;
            }
        }

        /* The failed attempt's body was already streamed into `ctx` above -
         * give an accumulating caller a chance to clear it before the
         * retried attempt streams its own body into the SAME ctx, or the
         * two responses end up concatenated (see owner_auth_call()'s doc
         * comment in owner_auth.h). */
        if (reset_ctx != (void (*)(void *)) 0) {
            reset_ctx(ctx);
        }
    }

    if (resp->status == 401) {
        return OWNER_AUTH_ERR_INVALID_CREDS;
    }
    if (resp->status == 429) {
        return OWNER_AUTH_ERR_LOCKED_OUT;
    }
    if (resp->status == 503) {
        return OWNER_AUTH_ERR_SERVER_DISABLED;
    }
    return OWNER_AUTH_OK;
}
