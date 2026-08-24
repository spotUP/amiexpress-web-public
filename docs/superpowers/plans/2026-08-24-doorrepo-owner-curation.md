---
date: 2026-08-24
topic: DoorRepo C door — owner-mode curation via the door server's admin API
tags: [doorrepo-c, doorserver, admin-api, curation, plan]
status: draft
---

# Plan: DoorRepo owner-mode curation

## Summary

Add a config-gated "owner mode" to the DoorRepo C door (`examples/doorrepo-c/`)
that logs in to the door server's admin API and lets a sysop, from inside the
door: approve/reject anonymous submissions, and edit a small set of catalog
fields. This is v1 of a larger curation surface the admin API exposes; most of
it is explicitly deferred (see "Scope" below). This is the highest-risk of
three parallel DoorRepo feature plans (siblings: an `.info`/access-level
editor claiming key `M`, an installed-doors list view claiming key `L` — do
not collide with those).

**The credential-storage tradeoff (Task 1) was escalated for explicit user
sign-off rather than resolved by guessing — see the ruling there.** The
security review of the new input surfaces (Task 7) still needs a second
pair of eyes during implementation review, the same way the door's four
existing vulnerability classes were found by adversarial review, not by
the original author.

## Global Constraints

- C89 strict (`-std=c89 -Wall -Wextra -pedantic`), no `stdint.h`, matches
  every other module in this door.
- Every new pure-logic function (JSON extraction, request-body building,
  field validation) goes in a module with no I/O, unit-tested the way
  `flow.c` already is — see `tests/` and `make test` (406 assertions today).
- Security discipline from `README.md`'s "Security" section applies to every
  new input: allowlist not denylist, byte-cap everything, validate
  server-supplied content before trusting it.
- Nothing here changes `http_get()`'s existing signature or behavior —
  archive downloads and catalog browsing must keep working exactly as today.
- `DoorRepo.cfg` already has a documented precedent for "absent config =
  feature off" (e.g., `Ansi=no` degrades gracefully) — owner mode follows the
  same rule: no `AdminUsername=`/`AdminPassword=` configured means the `O`
  key does not even appear in the footer, exactly like `V=Doc` is hidden for
  a doc-less door (`doorrepo.c` ~3605).

## Auth storage & flow — Task 1

**The real mechanism** (not a static key): `POST /api/door-repo/admin/login`
takes `{"username":"...","password":"..."}`, returns `{"token":"<JWT>",
"user":{...}}` on success, `401 {"error":"invalid credentials"}` on failure,
`429` if the account is locked out from repeated failures, `503` if the
server has no `DOORSERVER_JWT_SECRET` configured at all. The JWT is valid for
`TOKEN_TTL_SECONDS = 12 * 60 * 60` (12 hours — `amiexpress-doorserver/src/auth.ts`).
Every subsequent admin call needs `Authorization: Bearer <token>`.

**Decision: store username+password in `DoorRepo.cfg`, gated, with the risk
stated plainly — do not silently accept it as free.** Two new keys:

```
AdminUsername = spot
AdminPassword = <plaintext>
```

