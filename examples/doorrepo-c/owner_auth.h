/* owner_auth.h - owner-mode admin login/token plumbing for the DoorRepo
 * door (approving/rejecting submissions, editing catalog fields, from
 * inside the door - see the plan's owner-mode-curation docs).
 *
 * Real mechanism verified directly against the amiexpress-doorserver
 * checkout (src/admin-routes.ts, src/auth.ts), not trusted from plan
 * prose: `POST <RepoPath>/admin/login` takes `{"username":"...",
 * "password":"..."}`, returns `{"token":"<JWT>","user":{...}}` with HTTP
 * 200 on success; 401 `{"error":"invalid credentials"}` on a bad
 * username/password; 429 `{"error":"too many failed attempts; try again
 * in a few minutes"}` when the account is locked out (5 failures in 5
 * minutes, per-account); 503 `{"error":"admin API disabled: ..."}` when
 * the server has no DOORSERVER_JWT_SECRET configured at all. Every other
 * admin route (src/admin-routes.ts's requireAdmin() gate) answers 401
 * `{"error":"not authenticated"}` for a missing/expired/invalid token,
 * and 503 the same way when the secret isn't configured - the token
 * itself is an HS256 JWT valid for TOKEN_TTL_SECONDS = 12*60*60 (12
 * hours) server-side (src/auth.ts).
 *
 * Token lifecycle (per the plan's ruling - do not redesign): login once,
 * lazily, the first time an authenticated admin call is actually made
 * (owner_auth_call() below does this itself - no separate "enter owner
 * mode" trigger needed). The token is held ONLY in owner_auth_state, in
 * memory - NEVER written to disk, no token-cache file: a 12-hour token
 * surviving in DownloadDir after the door exits would be unnecessary
 * exposure for a value that is cheap to re-acquire. On any admin call
 * returning 401, owner_auth_call() re-logs in once automatically (the
 * token expired or was revoked server-side) and retries the SAME call
 * exactly once; a second 401 after that re-login is a real credentials
 * failure, reported to the caller as OWNER_AUTH_ERR_INVALID_CREDS, not
 * retried again.
 *
 * AdminUsername/AdminPassword (config.h/config.c) are NEVER logged by
 * this module - grep owner_auth.c for every string this file could hand
 * to a caller-visible log and confirm none of them carry cfg->admin_password
 * or cfg->admin_username. The plaintext password is wiped from its local
 * stack buffer immediately after the login HTTP call returns, rather than
 * left to linger for the rest of the function.
 *
 * Split, per this door's usual pure-logic/thin-I/O convention (see
 * flow.h's file header on flow_read_door_info()): owner_auth_classify_login()
 * and owner_auth_should_retry() are pure, deterministic, and unit-tested
 * directly with no I/O; owner_auth_login() and owner_auth_call() are thin
 * wrappers that do the real HTTP request/response cycle via http_request()
 * and are exercised in tests/test_owner_auth.c against a real (but
 * loopback) stub server, the same way tests/test_http.c already does.
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 */

#ifndef DOORREPO_OWNER_AUTH_H
#define DOORREPO_OWNER_AUTH_H

#include "config.h"
#include "http.h"

/* Generous headroom over a real HS256 JWT for this door's own username/role
 * claims (typically 200-400 bytes) - see owner_auth_classify_login()'s doc
 * comment for what happens if a real token somehow exceeds this (a clean,
 * fail-closed OWNER_AUTH_ERR_BAD_RESPONSE, never a truncated/partial token
 * silently used). */
#define OWNER_AUTH_TOKEN_MAX 512

/* In-memory-only session state for owner-mode admin calls. NEVER written to
 * disk (see this file's header) - the caller owns the storage, exactly like
 * every other stateful struct in this door (no malloc anywhere). */
typedef struct {
    char token[OWNER_AUTH_TOKEN_MAX];
    int have_token;
} owner_auth_state;

/* Outcome codes, returned by owner_auth_login(), owner_auth_call(), and
 * owner_auth_classify_login(). 0 (OWNER_AUTH_OK) means success; every
 * negative value is a distinct, reportable failure reason. */
