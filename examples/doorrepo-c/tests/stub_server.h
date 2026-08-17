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

#endif /* DOORREPO_TEST_STUB_SERVER_H */