Both absent by default (commented out in `DoorRepo.cfg.example`, like every
other optional key). `AdminPassword` follows the SAME denylist-plus-quoting
treatment `DownloadDir`/`LogFile`/`RepoPath` already get in `config.c` (see
README's vulnerability class #1/#2) even though this value is never
interpolated into a shell command — the reason is different (it must not be
truncated or mis-parsed by the config line reader, not injection), but the
validation discipline this codebase already has for "a free-form string from
a config file" is the right starting point. `AdminUsername`/`AdminPassword`
are NEVER logged (`log_line()` calls near login must not print them, unlike
most of this door's other logging).

**RULING (user, explicit sign-off, not the controller's call to make
unilaterally — this is a real security tradeoff):** ship v1 against the
real login, storing username+password in `DoorRepo.cfg` per the design
above. The proper long-term answer — a scoped, revocable API-key primitive
distinct from the human admin login — is filed as a future, separate
project against `amiexpress-doorserver`, not blocking this plan.

**Token lifecycle**: login once, lazily, the first time owner mode is
entered in a session (not at door startup — most sysops running DoorRepo are
not curating every session). Hold the token in memory only, never written to
disk (no token-cache file — a 12-hour token surviving in `DownloadDir` after
the door exits is unnecessary exposure for a value that is cheap to
re-acquire). On any admin call returning `401`, re-login once automatically
(the token expired or was revoked server-side) and retry the call exactly
once; a second `401` after re-login is a real credentials failure, reported
to the sysop, not retried again.

## Scope (v1 vs. deferred) — Task 2

The admin API's ten actions (all under `/api/door-repo/admin/`, all
`requireAdmin`):

| Route | v1? | Why |
|---|---|---|
| `POST /login` | **yes** | prerequisite for everything below |
| `GET /submissions` | **yes** | the actual pending need: a sysop asked "how do I approve 3 uploaded doors" and had to use the web console |
| `POST /submissions/:id/approve` | **yes** | " |
| `POST /submissions/:id/reject` | **yes** | " |
| `PATCH /doors/:archiveName` | **yes, 3 fields only** (`name`, `description`, `category` — the three a sysop is most likely to want to fix from inside the door; the other 7 in `OVERRIDABLE_FIELDS` are deferred) | highest-value editing surface without building a 10-field form UI in C89 ANSI |
| `DELETE /doors/:archiveName/overrides/:field` | **yes, cheap bonus** | "undo my last edit" — trivial once PATCH exists (one more HTTP call, no new UI beyond a confirm) |
| `POST /doors/:archiveName/redescribe` | deferred | a preview-only action with no write; lower value from a door client that already shows the DIZ text directly (`A`=Archive, already in the base door) |
| `DELETE /doors/:archiveName` (hide) | deferred | destructive-adjacent (even though reversible), needs its own confirm UX and a `GET /hidden` restore screen to be a complete feature — a bigger unit of work than this plan's other pieces, better as its own follow-up plan |
| `POST /doors/:archiveName/restore` | deferred | pairs with hide above |
| `GET /hidden` | deferred | " |
| `GET /audit` | deferred | read-only, lowest urgency, and a 200-line audit log does not fit this door's list-screen pagination without new work |

## HTTP layer changes — Task 3

**Files:** Modify `http.h`, `http.c`.

**Interfaces:**
```c
/* Generalizes http_get(): any method, an optional request body, and
 * extra headers beyond Host/Connection/User-Agent (Authorization,
 * Content-Type). http_get() becomes a thin wrapper:
 *   http_get(cfg, path, resp, sink, ctx) ==
 *     http_request(cfg, "GET", path, (const char *) 0, 0,
 *                  (const char * const *) 0, 0, resp, sink, ctx)
 * so every existing caller and every existing test of http_get() needs
 * NO changes. */
int http_request(const dr_config *cfg, const char *method,
                  const char *path_and_query,
                  const char *body, unsigned long body_len,
                  const char * const *extra_headers, int extra_header_count,
                  http_response *resp,
                  int (*sink)(void *ctx, const unsigned char *buf, unsigned long len),
                  void *ctx);
```

- `extra_headers` is an array of already-formatted `"Name: value\r\n"`
  strings (caller builds `"Authorization: Bearer <token>\r\n"` and
  `"Content-Type: application/json\r\n"` this way) — matches this module's
  existing preference for the caller doing string assembly and `http.c`
  doing only transport, not a generic header-map abstraction that C89 has no
  good container for.
- `body`/`body_len`: when `body != NULL`, `http_request()` sends
  `Content-Length: <body_len>` and writes `body` after the headers, before
  reading the response — same buffered-write discipline `http_get()`
  already uses for the request line, just longer.
- Response handling (status line, headers, `Content-Length` framing, the
  byte-cap discipline) is **entirely unchanged** — reused as-is from
  `http_get()`'s existing internals, now shared by both entry points.
- New response byte cap for admin responses specifically: the login
  response, a submissions list, and a PATCH/approve/reject acknowledgment
  are all small JSON — cap the sink's accumulation buffer for admin calls at
  a fixed ceiling (propose 16 KB; `GET /submissions` returns up to 200 rows
  per its own `LIMIT 200`, comfortably under that with the fields used).
  This is the same "unbounded response body" defence class as vulnerability
  #4 in the README, applied to a new endpoint family.

**Test:** `tests/test-http.c` (existing suite) gains cases for
`http_request()` with a body and extra headers against a local test server
(the existing test harness likely already spins one up for `http_get()` —
reuse it), asserting the request line, headers, and body bytes sent are
exactly what was asked for.

## JSON handling — Task 4

**Files:** Create `json_lite.c`, `json_lite.h`. Pure, I/O-free, unit-tested
like `flow.c`.

This is a narrow, targeted extractor, not a general JSON parser — matching
this door's existing minimalist-parser ethos (`listtxt.c` reads six
positional pipe-delimited fields and ignores the rest; this does the JSON
equivalent: find named keys, ignore everything else, refuse to be confused
by nesting it does not need to understand).

