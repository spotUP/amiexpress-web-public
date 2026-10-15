/* test_owner_auth.c - tests for owner_auth.c/h: owner-mode admin login and
 * token lifecycle. Pure decision logic (owner_auth_classify_login(),
 * owner_auth_should_retry()) is tested directly, no I/O. The thin I/O
 * wrappers (owner_auth_login(), owner_auth_call()) are driven against a
 * local stub server (tests/stub_server.c) on an ephemeral loopback port,
 * the same precedent tests/test_http.c already established - including a
 * new stub_server_start_sequence() (added alongside this file) for the
 * multi-round-trip 401-then-relogin-then-retry flow, which needs more than
 * one scripted response on the SAME port within a single logical call.
 *
 * The "never log the password" discipline is enforced by owner_auth.c not
 * having any log_line()/ae_put() call at all (grepped, confirmed in the
 * task report) - nothing to regression-test at the unit level for an
 * absence, but every wire-capture test below also incidentally proves the
 * password is sent in exactly the body position expected and nowhere else.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "../config.h"
#include "../http.h"
#include "../owner_auth.h"
#include "stub_server.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-60s ", #name); fflush(stdout); test_##name(); } while (0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((got) == (expected)) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got %ld, expected %ld)\n", msg, (long) (got), (long) (expected)); \
    } \
    tests_run++; \
} while (0)

#define ASSERT_STR_EQ(got, expected, msg) do { \
    if (strcmp((got), (expected)) == 0) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s (got '%s', expected '%s')\n", msg, got, expected); \
    } \
    tests_run++; \
} while (0)

#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { \
        tests_passed++; \
        printf("[OK]\n"); \
    } else { \
        tests_failed++; \
        printf("[FAIL] %s\n", msg); \
    } \
    tests_run++; \
} while (0)

static void cfg_for_port(dr_config *cfg, int port)
{
    config_defaults(cfg);
    strncpy(cfg->host, "127.0.0.1", sizeof(cfg->host) - 1);
    cfg->host[sizeof(cfg->host) - 1] = '\0';
    cfg->port = port;
    cfg->timeout_secs = 3;
    strncpy(cfg->admin_username, "spot", sizeof(cfg->admin_username) - 1);
    cfg->admin_username[sizeof(cfg->admin_username) - 1] = '\0';
    strncpy(cfg->admin_password, "hunter2", sizeof(cfg->admin_password) - 1);
    cfg->admin_password[sizeof(cfg->admin_password) - 1] = '\0';
}

/* Discards every byte handed to it - used for owner_auth_call() tests that
 * only care about resp->status / the return code, not the body. */
static int discard_sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    (void) ctx; (void) buf; (void) len;
    return 0;
}

/* A REAL accumulating sink - the shape a genuine admin-API caller uses
 * (e.g. buffering a response to hand to json_extract_string()), unlike
 * discard_sink() above. Every owner_auth_call() orchestration test before
 * this one used discard_sink(), which is exactly why the "retry leaks the
 * first response's bytes into ctx" defect (fixed alongside this test)
 * shipped uncaught - discard_sink() can never observe a leak. */
#define ACCUM_SINK_CAP 512
typedef struct {
    char data[ACCUM_SINK_CAP];
    unsigned long len;
} accum_sink_ctx;

static void accum_sink_init(accum_sink_ctx *c)
{
    c->data[0] = '\0';
    c->len = 0;
}

static int accum_sink(void *vctx, const unsigned char *buf, unsigned long len)
{
    accum_sink_ctx *c = (accum_sink_ctx *) vctx;
    unsigned long room = (c->len < sizeof(c->data) - 1) ? (sizeof(c->data) - 1 - c->len) : 0;
    unsigned long copy = (len < room) ? len : room;
    if (copy > 0) {
        memcpy(c->data + c->len, buf, copy);
        c->len += copy;
        c->data[c->len] = '\0';
    }
    return 0;
}

