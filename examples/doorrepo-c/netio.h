/* netio.h - portable socket layer for the DoorRepo C client.
 *
 * netio.c is the ONLY file in this project allowed to contain
 * "#ifdef AMIGA". Every caller (http.c and above) talks only through this
 * five-function interface and never touches a socket, sockaddr, or
 * hostent directly.
 *
 * A socket handle is a small non-negative int (a real fd on POSIX, a
 * bsdsocket.library socket descriptor on Amiga). Negative return values
 * are always errors; net_last_error() explains the most recent one.
 *
 * This client holds at most one connection open at a time (one HTTP
 * request in flight), so a single net_open() call establishes both the
 * connection and the read timeout that governs every subsequent
 * net_read() on that handle (see net_write()'s comment for why writes
 * are not separately timed).
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 */

#ifndef DOORREPO_NETIO_H
#define DOORREPO_NETIO_H

/* Resolves `host`, opens a TCP connection to `host:port`, and returns a
 * socket handle (>= 0) on success. `timeout_secs` bounds both the connect
 * itself and every net_read() made on the returned handle afterward.
 * Returns a negative value on any failure (resolution, socket creation,
 * connect refused, or connect timeout) - net_last_error() has the reason.
 */
int net_open(const char *host, int port, int timeout_secs);

/* Writes up to `len` bytes from `buf`. Returns the number of bytes
 * actually written (may be less than `len` - the caller must loop), or a
 * negative value on error. Unlike net_read(), this is a plain blocking
 * send with no explicit timeout: the requests this client sends are a
 * few hundred bytes, well within any normal TCP send buffer, so this has
 * never been observed to block in practice. */
long net_write(int s, const void *buf, unsigned long len);

/* Reads up to `len` bytes into `buf`. Returns the number of bytes read
 * (0 means clean EOF - the peer closed the connection), or a negative
 * value on error, including a read that did not complete within
 * net_open()'s timeout. */
long net_read(int s, void *buf, unsigned long len);

/* Closes a handle returned by net_open(). Safe to call on an already
 * negative/invalid handle (a no-op in that case). */
void net_close(int s);

/* Returns a description of the most recent net_*() failure on this
 * process. Never returns NULL; returns an empty string ("") if nothing
 * has failed yet. The string is owned by netio.c - callers must not
 * modify or free it, and it is overwritten by the next failing call. */
const char *net_last_error(void);

#endif /* DOORREPO_NETIO_H */
