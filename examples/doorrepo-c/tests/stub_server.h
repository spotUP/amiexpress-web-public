/* stub_server.h - minimal one-shot HTTP stub server for testing http.c
 * against controlled, scripted responses. POSIX-only (fork + sockets);
 * used only by the native test suite, never linked into the door itself.
 */

#ifndef DOORREPO_TEST_STUB_SERVER_H
#define DOORREPO_TEST_STUB_SERVER_H

/* Forks a child process that listens on an ephemeral loopback port,
 * accepts exactly one connection, writes `response` (exactly
 * `response_len` bytes, verbatim - whatever the client sends is not
 * inspected), then closes the connection and exits. Returns the port
 * number to connect to on success (and stores the child pid in
 * *out_pid, for stub_server_reap()), or -1 on failure. */
int stub_server_start(const unsigned char *response, unsigned long response_len, int *out_pid);

/* Waits for the child process started by stub_server_start() to exit, so
 * the test suite does not accumulate zombies. Safe to call with any pid
 * returned by stub_server_start(). */
void stub_server_reap(int pid);

/* Returns a loopback TCP port number that nothing is listening on (a
 * listening socket is opened just long enough to claim an ephemeral port,
 * then closed before returning), for testing the connect-refused error
 * path. Returns -1 on failure. */
int stub_closed_port(void);

/* Like stub_server_start(), but also captures every byte the client sends
 * (request line, headers, and any request body) instead of discarding
 * them. The forked child drains the client's request with a short receive
 * timeout (so it stops once no more bytes arrive, without needing to know
 * the request length up front or waiting for the client to close its
 * write side - the client never does, since it is still waiting to read
 * the response), THEN writes the captured bytes across a pipe to the
 * parent, THEN sends `response`, exactly like stub_server_start().
 *
 * Returns the port to connect to on success (storing the child pid in
 * *out_pid and a pipe read-fd in *out_capture_fd, for
 * stub_server_read_capture()), or -1 on failure. */
int stub_server_start_capturing(const unsigned char *response, unsigned long response_len,
                                 int *out_pid, int *out_capture_fd);

/* Reads everything the paired stub_server_start_capturing() child
 * captured from the pipe at capture_fd into `out` (bounded to outsize
 * bytes - any excess captured bytes are still drained from the pipe so
 * the child never blocks on a full pipe buffer, but are not copied into
 * `out`), then closes capture_fd. Call this after the HTTP exchange
 * (e.g. after http_get()/http_request() returns), before
 * stub_server_reap(). Returns the number of bytes copied into `out`. */
unsigned long stub_server_read_capture(int capture_fd, unsigned char *out, unsigned long outsize);

/* Like stub_server_start(), but serves `count` responses in sequence across
 * `count` separate connections, all on the SAME port - for testing code
 * that makes more than one HTTP round trip to the same host:port within
 * one logical operation (e.g. owner_auth_call()'s re-login-and-retry flow:
 * an admin call that gets 401, a re-login, then the retried call - three
 * separate connections, since http_request() always sends
 * Connection: close). `responses[i]`/`response_lens[i]` is served to the
 * i-th connection accepted, in order; each connection's inbound bytes are
 * drained and discarded first, exactly like stub_server_start(). If the
 * code under test makes FEWER connections than `count` (e.g. a retry that
 * should have fired but didn't), the child gives up waiting for the next
 * one after a few seconds and exits instead of blocking forever - a
 * connection-count shortfall then surfaces as a clean connect failure on
 * whichever attempt never arrives, not a hung test suite. Returns the
 * port to connect to on success (storing the child pid in *out_pid, for
 * stub_server_reap()), or -1 on failure. */
int stub_server_start_sequence(const unsigned char * const *responses,
                                const unsigned long *response_lens,
                                int count, int *out_pid);

#endif /* DOORREPO_TEST_STUB_SERVER_H */