/* owner_auth_call()'s reset_ctx callback for accum_sink_ctx - matches the
 * void (*)(void *) signature owner_auth_call() invokes between the failed
 * first attempt and the retried attempt. */
static void accum_sink_reset(void *vctx)
{
    accum_sink_init((accum_sink_ctx *) vctx);
}

/* Formats "HTTP/1.1 <status> X\r\nContent-Length: <len>\r\nConnection: close\r\n\r\n<body>"
 * into `out` with an exact, computed Content-Length - shared by every I/O
 * test below so a hand-counted length never silently breaks a test via
 * HTTP_ERR_LENGTH_MISMATCH. Returns the bytes written. */
static int format_json_response(char *out, int status, const char *body)
{
    return sprintf(out, "HTTP/1.1 %d X\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",
                   status, (int) strlen(body), body);
}

/* ---------------------------------------------------------------------
 * owner_auth_classify_login - pure, no I/O
 * ------------------------------------------------------------------- */

TEST(classify_transport_failure_is_reported_and_body_not_trusted)
{
    char token[64];
    char error[64];
    int rc = owner_auth_classify_login(HTTP_ERR_CONNECT, 0, (const char *) 0,
                                        token, sizeof(token), error, sizeof(error));
    ASSERT_EQ(rc, OWNER_AUTH_ERR_TRANSPORT, "return code");
    ASSERT_STR_EQ(token, "", "token left empty");
}

TEST(classify_200_with_token_succeeds)
{
    char token[64];
    char error[64];
    int rc = owner_auth_classify_login(HTTP_OK, 200,
        "{\"token\":\"abc.def.ghi\",\"user\":{\"id\":1,\"username\":\"spot\",\"role\":\"owner\"}}",
        token, sizeof(token), error, sizeof(error));
    ASSERT_EQ(rc, OWNER_AUTH_OK, "return code");
    ASSERT_STR_EQ(token, "abc.def.ghi", "extracted token");
}

TEST(classify_200_without_token_field_is_bad_response)
{
    char token[64];
    int rc = owner_auth_classify_login(HTTP_OK, 200, "{\"nope\":true}",
                                        token, sizeof(token), (char *) 0, 0);
    ASSERT_EQ(rc, OWNER_AUTH_ERR_BAD_RESPONSE, "return code");
    ASSERT_STR_EQ(token, "", "token left empty");
}

TEST(classify_200_with_empty_token_is_bad_response)
{
    char token[64];
    int rc = owner_auth_classify_login(HTTP_OK, 200, "{\"token\":\"\"}",
                                        token, sizeof(token), (char *) 0, 0);
    ASSERT_EQ(rc, OWNER_AUTH_ERR_BAD_RESPONSE, "return code (empty token is not usable)");
}

TEST(classify_null_body_with_ok_status_is_bad_response)
{
    char token[64];
    int rc = owner_auth_classify_login(HTTP_OK, 200, (const char *) 0,
                                        token, sizeof(token), (char *) 0, 0);
    ASSERT_EQ(rc, OWNER_AUTH_ERR_BAD_RESPONSE, "return code");
}

TEST(classify_401_reports_invalid_creds_and_extracts_error)
{
    char token[64];
    char error[64];
    int rc = owner_auth_classify_login(HTTP_OK, 401, "{\"error\":\"invalid credentials\"}",
                                        token, sizeof(token), error, sizeof(error));
    ASSERT_EQ(rc, OWNER_AUTH_ERR_INVALID_CREDS, "return code");
    ASSERT_STR_EQ(token, "", "token left empty");
    ASSERT_STR_EQ(error, "invalid credentials", "extracted error text");
}

TEST(classify_429_reports_locked_out)
{
    char token[64];
    char error[128];
    int rc = owner_auth_classify_login(HTTP_OK, 429,
        "{\"error\":\"too many failed attempts; try again in a few minutes\"}",
        token, sizeof(token), error, sizeof(error));
    ASSERT_EQ(rc, OWNER_AUTH_ERR_LOCKED_OUT, "return code");
    ASSERT_STR_EQ(error, "too many failed attempts; try again in a few minutes", "extracted error text");
}

