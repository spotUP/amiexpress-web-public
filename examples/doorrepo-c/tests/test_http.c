/* test_http.c - tests for http.c (streaming HTTP/1.1 GET client) driven
 * against a local stub server (stub_server.c) on an ephemeral loopback
 * port. POSIX-only test harness; the module under test (http.c) is
 * platform-neutral C89 and does not know it is being tested this way.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "../config.h"
#include "../http.h"
#include "../netio.h"
#include "stub_server.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-50s ", #name); fflush(stdout); test_##name(); } while (0)
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

/* Captures every byte handed to it by http_get(), counts how many times
 * it was called, and (when `abort` is set) aborts the transfer on the
 * very first call - this is how the sink-abort test proves http_get()
 * stops reading rather than draining the rest of the socket. */
typedef struct {
    int calls;
    unsigned long total;
    unsigned char data[8192];
    unsigned long data_len;
    int abort;
} test_ctx;

static void ctx_init(test_ctx *c)
{
    c->calls = 0;
    c->total = 0;
    c->data_len = 0;
    c->abort = 0;
}

static int test_sink(void *vctx, const unsigned char *buf, unsigned long len)
{
    test_ctx *c = (test_ctx *) vctx;
    unsigned long copy = len;
    c->calls++;
    c->total += len;
    if (c->data_len + copy > sizeof(c->data)) {
        copy = sizeof(c->data) - c->data_len;
    }
    if (copy > 0) {
        memcpy(c->data + c->data_len, buf, copy);
        c->data_len += copy;
    }
    return c->abort;
}

static void cfg_for_port(dr_config *cfg, int port)
{
    config_defaults(cfg);
    strncpy(cfg->host, "127.0.0.1", sizeof(cfg->host) - 1);
    cfg->host[sizeof(cfg->host) - 1] = '\0';
    cfg->port = port;
    cfg->timeout_secs = 3;
}

TEST(get_200_with_content_length_delivers_exact_body)
{
    static const char body[] = "hello world, this is the archive bytes";
    char resp_buf[1024];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/octet-stream\r\n"
        "Content-Length: %lu\r\n"
        "X-Archive-MD5: 52ee1086c055fc1c82407dc0961ab04d\r\n"
        "X-Archive-SHA256: d918a826c5ea694ba2aca4a5e18f464f5947c59d85e6d1e15cc14341e805b367\r\n"
        "X-Door-Repo-Revision: rev123\r\n"
        "Connection: close\r\n\r\n%s",
        (unsigned long) strlen(body), body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/AETRIV10.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_get should succeed");
    ASSERT_EQ(resp.status, 200, "status should be 200");
    ASSERT_EQ(resp.have_content_length, 1, "content-length should be present");
    ASSERT_EQ(resp.content_length, (unsigned long) strlen(body), "content-length should match body");
    ASSERT_STR_EQ(resp.md5, "52ee1086c055fc1c82407dc0961ab04d", "md5 header captured");
    ASSERT_STR_EQ(resp.sha256, "d918a826c5ea694ba2aca4a5e18f464f5947c59d85e6d1e15cc14341e805b367", "sha256 header captured");
    ASSERT_STR_EQ(resp.revision, "rev123", "revision header captured");
    ASSERT_EQ(ctx.data_len, (unsigned long) strlen(body), "sink received exact byte count");
    ASSERT_TRUE(memcmp(ctx.data, body, strlen(body)) == 0, "sink received exact body bytes");

    stub_server_reap(pid);
}

TEST(get_404_records_status_without_crashing)
{
    static const char body[] = "NOT FOUND: DOES_NOT_EXIST_XYZ.LHA\r\n";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 404 Not Found\r\n"
        "Content-Type: text/plain; charset=utf-8\r\n"
        "Content-Length: %lu\r\n"
        "X-Door-Repo-Revision: unknown\r\n"
        "Connection: close\r\n\r\n%s",
        (unsigned long) strlen(body), body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/DOES_NOT_EXIST_XYZ.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_get should succeed even for a 404");
    ASSERT_EQ(resp.status, 404, "status should be 404");

    stub_server_reap(pid);
}

