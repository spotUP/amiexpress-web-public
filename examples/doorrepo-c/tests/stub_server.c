/* stub_server.c - see stub_server.h. POSIX-only (fork + sockets); test
 * harness code, never linked into the door itself, so it is fine for this
 * file to need POSIX feature macros/headers that the production modules
 * deliberately avoid. */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include "stub_server.h"

static int make_listener(int *out_port)
{
    int fd;
    struct sockaddr_in addr;
    socklen_t addrlen;

    fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = 0; /* ephemeral: the kernel picks an unused port */

    if (bind(fd, (struct sockaddr *) &addr, sizeof(addr)) != 0) {
        close(fd);
        return -1;
    }

    addrlen = sizeof(addr);
    if (getsockname(fd, (struct sockaddr *) &addr, &addrlen) != 0) {
        close(fd);
        return -1;
    }
    *out_port = (int) ntohs(addr.sin_port);

    return fd;
}

int stub_server_start(const unsigned char *response, unsigned long response_len, int *out_pid)
{
    int listen_fd;
    int port;
    pid_t pid;

    listen_fd = make_listener(&port);
    if (listen_fd < 0) {
        return -1;
    }
    if (listen(listen_fd, 1) != 0) {
        close(listen_fd);
        return -1;
    }

    pid = fork();
    if (pid < 0) {
        close(listen_fd);
        return -1;
    }

    if (pid == 0) {
        /* Child: serve exactly one connection, then exit. */
        int conn_fd;
        unsigned long sent;
        char reqbuf[2048];
        long got;
        int have_terminator = 0;

        conn_fd = accept(listen_fd, (struct sockaddr *) 0, (socklen_t *) 0);
        close(listen_fd);
        if (conn_fd >= 0) {
            /* Drain (and discard) the client's request before writing the
             * scripted response. This matters: if this socket still has
             * unread inbound data sitting in its receive buffer when
             * close() is called below, BSD sockets send a TCP RST instead
             * of a clean FIN, which the client's read() then reports as
             * ECONNRESET instead of a graceful EOF - exactly the
             * EOF-framed-body and truncated-body test cases below need to
             * NOT happen. Reading up to the blank line that ends the
             * request headers (or filling reqbuf, or hitting EOF/error)
             * is enough - this stub never needs the request body. */
            got = 0;
            while (got < (long) sizeof(reqbuf) - 1) {
                ssize_t n = read(conn_fd, reqbuf + got, sizeof(reqbuf) - 1 - (size_t) got);
                if (n <= 0) {
                    break;
                }
                got += n;
                reqbuf[got] = '\0';
                if (strstr(reqbuf, "\r\n\r\n") != (char *) 0) {
                    have_terminator = 1;
                    break;
                }
            }
            (void) have_terminator;

            sent = 0;
            while (sent < response_len) {
                ssize_t n = write(conn_fd, response + sent, (size_t) (response_len - sent));
                if (n <= 0) {
                    break;
                }
                sent += (unsigned long) n;
            }
            close(conn_fd);
        }
        _exit(0);
    }

    /* Parent: the child owns the connection now. */
    close(listen_fd);
    *out_pid = (int) pid;
    return port;
}

void stub_server_reap(int pid)
{
    int status;
    waitpid((pid_t) pid, &status, 0);
}

int stub_closed_port(void)
{
    int fd;
    int port;

    fd = make_listener(&port);
    if (fd < 0) {
        return -1;
    }
    close(fd); /* never listen()s: nothing accepts connections on this port now */
    return port;
}