TEST(classify_503_reports_server_disabled)
{
    char token[64];
    char error[128];
    int rc = owner_auth_classify_login(HTTP_OK, 503,
        "{\"error\":\"admin API disabled: DOORSERVER_JWT_SECRET is not set\"}",
        token, sizeof(token), error, sizeof(error));
    ASSERT_EQ(rc, OWNER_AUTH_ERR_SERVER_DISABLED, "return code");
    ASSERT_STR_EQ(error, "admin API disabled: DOORSERVER_JWT_SECRET is not set", "extracted error text");
}

TEST(classify_unexpected_status_is_bad_response)
{
    char token[64];
    int rc = owner_auth_classify_login(HTTP_OK, 500, "{\"error\":\"boom\"}",
                                        token, sizeof(token), (char *) 0, 0);
    ASSERT_EQ(rc, OWNER_AUTH_ERR_BAD_RESPONSE, "return code");
}

TEST(classify_clears_caller_supplied_error_buffer_on_success)
{
    char token[64];
    char error[64];
    int rc;
    strcpy(error, "stale garbage from a previous call");
    rc = owner_auth_classify_login(HTTP_OK, 200, "{\"token\":\"tok123\"}",
                                    token, sizeof(token), error, sizeof(error));
    ASSERT_EQ(rc, OWNER_AUTH_OK, "return code");
    ASSERT_STR_EQ(error, "", "error buffer cleared even on success");
}

TEST(classify_null_token_out_on_200_is_bad_response)
{
    /* Cannot report success without anywhere to put the token. */
    int rc = owner_auth_classify_login(HTTP_OK, 200, "{\"token\":\"tok123\"}",
                                        (char *) 0, 0, (char *) 0, 0);
    ASSERT_EQ(rc, OWNER_AUTH_ERR_BAD_RESPONSE, "return code");
}

/* ---------------------------------------------------------------------
 * owner_auth_should_retry - pure, no I/O
 * ------------------------------------------------------------------- */

TEST(should_retry_fires_on_first_attempt_401)
{
    ASSERT_EQ(owner_auth_should_retry(1, 401), 1, "first-attempt 401 should retry");
}

TEST(should_retry_does_not_fire_on_second_attempt_401)
{
    ASSERT_EQ(owner_auth_should_retry(2, 401), 0, "second-attempt 401 must not retry again");
}

TEST(should_retry_does_not_fire_on_first_attempt_200)
{
    ASSERT_EQ(owner_auth_should_retry(1, 200), 0, "success should not retry");
}

TEST(should_retry_does_not_fire_on_first_attempt_429)
{
    ASSERT_EQ(owner_auth_should_retry(1, 429), 0, "429 must not retry (relogin would just fail again)");
}

TEST(should_retry_does_not_fire_on_first_attempt_503)
{
    ASSERT_EQ(owner_auth_should_retry(1, 503), 0, "503 must not retry (server has no admin API right now)");
}

TEST(should_retry_does_not_fire_on_attempt_zero)
{
    ASSERT_EQ(owner_auth_should_retry(0, 401), 0, "attempt 0 is not attempt 1");
}

/* ---------------------------------------------------------------------
 * owner_auth_reset
 * ------------------------------------------------------------------- */

TEST(reset_clears_token_and_have_token_flag)
{
    owner_auth_state state;
    strcpy(state.token, "some-stale-token");
    state.have_token = 1;
    owner_auth_reset(&state);
    ASSERT_EQ(state.have_token, 0, "have_token cleared");
    ASSERT_STR_EQ(state.token, "", "token buffer cleared");
}

TEST(reset_tolerates_null_state)
{
    owner_auth_reset((owner_auth_state *) 0);
    ASSERT_TRUE(1, "does not crash");
}

/* ---------------------------------------------------------------------
 * owner_auth_login - real HTTP round trip against a stub server
 * ------------------------------------------------------------------- */