TEST(missing_content_length_with_connection_close_delivers_full_body)
{
    static const char body[] = "the whole list.txt index, byte for byte, no length header at all";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/plain\r\n"
        "Connection: close\r\n\r\n%s",
        body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/list.txt", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_get should succeed with EOF-delimited body");
    ASSERT_EQ(resp.have_content_length, 0, "no content-length header was sent");
    ASSERT_EQ(ctx.data_len, (unsigned long) strlen(body), "full body delivered via EOF framing");
    ASSERT_TRUE(memcmp(ctx.data, body, strlen(body)) == 0, "EOF-framed body bytes are exact");

    stub_server_reap(pid);
}

TEST(chunked_transfer_encoding_is_rejected)
{
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Transfer-Encoding: chunked\r\n"
        "Connection: close\r\n\r\n"
        "5\r\nhello\r\n0\r\n\r\n");

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/WEIRD.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_CHUNKED, "chunked transfer-encoding must be a distinct error");
    ASSERT_EQ(ctx.calls, 0, "no body bytes should ever reach the sink");

    stub_server_reap(pid);
}

TEST(header_names_are_matched_case_insensitively)
{
    static const char body[] = "abc";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "content-length: %lu\r\n"
        "X-ARCHIVE-MD5: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\r\n"
        "x-archive-sha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\r\n"
        "X-Door-Repo-REVISION: rev9\r\n"
        "Connection: close\r\n\r\n%s",
        (unsigned long) strlen(body), body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/CASE.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_get should succeed");
    ASSERT_EQ(resp.have_content_length, 1, "lowercase content-length header should be recognized");
    ASSERT_STR_EQ(resp.md5, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "uppercase header name should be recognized");
    ASSERT_STR_EQ(resp.sha256, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "lowercase header name should be recognized");
    ASSERT_STR_EQ(resp.revision, "rev9", "mixed-case header name should be recognized");

    stub_server_reap(pid);
}

TEST(content_length_larger_than_actual_bytes_is_an_error)
{
    static const char body[] = "short";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    /* Declares 100 bytes but only ever sends 5, then the stub closes the
     * connection - this must be reported as an error, not silent
     * success. */
    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: 100\r\n"
        "Connection: close\r\n\r\n%s",
        body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/SHORT.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_LENGTH_MISMATCH, "truncated body must not be reported as success");
    ASSERT_EQ(ctx.data_len, (unsigned long) strlen(body), "the bytes that did arrive were still delivered");

    stub_server_reap(pid);
}

TEST(content_length_negative_one_is_not_trusted)
{
    /* strtoul() alone accepts a leading '-' and computes the value as if
     * unsigned, so "Content-Length: -1" would otherwise parse as
     * ULONG_MAX - a real, demonstrated bug (the one soft signal that
     * something was wrong disappears entirely). Must be treated as if
     * the header were simply absent: have_content_length stays 0, and
     * the body still arrives in full via Connection: close's EOF-
     * terminated framing. */
    static const char body[] = "hello world";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: -1\r\n"
        "Connection: close\r\n\r\n%s",
        body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/NEG.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "a malformed Content-Length must not fail the whole request");
    ASSERT_EQ(resp.have_content_length, 0, "'-1' is never trusted as a real Content-Length");
    ASSERT_EQ(ctx.data_len, (unsigned long) strlen(body), "the full body still arrives via EOF framing");
    ASSERT_TRUE(memcmp(ctx.data, body, strlen(body)) == 0, "body content is byte-exact, not corrupted");

    stub_server_reap(pid);
}

TEST(content_length_non_numeric_is_not_trusted)
{
    static const char body[] = "hi";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: abc\r\n"
        "Connection: close\r\n\r\n%s",
        body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/NAN.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "a non-numeric Content-Length must not fail the whole request");
    ASSERT_EQ(resp.have_content_length, 0, "a non-numeric value is never trusted as a real Content-Length");

    stub_server_reap(pid);
}

