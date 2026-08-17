/* netio.c - portable socket layer for the DoorRepo C client.
 * See netio.h for the interface contract.
 *
 * THE ONLY FILE IN THIS PROJECT ALLOWED TO CONTAIN "#ifdef AMIGA". Three
 * branches, selected at compile time:
 *
 *   1. NETIO_STUB defined       -> compile-only stub, no real sockets.
 *      Exists so http.c and everything above it can be built to m68k
 *      object code on this toolchain, which lacks the AmiTCP SDK headers
 *      the real Amiga branch needs (see branch 2's comment). This is how
 *      Task 7 proves every module other than this one is m68k-clean.
 *   2. AMIGA defined (and NETIO_STUB not defined) -> bsdsocket.library.
 *      UNVERIFIED ON THIS TOOLCHAIN - see the comment at that branch.
 *   3. neither defined           -> POSIX (getaddrinfo + BSD sockets).
 *      Used for the native dev/test build; this is what test_http.c and
 *      the rest of the suite actually exercise.
 *
 * Branches 2 and 3 are written to mirror each other function-for-function:
 * resolve host, open a non-blocking socket, connect with a wait-for-
 * writable timeout, switch back to blocking, then use a wait-for-readable
 * timeout in front of every read.
 */

#include <string.h>
#include "netio.h"

static char g_last_error[128] = "";

static void set_error(const char *msg)
{
    unsigned long len;
    len = 0;
    while (msg[len] != '\0' && len < sizeof(g_last_error) - 1) {
        g_last_error[len] = msg[len];
        len++;
    }
    g_last_error[len] = '\0';
}

const char *net_last_error(void)
{
    return g_last_error;
}

#if defined(NETIO_STUB)

/* ---- Branch 1: compile-only stub. Every call fails cleanly with a
 * distinct message; no header beyond netio.h itself is required, which is
 * the entire point - it lets a vbcc m68k build link http.c without ever
 * needing sys/socket.h, netinet/in.h, or netdb.h. */

/* Parameters are intentionally unused here - this branch never touches a
 * real socket. Not suppressed with "(void) param;": that idiom (needed
 * under native -Wextra, where NETIO_STUB is never defined so this branch
 * never actually compiles there) trips vbcc's "statement has no effect"
 * warning instead, and vbcc does not warn on unused parameters by
 * default - so simply leaving them unused is the one form that is silent
 * on both toolchains. */

int net_open(const char *host, int port, int timeout_secs)
{
    set_error("netio: NETIO_STUB build, no real networking");
    return -1;
}

long net_write(int s, const void *buf, unsigned long len)
{
    set_error("netio: NETIO_STUB build, no real networking");
    return -1;
}

long net_read(int s, void *buf, unsigned long len)
{
    set_error("netio: NETIO_STUB build, no real networking");
    return -1;
}

void net_close(int s)
{
}

#elif defined(AMIGA)

/* ---- Branch 2: bsdsocket.library.
 *
 * UNVERIFIED ON THIS TOOLCHAIN. This has never been compiled or run: vbcc
 * 0.9hp3 here ships proto/socket.h and inline/bsdsocket_protos.h (the
 * function stubs/pragmas) but not the AmiTCP SDK headers that define the
 * actual types the API needs - sys/socket.h (struct sockaddr), netinet/in.h
 * (struct sockaddr_in, htons), netdb.h (struct hostent, gethostbyname).
 * The m68k-amiga-elf-gcc tree's copies of those headers assume a different
 * libc and fail to compile under vbcc. Hand-declaring the structs here
 * would risk an undetectable ABI mismatch against whatever AmiTCP/Roadshow
 * build a sysop actually runs, so that was ruled out (see task-4 report).
 * This code is written carefully against the documented bsdsocket.library
 * v4 API (function names, parameter order, and semantics taken from the
 * NDK's bsdsocket_protos.h and the classic AmiTCP SDK headers) and mirrors
 * the POSIX branch below step for step, but it is unverified until it is
 * built and run against a real AmiTCP/Roadshow stack.
 */

#include <exec/types.h>
#include <proto/exec.h>
#include <proto/socket.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netdb.h>
#include <sys/ioctl.h>
#include <stdlib.h>

struct Library *SocketBase = (struct Library *) 0;
static int g_timeout_secs = 30;

static void close_socket_lib(void)
{
    if (SocketBase != (struct Library *) 0) { CloseLibrary(SocketBase); SocketBase = (struct Library *) 0; }
}

static int ensure_lib(void)
{
    if (SocketBase != (struct Library *) 0) return 0;
    SocketBase = OpenLibrary((STRPTR) "bsdsocket.library", 4);
    if (SocketBase == (struct Library *) 0) { set_error("netio: cannot open bsdsocket.library v4"); return -1; }
    atexit(close_socket_lib);
    return 0;
}

int net_open(const char *host, int port, int timeout_secs)
{
    int s;
    long on;
    struct hostent *he;
    struct sockaddr_in addr;
    struct __timeval tv;
    long wmask;

    if (ensure_lib() != 0) return -1;
    g_timeout_secs = timeout_secs;

    he = gethostbyname((STRPTR) host);
    if (he == (struct hostent *) 0) { set_error("netio: gethostbyname() failed"); return -1; }

    s = socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) { set_error("netio: socket() failed"); return -1; }
    on = 1;
    IoctlSocket(s, FIONBIO, (char *) &on); /* non-blocking, so connect() below can be timed */

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((unsigned short) port);
    memcpy(&addr.sin_addr, he->h_addr, (size_t) he->h_length);

    if (connect(s, (struct sockaddr *) &addr, sizeof(addr)) < 0 && Errno() != EINPROGRESS) {
        set_error("netio: connect() failed"); CloseSocket(s); return -1;
    }

    wmask = 1L << s;
    tv.tv_sec = timeout_secs; tv.tv_usec = 0;
    if (WaitSelect(s + 1, (long *) 0, &wmask, (long *) 0, &tv, (unsigned long *) 0) <= 0) {
        set_error("netio: connect() timed out"); CloseSocket(s); return -1;
    }

    on = 0;
    IoctlSocket(s, FIONBIO, (char *) &on); /* back to blocking for the send/recv calls below */
    return s;
}

