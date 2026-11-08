/* test_ae_net_tls.c - ae_net_open_tls() and the https path of ae_http_request()
 * against a real OpenSSL server (forked, loopback, ephemeral port).
 *
 * Throwaway certificates are made with the openssl command into a mkdtemp
 * directory under $TMPDIR and removed at the end; nothing lands in the repo.
 * The test trusts its own certificate through OpenSSL's SSL_CERT_FILE, so the
 * production code has no verification switch.
 *
 * ae_http.c is #included (not linked) so the static Host-header builder can be
 * driven directly: the 443 omission cannot bind a local port.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <openssl/ssl.h>
#include "../src/ae_http.c"
#include "../include/ae_net.h"

static int failures = 0;
static int checks = 0;

#define CHECK(cond, msg) do { checks++; if (cond) printf("  [OK] %s\n", msg); \
    else { failures++; printf("  [FAIL] %s\n", msg); } } while (0)

static char dir[256];
static char cert_a[300], key_a[300], cert_b[300], key_b[300];

static int make_cert(const char *cert, const char *key)
{
    char cmd[1200];
    sprintf(cmd, "openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost "
                 "-addext subjectAltName=DNS:localhost -keyout %s -out %s >/dev/null 2>&1", key, cert);
    return system(cmd);
}

/* Forks a server that handshakes, reads one request, and answers 200 with the
 * request itself as the body. `accepts` connections, then exits. */
static pid_t start_server(const char *cert, const char *key, int accepts, int *port_out)
{
    struct sockaddr_in a;
    socklen_t al = sizeof a;
    int ls = socket(AF_INET, SOCK_STREAM, 0), one = 1;
    pid_t pid;

    setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    memset(&a, 0, sizeof a);
    a.sin_family = AF_INET;
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(ls, (struct sockaddr *) &a, sizeof a) != 0 || listen(ls, 4) != 0) return -1;
    getsockname(ls, (struct sockaddr *) &a, &al);
    *port_out = ntohs(a.sin_port);

    pid = fork();
    if (pid == 0) {
        SSL_CTX *ctx = SSL_CTX_new(TLS_server_method());
        int i;
        signal(SIGPIPE, SIG_IGN);
        if (SSL_CTX_use_certificate_file(ctx, cert, SSL_FILETYPE_PEM) != 1 ||
            SSL_CTX_use_PrivateKey_file(ctx, key, SSL_FILETYPE_PEM) != 1) _exit(2);
        for (i = 0; i < accepts; i++) {
            int c = accept(ls, 0, 0);
            SSL *ssl;
            char req[2048], resp[2300];
            int n = 0, r;
            if (c < 0) _exit(3);
            ssl = SSL_new(ctx);
            SSL_set_fd(ssl, c);
            if (SSL_accept(ssl) == 1) {
                while (n < (int) sizeof req - 1 && (r = SSL_read(ssl, req + n, sizeof req - 1 - n)) > 0) {
                    n += r;
                    req[n] = '\0';
                    if (strstr(req, "\r\n\r\n") != 0) break;
                }
                req[n] = '\0';
                sprintf(resp, "HTTP/1.1 200 OK\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s", n, req);
                SSL_write(ssl, resp, (int) strlen(resp));
                SSL_shutdown(ssl);
            }
            SSL_free(ssl);
            close(c);
        }
        _exit(0);
    }
    close(ls);
    return pid;
}

static char body[2400];
static unsigned long body_len;
static int sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    (void) ctx;
    if (body_len + len < sizeof body) { memcpy(body + body_len, buf, len); body_len += len; body[body_len] = '\0'; }
    return 0;
}

