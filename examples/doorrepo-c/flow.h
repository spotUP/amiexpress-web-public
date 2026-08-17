/* flow.h - pure decision logic extracted from the DoorRepo door (doorrepo.c)
 * so it is testable without blessed/door/network dependencies.
 *
 * Every function here is a plain, deterministic transform over its
 * arguments: no I/O, no aedoor.h, no http.h, no netio.h, no global state.
 * tests/test_flow.c links only this file (plus <string.h>) to exercise it.
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 */

#ifndef DOORREPO_FLOW_H
#define DOORREPO_FLOW_H

/* ---- Pagination maths ---- */

typedef struct {
    unsigned long start_index;  /* 0-based index of the first row shown on this page */
    unsigned long row_count;    /* rows actually shown on this page (0 for an empty catalog) */
    unsigned long page_count;   /* total number of pages (0 for an empty catalog) */
    unsigned long page_number;  /* the page actually returned, 1-based (0 if page_count == 0) */
} flow_page_info;

/* Computes page boundaries for `page_number` (1-based). Out-of-range values
 * are CLAMPED to the nearest valid page rather than treated as an error, so
 * a caller driving "N" past the last page, "P" before the first, or a
 * user-typed page number outside [1, page_count] never has to special-case
 * out-of-bounds input itself - it just re-displays the clamped page.
 * page_size < 1 is treated as 1, defensively (dr_config already range-
 * validates PageSize to 1-9999, so this is a belt-and-braces guard, not the
 * primary defense). total_rows == 0 yields page_count == 0, row_count == 0,
 * page_number == 0, start_index == 0. */
void flow_compute_page(unsigned long total_rows, int page_size,
                        int page_number, flow_page_info *out);

/* ---- Download verification retry state machine ---- */

typedef enum {
    FLOW_VERIFY_OK = 0,     /* digest matched: safe to keep/extract */
    FLOW_VERIFY_RETRY = 1,  /* mismatch on the first attempt: delete, retry once */
    FLOW_VERIFY_ABORT = 2   /* mismatch persisted past the first retry: stop */
} flow_verify_outcome;

/* `attempt_number` is 1 for the first download, 2 for the one retry this
 * client ever makes (docs/DOOR-REPO-API.md section 9: "retry the download
 * once ... if the retry also mismatches, treat that as fatal"). Any match,
 * regardless of attempt number, is FLOW_VERIFY_OK. A mismatch on attempt 1
 * is FLOW_VERIFY_RETRY; a mismatch on attempt 2 (or any later attempt,
 * defensively - this client's driver never actually calls a third time) is
 * FLOW_VERIFY_ABORT. */
flow_verify_outcome flow_next_verify_outcome(int attempt_number, int digest_matches);

/* ---- Query-string / URL-path construction ---- */

/* Percent-encodes `in` per RFC 3986's unreserved set (ALPHA / DIGIT / "-"
 * "." "_" "~" pass through unencoded; every other byte becomes "%XX" with
 * uppercase hex digits). Used for the `?q=` search term, which can contain
 * spaces, "&", "=", or other bytes that would otherwise corrupt the query
 * string it is embedded in. Returns the encoded length, or -1 if the result
 * (including the terminating NUL) would not fit `outsize` - never
 * truncates silently. `in`, `out` NULL or `outsize` 0 is also -1. */
int flow_url_encode(const char *in, char *out, unsigned long outsize);

/* Builds "?type=<type_filter>&q=<url-encoded search_term>" into `out`,
 * omitting either half when the corresponding filter is NULL or empty, and
 * writing an empty string (not even a bare "?") when both are empty - a
 * caller can always append the result directly to a base path. Per
 * docs/DOOR-REPO-API.md section 8, `type_filter` (a `doorType` value like
 * XIM/DD/REXX) is a plain alphanumeric token and is copied through
 * UNENCODED; `search_term` is free text and is always run through
 * flow_url_encode() first. Returns the output length, or -1 if it would
 * not fit `outsize`. */