long net_write(int s, const void *buf, unsigned long len)
{
    long n = send(s, (APTR) buf, (long) len, 0);
    if (n < 0) set_error("netio: send() failed");
    return n;
}

/* Every read is bounded by g_timeout_secs (set by net_open()): WaitSelect()
 * first, so a peer that stops sending mid-response cannot hang the door. */
long net_read(int s, void *buf, unsigned long len)
{
    struct __timeval tv;
    long rmask = 1L << s;
    long n;

    tv.tv_sec = g_timeout_secs; tv.tv_usec = 0;
    n = WaitSelect(s + 1, &rmask, (long *) 0, (long *) 0, &tv, (unsigned long *) 0);
    if (n == 0) { set_error("netio: read timed out"); return -1; }
    if (n < 0) { set_error("netio: WaitSelect() failed"); return -1; }

    n = recv(s, (APTR) buf, (long) len, 0);
    if (n < 0) set_error("netio: recv() failed");
    return n;
}

void net_close(int s)
{
    if (s >= 0) CloseSocket(s);
}

#else

/* ---- Branch 3: POSIX (getaddrinfo + BSD sockets). Native dev/test build.
 * Mirrors the Amiga branch above: non-blocking connect bounded by
 * select(), then blocking I/O with a select()-bounded wait before every
 * read (the socket-level read timeout net_read() promises). */

#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netdb.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>

static int g_timeout_secs = 30;

/* Formats a non-negative int as decimal into `out` (at least 12 bytes).
 * Avoids sprintf()/snprintf(): C89 has no snprintf, and getaddrinfo()'s
 * port argument is the only place this file needs numeric-to-string
 * conversion, so a tiny hand-rolled formatter is simpler than pulling in
 * stdio's formatting machinery for one field. */
static void format_port(char *out, int port)
{
    char tmp[12];
    int i = 0;
    unsigned int v = (unsigned int) port;

    if (v == 0) {
        out[0] = '0';
        out[1] = '\0';
        return;
    }
    while (v > 0) {
        tmp[i++] = (char) ('0' + (v % 10));
        v /= 10;
    }
    while (i > 0) {
        *out++ = tmp[--i];
    }
    *out = '\0';
}

int net_open(const char *host, int port, int timeout_secs)
{
    int s;
    int flags;
    struct addrinfo hints;
    struct addrinfo *res;
    struct addrinfo *rp;
    char portbuf[16];
    fd_set wfds;
    struct timeval tv;
    int err;
    socklen_t errlen;

    g_timeout_secs = timeout_secs;

    format_port(portbuf, port);
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(host, portbuf, &hints, &res) != 0) {
        set_error("netio: getaddrinfo() failed");
        return -1;
    }

    s = -1;
    for (rp = res; rp != (struct addrinfo *) 0; rp = rp->ai_next) {
        s = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
        if (s < 0) {
            continue;
        }

        flags = fcntl(s, F_GETFL, 0);
        fcntl(s, F_SETFL, flags | O_NONBLOCK);

        if (connect(s, rp->ai_addr, rp->ai_addrlen) == 0) {
            break;
        }
        if (errno != EINPROGRESS) {
            close(s);
            s = -1;
            continue;
        }

        FD_ZERO(&wfds);
        FD_SET(s, &wfds);
        tv.tv_sec = timeout_secs;
        tv.tv_usec = 0;
        if (select(s + 1, (fd_set *) 0, &wfds, (fd_set *) 0, &tv) <= 0) {
            close(s);
            s = -1;
            continue;
        }

        err = 0;
        errlen = sizeof(err);
        getsockopt(s, SOL_SOCKET, SO_ERROR, &err, &errlen);
        if (err != 0) {
            close(s);
            s = -1;
            continue;
        }
        break;
    }
    freeaddrinfo(res);

    if (s < 0) {
        set_error("netio: connect() failed");
        return -1;
    }

    flags = fcntl(s, F_GETFL, 0);
    fcntl(s, F_SETFL, flags & ~O_NONBLOCK);
    return s;
}

long net_write(int s, const void *buf, unsigned long len)
{
    ssize_t n;
    n = write(s, buf, (size_t) len);
    if (n < 0) {
        set_error("netio: write() failed");
    }
    return (long) n;
}

long net_read(int s, void *buf, unsigned long len)
{
    fd_set rfds;
    struct timeval tv;
    int rv;
    ssize_t n;

    for (;;) {
        FD_ZERO(&rfds);
        FD_SET(s, &rfds);
        tv.tv_sec = g_timeout_secs;
        tv.tv_usec = 0;
        rv = select(s + 1, &rfds, (fd_set *) 0, (fd_set *) 0, &tv);
        if (rv < 0 && errno == EINTR) {
            continue;
        }
        break;
    }
    if (rv == 0) {
        set_error("netio: read timed out");
        return -1;
    }
    if (rv < 0) {
        set_error("netio: select() failed");
        return -1;
    }

    n = read(s, buf, (size_t) len);
    if (n < 0) {
        set_error("netio: read() failed");
    }
    return (long) n;
}

void net_close(int s)
{
    if (s >= 0) {
        close(s);
    }
}

#endif