TEST(login_success_stores_token_and_returns_ok)
{
    char resp_buf[256];
    int resp_len;
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;

    resp_len = format_json_response(resp_buf, 200,
        "{\"token\":\"jwt.abc.def\",\"user\":{\"id\":1,\"username\":\"spot\"}}");

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;
    rc = owner_auth_login(&cfg, &state, (char *) 0, 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_OK, "return code");
    ASSERT_EQ(state.have_token, 1, "have_token set");
    ASSERT_STR_EQ(state.token, "jwt.abc.def", "stored token");
}

TEST(login_sends_correct_method_path_and_body)
{
    char resp_buf[256];
    int resp_len;
    int port, pid, capture_fd, rc;
    dr_config cfg;
    owner_auth_state state;
    unsigned char captured[2048];
    unsigned long captured_len;
    char captured_str[2049];

    resp_len = format_json_response(resp_buf, 200, "{}");

    port = stub_server_start_capturing((const unsigned char *) resp_buf, (unsigned long) resp_len,
                                        &pid, &capture_fd);
    ASSERT_TRUE(port >= 0, "capturing stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;
    rc = owner_auth_login(&cfg, &state, (char *) 0, 0);
    /* rc will be OWNER_AUTH_ERR_BAD_RESPONSE ("{}" has no token) -
     * irrelevant to this test, which only checks the REQUEST. */
    (void) rc;

    captured_len = stub_server_read_capture(capture_fd, captured, sizeof(captured) - 1);
    stub_server_reap(pid);
    memcpy(captured_str, captured, captured_len);
    captured_str[captured_len] = '\0';

    ASSERT_TRUE(strncmp(captured_str, "POST /api/door-repo/admin/login HTTP/1.1\r\n",
                         strlen("POST /api/door-repo/admin/login HTTP/1.1\r\n")) == 0,
                "request line should target the admin login route");
    ASSERT_TRUE(strstr(captured_str, "Content-Type: application/json\r\n") != (char *) 0,
                "Content-Type header should be sent");
    ASSERT_TRUE(strstr(captured_str, "\r\n\r\n{\"username\":\"spot\",\"password\":\"hunter2\"}") != (char *) 0,
                "exact JSON body should follow the blank line");
}

TEST(login_401_returns_invalid_creds_and_does_not_store_token)
{
    char resp_buf[256];
    int resp_len;
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;
    char error[64];

    resp_len = format_json_response(resp_buf, 401, "{\"error\":\"invalid credentials\"}");

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;
    rc = owner_auth_login(&cfg, &state, error, sizeof(error));
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_ERR_INVALID_CREDS, "return code");
    ASSERT_EQ(state.have_token, 0, "have_token must stay unset");
    ASSERT_STR_EQ(error, "invalid credentials", "server error text surfaced");
}

TEST(login_429_returns_locked_out)
{
    char resp_buf[256];
    int resp_len;
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;

    resp_len = format_json_response(resp_buf, 429,
        "{\"error\":\"too many failed attempts; try again in a few minutes\"}");

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;
    rc = owner_auth_login(&cfg, &state, (char *) 0, 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_ERR_LOCKED_OUT, "return code");
}

TEST(login_503_returns_server_disabled)
{
    char resp_buf[256];
    int resp_len;
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;

    resp_len = format_json_response(resp_buf, 503,
        "{\"error\":\"admin API disabled: DOORSERVER_JWT_SECRET is not set\"}");

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;
    rc = owner_auth_login(&cfg, &state, (char *) 0, 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_ERR_SERVER_DISABLED, "return code");
}