int flow_build_list_query(char *out, unsigned long outsize,
                           const char *type_filter, const char *search_term);

/* Builds "<base_path>/archive/<archive_name>" into `out`. Deliberately does
 * NOT percent-encode archive_name: docs/DOOR-REPO-API.md section 5 states
 * "No percent-encoding is required" for any character found in real
 * catalog archive names (including "&", "$", "^", "!", "~") - they are
 * valid unreserved/sub-delim path-segment characters, or are accepted
 * unencoded by this server in practice even where the strict grammar
 * would technically require encoding (`^`). Percent-encoding is "always
 * accepted too", never required, so encoding here would only add risk
 * (a wrong encoding table) for no behavior change. Plain bounded
 * concatenation. Returns the output length, or -1 if it would not fit
 * `outsize`. */
int flow_build_archive_path(char *out, unsigned long outsize,
                             const char *base_path, const char *archive_name);

/* Builds a local filesystem path for a downloaded archive:
 * "<download_dir><archive_name>", inserting a "/" separator between them
 * only when `download_dir` does not already end in a path separator.
 * AmigaDOS device/assign names conventionally end in ":" (e.g. "T:",
 * "RAM:") and directories are conventionally given with a trailing "/"
 * (e.g. "Work:Doors/Downloads/") - both of those already concatenate
 * correctly with no separator; a bare directory name with neither
 * (e.g. "Work:Doors/Downloads") would otherwise glue directly onto the
 * archive name and produce a wrong path, so this function detects the
 * bare case and inserts "/". Returns the output length, or -1 if it
 * would not fit `outsize`. */
int flow_build_local_path(char *out, unsigned long outsize,
                           const char *download_dir, const char *archive_name);

/* ---- Shell-injection defense: allowlist for LhaCommand, denylist for
 * everything else that lands inside a double-quoted shell argument ----
 *
 * Real, demonstrated vulnerability this exists to close: doorrepo.c
 * builds an lha-extraction system() command line by sprintf()-ing
 * cfg->lha_command, a local file path (built from cfg->download_dir),
 * and a server-supplied archive name into a string. Two distinct rounds
 * of live exploitation proved a DENYLIST is the wrong primitive for a
 * value that sits OUTSIDE any quoting (cfg->lha_command, unquoted at the
 * front of the command line):
 *   Round 1: DownloadDir = INJECTDIR" ; touch /tmp/PWNED_BY_DOORREPO ; echo "
 *            broke out of the surrounding double quotes.
 *   Round 2 (after Round 1's denylist shipped): LhaCommand =
 *            "touch /tmp/PWNED_HASH_COMMENT #" - "#" was not yet in the
 *            denylist, and even after adding it, cfg->lha_command is
 *            interpolated UNQUOTED, so a trailing "#" comments out the
 *            rest of the shell command line regardless of what the
 *            denylist rejects - a bypass a denylist can never fully
 *            close, because it always trails the discovery of the next
 *            special character (the controller's ruling after Round 2:
 *            "you have now lost that game twice").
 *
 * The fix is two different primitives for two different roles:
 *   - flow_is_valid_command_token() (ALLOWLIST): LhaCommand is a single
 *     command name/path with no shell semantics at all once restricted
 *     to an allowlist that cannot express ANY shell metacharacter,
 *     comment marker, or whitespace - there is no denylist entry to
 *     forget, because nothing is permitted except what is explicitly
 *     named. Used at config.c (parse time) AND doorrepo.c (again,
 *     immediately before the system() call - defense in depth against a
 *     future code path that sets cfg->lha_command without going through
 *     config_load()), plus the command is ALSO quoted in the system()
 *     string as a second, independent layer (see doorrepo.c).
 *   - flow_contains_forbidden_shell_char() (DENYLIST, "#" added after
 *     Round 2): still defensible for DownloadDir/LogFile/RepoPath and
 *     the server-supplied archive name, because ALL FOUR of those sit
 *     INSIDE double quotes in the command string - a denylist of the
 *     bytes that can break out of or act specially within a double-quoted
 *     shell argument is a materially narrower, more defensible claim than
 *     "safe for an unquoted, unrestricted command line" ever was. */