**Interfaces:**
```c
/* Finds "key":"value" (a string field) anywhere in a flat or nested JSON
 * object and copies value into out (unescaped: \" \\ \/ \n \t \r \uXXXX
 * per the JSON spec's minimum — this door's own values never need more).
 * Returns 0 on success, non-zero if the key is absent, malformed, or
 * value would not fit outcap (never overruns; out is left as "" on
 * failure). Scans byte-by-byte, respects quoted strings (a key name
 * appearing inside an unrelated string value must not false-match) but
 * does NOT track object nesting depth — safe for this door's use because
 * every key it looks for (token, id, archiveName, error, ok) is unique
 * within the one response it's read from. */
int json_extract_string(const char *json, const char *key,
                         char *out, unsigned long outcap);

/* Same contract for a bare integer/numeric field (e.g. an httpish "ok":true
 * boolean read as 0/1, or ...). Returns 0/nonzero the same way. */
int json_extract_bool(const char *json, const char *key, int *out);

/* Cursor-based scanner for a top-level JSON array of objects (GET
 * /submissions' `{"rows":[{...},{...}]}` shape). Call repeatedly with
 * the same `*cursor` (start it at 0); each call returns a pointer to the
 * START of the next {...} object in the array (respecting brace nesting
 * so a nested "derived":{...} object inside a row does not end the row
 * early) and its length, and advances *cursor past it. Returns 0 and
 * sets *obj_start/*obj_len when an object was found, non-zero at the end
 * of the array or on malformed input. The caller then runs
 * json_extract_string()/json_extract_bool() against just that object's
 * slice for id/archiveName/size/md5/note/status — "derived" is never
 * parsed (opaque, skipped), v1 has no use for it. */
int json_next_array_object(const char *json, unsigned long *cursor,
                            const char **obj_start, unsigned long *obj_len);
```

- **Malformed/truncated input**: every function above returns a clean
  failure code, never reads past a NUL terminator, never loops unbounded on
  input that never produces a closing quote/brace (a hard scan-length cap
  derived from the caller's known buffer size, passed in or implied by
  `strlen()` on a NUL-terminated buffer — since the admin response buffer
  from Task 3 is itself capped at 16 KB and NUL-terminated by the sink, this
  is bounded by construction).
