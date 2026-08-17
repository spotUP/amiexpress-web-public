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
 * COMPILE-VERIFIED, NOT LINK/RUN-VERIFIED. Earlier drafts of this file
 * called this branch entirely unverified because vbcc 0.9hp3's own SDK
 * ships proto/bsdsocket.h + inline/bsdsocket_protos.h (the call
 * stubs/pragmas) but no AmiTCP SDK - no sys/socket.h, netinet/in.h,
 * netdb.h, devices/timer.h. That is still true of vbcc's OWN tree. But
 * this repo separately vendors NDK3.2R4 at "Documentation/7-Reference
 * Sources/NDK3.2R4/", and once that is added to the include path this
 * branch compiles to m68k object code with ZERO warnings under
 * `-std=c89`-equivalent vbcc strictness. Exact recipe (see the task-4
 * report's fix-round section for the full verbatim transcript):
 *   -I <vbcc's own targets/m68k-amigaos/include>
 *   -I <a directory containing ONLY devices/timer.h, symlinked from
 *       NDK3.2R4/Include_H/devices/timer.h - see the WaitSelect comment
 *       below for why this one specific file needs to come from there
 *       rather than the next include path>
 *   -I NDK3.2R4/SANA+RoadshowTCP-IP/netinclude
 *       (sys/socket.h: struct sockaddr/sa_family_t/socklen_t/AF_INET/
 *       SOCK_STREAM/SOL_SOCKET/SO_ERROR; netinet/in.h: struct in_addr,
 *       struct sockaddr_in [4.4BSD-style, with a sin_len byte - set
 *       explicitly below], htons()/htonl() as identity macros, correct
 *       on m68k which is already big-endian; netdb.h: struct hostent.
 *       Both sys/socket.h and netinet/in.h have a
 *       "#elif defined(__VBCC__) #pragma amiga-align" branch - this
 *       vendored NDK was written with vbcc as a target, not just SAS/C.)
 *   -I <m68k-amiga-elf-gcc's sys-include> (fallback only, for
 *       exec/types.h and similar OS-generic headers neither of the above
 *       provides; its OWN devices/timer.h is intentionally shadowed by
 *       the earlier -I - see below)
 * Hand-declaring sockaddr/hostent/etc. from scratch remains ruled out per
 * the plan (ABI-mismatch risk) - this is not that: the vendored NDK is
 * the authoritative source for this exact library version, not a guess.
 * What is still NOT verified: linking against a real bsdsocket.library
 * and running on real (or emulated) AmigaOS - no such environment is
 * available here. Compiling clean is strong evidence the API usage is
 * structurally correct, but LVO offsets, register conventions at the
 * ABI level, and runtime behavior remain unexercised.
 */

#include <exec/types.h>
#include <proto/exec.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netdb.h>
#include <sys/ioctl.h>
#include <errno.h>
#include <stdlib.h>
#include <proto/bsdsocket.h>

/* bsdsocket.library's WaitSelect() timeout parameter - what it actually
 * expects, determined by experiment rather than assumed:
 *
 * The master .sfd (Documentation/7-Reference Sources/NDK3.2R4/
 * SANA+RoadshowTCP-IP/sfd/bsdsocket_lib.sfd:34) says "struct timeval
 * *_timeout". The vendored NDK's own DOCUMENTATION copy of
 * inline/bsdsocket_protos.h renames that to "struct __timeval *" in its
 * generated prototype (evidently to sidestep AmigaOS's separate, unrelated
 * "struct timeval" from <devices/timer.h>) and never defines
 * "struct __timeval" anywhere - confirmed by grepping the whole vendored
 * NDK tree. BUT the vbcc 0.9hp3 SDK actually INSTALLED on this machine
 * (targets/m68k-amigaos/include/inline/bsdsocket_protos.h:56, checked
 * directly, not assumed from the vendored doc copy above) declares
 * WaitSelect's timeout parameter as plain "struct timeval *" - no
 * "__timeval" involved at all for this toolchain version. So the fix is
 * not an alias shim; it is supplying a real, complete "struct timeval".
 *
 * That struct is reachable from the vendored NDK: <sys/socket.h> (see
 * Documentation/7-Reference Sources/NDK3.2R4/SANA+RoadshowTCP-IP/
 * netinclude/sys/socket.h, bottom of file) includes <devices/timer.h> and
 * then "#define tv_sec tv_secs" / "#define tv_usec tv_micro", giving
 * POSIX-named field access on top of the AmigaOS-native struct - exactly
 * what this file uses below (tv.tv_sec / tv.tv_usec). The one wrinkle:
 * <devices/timer.h> as vendored in the m68k-amiga-elf-gcc sys-include tree
 * wraps tv_sec/tv_secs (and tv_usec/tv_micro) in anonymous unions, a GNU
 * extension vbcc does not accept (warning 53, "struct/union member needs
 * identifier") - so the build points -I at the ORIGINAL NDK3.2R4 copy
 * (Documentation/7-Reference Sources/NDK3.2R4/Include_H/devices/timer.h,
 * a plain non-union struct) ahead of it. See the task-4 report's fix-round
 * section for the exact include order and vbcc transcript (0 warnings). */