/* Returns non-zero if `value` contains a byte that must never be
 * interpolated unescaped into a DOUBLE-QUOTED shell argument or a raw
 * HTTP request line: quote/escape characters that could break out of the
 * quoting ("'`\), shell metacharacters that chain, redirect, substitute,
 * or comment out commands (;|&<>#), and CR/LF (which could inject an
 * extra line into a raw HTTP request or a config-derived shell command).
 * Deliberately NOT used for cfg->lha_command, which sits UNQUOTED in the
 * command line - see flow_is_valid_command_token() for that value's
 * allowlist instead; a denylist cannot defend an unquoted position (see
 * the block comment above). None of these bytes are legal in a real
 * AmigaDOS path or URL path segment, so nothing legitimate is ever
 * rejected by this for DownloadDir/LogFile/RepoPath/archive names. */
int flow_contains_forbidden_shell_char(const char *value);

/* Returns 1 if `value` is safe to use as LhaCommand: a single command
 * name or path with NO shell semantics whatsoever. Every byte must be in
 * the allowlist `[A-Za-z0-9_.:/-]` (AmigaDOS paths legitimately use ':'
 * for a device/assign, e.g. "Work:", and '/' for a directory separator,
 * e.g. "c/lha") - ALL whitespace is rejected (so a multi-token value like
 * "7z x" is refused outright, not silently mis-parsed into "7z" plus a
 * dropped argument), and so is every shell metacharacter, quote, and
 * comment marker, because none of them appear in the allowlist at all.
 * `value` must also be non-empty and fit within `maxlen` bytes including
 * the terminating NUL (pass sizeof(dr_config.lha_command)). Returns 0 for
 * NULL, empty, too long, or containing any byte outside the allowlist.
 *
 * A single-token allowlist cannot express "7z x" (a command plus a
 * fixed argument) - configuring an alternate archiver that needs its own
 * arguments is consequently unsupported by this door as shipped. See the
 * task-6 report's fix-round-3 section for the LhaArgs alternative
 * considered and deliberately not built without being asked first. */
int flow_is_valid_command_token(const char *value, unsigned long maxlen);

/* ---- Catalog cache-reuse decision ---- */

/* Returns 1 if a previously cached catalog (whose list.txt header carried
 * `cached_revision`) may be reused instead of re-fetching the whole file,
 * 0 if a fresh fetch is required. Reuse requires BOTH strings to be
 * non-empty and byte-equal, AND `server_revision` must not be the literal
 * string "unknown". docs/DOOR-REPO-API.md section 7's "Local development
 * caveat" documents that a server with no baked-in git SHA always reports
 * exactly "unknown" - two DIFFERENT catalogs on two such servers (or the
 * same server across a real content change made without rebuilding the
 * image) would both report "unknown" and satisfy a naive string-equality
 * check, causing a stale cache to be trusted forever. Treating "unknown"
 * as always-stale is conservative (one extra fetch per run against a dev
 * server) rather than silently wrong against one. */
int flow_should_use_cache(const char *cached_revision, const char *server_revision);

/* ---- Catalog row cap ---- */

/* Returns the number of rows to actually store, given the list.txt
 * header's declared row count and a hard capacity limit:
 * min(declared_count, cap). Does not itself decide whether to warn the
 * caller - see flow_declared_count_exceeds_cap(). */
unsigned long flow_effective_row_count(unsigned long declared_count, unsigned long cap);

/* Returns non-zero if `declared_count` (the list.txt header's <count>
 * field) is larger than `cap` - the caller should surface a clear message
 * that only the first `cap` rows are usable this run. */
int flow_declared_count_exceeds_cap(unsigned long declared_count, unsigned long cap);

#endif /* DOORREPO_FLOW_H */
