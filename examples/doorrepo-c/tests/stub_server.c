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
#include <sys/time.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include "stub_server.h"

#define CAPTURE_BUF_SIZE 4096

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

int stub_server_start_capturing(const unsigned char *response, unsigned long response_len,
                                 int *out_pid, int *out_capture_fd)
{
    int listen_fd;
    int port;
    int pipefd[2];
    pid_t pid;

    if (pipe(pipefd) != 0) {
        return -1;
    }

    listen_fd = make_listener(&port);
    if (listen_fd < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        return -1;
    }
    if (listen(listen_fd, 1) != 0) {
        close(listen_fd);
        close(pipefd[0]);
        close(pipefd[1]);
        return -1;
    }

    pid = fork();
    if (pid < 0) {
        close(listen_fd);
        close(pipefd[0]);
        close(pipefd[1]);
        return -1;
    }

    if (pid == 0) {
        /* Child: capture the request, hand it to the parent over the
         * pipe, THEN serve the scripted response, then exit - see
         * stub_server.h's doc comment for why this ordering matters. */
        int conn_fd;
        unsigned long sent;
        static unsigned char capbuf[CAPTURE_BUF_SIZE];
        unsigned long caplen = 0;
        struct timeval tv;

        close(pipefd[0]);

        conn_fd = accept(listen_fd, (struct sockaddr *) 0, (socklen_t *) 0);
        close(listen_fd);
        if (conn_fd >= 0) {
            /* A short receive timeout is how this loop knows the client
             * is done sending: the client (http_get()/http_request())
             * never closes its write side before reading the response,
             * so waiting for EOF here would deadlock. Once no more bytes
             * arrive within the timeout, everything the client sent has
             * necessarily already been delivered on a loopback
             * connection. */
            tv.tv_sec = 0;
            tv.tv_usec = 200000;
            setsockopt(conn_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

            while (caplen < sizeof(capbuf)) {
                ssize_t n = read(conn_fd, capbuf + caplen, sizeof(capbuf) - caplen);
                if (n <= 0) {
                    break;
                }
                caplen += (unsigned long) n;
            }

            {
                unsigned long off = 0;
                while (off < caplen) {
                    ssize_t n = write(pipefd[1], capbuf + off, (size_t) (caplen - off));
                    if (n <= 0) {
                        break;
                    }
                    off += (unsigned long) n;
                }
            }
            close(pipefd[1]);

            sent = 0;
            while (sent < response_len) {
                ssize_t n = write(conn_fd, response + sent, (size_t) (response_len - sent));
                if (n <= 0) {
                    break;
                }
                sent += (unsigned long) n;
            }
            close(conn_fd);
        } else {
            close(pipefd[1]);
        }
        _exit(0);
    }

    /* Parent: the child owns the connection and the pipe's write end now. */
    close(pipefd[1]);
    close(listen_fd);
    *out_pid = (int) pid;
    *out_capture_fd = pipefd[0];
    return port;
}

int stub_server_start_sequence(const unsigned char * const *responses,
                                const unsigned long *response_lens,
                                int count, int *out_pid)
{
    int listen_fd;
    int port;
    pid_t pid;

    if (count <= 0) {
        return -1;
    }

    listen_fd = make_listener(&port);
    if (listen_fd < 0) {
        return -1;
    }
    if (listen(listen_fd, count) != 0) {
        close(listen_fd);
        return -1;
    }

    pid = fork();
    if (pid < 0) {
        close(listen_fd);
        return -1;
    }

    if (pid == 0) {
        /* Child: serve exactly `count` connections, in order, then exit. */
        int idx;

        for (idx = 0; idx < count; idx++) {
            int conn_fd;
            unsigned long sent;
            char reqbuf[2048];
            long got;

            conn_fd = accept(listen_fd, (struct sockaddr *) 0, (socklen_t *) 0);
            if (conn_fd < 0) {
                break;
            }

            got = 0;
            while (got < (long) sizeof(reqbuf) - 1) {
                ssize_t n = read(conn_fd, reqbuf + got, sizeof(reqbuf) - 1 - (size_t) got);
                if (n <= 0) {
                    break;
                }
                got += n;
                reqbuf[got] = '\0';
                if (strstr(reqbuf, "\r\n\r\n") != (char *) 0) {
                    break;
                }
            }

            sent = 0;
            while (sent < response_lens[idx]) {
                ssize_t n = write(conn_fd, responses[idx] + sent, (size_t) (response_lens[idx] - sent));
                if (n <= 0) {
                    break;
                }
                sent += (unsigned long) n;
            }
            close(conn_fd);
        }
        close(listen_fd);
        _exit(0);
    }

    /* Parent: the child owns the connections now. */
    close(listen_fd);
    *out_pid = (int) pid;
    return port;
}

unsigned long stub_server_read_capture(int capture_fd, unsigned char *out, unsigned long outsize)
{
    unsigned char drain[512];
    unsigned long total = 0;

    for (;;) {
        ssize_t n = read(capture_fd, drain, sizeof(drain));
        if (n <= 0) {
            break;
        }
        {
            unsigned long avail = (unsigned long) n;
            unsigned long room = (total < outsize) ? outsize - total : 0;
            unsigned long copy = (avail < room) ? avail : room;
            if (copy > 0) {
                memcpy(out + total, drain, copy);
            }
            total += copy;
        }
    }
    close(capture_fd);
    return total;
}