#define OWNER_AUTH_OK                    0
#define OWNER_AUTH_ERR_ARGS             -1  /* NULL cfg/state/method/path, too many extra_headers, or AdminUsername/AdminPassword not configured */
#define OWNER_AUTH_ERR_TRANSPORT        -2  /* http_request() itself failed - see http.h's HTTP_ERR_* for the underlying reason */
#define OWNER_AUTH_ERR_INVALID_CREDS    -3  /* 401 - wrong username/password (owner_auth_call(): a SECOND 401, even after one automatic re-login) */
#define OWNER_AUTH_ERR_LOCKED_OUT       -4  /* 429 - too many recent failed logins for this account, server-side */
#define OWNER_AUTH_ERR_SERVER_DISABLED  -5  /* 503 - server has no DOORSERVER_JWT_SECRET configured; the admin API does not exist right now */
#define OWNER_AUTH_ERR_BAD_RESPONSE     -6  /* transport succeeded and returned an HTTP status this module understood, but the body did not have the expected shape (e.g. 200 with no "token") */

/* Clears state (have_token = 0, token buffer zeroed) - call once at
 * startup, and internally before every re-login. */
void owner_auth_reset(owner_auth_state *state);

/* Logs in once: builds `{"username":...,"password":...}` via
 * json_build_login_body(), POSTs it to "<cfg->path>/admin/login" via
 * http_request(), and on success stores the token in `state` (have_token
 * set to 1). On any failure, `state` is left however owner_auth_reset()
 * would leave it (a stale token from a previous session is never kept
 * half-updated by a failed re-login attempt) - see owner_auth_call() for
 * why that matters to its retry loop.
 *
 * `error_out`/`error_out_cap` optionally receive the server's own
 * "error" message on a non-OK outcome (safe to log/display - it is
 * server-authored text, e.g. "invalid credentials", never anything
 * derived from the password); pass (char *) 0 / 0 to skip this.
 *
 * Returns OWNER_AUTH_OK, OWNER_AUTH_ERR_ARGS (cfg/state NULL, or
 * cfg->admin_username/cfg->admin_password not configured - owner mode is
 * "absent config = feature off", see config.h), OWNER_AUTH_ERR_TRANSPORT,
 * OWNER_AUTH_ERR_INVALID_CREDS, OWNER_AUTH_ERR_LOCKED_OUT,
 * OWNER_AUTH_ERR_SERVER_DISABLED, or OWNER_AUTH_ERR_BAD_RESPONSE. */
int owner_auth_login(const dr_config *cfg, owner_auth_state *state,
                      char *error_out, unsigned long error_out_cap);

/* Up to this many caller-supplied extra headers may be passed to
 * owner_auth_call() - it adds exactly one more (Authorization) itself, into
 * a fixed-size local array, matching this door's no-malloc discipline. */
#define OWNER_AUTH_MAX_CALLER_HEADERS 6

/* Makes ONE authenticated admin-API call, with the documented login
 * lifecycle applied automatically:
 *   - if `state` holds no token yet, logs in first (owner_auth_login());
 *   - sends the call with "Authorization: Bearer <token>" prepended to
 *     `extra_headers` (do NOT pass your own Authorization header - this
 *     function always supplies it);
 *   - if the call comes back 401, re-logs in once and retries the SAME
 *     call exactly once (see owner_auth_should_retry());
 *   - a second 401 (or any login failure encountered while retrying) is
 *     reported, not retried again.
 *
 * `method`/`path_and_query`/`body`/`body_len`/`resp`/`sink`/`ctx` are
 * exactly http_request()'s own parameters, with ONE important difference
 * from a plain http_request() call: `sink`/`ctx` may be invoked across TWO
 * separate HTTP responses, not one, when the retry fires - first the
 * failed (401) attempt's body, then the retried attempt's body, both
 * through the SAME `ctx`, one full http_request() call after another (never
 * interleaved). A `sink` that accumulates into `ctx` (the shape
 * json_extract_string() needs) would otherwise end up holding BOTH bodies
 * concatenated after a retry, and a caller checking `ctx` for an "error"
 * field could find the stale 401 error text even after the retry
 * succeeded. `reset_ctx`, if non-NULL, is called with `ctx` exactly once,
 * immediately before the retried attempt's http_request() call (i.e.
 * between the failed first attempt and the second one) - an accumulating
 * caller should pass a function that clears its buffer back to empty.
 * Pass (void (*)(void *)) 0 if `sink`/`ctx` don't accumulate state (e.g. a
 * caller that only cares about `resp->status`, like `discard_sink`) or if
 * a leftover first-attempt body genuinely does not matter to this caller.
 *
 * `path_and_query` is the caller's responsibility to build (e.g. via
 * flow_build_archive_path()-style helpers), not something this function
 * derives.
 *
 * Only the AUTH-relevant statuses (401 after a failed retry, 429, 503)
 * are interpreted here and turned into a distinct outcome code; every
 * other status (200, 404, ...) is reported as OWNER_AUTH_OK with the real
 * status left in `resp->status` for the caller to interpret itself -
 * exactly like http_get()'s own "a 404 with a well-formed body is
 * HTTP_OK" philosophy.
 *
 * Returns OWNER_AUTH_OK, OWNER_AUTH_ERR_ARGS, OWNER_AUTH_ERR_TRANSPORT,
 * OWNER_AUTH_ERR_INVALID_CREDS, OWNER_AUTH_ERR_LOCKED_OUT, or
 * OWNER_AUTH_ERR_SERVER_DISABLED (the last three only when the lazy
 * login, or a mid-retry re-login, itself hits that outcome, OR when the
 * retried call's own final status is 401/429/503). */