#include <devices/timer.h>

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
    struct timeval tv;
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
    addr.sin_len = sizeof(addr); /* the vendored netinclude/netinet/in.h struct sockaddr_in carries a 4.4BSD-style length byte */
    addr.sin_family = AF_INET;
    addr.sin_port = htons((unsigned short) port);
    memcpy(&addr.sin_addr, he->h_addr, (size_t) he->h_length);

    if (connect(s, (struct sockaddr *) &addr, sizeof(addr)) < 0 && Errno() != EINPROGRESS) {
        set_error("netio: connect() failed"); CloseSocket(s); return -1;
    }

    wmask = 1L << s;
    tv.tv_sec = timeout_secs; tv.tv_usec = 0;
    if (WaitSelect(s + 1, (APTR) 0, (APTR) &wmask, (APTR) 0, &tv, (unsigned long *) 0) <= 0) {
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
    struct timeval tv;
    long rmask = 1L << s;
    long n;

    tv.tv_sec = g_timeout_secs; tv.tv_usec = 0;
    n = WaitSelect(s + 1, (APTR) &rmask, (APTR) 0, (APTR) 0, &tv, (unsigned long *) 0);
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
    const char *fail_reason;

    g_timeout_secs = timeout_secs;

    format_port(portbuf, port);
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(host, portbuf, &hints, &res) != 0) {
        set_error("netio: getaddrinfo() failed");
        return -1;
    }

    /* Mirrors the Amiga branch's net_open(): "connect() failed" (refused
     * or otherwise rejected synchronously/asynchronously) and
     * "connect() timed out" (no response within timeout_secs) are
     * reported as distinct net_last_error() strings, not folded into one
     * generic message - a caller (or a human reading a log) can tell a
     * closed port from an unreachable/black-holed one. fail_reason
     * carries the most recent attempt's specific reason forward; if every
     * address in res fails, the last one's reason is what gets reported,
     * same as which failing `s` "wins" is already decided by the loop. */
    fail_reason = "netio: connect() failed";
    s = -1;
    for (rp = res; rp != (struct addrinfo *) 0; rp = rp->ai_next) {
        s = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
        if (s < 0) {
            fail_reason = "netio: socket() failed";
            continue;
        }

        flags = fcntl(s, F_GETFL, 0);
        fcntl(s, F_SETFL, flags | O_NONBLOCK);

        if (connect(s, rp->ai_addr, rp->ai_addrlen) == 0) {
            break;
        }
        if (errno != EINPROGRESS) {
            fail_reason = "netio: connect() failed";
            close(s);
            s = -1;
            continue;
        }

        FD_ZERO(&wfds);
        FD_SET(s, &wfds);
        tv.tv_sec = timeout_secs;
        tv.tv_usec = 0;
        if (select(s + 1, (fd_set *) 0, &wfds, (fd_set *) 0, &tv) <= 0) {
            fail_reason = "netio: connect() timed out";
            close(s);
            s = -1;
            continue;
        }

        err = 0;
        errlen = sizeof(err);
        getsockopt(s, SOL_SOCKET, SO_ERROR, &err, &errlen);
        if (err != 0) {
            fail_reason = "netio: connect() failed";
            close(s);
            s = -1;
            continue;
        }
        break;
    }
    freeaddrinfo(res);

    if (s < 0) {
        set_error(fail_reason);
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