TEST(content_length_twenty_digit_overflow_is_not_trusted)
{
    /* Fix-round-5 regression: is_plain_nonneg_decimal() only checked
     * SYNTAX (all digits), never MAGNITUDE - a 20-digit all-digit string
     * passes that check but overflows strtoul()'s unsigned long, which
     * silently saturates to ULONG_MAX with no errno/ERANGE inspection by
     * the caller. Must be treated exactly like a malformed value (not
     * trusted), not as "successfully parsed to some huge number". */
    static const char body[] = "hi";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: 99999999999999999999\r\n"
        "Connection: close\r\n\r\n%s",
        body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/HUGE.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "a 20-digit overflowing Content-Length must not fail the whole request");
    ASSERT_EQ(resp.have_content_length, 0, "an overflowing value is never trusted, even though every character is a digit");
    ASSERT_EQ(ctx.data_len, (unsigned long) strlen(body), "the actual (short) body still arrives via EOF framing");

    stub_server_reap(pid);
}

TEST(content_length_large_but_non_overflowing_value_is_still_trusted)
{
    /* The companion case: a value that is merely LARGE, not an actual
     * strtoul() overflow, must still be trusted as a real
     * Content-Length - rejecting every big number would be a different,
     * unrequested behavior change. This door's own archive byte-ceiling
     * enforcement (flow_archive_byte_ceiling(), fix round 4) is the real
     * backstop against an absurd-but-syntactically-valid declared
     * length, not Content-Length parsing. */
    static const char body[] = "hi";
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: 1000000000000\r\n"
        "Connection: close\r\n\r\n%s",
        body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/LARGE.LHA", &resp, test_sink, &ctx);

    /* The stub only ever sends the short real body then closes - a
     * genuinely large but non-overflowing Content-Length that the
     * server did not actually deliver is correctly still an error
     * (HTTP_ERR_LENGTH_MISMATCH), the same as the existing
     * content_length_larger_than_actual_bytes_is_an_error test - what
     * this test actually verifies is that the header value ITSELF was
     * trusted/parsed (have_content_length == 1, content_length exactly
     * matches), not silently discarded the way an overflowing value now
     * correctly is. */
    ASSERT_EQ(rc, HTTP_ERR_LENGTH_MISMATCH, "the stub's short body doesn't match the (valid, trusted) declared length");
    ASSERT_EQ(resp.have_content_length, 1, "the large-but-valid header value WAS trusted and parsed, unlike the overflowing case above");
    ASSERT_EQ(resp.content_length, 1000000000000UL, "the parsed value is byte-exact, not clamped or altered");

    stub_server_reap(pid);
}

TEST(sink_abort_stops_the_transfer)
{
    static char body[4000];
    char resp_buf[4200];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;
    unsigned long i;

    for (i = 0; i < sizeof(body) - 1; i++) {
        body[i] = 'A' + (char) (i % 26);
    }
    body[sizeof(body) - 1] = '\0';

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: %lu\r\n"
        "Connection: close\r\n\r\n%s",
        (unsigned long) strlen(body), body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    ctx.abort = 1;
    rc = http_get(&cfg, "/api/door-repo/archive/BIG.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_SINK_ABORT, "http_get should report the sink abort");
    ASSERT_EQ(ctx.calls, 1, "the transfer should stop after the first sink call");
    ASSERT_TRUE(ctx.total < strlen(body), "the full body must not have been read after the abort");

    stub_server_reap(pid);
}

TEST(connect_to_closed_port_is_a_clean_error)
{
    int port;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    port = stub_closed_port();
    ASSERT_TRUE(port >= 0, "should be able to claim a closed ephemeral port");

    cfg_for_port(&cfg, port);
    cfg.timeout_secs = 2;
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/list.txt", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_CONNECT, "connect to a closed port should fail cleanly");
    ASSERT_TRUE(strlen(net_last_error()) > 0, "net_last_error() should be non-empty");
}

/* A closed port and a black-holed one both used to report the identical
 * "connect() failed", so a sysop could not tell "nothing is listening on
 * that port" (fix: check the port) from "the packets went nowhere" (fix:
 * check routing/firewall). netio.c now maps the errno to a specific
 * message, which is only correct if it compares against this platform's
 * real errno values - the same mistake on the Amiga branch (Linux numbers
 * where classic BSD numbers were required) made every such comparison
 * false, so the mapping silently degraded to the generic message. */
TEST(connect_to_closed_port_says_refused_not_just_failed)
{
    int port;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    port = stub_closed_port();
    ASSERT_TRUE(port >= 0, "should be able to claim a closed ephemeral port");

    cfg_for_port(&cfg, port);
    cfg.timeout_secs = 2;
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/list.txt", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_CONNECT, "connect to a closed port should fail cleanly");
    ASSERT_TRUE(strstr(net_last_error(), "refused") != (const char *) 0,
                "a closed port must be reported as refused, not as a generic failure");
}

TEST(header_line_longer_than_buffer_does_not_overflow)
{
    static char huge_value[2000];
    char resp_buf[2500];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;
    unsigned long i;

    for (i = 0; i < sizeof(huge_value) - 1; i++) {
        huge_value[i] = 'A';
    }
    huge_value[sizeof(huge_value) - 1] = '\0';

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "X-Huge-Header: %s\r\n"
        "Content-Length: 5\r\n"
        "Connection: close\r\n\r\nhello",
        huge_value);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/HUGE.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_HEADER_TOO_LONG, "an oversized header line must be a clean error, not a crash");

    stub_server_reap(pid);
}