- **Building the login request body**: a separate small function,
  `json_build_login_body(char *out, unsigned long outcap, const char
  *username, const char *password)`, JSON-escapes username/password (at
  minimum: `"` and `\` — a password containing either must not break the
  request or, worse, let its content escape the JSON string and be
  interpreted as JSON structure) and writes `{"username":"...","password":"..."}`.
  Same signature style as `flow_build_info_content()` — return the byte
  count or -1 if it would not fit.

**Test cases** (all pure, no network): well-formed login response → token
extracted; token key absent → clean failure; truncated response (cut
mid-value) → clean failure, not a crash or infinite scan; a submissions
array with 0/1/3 rows, including one with a nested `derived` object, → each
row's id/archiveName/size/md5/note extracted correctly and the cursor lands
correctly on the object AFTER a nested-brace row; a username/password
containing `"` and `\` → escaped correctly in the built request body and
round-trips through `json_extract_string` reading the SAME escaping back
out (proves the escape/unescape pair is actually inverse, not just each
"looks right" in isolation).

## UI: owner mode — Task 5

**Files:** Modify `doorrepo.c`.

**Key claimed: `O`** (Owner mode — free per the shared keybinding survey;
does not collide with `M` (sibling info-editor plan) or `L` (sibling
installed-list plan)). Shown in the entry-detail footer ONLY when
`cfg->admin_username[0] != '\0'` (i.e., `AdminUsername=` is configured) —
same conditional-footer pattern as `V=Doc` (`doorrepo.c` ~3605-3610).

Pressing `O`:
1. If no cached token yet this session, run the login flow (Task 1) via
   `http_request()`. A failure (bad credentials, `429` lockout, `503`
   disabled) is reported in place (reusing the existing "Press any key to
   return" pattern `install_door()`/`uninstall_door()` already use for
   error reporting) and does NOT enter owner mode.
2. On success, enter a **new, separate screen** — the submissions queue —
   rather than adding more keys to the already-dense entry-detail switch.
   This matches how `browse_loop()` (`doorrepo.c` ~3636) is already a
   distinct screen/loop from the entry-detail view with its OWN local
   keyspace (its `S` means "Search", the entry-detail view's `S` means
   "Strip" — this codebase already reuses letters across distinct
   screens, so a fresh local keyspace for the submissions screen is
   consistent with existing precedent, not a new pattern).

**Submissions queue screen** (new function `submissions_loop()`,
structurally modeled on `browse_loop()`'s plain-line-list pattern — reuse
its pagination approach, do not build a second ANSI-panel UI when the plain
list-and-select style already works and this is an admin-only, low-traffic
screen where full-screen ANSI polish is not worth the extra code):

```
Submissions (pending):
  1) SOMEDOOR.LHA        41 KB  note: "great new door" md5 verified
  2) OTHERDOOR.LHA       12 KB  note: (none)
  3) THIRDDOOR.LHA      108 KB  note: "please add"

Selection (number), [A]pprove [R]eject [Q]uit:
```

Selecting a number shows the one submission's full detail (id, archive
name, size, md5, note — matches what `GET /submissions` already returns)
and offers `[A]pprove [R]eject [B]ack`. Approve calls `POST
/submissions/:id/approve` with no body. Reject prompts for a reason (a new
generic `ui_text_prompt()` helper, Task 6) then calls `POST
/submissions/:id/reject` with `{"reason":"..."}`. Both show the server's
response (`ok:true` or an error) before returning to the list, and the list
is **re-fetched** after either action (not locally mutated) so a second
curator's concurrent action is reflected, not silently overwritten.

**Field-edit entry point**: from the existing entry-detail view (the
regular catalog browse, NOT inside owner mode's submissions screen), when
owner mode is active, a new footer option `[O]wner: Edit` becomes available
on the SAME `O` key while already in owner mode and viewing a catalog
entry — pressing `O` a second time, on an entry (not from the top-level
browse), opens a small field-edit menu:

```
Edit SOMEDOOR.LHA
  [N]ame:        SomeDoor v2
  [D]escription: A great new door
  [C]ategory:    Utility
  [X] Revert one field to the original
  [Q]uit without changes
```

Each of `N`/`D`/`C` opens `ui_text_prompt()` pre-filled with the current
value, Enter confirms, and the door sends ONE `PATCH` per field changed
(not batched — simpler error handling, and the admin API already accepts
a single-field PATCH body just as well as a multi-field one). `[X]` prompts
which field to revert (a short menu of the fields THIS door has ever
edited this session, or just N/D/C always offered) and calls `DELETE
/doors/:archiveName/overrides/:field`.

**RULING (controller):** accept this plan's default — `O` double-purposes
(enter-mode from the top-level browse, edit-current-entry when already in
owner mode and viewing an entry), disambiguated by context. Keeps the
footer from growing a second line; low cost to split into distinct keys
later if it proves confusing in the `make live`/emulator pass.

## New shared UI helper — Task 6

**Files:** Modify `doorrepo.c` (or extract to a new `ui_prompt.c` if the
file is already large — check current line count first; if it is near a
size limit, prefer the new file).

```c
/* Generic single-line text input, modeled directly on ui_filter_prompt()'s
 * key-handling loop (doorrepo.c ~2201) but parameterized instead of bound
 * to a filter's ui_view. `initial` pre-fills the buffer (empty string for
 * a fresh prompt); `mask` non-zero echoes '*' instead of the typed
 * character (for AdminPassword entry, if this door ever prompts for it
 * interactively rather than only reading it from DoorRepo.cfg — v1 reads
 * config only, but the helper supports masking from day one since a
 * password-adjacent prompt is a predictable near-term ask). Returns 1 if
 * ENTER confirmed (buf holds the result), 0 if the prompt was cancelled
 * (a new escape path this door does not currently have anywhere -
 * needs a defined cancel key, e.g. CTRL-C/3, since this door's README
 * explicitly says a lone ESC is not safely detectable). */
static int ui_text_prompt(ansi_buf *b, char *frame, long framecap,
                          const ui_geometry *g, const char *title,
                          const char *initial, int mask,
                          char *buf, unsigned long bufcap);
```

**Test**: this is UI (not pure logic), so it is exercised via `make
live`/emulator smoke test (Task 8), not a native unit test — consistent
with how this door's other ANSI screen functions (`ui_confirm`,
`ui_filter_prompt` itself) have no native unit tests today; only the pure
logic beneath them does.

