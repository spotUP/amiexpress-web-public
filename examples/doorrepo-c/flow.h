/* flow.h - pure decision logic extracted from the DoorRepo door (doorrepo.c)
 * so it is testable without blessed/door/network dependencies.
 *
 * Almost every function here is a plain, deterministic transform over its
 * arguments: no I/O, no aedoor.h, no http.h, no netio.h, no global state.
 * The one deliberate exception is flow_read_door_info(), a thin fopen/
 * fgets wrapper kept here (rather than doorrepo.c) so its line-by-line
 * parsing logic sits next to flow_build_info_content(), the writer whose
 * exact format it has to match - see that function's comment for why.
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

/* ---- List navigation ----
 *
 * Where a navigation key moves the selection. Pure arithmetic, extracted so
 * the browser can apply it from TWO places without the two drifting: the
 * ordinary key handler, and the input-coalescing drain that coalesces keys
 * the user has already typed (see doorrepo.c's browse loop). */

#define FLOW_NAV_NONE 0
#define FLOW_NAV_UP   1
#define FLOW_NAV_DOWN 2
#define FLOW_NAV_PGUP 3
#define FLOW_NAV_PGDN 4
#define FLOW_NAV_HOME 5
#define FLOW_NAV_END  6

/* Returns the new selection. `count` is how many rows the filtered view has
 * and `page` how many fit on screen. Clamps at both ends rather than
 * wrapping, and an empty view always selects 0. FLOW_NAV_NONE returns the
 * selection unchanged, so a caller can hand it any key it likes. */
unsigned long flow_nav_target(int action, unsigned long selected,
                              unsigned long count, unsigned long page);

/* Re-anchors a scrolled list's selection/window after the row set behind it
 * changes size out from under the cursor - a filter narrowing the view, or
 * (installed_loop_ansi()'s case) an uninstalled row disappearing from an
 * install-status-filtered one. Distinct from flow_nav_target(): that one
 * only repairs a stale `selected` when the NEXT navigation key arrives (see
 * nav_repairs_a_selection_left_past_the_end in tests/test_flow.c); this one
 * is for the caller to apply immediately, right after the mutation, so the
 * very next dereference of `view.index[selected]` is already safe rather
 * than depending on another pass of the render loop happening first.
 *
 * Mirrors DOORMAN's clampSelection() (Doors/door-manager/repo-view-helpers.ts)
 * plus its scroll-follow half: without the first half, uninstalling the
 * LAST row currently in view leaves `*selected` one past the new end (see
 * InstalledView.refresh()'s comment, Doors/door-manager/app.ts:627-628);
 * without the second, `*top_index` can be left pointing past the new end of
 * the list too, once `*selected` has been pulled back under it.
 *
 * `*selected` and `*top_index` are updated in place. `count` is the new
 * (post-mutation) row count of the view; `visible_rows` is how many rows
 * fit on screen (0 is tolerated and treated as "no scroll window to keep
 * in sync", not a divide/underflow hazard). A NULL `selected` or
 * `top_index` is a no-op. */
void flow_clamp_view(unsigned long *selected, unsigned long *top_index,
                      unsigned long count, unsigned long visible_rows);

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

/* Same, for "<base_path>/diz/<archive_name>" - the per-entry FILE_ID.DIZ
 * endpoint. It exists because list.txt collapses newlines to spaces by
 * design, so multi-line DIZ art cannot be recovered from a catalog row;
 * see docs/DOOR-REPO-API.md. */
int flow_build_diz_path(char *out, unsigned long outsize,
                        const char *base_path, const char *archive_name);

/* Same, for "<base_path>/files/<archive_name>" - the archive contents
 * listing ("FILES|<count>|<junk>" then "<size>|<junk>|<path>" per line). */
int flow_build_files_path(char *out, unsigned long outsize,
                          const char *base_path, const char *archive_name);

/* Same, for "<base_path>/doc/<archive_name>" - the door's own documentation
 * as raw bytes (Latin-1, control bytes intact). */