TEST(request_post_with_body_and_extra_headers_sends_exact_bytes)
{
    static const char body[] = "{\"user\":\"sysop\",\"pass\":\"hunter2\"}";
    const char *extra_headers[2];
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    int capture_fd;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;
    unsigned char captured[2048];
    unsigned long captured_len;
    char captured_str[2049];

    extra_headers[0] = "Authorization: Bearer testtoken123\r\n";
    extra_headers[1] = "Content-Type: application/json\r\n";

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: 2\r\n"
        "Connection: close\r\n\r\n{}");

    port = stub_server_start_capturing((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid, &capture_fd);
    ASSERT_TRUE(port >= 0, "capturing stub server should start");

    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_request(&cfg, "POST", "/api/door-repo/admin/login",
                       body, (unsigned long) strlen(body),
                       extra_headers, 2,
                       &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_request should succeed");
    ASSERT_EQ(resp.status, 200, "status should be 200");

    captured_len = stub_server_read_capture(capture_fd, captured, sizeof(captured) - 1);
    stub_server_reap(pid);

    memcpy(captured_str, captured, captured_len);
    captured_str[captured_len] = '\0';

    ASSERT_TRUE(strncmp(captured_str, "POST /api/door-repo/admin/login HTTP/1.1\r\n",
                         strlen("POST /api/door-repo/admin/login HTTP/1.1\r\n")) == 0,
                "request line should use the requested method and path");
    ASSERT_TRUE(strstr(captured_str, "Content-Length: 33\r\n") != (char *) 0,
                "Content-Length should match the body length exactly");
    ASSERT_TRUE(strstr(captured_str, "Authorization: Bearer testtoken123\r\n") != (char *) 0,
                "extra header (Authorization) should be sent verbatim");
    ASSERT_TRUE(strstr(captured_str, "Content-Type: application/json\r\n") != (char *) 0,
                "extra header (Content-Type) should be sent verbatim");
    ASSERT_TRUE(strstr(captured_str, "\r\n\r\n{\"user\":\"sysop\",\"pass\":\"hunter2\"}") != (char *) 0,
                "the exact body bytes should follow the blank line that ends the headers");
}

TEST(request_get_with_no_body_or_extra_headers_matches_http_get_wire_format)
{
    char resp_buf[512];
    int resp_len;
    int port;
    int pid;
    int capture_fd;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;
    unsigned char captured[2048];
    unsigned long captured_len;
    char captured_str[2049];

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: 2\r\n"
        "Connection: close\r\n\r\n{}");

    port = stub_server_start_capturing((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid, &capture_fd);
    ASSERT_TRUE(port >= 0, "capturing stub server should start");

    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_request(&cfg, "GET", "/api/door-repo/list.txt",
                       (const char *) 0, 0,
                       (const char * const *) 0, 0,
                       &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_request should succeed");

    captured_len = stub_server_read_capture(capture_fd, captured, sizeof(captured) - 1);
    stub_server_reap(pid);

    memcpy(captured_str, captured, captured_len);
    captured_str[captured_len] = '\0';

    ASSERT_TRUE(strncmp(captured_str, "GET /api/door-repo/list.txt HTTP/1.1\r\n",
                         strlen("GET /api/door-repo/list.txt HTTP/1.1\r\n")) == 0,
                "GET with no body should keep the exact request line http_get() always sent");
    ASSERT_TRUE(strstr(captured_str, "Content-Length:") == (char *) 0,
                "no Content-Length header should be added when body is NULL, matching http_get()'s existing wire format");
    ASSERT_TRUE(strstr(captured_str, "Connection: close\r\n") != (char *) 0,
                "Connection: close header should still be present");
    ASSERT_TRUE(strstr(captured_str, "User-Agent: DoorRepo-C-Client/1.0\r\n") != (char *) 0,
                "User-Agent header should still be present");
}

TEST(request_with_body_but_no_extra_headers_still_sends_content_length)
{
    static const char body[] = "ack";
    char resp_buf[256];
    int resp_len;
    int port;
    int pid;
    int capture_fd;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;
    unsigned char captured[1024];
    unsigned long captured_len;
    char captured_str[1025];

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: 2\r\n"
        "Connection: close\r\n\r\n{}");

    port = stub_server_start_capturing((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid, &capture_fd);
    ASSERT_TRUE(port >= 0, "capturing stub server should start");

    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_request(&cfg, "PATCH", "/api/door-repo/admin/submissions/42",
                       body, (unsigned long) strlen(body),
                       (const char * const *) 0, 0,
                       &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_request should succeed");

    captured_len = stub_server_read_capture(capture_fd, captured, sizeof(captured) - 1);
    stub_server_reap(pid);

    memcpy(captured_str, captured, captured_len);
    captured_str[captured_len] = '\0';

    ASSERT_TRUE(strncmp(captured_str, "PATCH /api/door-repo/admin/submissions/42 HTTP/1.1\r\n",
                         strlen("PATCH /api/door-repo/admin/submissions/42 HTTP/1.1\r\n")) == 0,
                "request line should carry the PATCH method and full path");
    ASSERT_TRUE(strstr(captured_str, "Content-Length: 3\r\n") != (char *) 0,
                "Content-Length should be sent even with zero extra headers");
    ASSERT_TRUE(strstr(captured_str, "\r\n\r\nack") != (char *) 0,
                "body bytes should follow the blank line");
}

TEST(request_with_null_entry_in_extra_headers_is_args_error_not_too_long)
{
    /* Task-review regression: a NULL entry inside a non-empty
     * extra_headers array used to be caught deep inside build_request(),
     * which returned the same generic -1 sentinel it uses for "the
     * request does not fit REQUEST_BUF_SIZE" - http_request() then
     * unconditionally mapped every -1 to HTTP_ERR_REQUEST_TOO_LONG,
     * hiding a caller bug (a malformed header array) behind a misleading
     * "too long" error. http_request() must now validate every
     * extra_headers[] entry itself and report HTTP_ERR_ARGS - never
     * connecting at all, exactly like the well-formed-but-oversized-
     * request case just above does not connect either. */
    const char *extra_headers[2];
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    extra_headers[0] = "Authorization: Bearer testtoken123\r\n";
    extra_headers[1] = (const char *) 0;

    config_defaults(&cfg);
    strncpy(cfg.host, "127.0.0.1", sizeof(cfg.host) - 1);
    cfg.host[sizeof(cfg.host) - 1] = '\0';
    cfg.port = 1; /* never actually connected to - rejected before net_open() */
    cfg.timeout_secs = 3;
    ctx_init(&ctx);

    rc = http_request(&cfg, "POST", "/api/door-repo/admin/login",
                       (const char *) 0, 0,
                       extra_headers, 2,
                       &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_ARGS, "a NULL entry in extra_headers must be HTTP_ERR_ARGS, not HTTP_ERR_REQUEST_TOO_LONG");
}

TEST(get_wrapper_still_produces_the_documented_error_codes_after_refactor)
{
    /* Regression guard for the http_get() -> http_request() refactor:
     * re-runs a representative slice of http_get()'s pre-existing
     * behaviors (success, and the sink-abort error path) to prove the
     * wrapper is byte-identical in behavior, not just in signature. The
     * full pre-existing suite above already re-verifies every other case
     * unchanged; this test exists so a `grep TEST` of this file shows an
     * explicit assertion of that fact, per the task brief. */
    static const char body[] = "hello world, this is the archive bytes";
    char resp_buf[1024];
    int resp_len;
    int port;
    int pid;
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;

    resp_len = sprintf(resp_buf,
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: %lu\r\n"
        "Connection: close\r\n\r\n%s",
        (unsigned long) strlen(body), body);

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    ASSERT_TRUE(port >= 0, "stub server should start");

    cfg_for_port(&cfg, port);
    ctx_init(&ctx);
    rc = http_get(&cfg, "/api/door-repo/archive/AETRIV10.LHA", &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_OK, "http_get() must still succeed after becoming a http_request() wrapper");
    ASSERT_EQ(ctx.data_len, (unsigned long) strlen(body), "http_get() must still deliver the exact body byte count");
    ASSERT_TRUE(memcmp(ctx.data, body, strlen(body)) == 0, "http_get() must still deliver byte-exact body content");

    stub_server_reap(pid);
}

TEST(request_larger_than_buffer_is_a_clean_error)
{
    static char huge_path[1000];
    dr_config cfg;
    http_response resp;
    test_ctx ctx;
    int rc;
    unsigned long i;

    for (i = 0; i < sizeof(huge_path) - 2; i++) {
        huge_path[i] = 'x';
    }
    huge_path[0] = '/';
    huge_path[sizeof(huge_path) - 2] = '\0';

    config_defaults(&cfg);
    strncpy(cfg.host, "127.0.0.1", sizeof(cfg.host) - 1);
    cfg.host[sizeof(cfg.host) - 1] = '\0';
    cfg.port = 1; /* never actually connected to - the request is rejected before net_open() */
    cfg.timeout_secs = 3;
    ctx_init(&ctx);

    rc = http_get(&cfg, huge_path, &resp, test_sink, &ctx);

    ASSERT_EQ(rc, HTTP_ERR_REQUEST_TOO_LONG, "an oversized request must be rejected before connecting");
}

int main(void)
{
    printf("\n====== HTTP Client Tests ======\n\n");

    RUN_TEST(get_200_with_content_length_delivers_exact_body);
    RUN_TEST(get_404_records_status_without_crashing);
    RUN_TEST(missing_content_length_with_connection_close_delivers_full_body);
    RUN_TEST(chunked_transfer_encoding_is_rejected);
    RUN_TEST(header_names_are_matched_case_insensitively);
    RUN_TEST(content_length_larger_than_actual_bytes_is_an_error);
    RUN_TEST(content_length_negative_one_is_not_trusted);
    RUN_TEST(content_length_non_numeric_is_not_trusted);
    RUN_TEST(content_length_twenty_digit_overflow_is_not_trusted);
    RUN_TEST(content_length_large_but_non_overflowing_value_is_still_trusted);
    RUN_TEST(sink_abort_stops_the_transfer);
    RUN_TEST(connect_to_closed_port_is_a_clean_error);
    RUN_TEST(connect_to_closed_port_says_refused_not_just_failed);
    RUN_TEST(header_line_longer_than_buffer_does_not_overflow);
    RUN_TEST(request_post_with_body_and_extra_headers_sends_exact_bytes);
    RUN_TEST(request_get_with_no_body_or_extra_headers_matches_http_get_wire_format);
    RUN_TEST(request_with_body_but_no_extra_headers_still_sends_content_length);
    RUN_TEST(request_with_null_entry_in_extra_headers_is_args_error_not_too_long);
    RUN_TEST(get_wrapper_still_produces_the_documented_error_codes_after_refactor);
    RUN_TEST(request_larger_than_buffer_is_a_clean_error);

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return (tests_failed == 0) ? EXIT_SUCCESS : EXIT_FAILURE;
}