int owner_auth_call(const dr_config *cfg, owner_auth_state *state,
                     const char *method, const char *path_and_query,
                     const char *body, unsigned long body_len,
                     const char * const *extra_headers, int extra_header_count,
                     http_response *resp,
                     int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
                     void *ctx,
                     void (*reset_ctx)(void *ctx));

/* ---- Pure decision logic (no I/O - unit-tested directly) ------------- */

/* Given the OUTCOME of one login HTTP exchange (http_request()'s own
 * return code, the HTTP status it reported, and the response body as a
 * NUL-terminated string), decides which OWNER_AUTH_* outcome it represents
 * and extracts the useful field:
 *   - http_rc != HTTP_OK (transport-level failure - connect refused, read
 *     error, malformed response, ...): OWNER_AUTH_ERR_TRANSPORT. `body` is
 *     not trusted or read in this case (it may be stale/unrelated to the
 *     failure).
 *   - status == 200: attempts json_extract_string(body, "token", ...); a
 *     non-empty extracted token is OWNER_AUTH_OK, anything else (key
 *     absent, not a string, malformed JSON, empty value) is
 *     OWNER_AUTH_ERR_BAD_RESPONSE - a 200 this module cannot use is
 *     treated as a clean failure, never a guess.
 *   - status == 401: OWNER_AUTH_ERR_INVALID_CREDS.
 *   - status == 429: OWNER_AUTH_ERR_LOCKED_OUT.
 *   - status == 503: OWNER_AUTH_ERR_SERVER_DISABLED.
 *   - anything else: OWNER_AUTH_ERR_BAD_RESPONSE (an HTTP status this
 *     module was not told to expect from this route - includes 400,
 *     which the real /admin/login route sends for a missing username/
 *     password; practically unreachable through owner_auth_login(),
 *     which already refuses empty credentials before any I/O, but
 *     classify_login() itself has no way to know that about a caller
 *     handing it a raw status/body pair directly, e.g. in a test).
 *
 * `token_out`/`token_out_cap` receive the token on OWNER_AUTH_OK, left as
 * "" on any other outcome (never partially filled - matches
 * json_extract_string()'s own contract). `error_out`/`error_out_cap`
 * (optional - pass (char *) 0 / 0 to skip) receive the server's "error"
 * field on any non-OK outcome where `body` has one; left as "" otherwise
 * or when extraction fails. */
int owner_auth_classify_login(int http_rc, int status, const char *body,
                               char *token_out, unsigned long token_out_cap,
                               char *error_out, unsigned long error_out_cap);

/* Whether owner_auth_call() should re-login and retry, given which attempt
 * number the admin call itself is on (1 = the first try) and the HTTP
 * status it just got back. Per the Token lifecycle ruling above: retry
 * fires ONLY on attempt 1's 401 (the token looked expired/revoked) - never
 * on a later attempt (a second 401 is a real credentials failure), and
 * never for 429/503 (retrying immediately after either would just fail
 * again for the same reason). Returns 1 to retry, 0 not to. */
int owner_auth_should_retry(int attempt, int status);

#endif /* DOORREPO_OWNER_AUTH_H */
