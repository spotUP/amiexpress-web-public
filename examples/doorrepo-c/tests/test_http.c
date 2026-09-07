/* test_http.c - the adapter between DoorRepo and the SDK's ae_http.
 *
 * The client's behaviour (framing, Content-Length, chunked rejection, the
 * error paths) is proven in sdk/c/tests/test_ae_http.c. What is proven
 * HERE is only what this door adds on top: its three X- headers arrive as
 * fields, matched case-insensitively; its User-Agent is the one on the
 * wire; its error names are the SDK's codes; the caller's sink and ctx
 * are the ones called. Driven against the SDK's stub server.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "../config.h"
#include "../http.h"
#include "ae_net.h"
#include "stub_server.h"

static int tests_run = 0;
static int tests_failed = 0;

#define CHECK(cond, msg) do { tests_run++; if (cond) { printf("[OK] %s\n", msg); } else { tests_failed++; printf("[FAIL] %s\n", msg); } } while (0)

typedef struct {
    unsigned char data[4096];
    unsigned long len;
    int calls;
    int abort;
} sink_ctx;

static int sink(void *vctx, const unsigned char *buf, unsigned long len)
{
    sink_ctx *c = (sink_ctx *) vctx;
    c->calls++;
    if (c->len + len <= sizeof(c->data)) {
        memcpy(c->data + c->len, buf, len);
        c->len += len;
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

static void the_repo_headers_arrive_as_fields(void)
{
    static const char body[] = "archive bytes";
    static const char fmt[] =
        "HTTP/1.1 200 OK\r\n"
        "content-length: %lu\r\n"
        "X-ARCHIVE-MD5: 52ee1086c055fc1c82407dc0961ab04d\r\n"
        "x-archive-sha256: d918a826c5ea694ba2aca4a5e18f464f5947c59d85e6d1e15cc14341e805b367\r\n"
        "X-Door-Repo-REVISION: rev123\r\n"
        "Connection: close\r\n\r\n%s";
    char resp_buf[1024];
    int resp_len;
    int port, pid, rc;
    dr_config cfg;
    http_response resp;
    sink_ctx ctx;

    resp_len = sprintf(resp_buf, fmt, (unsigned long) strlen(body), body);
    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) resp_len, &pid);
    CHECK(port >= 0, "stub server starts");
    cfg_for_port(&cfg, port);
    memset(&ctx, 0, sizeof(ctx));
    rc = http_get(&cfg, "/api/door-repo/archive/AETRIV10.LHA", &resp, sink, &ctx);

    CHECK(rc == HTTP_OK, "http_get succeeds through the adapter");
    CHECK(resp.status == 200 && resp.have_content_length == 1 && resp.content_length == strlen(body), "status and length come back");
    CHECK(strcmp(resp.md5, "52ee1086c055fc1c82407dc0961ab04d") == 0, "X-Archive-MD5 lands in resp.md5, any case");
    CHECK(strcmp(resp.sha256, "d918a826c5ea694ba2aca4a5e18f464f5947c59d85e6d1e15cc14341e805b367") == 0, "X-Archive-SHA256 lands in resp.sha256, any case");
    CHECK(strcmp(resp.revision, "rev123") == 0, "X-Door-Repo-Revision lands in resp.revision, any case");
    CHECK(ctx.len == strlen(body) && memcmp(ctx.data, body, ctx.len) == 0, "the caller's sink gets the body");
    stub_server_reap(pid);
}

static void the_user_agent_on_the_wire_is_doorrepos(void)
{
    static const char resp_buf[] = "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    unsigned char captured[2048];
    unsigned long n;
    int port, pid, fd, rc;
    dr_config cfg;
    http_response resp;
    sink_ctx ctx;

    port = stub_server_start_capturing((const unsigned char *) resp_buf, (unsigned long) (sizeof(resp_buf) - 1), &pid, &fd);
    CHECK(port >= 0, "capturing stub server starts");
    cfg_for_port(&cfg, port);
    memset(&ctx, 0, sizeof(ctx));
    rc = http_get(&cfg, "/api/door-repo/list.txt", &resp, sink, &ctx);
    CHECK(rc == HTTP_OK, "request succeeds");
    n = stub_server_read_capture(fd, captured, sizeof(captured) - 1);
    captured[n] = '\0';
    CHECK(strstr((const char *) captured, "GET /api/door-repo/list.txt HTTP/1.1\r\nHost: 127.0.0.1:") != (char *) 0, "request line and Host are as before");
    CHECK(strstr((const char *) captured, "\r\nConnection: close\r\nUser-Agent: DoorRepo-C-Client/1.0\r\n\r\n") != (char *) 0, "User-Agent: DoorRepo-C-Client/1.0, in the same place");
    stub_server_reap(pid);
}

static void a_refused_port_is_connect_with_a_reason(void)
{
    dr_config cfg;
    http_response resp;
    sink_ctx ctx;
    int port = stub_closed_port();
    int rc;

    CHECK(port > 0, "a closed port is found");
    cfg_for_port(&cfg, port);
    cfg.timeout_secs = 2;
    memset(&ctx, 0, sizeof(ctx));
    rc = http_get(&cfg, "/x", &resp, sink, &ctx);
    CHECK(rc == HTTP_ERR_CONNECT, "HTTP_ERR_CONNECT is the SDK's code");
    CHECK(strstr(ae_net_last_error(), "refused") != (const char *) 0, "ae_net_last_error() says why");
}

static void the_callers_abort_is_sink_abort(void)
{
    static const char resp_buf[] = "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello";
    int port, pid, rc;
    dr_config cfg;
    http_response resp;
    sink_ctx ctx;

    port = stub_server_start((const unsigned char *) resp_buf, (unsigned long) (sizeof(resp_buf) - 1), &pid);
    cfg_for_port(&cfg, port);
    memset(&ctx, 0, sizeof(ctx));
    ctx.abort = 1;
    rc = http_get(&cfg, "/x", &resp, sink, &ctx);
    CHECK(rc == HTTP_ERR_SINK_ABORT, "a non-zero sink return is HTTP_ERR_SINK_ABORT");
    CHECK(ctx.calls == 1, "the sink was called once, with the caller's ctx");
    stub_server_reap(pid);
}

int main(void)
{
    printf("\n====== DoorRepo HTTP adapter ======\n\n");
    the_repo_headers_arrive_as_fields();
    the_user_agent_on_the_wire_is_doorrepos();
    a_refused_port_is_connect_with_a_reason();
    the_callers_abort_is_sink_abort();
    printf("\nFailed: %d/%d\n", tests_failed, tests_run);
    return tests_failed == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