int flow_build_doc_path(char *out, unsigned long outsize,
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

/* ---- Install verdict ----
 *
 * Whether an install may proceed, decided from three INDEPENDENT signals
 * rather than the archiver's word alone:
 *
 *   extract_ok      - the archiver reported success. The weakest signal of
 *                     the three, and the only one that used to be trusted:
 *                     under this project's 68K emulator the door's system()
 *                     returned 0 without running anything, so every install
 *                     "succeeded" into a directory that was never created.
 *   program_readable- the file LOCATION is about to name can be opened.
 *                     Cannot tell "missing" from "protected": TELSER40.LHA
 *                     extracts bin/telser with Amiga protection bits that
 *                     become a Unix mode with no read permission.
 *   listed_present  - how many of `listed_checked` files the repository's
 *                     listing names were found on disk afterwards. This is
 *                     what separates the two cases above: an unreadable
 *                     program among readable siblings is a protection-bit
 *                     quirk, an unreadable program with NO sibling present
 *                     means nothing was unpacked at all.
 *
 * listed_checked == 0 means no census was taken (no listing, or no row
 * worth testing) - which is not the same as a census that came back empty,
 * and never causes a refusal on its own.
 */
#define FLOW_INSTALL_OK                        0
#define FLOW_INSTALL_WARN_NO_LISTING           1
#define FLOW_INSTALL_WARN_PROGRAM_UNREADABLE   2
#define FLOW_INSTALL_WARN_ARCHIVER_ERROR       3
#define FLOW_INSTALL_REFUSE_ARCHIVER_AND_MISSING 4
#define FLOW_INSTALL_REFUSE_NOTHING_EXTRACTED    5

int flow_install_verdict(int extract_ok, int have_listing, int program_readable,
                         int listed_checked, int listed_present);

/* Builds the archiver command line that unpacks `archive_path` into
 * `dest_dir`, in the spelling `amiga_form` selects.
 *
 * The two targets need DIFFERENT shapes and there is no wording that works
 * on both. AmigaDOS LhA takes the destination as a third argument
 * ("LhA x foo.lha Doors:MYDOOR/"), while Unix lha reads that same third
 * argument as a MEMBER NAME FILTER and extracts nothing at all (verified on
 * this host: exit 1, empty destination), so the native build has to use
 * lha's own "xw=<dir>" form.
 *
 * Every interpolated value is wrapped in double quotes, and a value that
 * itself contains a double quote is REFUSED rather than escaped: quoting
 * rules differ between /bin/sh and the AmigaDOS shell, and a door has no
 * business trying to be right about both. Catalog archive names are
 * server-supplied, so this is the boundary where that matters.
 *
 * Returns the command length, or -1 if any argument is missing, carries a
 * double quote, or the result would not fit `outsize`. On -1 nothing
 * usable is left in `out`. */
int flow_build_extract_command(char *out, unsigned long outsize,
                                const char *lha_command,
                                const char *archive_path,
                                const char *dest_dir,
                                int amiga_form);

/* Builds the quarantine path a mismatching download is kept under when
 * KeepFailedDownloads is on: "<local_path>.bad".
 *
 * Why the door keeps such a file at all: a checksum mismatch is the one
 * failure whose cause cannot be worked out from the log line it writes. The
 * digest tells you the bytes were wrong, not HOW - and the bytes are the
 * only thing that answers that. A real case on this project's own BBS
 * (-D-CALC.LHA, twice, same wrong digest, while the server, the network and
 * the same binary all verified clean elsewhere) was unresolvable precisely
 * because the door had already deleted the evidence.
 *
 * Off by default, because a door that silently keeps corrupt archives on a
 * sysop's disk is worse than one that discards them.
 *
 * Returns the output length, or -1 if it would not fit `outsize`. */
int flow_build_bad_path(char *out, unsigned long outsize, const char *local_path);

/* Builds the temporary name a command config is written under before being
 * renamed into place: "<info_path>.new".
 *
 * Why the install writes via a temporary at all: this server caches the
 * BBSCmd directory and revalidates it on the directory's MTIME, and a
 * directory's mtime changes when a file is CREATED, not when it is later
 * filled in. Writing straight to <CMD>.info therefore publishes an empty
 * config, and a command typed in the window before it is closed makes the
 * BBS reload the directory, find nothing useful, and mark itself fresh -
 * after which the finished content never triggers another reload and the
 * door stays invisible until a restart. Renaming a completed file in makes
 * the directory change at the moment the CONTENT appears.
 *
 * Returns the output length, or -1 if it would not fit `outsize`. */
int flow_build_info_temp_path(char *out, unsigned long outsize, const char *info_path);

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

/* ---- Path-traversal defense (CWE-22): archive filenames and DownloadDir ----
 *
 * Real, demonstrated vulnerability this pair exists to close, distinct
 * from the shell-injection defense above: `entry->archive` (parsed
 * straight out of a server-controlled `list.txt` row) reached
 * flow_build_local_path() and then fopen(local_path, "wb") guarded ONLY
 * by flow_contains_forbidden_shell_char(), whose denylist contains no
 * '/', '\\', or ':' at all - a catalog row named
 * "../../../../../../../tmp/doorrepo_traversal_out/PWNED_TRAVERSAL.lha"
 * wrote a file OUTSIDE DownloadDir, logged as DOWNLOAD OK. This matters
 * more than an ordinary supply-chain concern because THIS DOOR SPEAKS
 * PLAIN HTTP BY DESIGN (docs/DOOR-REPO-API.md section 1 - deliberate,
 * for classic Amiga TCP stacks with no practical TLS story): an attacker
 * does not need to compromise the repo's git history, only the network
 * path between the door and bbs.uprough.net, to rewrite list.txt and
 * choose where this client writes a file. On the real AmigaDOS target a
 * BARE '/' is itself a parent-directory marker (unlike Unix, where only
 * ".." is), so "//S/Startup-Sequence" is a plausible traversal primitive
 * there with no ".." substring anywhere in it.
 *
 * Shell-safety and filename-safety are DELIBERATELY SEPARATE predicates,
 * not merged into one denylist: a value can be perfectly filename-safe
 * yet shell-unsafe (a real archive name containing "$"), or perfectly
 * shell-safe yet filename-unsafe (a name containing "/", none of which
 * appears in flow_contains_forbidden_shell_char()'s denylist at all) -
 * conflating the two concerns into one function is exactly how this gap
 * survived two earlier fix rounds that only ever checked shell-safety. */

/* Returns 1 if `name` is safe to use as a single, bare filename component
 * - never a path - when building a local download path
 * (flow_build_local_path()) on ANY platform this client might run on.
 * Rejects: empty; a leading '.' (never a real catalog archiveName, and
 * refusing it outright costs nothing); any '/' (Unix separator AND, when
 * leading, an AmigaDOS parent-directory marker); any '\\' (Windows-shaped,
 * defense in depth); any ':' (AmigaDOS device/assign separator - a name
 * containing one could target an arbitrary volume); any ".." substring
 * anywhere (a traversal primitive regardless of what surrounds it); and
 * any control byte (0x00-0x1F or 0x7F). Permits every other byte,
 * INCLUDING high-bit Latin-1 (0x80-0xFF) and ordinary catalog punctuation
 * ('!', '$', '&', '^', '~', ...) - docs/DOOR-REPO-API.md section 5
 * documents real, current rows using all of those (BR&IB20.LHA,
 * 5D^AMU20.LHA), and this predicate must not reject them: it defends
 * against PATH structure, not against characters that are merely
 * shell-unsafe (that is flow_contains_forbidden_shell_char()'s job, a
 * separate concern applied separately). */
int flow_is_safe_archive_filename(const char *name);

/* Returns non-zero if `value` contains a ".." substring anywhere - a
 * directory-traversal primitive independent of which separator (if any)
 * surrounds it. Applied to DownloadDir/LogFile/RepoPath ALONGSIDE, not
 * instead of, flow_contains_forbidden_shell_char() (a value can be free
 * of every shell metacharacter and still traverse, e.g. "T:../../S/"
 * contains none of the denylisted shell bytes at all). Deliberately a
 * narrower, substring-only check rather than the full allowlist used for
 * archive filenames: DownloadDir/LogFile/RepoPath legitimately need '/'
 * and ':' (AmigaDOS separators an archive filename must never contain),
 * so they get this narrower rule instead of
 * flow_is_safe_archive_filename()'s stricter one. */
int flow_contains_dotdot_segment(const char *value);

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

/* ---- Archive download byte ceiling ----
 *
 * Real, demonstrated vulnerability this exists to close: nothing bounded
 * the TOTAL bytes a download_sink()/catalog_sink() callback would write
 * to disk - the catalog's own row cap (MAX_CATALOG_ROWS) and the
 * archive's own declared archiveSize were both descriptive metadata,
 * never enforced against what the server actually sent. A list.txt
 * response declaring "<count>=1" followed by megabytes of junk wrote
 * every byte to the cache file before the row cap ever mattered
 * (confirmed live: 20,971,596 bytes for exactly that shape); an archive
 * row declaring archiveSize=100 streamed 10 MiB to disk and logged
 * DOWNLOAD OK. Severity is higher on the real target than these numbers
 * suggest: the default DownloadDir is "T:", conventionally a RAM disk on
 * AmigaDOS - on a 68020 with a few megabytes of RAM this is memory
 * exhaustion, not merely a full disk, and this door speaks plain HTTP by
 * design, so an on-path attacker chooses the byte count. */

/* Computes the total-byte ceiling to enforce for one archive download,
 * given the catalog's declared archiveSize (`declared_size`; 0 means
 * "unknown" per docs/DOOR-REPO-API.md section 3's archiveSize field).
 *
 * Returns min(declared_size + slack, absolute_max) when `declared_size`
 * is present AND plausible (nonzero, and no larger than `absolute_max`
 * itself - a genuine catalog entry has never declared a size anywhere
 * near that large), where `slack` is `slack_percent`% of `declared_size`
 * or `slack_floor` bytes, whichever is larger (the floor matters for
 * small archives, where a percentage alone would be too tight to
 * tolerate the archive having been legitimately re-indexed or slightly
 * changed since list.txt was last generated). The min(...) clamp is
 * load-bearing, not defensive decoration: without it, a declared_size
 * at or near `absolute_max` still passes the plausibility check and
 * gets slack added ON TOP of it, so the returned value could exceed
 * `absolute_max` by up to the slack amount - fixed in round 5 of this
 * project's security review after exactly that was reproduced live
 * (declared_size == 16,777,216 yielded an enforced ceiling of
 * 20,132,656 with this door's real constants, ~3.35 MiB past the
 * documented cap). The return value from this function is therefore
 * NEVER greater than `absolute_max`, for any input.
 *
 * Returns `absolute_max` unchanged when `declared_size` is 0 or itself
 * implausible (bigger than `absolute_max` - treating an absurd declared
 * size as a license for an unbounded download would defeat the whole
 * point). Every argument is caller-supplied (not a compile-time constant
 * here) so this function stays pure and testable without doorrepo.c's
 * MAX_CATALOG_BYTES/ARCHIVE_ABSOLUTE_MAX_BYTES/ARCHIVE_SLACK_FLOOR_BYTES/
 * ARCHIVE_SLACK_PERCENT definitions. */
unsigned long flow_archive_byte_ceiling(unsigned long declared_size,
                                         unsigned long absolute_max,
                                         unsigned long slack_floor,
                                         unsigned long slack_percent);

/* Returns 1 if `value` is non-empty and every byte is an ASCII letter or
 * digit (A-Z, a-z, 0-9) - nothing else. Used to validate the user-typed
 * `T`(ype) filter before it is embedded, UNENCODED, into the `?type=`
 * query string by flow_build_list_query() - real `doorType` values
 * (XIM/DD/REXX/...) are always plain alphanumeric tokens per
 * docs/DOOR-REPO-API.md section 8, and that function deliberately does
 * not URL-encode this parameter (matching the API doc's assumption). A
 * user-typed value containing '&', '=', or similar would otherwise
 * inject extra, unintended query parameters into the request line. */
int flow_is_plain_alnum(const char *value);

/* Validates a sysop-typed access-level string. Digits only (no leading
 * '+'/'-', no whitespace, no leading zeros beyond a single "0"), length
 * 1-3 characters, numeric value 0-255 inclusive (this project's own
 * ACCESS convention treats 255 as "sysop-only, the practical maximum" -
 * see command-execution.handler.ts's own ACCESS=255 example). On success
 * returns 0 and writes the parsed value to *value_out; on failure returns
 * non-zero and leaves *value_out untouched - this is the ONE validator
 * for this feature's only new input surface, so callers never need a
 * second ad-hoc check. */
int flow_validate_access_level(const char *input, long *value_out);

/* ---- Install support ---------------------------------------------------
 *
 * Installing means three things a download does not: the archive is
 * extracted into its own directory under DoorsDir, a <CMD>.info naming the
 * door's binary is written into BBSCmdDir, and the BBS can then run it.
 * Everything below is the pure part of that, kept here so it is testable
 * without a server, a terminal or a filesystem.
 */

/* AmiExpress BBS command names are short and upper-case; 12 is the limit
 * DOORMAN's own install prompt applies. */
#define FLOW_MAX_BBS_COMMAND 12

/* Non-zero when `cmd` is a usable BBS command name: 1..FLOW_MAX_BBS_COMMAND
 * characters, A-Z and 0-9 only. Deliberately stricter than "not dangerous":
 * this value becomes both a directory name and a filename on an AmigaDOS
 * volume and is typed by a user at a BBS prompt, so anything outside the
 * alphabet is rejected rather than sanitized (silently altering what
 * somebody typed produces a door they cannot find again). */
int flow_is_valid_bbs_command(const char *cmd);

/* Derives a default command name from an archive name: extension dropped,
 * lower-case folded up, every character outside A-Z0-9 removed (real
 * catalog names contain '!', '$', '-', '&'), truncated to
 * FLOW_MAX_BBS_COMMAND. Returns the length, or -1 when nothing usable
 * remains (in which case *out is empty and the caller must ask). */
int flow_suggest_bbs_command(const char *archive_name, char *out, unsigned long outsize);

/* "<doors_dir>/<cmd>/" and "<bbscmd_dir>/<cmd>.info", both using
 * flow_build_local_path's AmigaDOS-aware separator rule (a "Work:" or
 * "Doors/" prefix already ends in a separator; a bare "Doors" does not).
 * Return the length written, or -1 if it would not fit. */
int flow_build_install_dir(char *out, unsigned long outsize,
                            const char *doors_dir, const char *cmd);
int flow_build_info_path(char *out, unsigned long outsize,
                          const char *bbscmd_dir, const char *cmd);

/* Renders the tooltype lines the BBS reads for a door command:
 *
 *   TYPE=<doorType>
 *   LOCATION=Doors:<CMD>/<binaryRel>
 *   STACK=65536
 *   ACCESS=<access>
 *   DRACCESS=<prior_access>     (only when prior_access >= 0)
 *
 * The first four lines are byte-identical to DOORMAN's
 * buildDoorInfoContent() (Doors/door-manager/app.ts) - a door installed by
 * either client must look the same to the BBS - except ACCESS now carries
 * whatever `access` the caller passes instead of a hardcoded 0.
 * install_door()'s call site passes (0, -1): doors always install at
 * ACCESS=0 with no DRACCESS line, unchanged from before this parameter was
 * added.
 *
 * `prior_access` of -1 means "omit the DRACCESS line entirely" (the normal
 * case). >= 0 appends a DRACCESS=<value> line, which is how "disable,
 * remembering what ACCESS used to be" survives a DoorRepo restart and a
 * round trip through the BBS's own tooltype parser. That parser
 * (amiga-command-parser.util.ts's extractTooltypesFromInfoFile /
 * parseInfoFileFallback) walks KEY=value lines into a generic map and only
 * reads back keys it recognizes, so an unrecognized DRACCESS line is inert
 * to it - confirmed by reading that parser, not assumed.
 *
 * An empty door_type becomes "XIM", the same default DOORMAN applies.
 * Returns the length written, or -1 if it would not fit. */
int flow_build_info_content(char *out, unsigned long outsize,
                             const char *door_type, const char *cmd,
                             const char *binary_rel, long access, long prior_access);

/* ---- Reading a .info's tooltypes -----------------------------------------
 *
 * The reader half of flow_build_info_content() above. DoorRepo has only
 * ever WRITTEN .info files, at install time; the .info/access-level editor
 * (key M) needs to show a door's current ACCESS before letting a sysop
 * change it, which means reading one back.
 */

/* Parses ONE "KEY=value\n" tooltype line. Returns 0 and fills key_out/
 * value_out on success; non-zero (and leaves both outputs as empty
 * strings) on a malformed line (no '=', empty key, line too long for the
 * caller's buffers) - malformed lines are skipped by the caller, not
 * fatal, matching flow_index_parse_line()'s "a hand-edited file can have
 * a bad line" tolerance. Trailing \r and \n are stripped (a .info edited
 * on a Windows machine or copied through a CRLF-preserving transfer must
 * still parse). */
int flow_parse_tooltype_line(const char *line, char *key_out, unsigned long key_size,
                              char *value_out, unsigned long value_size);

/* Reads all tooltypes DoorRepo cares about from the .info at info_path in
 * one pass: TYPE, LOCATION, STACK, ACCESS, and (if present) DRACCESS (the
 * prior access level this plan's Task 2 stashes before an edit). Built as
 * ONE struct-returning reader rather than a narrow ACCESS-only one, since
 * Task 4's rewrite needs TYPE/LOCATION back too so it never silently
 * resets them on write. Each field's "found" flag is independent: a
 * .info missing STACK (hand-edited, or written by a different tool) still
 * yields whatever it does have rather than failing the whole read.
 * access/prior_access are `long` (numeric, parsed); type/location are
 * fixed-size char buffers the caller supplies (same ownership pattern as
 * flow_index_parse_line's out params - no dynamic allocation in this
 * codebase). Returns 1 if the file opened at all, 0 if it could not be
 * opened (missing/unreadable) or `out` is NULL - the caller checks each
 * field's own found-flag for anything finer than that. */
typedef struct {
    int type_found;      char type[16];
    int location_found;  char location[192];
    int stack_found;     long stack;
    int access_found;    long access;
    int prior_access_found; long prior_access;
} dr_info_fields;

int flow_read_door_info(const char *info_path, dr_info_fields *out);

/* ---- /files listing helpers ----
 *
 * The archive-contents listing (GET /files/<archive>, section 6 of the API
 * doc) is "FILES|<count>|<junk>" followed by "<size>|<junk>|<path>" rows.
 * It is the ONLY way this door can know what came out of an archive: C89
 * has no directory enumeration at all, and AmigaDOS's Examine/ExNext is
 * not available through the portable backend. So the listing doubles as
 * the manifest used to pick the door's binary and to delete ad files after
 * extraction. */

/* Start of the line after the one `p` points into, or NULL at the end. */
const char *flow_files_next_line(const char *p);

/* Parses one "<size>|<junk>|<path>" row. Returns 0 on success (and fills
 * whichever out-parameters are non-NULL), non-zero for a header line, a
 * malformed row, or an empty path. */
int flow_files_parse_row(const char *line, unsigned long *size, int *is_junk,
                          char *path_out, unsigned long path_outsize);

/* Chooses which extracted file is the door's executable, from the /files
 * body. Preference order:
 *   1. a non-junk file whose name equals the archive's base name or the
 *      chosen BBS command (case-insensitive) - e.g. AETRIV10.LHA's
 *      "AETRIV10";
 *   2. otherwise the largest non-junk file with no extension, since Amiga
 *      executables conventionally carry none while the .doc/.txt/.info
 *      files beside them do;
 *   3. otherwise the largest non-junk ".rexx" script. Some doors ship no
 *      executable at all: ACC-V103.LHA's program is Account/AccEd.Rexx and
 *      every other member carries a suffix, so rules 1 and 2 both came up
 *      empty and the install wrote a LOCATION that could not exist. A
 *      script ranks BELOW a real executable, because a .rexx sitting next
 *      to one is an installer or a helper.
 * Returns the length written, or -1 when nothing qualifies - the caller
 * then falls back to the command name, exactly as DOORMAN does when its
 * own search finds nothing. */
int flow_pick_door_binary(const char *files_body, const char *archive_name,
                          const char *cmd, char *out, unsigned long outsize);

/* The door type to write into the command config, given the catalog's type
 * and the program that was actually chosen.
 *
 * The catalog classifies an ARCHIVE; the type has to say how the BBS should
 * RUN what came out of it, and for a script those differ. ACC-V103.LHA is
 * catalogued XIM and contains no executable at all - its program is
 * Account/AccEd.Rexx.
 *
 * express.e is the authority here (AmiExpress-Sources/express.e:4681-4697
 * for the type table):
 *   DOORTYPE_XIM runs the LOCATION file as a program (express.e:4278) -
 *     which a text script is not, so XIM is simply wrong for a .rexx and
 *     fails on a real node even though this server's suffix check happens
 *     to save it.
 *   DOORTYPE_AIM runs "REXXDOOR <node> <cmd>" (express.e:4272-4276), i.e.
 *     it hands the LOCATION to REXXDOOR. That is how AmiExpress has always
 *     run ARexx doors, and it is what this returns.
 *   DOORTYPE_AEM ("REXXEXEC", express.e:4298-4302) is the other ARexx
 *     spelling; a catalog entry already saying AEM is left alone.
 * There is no TYPE=AREXX in express.e - that marker exists only in this
 * server's parser, and a .info written here has to work on a real Amiga.
 *
 * Only an empty or XIM catalog type is overridden: anything more specific
 * was chosen deliberately and is not this function's to second-guess.
 *
 * Returns a pointer to either `catalog_type` itself or a static literal -
 * never a buffer the caller owns. */
const char *flow_effective_door_type(const char *catalog_type,
                                     const char *binary_rel);

/* Non-zero when a key value read from the door layer means "there is no
 * user any more" rather than a keystroke: ae_key() returns -1 at EOF /
 * carrier loss.
 *
 * This is a one-line rule with a large blast radius, which is why it lives
 * here rather than inline: every interactive loop in the full-screen
 * browser (list, filter box, yes/no confirm, install prompt) exits only on
 * a key, so a -1 that matches no case falls through to "redraw and read
 * again" and the door spins as fast as the terminal accepts output - a run
 * whose input ran out wrote 21 GB of frames in two minutes before it was
 * killed. */
int flow_key_ends_session(int key);

/* ---- Install index -----------------------------------------------------
 *
 * DOORMAN knows which catalog rows it has installed because it has a local
 * database; this door has none, and probing the filesystem per visible row
 * per keystroke is exactly the kind of per-row disk work a real Amiga node
 * cannot afford. So an install appends one line to a small text file in
 * DownloadDir, and an uninstall removes it:
 *
 *   <archiveName>|<CMD>
 *
 * That one line is what lets the list mark an installed door, the header
 * count them, an uninstall know the command name without asking, and the
 * ad-strip act on an already-installed door. Kept deliberately as text with
 * one record per line: it is a file a sysop may end up reading or editing
 * by hand on a machine with no other tools.
 */

#define FLOW_INDEX_FILENAME "DoorRepo.idx"

/* "<archive>|<cmd>\n" into `out`. Returns the length written, or -1 for a
 * NULL/empty field, a field containing '|' (which would make the line
 * unparseable), or a buffer too small. */
int flow_index_format_line(char *out, unsigned long outsize,
                            const char *archive, const char *cmd);

/* Splits one index line. Returns 0 on success, non-zero when the line has
 * no separator, an empty archive, or an empty command - in which case both
 * outputs are emptied, so a truncated or hand-mangled file cannot leave a
 * caller acting on half a record. */
int flow_index_parse_line(const char *line, char *archive_out, unsigned long archive_size,
                           char *cmd_out, unsigned long cmd_size);

/* "<download_dir>/DoorRepo.idx". Returns the length, or -1 if it would not
 * fit. */
int flow_build_index_path(char *out, unsigned long outsize, const char *download_dir);

/* ---- Installed-only view ------------------------------------------------
 *
 * The new "installed doors" screen (doorrepo.c's installed_loop_ansi())
 * keeps only the catalog rows whose archive name is in the install index
 * (g_index[], doorrepo.c). g_index and the dr_catalog it is matched
 * against both live in doorrepo.c and touch the filesystem via
 * index_load(), so the membership test itself is pulled out here as a
 * plain array scan - the caller builds `known_archives` from g_index[]
 * once per screen-open (see ui_view_rebuild_installed(), doorrepo.c),
 * this function does none of that I/O and knows nothing of g_index.
 */

/* Non-zero when `row_archive` equals one of `known_archives[0..known_count)`.
 * Case-sensitive strcmp, matching index_lookup()'s own comparison - archive
 * names are not case-folded anywhere else in this door, so this does not
 * introduce it either. A NULL `row_archive` or a NULL entry in
 * `known_archives` never matches. */
int flow_is_installed_row(const char *row_archive,
                          const char *known_archives[], int known_count);

/* ---- Footer bar builder --------------------------------------------------
 *
 * ui_draw_footer() and ui_draw_footer_installed() (doorrepo.c) each built
 * their key-legend bar with a fixed strcat chain and handed the result to
 * ui_draw_bar(), which centers-then-truncates at `g->cols` (ansi_center()).
 * Adding a part to either chain (L=Installed; two more sibling plans queue
 * an .info-editor key and an owner-mode key next) can silently push the
 * total past `cols`, and truncation cuts from the FRONT of whatever
 * ansi_center() is handed past `width` bytes - i.e. it keeps the first
 * `cols` bytes of the string and drops the tail, which is exactly where
 * the mandatory "Q=Quit"/"Q=Back" lives. A sysop with no ESC binding then
 * has no documented way out of the screen. See docs/DOOR-REPO-API.md's
 * sibling review write-up for the live 94-char reproduction.
 *
 * This function is the fix: a width-budgeted builder that drops OPTIONAL
 * parts, lowest priority first, before ever touching the mandatory prefix
 * or suffix. */

/* Builds a footer bar from optional parts in priority order (parts[0]
 * highest priority), stopping BEFORE adding a part that would push the bar
 * past `cols`. `mandatory_prefix` (e.g. "ENTER/R=Get  U=Uninstall") and
 * `mandatory_suffix` (e.g. "Q=Quit") are ALWAYS present in full, separated
 * from the optional parts and each other by "  " - the budget calculation
 * accounts for both separators, including the one reserved in front of the
 * suffix while deciding whether each optional part still fits. If even the
 * mandatory prefix+suffix don't fit in `cols` (a pathological/tiny screen),
 * the result is prefix+suffix untruncated (never silently drop the one
 * documented way out) rather than something shorter that cuts Q - the
 * suffix is appended unconditionally once the optional-part loop is done,
 * never gated on the `cols` budget itself (only `outcap`, the actual
 * buffer, can make this return -1).
 *
 * Either `mandatory_prefix` or `mandatory_suffix` may be NULL or "" to
 * omit that side entirely (no stray leading/trailing separator is left
 * behind) - used for the installed-doors screen's empty-list footer,
 * which has no prefix at all, just "Q=Back".
 *
 * `optional_parts` may be NULL when `optional_count` is 0. A NULL or empty
 * entry within it is skipped, matching the conditional-strcat cases in the
 * two callers (e.g. "V=Doc" only when the selected row has documentation).
 *
 * Returns the bar length written to `out`, or -1 if it would not fit
 * `outcap` at all (a NULL `out`, zero `outcap`, or a genuinely undersized
 * buffer - never triggered by the `cols` budget on its own). */
int flow_build_footer_bar(char *out, unsigned long outcap, int cols,
                           const char *mandatory_prefix,
                           const char *const *optional_parts, int optional_count,
                           const char *mandatory_suffix);

#endif /* DOORREPO_FLOW_H */