TEST(login_missing_admin_credentials_returns_args_error_without_a_network_call)
{
    int closed_port;
    int rc;
    dr_config cfg;
    owner_auth_state state;

    closed_port = stub_closed_port();
    ASSERT_TRUE(closed_port >= 0, "should be able to reserve a closed port");

    cfg_for_port(&cfg, closed_port);
    cfg.admin_username[0] = '\0'; /* not configured - "absent config = feature off" */
    state.have_token = 0;

    rc = owner_auth_login(&cfg, &state, (char *) 0, 0);

    /* If this had actually attempted a connection, it would come back
     * OWNER_AUTH_ERR_TRANSPORT (nothing is listening on closed_port), not
     * OWNER_AUTH_ERR_ARGS - so ARGS here proves the missing-credentials
     * check short-circuits before any I/O. */
    ASSERT_EQ(rc, OWNER_AUTH_ERR_ARGS, "return code");
}

TEST(login_null_args_return_args_error)
{
    dr_config cfg;
    owner_auth_state state;
    config_defaults(&cfg);
    state.have_token = 0;

    ASSERT_EQ(owner_auth_login((const dr_config *) 0, &state, (char *) 0, 0), OWNER_AUTH_ERR_ARGS, "NULL cfg");
    ASSERT_EQ(owner_auth_login(&cfg, (owner_auth_state *) 0, (char *) 0, 0), OWNER_AUTH_ERR_ARGS, "NULL state");
}

/* ---------------------------------------------------------------------
 * owner_auth_call - the full lazy-login / 401-retry-once orchestration
 * ------------------------------------------------------------------- */