int main(void)
{
    const char *tmp = getenv("TMPDIR");
    char host_hdr[256];
    int port, port_b, rc, fd;
    pid_t pid, pid_b;
    ae_http_target t;
    ae_http_response resp;

    signal(SIGPIPE, SIG_IGN);
    sprintf(dir, "%s/ae-tls-test-XXXXXX", tmp != 0 && *tmp ? tmp : "/tmp");
    if (mkdtemp(dir) == 0) { printf("[FAIL] mkdtemp\n"); return 1; }
    sprintf(cert_a, "%s/a.crt", dir); sprintf(key_a, "%s/a.key", dir);
    sprintf(cert_b, "%s/b.crt", dir); sprintf(key_b, "%s/b.key", dir);
    if (make_cert(cert_a, key_a) != 0 || make_cert(cert_b, key_b) != 0) { printf("[FAIL] openssl req\n"); return 1; }

    /* Host header: default port per scheme is omitted, anything else is kept. */
    {
        char out[600];
        build_request(out, sizeof out, "GET", "h.example", 443, 1, "ua", "/", 0, 0, 0, 0);
        CHECK(strstr(out, "Host: h.example\r\n") != 0, "tls on 443 sends Host without a port");
        build_request(out, sizeof out, "GET", "h.example", 80, 1, "ua", "/", 0, 0, 0, 0);
        CHECK(strstr(out, "Host: h.example:80\r\n") != 0, "tls on 80 keeps the port");
        build_request(out, sizeof out, "GET", "h.example", 80, 0, "ua", "/", 0, 0, 0, 0);
        CHECK(strstr(out, "Host: h.example\r\n") != 0, "plain on 80 sends Host without a port");
        build_request(out, sizeof out, "GET", "h.example", 443, 0, "ua", "/", 0, 0, 0, 0);
        CHECK(strstr(out, "Host: h.example:443\r\n") != 0, "plain on 443 keeps the port");
    }

    /* Trusted certificate, right name: full request through ae_http_request. */
    setenv("SSL_CERT_FILE", cert_a, 1);
    pid = start_server(cert_a, key_a, 3, &port);
    memset(&t, 0, sizeof t);
    t.host = "localhost"; t.port = port; t.tls = 1; t.timeout_secs = 5; t.user_agent = "tls-test";
    body_len = 0; body[0] = '\0';
    rc = ae_http_request(&t, "GET", "/hello", 0, 0, 0, 0, &resp, sink, 0, 0);
    CHECK(rc == AE_HTTP_OK && resp.status == 200, "https GET to localhost succeeds with a trusted certificate");
    sprintf(host_hdr, "Host: localhost:%d\r\n", port);
    CHECK(strstr(body, "GET /hello HTTP/1.1") != 0 && strstr(body, host_hdr) != 0,
          "the server decrypted the request, Host carries the non-443 port (the TLS code RAN)");
    CHECK(strstr(body, "tls-test") != 0, "User-Agent arrived through the encrypted channel");

    /* Right chain, wrong name: 127.0.0.1 is not in the certificate. */
    fd = ae_net_open_tls("127.0.0.1", port, 5);
    CHECK(fd < 0 && strstr(ae_net_last_error(), "certificate rejected") != 0,
          "a host the certificate does not name is rejected");
    if (fd >= 0) ae_net_close(fd);

    /* Name fine, chain not trusted: trust anchor is a different certificate. */
    setenv("SSL_CERT_FILE", cert_b, 1);
    fd = ae_net_open_tls("localhost", port, 5);
    CHECK(fd < 0 && strstr(ae_net_last_error(), "certificate rejected") != 0,
          "a certificate the system does not trust is rejected");
    if (fd >= 0) ae_net_close(fd);
    kill(pid, SIGTERM); waitpid(pid, 0, 0);

    /* Plain client against a TLS server must not look like success. */
    pid_b = start_server(cert_b, key_b, 1, &port_b);
    t.port = port_b; t.tls = 0; t.timeout_secs = 2;
    body_len = 0; body[0] = '\0';
    rc = ae_http_request(&t, "GET", "/", 0, 0, 0, 0, &resp, sink, 0, 0);
    CHECK(rc != AE_HTTP_OK || resp.status != 200, "plain HTTP to a TLS port does not succeed");
    kill(pid_b, SIGTERM); waitpid(pid_b, 0, 0);

    {
        char cmd[400];
        sprintf(cmd, "rm -rf %s", dir);
        if (system(cmd) != 0) printf("  [INFO] could not remove %s\n", dir);
    }
    printf("TLS: %d checks, %d failed\n", checks, failures);
    return failures == 0 ? 0 : 1;
}