## File changes summary — Task 7 (security review)

| File | Change |
|---|---|
| `config.h`, `config.c` | `AdminUsername`, `AdminPassword` keys, same validation-and-default-on-invalid pattern as every other key; never logged |
| `http.h`, `http.c` | `http_request()` (Task 3); `http_get()` becomes a wrapper |
| `json_lite.h`, `json_lite.c` (new) | Task 4 |
| `doorrepo.c` | `O` key, `submissions_loop()`, field-edit menu, `ui_text_prompt()` (Task 5/6), footer text |
| `DoorRepo.cfg.example` | document the two new keys, commented out, with the same "invalid = default, does not stop the door" note the file already gives every other key |
| `tests/test-json-lite.c` (new) | Task 4's test cases |
| `tests/test-http.c` | Task 3's new cases |

**Security review checklist for this plan specifically** (apply the
README's existing four-vulnerability-class discipline to what's new here,
not a fresh ad-hoc pass):
- `AdminPassword`/`AdminUsername` from `DoorRepo.cfg`: never interpolated
  into a shell command (this is the one config value class in this door
  that ISN'T shell-adjacent) — the risk here is disclosure (a plaintext
  file, a log line, an error message echoing it back), not injection.
  Audit every `ae_put()`/`log_line()` call on the login path for an
  accidental echo of the password.
- The PATCH field values a sysop TYPES (via `ui_text_prompt()`): these
  become a JSON string body sent to the server — `json_build_login_body()`
  style escaping (Task 4) must be reused/generalized for these too, not
  just the login body, or a name/description containing `"` breaks the
  request.
- The `reject` reason a sysop types: same escaping requirement.
- Server-supplied content now flowing into new `ae_put()` calls (a
  submission's `note`, an error message from the admin API): apply the
  same "control bytes/ANSI in server-supplied text are accepted, not
  stripped" deliberate policy the README already states for catalog
  rows — for CONSISTENCY, not because it was re-derived as newly safe;
  say so explicitly in the code comment the way the README does.
- `json_lite.c`'s scan functions: the length-cap and no-unbounded-loop
  properties are the primary security property here (this is the
  "unbounded response body" vulnerability class, replayed against a new
  parser) — this is the single most important thing an adversarial
  reviewer should re-check before this ships, matching how the original
  four vulnerability classes were each found this same way.

## Testing summary — Task 8

- `make test`: `json_lite` and `http_request` cases added to the native
  suite, run alongside the existing 406 assertions.
- `make live`/emulator pass, scripted end to end against the REAL door
  server (not a mock): configure `AdminUsername`/`AdminPassword` for a
  real test admin account, enter owner mode (`O`), confirm login succeeds,
  open the submissions queue, approve ONE real pending submission (or a
  disposable test submission created for this purpose), verify via `GET
  /doors/:archiveName` or the door server's own audit log
  (`amiexpress-doorserver`'s `/admin/audit`, read from the web console —
  not from this door, since audit reading is deferred) that the approval
  actually landed server-side, not just that the door printed success.
  Repeat for one PATCH edit (change `description`, verify server-side) and
  one revert (Task 5's `[X]`).
- This satisfies this project's own "a feature that compiles but is
  unreachable is not done" rule — an emulator run that never actually logs
  in, approves, or edits anything for real is not sufficient sign-off.

## Open questions — RESOLVED

1. **Credential storage**: user explicitly approved v1 against real
   username+password in `DoorRepo.cfg` (see Task 1 ruling above).
2. **`O` key double-purpose**: controller-ruled, accept plan default (see
   Task 5 ruling above).

Both rulings recorded in-place above; nothing left open before
implementation.