TEST(call_lazily_logs_in_before_the_first_admin_call)
{
    /* Two connections: the lazy login (200 + token), then the actual
     * admin call (200). Proves owner_auth_call() logs in BEFORE issuing
     * a call when state starts with no token. */
    char login_resp[256];
    char call_resp[256];
    int login_len, call_len;
    const unsigned char *responses[2];
    unsigned long lens[2];
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;
    http_response resp;

    login_len = format_json_response(login_resp, 200, "{\"token\":\"tok1\"}");
    call_len = format_json_response(call_resp, 200, "{}");

    responses[0] = (const unsigned char *) login_resp;
    lens[0] = (unsigned long) login_len;
    responses[1] = (const unsigned char *) call_resp;
    lens[1] = (unsigned long) call_len;

    port = stub_server_start_sequence(responses, lens, 2, &pid);
    ASSERT_TRUE(port >= 0, "sequence stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;

    rc = owner_auth_call(&cfg, &state, "GET", "/api/door-repo/admin/submissions",
                          (const char *) 0, 0, (const char * const *) 0, 0,
                          &resp, discard_sink, (void *) 0, (void (*)(void *)) 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_OK, "return code");
    ASSERT_EQ(resp.status, 200, "final call status");
    ASSERT_EQ(state.have_token, 1, "token now held");
    ASSERT_STR_EQ(state.token, "tok1", "stored token");
}

TEST(call_retries_once_after_401_and_succeeds)
{
    /* Three connections: original call -> 401, re-login -> 200, retried
     * call -> 200. Proves the exact "retry the call exactly once" flow. */
    char call_401_resp[256];
    char login_resp[256];
    char call_200_resp[256];
    int call_401_len, login_len, call_200_len;
    const unsigned char *responses[3];
    unsigned long lens[3];
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;
    http_response resp;

    call_401_len = format_json_response(call_401_resp, 401, "{\"error\":\"not authenticated\"}");
    login_len = format_json_response(login_resp, 200, "{\"token\":\"tok2\"}");
    call_200_len = format_json_response(call_200_resp, 200, "{}");

    responses[0] = (const unsigned char *) call_401_resp;
    lens[0] = (unsigned long) call_401_len;
    responses[1] = (const unsigned char *) login_resp;
    lens[1] = (unsigned long) login_len;
    responses[2] = (const unsigned char *) call_200_resp;
    lens[2] = (unsigned long) call_200_len;

    port = stub_server_start_sequence(responses, lens, 3, &pid);
    ASSERT_TRUE(port >= 0, "sequence stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 1;
    strcpy(state.token, "stale-expired-token");

    rc = owner_auth_call(&cfg, &state, "GET", "/api/door-repo/admin/submissions",
                          (const char *) 0, 0, (const char * const *) 0, 0,
                          &resp, discard_sink, (void *) 0, (void (*)(void *)) 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_OK, "return code after retry");
    ASSERT_EQ(resp.status, 200, "final call status");
    ASSERT_STR_EQ(state.token, "tok2", "token replaced by the re-login");
}

TEST(call_retries_with_accumulating_sink_does_not_leak_first_response_into_second)
{
    /* Same three-connection shape as call_retries_once_after_401_and_succeeds,
     * but with a REAL accumulating sink + reset_ctx instead of
     * discard_sink() - proves the failed attempt's "{\"error\":...}" body
     * does not survive into the ctx the retried attempt's success body
     * lands in (Important #1 fix). Without the reset_ctx call, `data`
     * would end up holding BOTH bodies concatenated. */
    char call_401_resp[256];
    char login_resp[256];
    char call_200_resp[256];
    int call_401_len, login_len, call_200_len;
    const unsigned char *responses[3];
    unsigned long lens[3];
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;
    http_response resp;
    accum_sink_ctx ctx;

    call_401_len = format_json_response(call_401_resp, 401, "{\"error\":\"not authenticated\"}");
    login_len = format_json_response(login_resp, 200, "{\"token\":\"tok4\"}");
    call_200_len = format_json_response(call_200_resp, 200, "{\"rows\":[]}");

    responses[0] = (const unsigned char *) call_401_resp;
    lens[0] = (unsigned long) call_401_len;
    responses[1] = (const unsigned char *) login_resp;
    lens[1] = (unsigned long) login_len;
    responses[2] = (const unsigned char *) call_200_resp;
    lens[2] = (unsigned long) call_200_len;

    port = stub_server_start_sequence(responses, lens, 3, &pid);
    ASSERT_TRUE(port >= 0, "sequence stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 1;
    strcpy(state.token, "stale-expired-token");
    accum_sink_init(&ctx);

    rc = owner_auth_call(&cfg, &state, "GET", "/api/door-repo/admin/submissions",
                          (const char *) 0, 0, (const char * const *) 0, 0,
                          &resp, accum_sink, &ctx, accum_sink_reset);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_OK, "return code after retry");
    ASSERT_EQ(resp.status, 200, "final call status");
    ASSERT_STR_EQ(ctx.data, "{\"rows\":[]}",
                  "ctx holds ONLY the retried response, not the 401 body concatenated onto it");
    ASSERT_TRUE(strstr(ctx.data, "not authenticated") == (char *) 0,
                "the failed first attempt's body must not survive into the retry's ctx");
}

TEST(call_reports_invalid_creds_after_a_second_401_and_does_not_retry_again)
{
    /* Three connections: original call -> 401, re-login -> 200 (new
     * token, but STILL wrong/insufficient somehow), retried call -> 401
     * again. Must stop here - a second 401 is a real failure. */
    char call_401_a[256];
    char login_resp[256];
    char call_401_b[256];
    int call_401_a_len, login_len, call_401_b_len;
    const unsigned char *responses[3];
    unsigned long lens[3];
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;
    http_response resp;

    call_401_a_len = format_json_response(call_401_a, 401, "{\"error\":\"not authenticated\"}");
    login_len = format_json_response(login_resp, 200, "{\"token\":\"tok3\"}");
    call_401_b_len = format_json_response(call_401_b, 401, "{\"error\":\"not authenticated\"}");

    responses[0] = (const unsigned char *) call_401_a;
    lens[0] = (unsigned long) call_401_a_len;
    responses[1] = (const unsigned char *) login_resp;
    lens[1] = (unsigned long) login_len;
    responses[2] = (const unsigned char *) call_401_b;
    lens[2] = (unsigned long) call_401_b_len;

    port = stub_server_start_sequence(responses, lens, 3, &pid);
    ASSERT_TRUE(port >= 0, "sequence stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 1;
    strcpy(state.token, "stale-expired-token");

    rc = owner_auth_call(&cfg, &state, "GET", "/api/door-repo/admin/submissions",
                          (const char *) 0, 0, (const char * const *) 0, 0,
                          &resp, discard_sink, (void *) 0, (void (*)(void *)) 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_ERR_INVALID_CREDS, "return code (second 401 is a real failure)");
    ASSERT_EQ(resp.status, 401, "final call status");
}

TEST(call_sends_authorization_header_built_from_the_held_token)
{
    char resp_buf[256];
    int resp_len;
    int port, pid, capture_fd, rc;
    dr_config cfg;
    owner_auth_state state;
    http_response resp;
    unsigned char captured[2048];
    unsigned long captured_len;
    char captured_str[2049];

    resp_len = format_json_response(resp_buf, 200, "{}");

    port = stub_server_start_capturing((const unsigned char *) resp_buf, (unsigned long) resp_len,
                                        &pid, &capture_fd);
    ASSERT_TRUE(port >= 0, "capturing stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 1;
    strcpy(state.token, "already-have-a-token");

    rc = owner_auth_call(&cfg, &state, "GET", "/api/door-repo/admin/submissions",
                          (const char *) 0, 0, (const char * const *) 0, 0,
                          &resp, discard_sink, (void *) 0, (void (*)(void *)) 0);

    captured_len = stub_server_read_capture(capture_fd, captured, sizeof(captured) - 1);
    stub_server_reap(pid);
    memcpy(captured_str, captured, captured_len);
    captured_str[captured_len] = '\0';

    ASSERT_EQ(rc, OWNER_AUTH_OK, "return code");
    ASSERT_TRUE(strstr(captured_str, "Authorization: Bearer already-have-a-token\r\n") != (char *) 0,
                "Authorization header built from the held token");
}

TEST(call_refuses_too_many_extra_headers)
{
    dr_config cfg;
    owner_auth_state state;
    http_response resp;
    const char *too_many[OWNER_AUTH_MAX_CALLER_HEADERS + 1];
    int i, rc, closed_port;

    for (i = 0; i < OWNER_AUTH_MAX_CALLER_HEADERS + 1; i++) {
        too_many[i] = "X-Test: 1\r\n";
    }

    closed_port = stub_closed_port();
    cfg_for_port(&cfg, closed_port);
    state.have_token = 1;
    strcpy(state.token, "tok");

    rc = owner_auth_call(&cfg, &state, "GET", "/x", (const char *) 0, 0,
                          too_many, OWNER_AUTH_MAX_CALLER_HEADERS + 1,
                          &resp, discard_sink, (void *) 0, (void (*)(void *)) 0);
    ASSERT_EQ(rc, OWNER_AUTH_ERR_ARGS, "return code");
}

/* ---------------------------------------------------------------------
 * Fail-closed guarantees, proven end to end (not just by inspection):
 * a token too long for OWNER_AUTH_TOKEN_MAX, and a response too long for
 * OWNER_AUTH_RESPONSE_CAP, must each come back a clean error, never a
 * truncated token or a partially-parsed body silently used.
 * ------------------------------------------------------------------- */

TEST(login_token_over_512_bytes_is_a_clean_bad_response_not_truncated)
{
    char long_token[600];
    char body[700];
    char resp_buf[900];
    int resp_len;
    int i;
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;

    /* One byte over OWNER_AUTH_TOKEN_MAX (512) - well under
     * OWNER_AUTH_RESPONSE_CAP (4096), so this isolates the token-buffer
     * guarantee from the overall-response-size guarantee tested below. */
    for (i = 0; i < 599; i++) {
        long_token[i] = 'A';
    }
    long_token[599] = '\0';
    sprintf(body, "{\"token\":\"%s\"}", long_token);

    resp_len = format_json_response(resp_buf, 200, body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;
    rc = owner_auth_login(&cfg, &state, (char *) 0, 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_ERR_BAD_RESPONSE, "return code (token too long to fit token_out)");
    ASSERT_EQ(state.have_token, 0, "have_token must stay unset, never partially updated");
    ASSERT_STR_EQ(state.token, "", "token buffer must stay empty, never a truncated fragment");
}

TEST(login_response_over_4096_bytes_is_refused_not_partially_parsed)
{
    char big_value[7900];
    char body[8100];
    char resp_buf[8300];
    int resp_len;
    int i;
    int port, pid, rc;
    dr_config cfg;
    owner_auth_state state;

    /* A well-formed 200 {"token": "<huge>"} response whose TOTAL body
     * exceeds OWNER_AUTH_RESPONSE_CAP (4096) - login_capture_sink() must
     * abort the transfer rather than accept it truncated. */
    for (i = 0; i < 7899; i++) {
        big_value[i] = 'A';
    }
    big_value[7899] = '\0';
    sprintf(body, "{\"token\":\"%s\"}", big_value);

    resp_len = format_json_response(resp_buf, 200, body);
    ASSERT_TRUE((unsigned long) resp_len > 4096, "sanity: response is actually over the cap");

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    state.have_token = 0;
    rc = owner_auth_login(&cfg, &state, (char *) 0, 0);
    stub_server_reap(pid);

    ASSERT_EQ(rc, OWNER_AUTH_ERR_BAD_RESPONSE, "return code (oversized response refused outright)");
    ASSERT_EQ(state.have_token, 0, "have_token must stay unset");
}

int main(void)
{
    RUN_TEST(classify_transport_failure_is_reported_and_body_not_trusted);
    RUN_TEST(classify_200_with_token_succeeds);
    RUN_TEST(classify_200_without_token_field_is_bad_response);
    RUN_TEST(classify_200_with_empty_token_is_bad_response);
    RUN_TEST(classify_null_body_with_ok_status_is_bad_response);
    RUN_TEST(classify_401_reports_invalid_creds_and_extracts_error);
    RUN_TEST(classify_429_reports_locked_out);
    RUN_TEST(classify_503_reports_server_disabled);
    RUN_TEST(classify_unexpected_status_is_bad_response);
    RUN_TEST(classify_clears_caller_supplied_error_buffer_on_success);
    RUN_TEST(classify_null_token_out_on_200_is_bad_response);

    RUN_TEST(should_retry_fires_on_first_attempt_401);
    RUN_TEST(should_retry_does_not_fire_on_second_attempt_401);
    RUN_TEST(should_retry_does_not_fire_on_first_attempt_200);
    RUN_TEST(should_retry_does_not_fire_on_first_attempt_429);
    RUN_TEST(should_retry_does_not_fire_on_first_attempt_503);
    RUN_TEST(should_retry_does_not_fire_on_attempt_zero);

    RUN_TEST(reset_clears_token_and_have_token_flag);
    RUN_TEST(reset_tolerates_null_state);

    RUN_TEST(login_success_stores_token_and_returns_ok);
    RUN_TEST(login_sends_correct_method_path_and_body);
    RUN_TEST(login_401_returns_invalid_creds_and_does_not_store_token);
    RUN_TEST(login_429_returns_locked_out);
    RUN_TEST(login_503_returns_server_disabled);
    RUN_TEST(login_missing_admin_credentials_returns_args_error_without_a_network_call);
    RUN_TEST(login_null_args_return_args_error);

    RUN_TEST(call_lazily_logs_in_before_the_first_admin_call);
    RUN_TEST(call_retries_once_after_401_and_succeeds);
    RUN_TEST(call_retries_with_accumulating_sink_does_not_leak_first_response_into_second);
    RUN_TEST(call_reports_invalid_creds_after_a_second_401_and_does_not_retry_again);
    RUN_TEST(call_sends_authorization_header_built_from_the_held_token);
    RUN_TEST(call_refuses_too_many_extra_headers);

    RUN_TEST(login_token_over_512_bytes_is_a_clean_bad_response_not_truncated);
    RUN_TEST(login_response_over_4096_bytes_is_refused_not_partially_parsed);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return tests_failed > 0 ? 1 : 0;
}
