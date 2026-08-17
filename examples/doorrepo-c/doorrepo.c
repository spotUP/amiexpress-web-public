/* doorrepo.c - AmiExpress XIM door: browse, search, and download archives
 * from the DoorRepo catalog (docs/DOOR-REPO-API.md).
 *
 * Consumes every module shipped in Tasks 1-5:
 *   md5.h     - streaming MD5, hashed while the archive is written to disk.
 *   listtxt.h - list.txt header/row parser.
 *   config.h  - DoorRepo.cfg loader.
 *   http.h    - streaming HTTP GET over netio.h.
 *   netio.h   - only for net_last_error(), to tell the user WHY the
 *               connection failed. No socket is touched from this file.
 *   aedoor.h  - the XIM message-port door I/O layer (or its native twin).
 * Pure decision logic (pagination maths, the download-verification retry
 * state machine, and query-string/path construction) lives in flow.h/
 * flow.c so it is unit-testable without any of the above - see
 * tests/test_flow.c.
 *
 * C89. No "#ifdef AMIGA" anywhere in this file - the Makefile selects
 * aedoor_native.c or aedoor_amiga.c, and netio.c is the only file with a
 * platform branch. ASCII output only, full English words, no ANSI escapes.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "config.h"
#include "http.h"
#include "listtxt.h"
#include "md5.h"
#include "aedoor.h"
#include "flow.h"
#include "netio.h"

#define DOOR_NAME "DoorRepo"
#define DOOR_VERSION "1.0"
#define DOOR_CONFIG_PATH "DoorRepo.cfg"
#define DOOR_CACHE_NAME "listtxt.cache"

/* Hard cap on catalog rows held in memory at once (brief requirement 10).
 * At sizeof(dr_entry) == 312 bytes (verified on this host; the layout is
 * platform-independent since every field is a fixed-size char array or an
 * unsigned long), 4096 rows is ~1.22 MB - a deliberate, disclosed ceiling,
 * not a number chosen to fit some specific machine's free RAM. See the
 * task report's memory-accounting section. */
#define MAX_CATALOG_ROWS 4096UL

/* One line of list.txt, generously bounded: archive(64) + type(8) +
 * size(<=20 digits) + md5(32) + name(64) + description(120, per the format
 * doc's 120-char truncation rule) + 5 '|' separators + CRLF + slack. */
#define LISTTXT_LINE_MAX 512

/* Progress is reported every 8 KB of a download, per the brief. */
#define PROGRESS_INTERVAL 8192UL

/* Hard ceiling on the TOTAL bytes read from a list.txt response, enforced
 * in catalog_sink() before a single byte is mirrored to the cache file or
 * handed to the line parser - MAX_CATALOG_ROWS bounds memory, but nothing
 * previously bounded the response body itself, so a listing declaring
 * "<count>=1" followed by megabytes of junk still wrote every byte to
 * disk before the row cap ever got a chance to matter (confirmed live:
 * 20,971,596 bytes written for exactly that shape of attack). Chosen
 * against the REAL catalog, measured directly: `curl .../list.txt |
 * wc -c` on the live 3301-row catalog returns exactly 441,852 bytes
 * (2026-08-17). At MAX_CATALOG_ROWS's cap (4096 rows) and today's
 * average row size (441,852 / 3301 =~ 134 bytes/row), a maximally-sized
 * LEGITIMATE catalog would top out around 4096 * 134 =~ 549,000 bytes -
 * so 2 MiB is not an arbitrary round number, it is ~4.7x today's real
 * size and ~3.8x the largest well-formed catalog this door could ever
 * actually use, giving the real catalog room to grow past 15,000 rows
 * before this ceiling becomes a practical constraint, while still
 * capping a runaway/hostile response at a small, bounded multiple of
 * reality rather than an unbounded stream. */
#define MAX_CATALOG_BYTES (2UL * 1024UL * 1024UL) /* 2 MiB */

/* Archive downloads are bounded two ways (attempt_download() picks one
 * per download, in archive_byte_ceiling() below):
 *   - When the catalog's declared archiveSize (dr_entry.size) is present
 *     and plausible (nonzero, and itself no larger than the absolute
 *     ceiling below), the allowed total is that declared size PLUS
 *     slack: 20% of the declared size, or 64 KiB, whichever the slack
 *     formula below computes to (see archive_byte_ceiling()) - generous
 *     enough to tolerate the archive having been legitimately re-indexed
 *     or slightly changed since list.txt was last generated (see
 *     docs/DOOR-REPO-API.md section 4's "Digest freshness" note, the
 *     same staleness this door already tolerates for MD5 mismatches),
 *     while still catching the reported attack outright: a row
 *     declaring archiveSize=100 allows at most 100 + 20 + 65536 =~ 64
 *     KiB, nowhere near the 10 MiB the attack actually sent.
 *   - When declared size is 0 ("unknown" per the format doc) or itself
 *     implausible (bigger than this absolute ceiling, which a genuine
 *     catalog entry has never been - see below), the ABSOLUTE ceiling
 *     applies instead. The real catalog's largest current archive,
 *     measured directly (2026-08-17), is 1,867,128 bytes (~1.78 MiB);
 *     16 MiB is ~8.9x that real maximum, generous headroom for future,
 *     larger legitimate archives while still bounding an
 *     unknown-declared-size download to a fixed, sane number instead of
 *     an unbounded stream. */
#define ARCHIVE_ABSOLUTE_MAX_BYTES (16UL * 1024UL * 1024UL) /* 16 MiB */
#define ARCHIVE_SLACK_FLOOR_BYTES (64UL * 1024UL) /* 64 KiB */
#define ARCHIVE_SLACK_PERCENT 20UL

/* fetch_catalog()-local failure sentinel, distinct from every http.h
 * HTTP_ERR_* code (all in -1..-10) so load_full_catalog() can tell
 * "the response exceeded MAX_CATALOG_BYTES" apart from an ordinary
 * transport failure and report it accurately. Scoped to this file only -
 * never crosses a header boundary. */
#define FETCH_ERR_CATALOG_TOO_LARGE (-101)

/* Read chunk used while re-parsing list.txt out of the local cache file
 * (the fresh-fetch path already streams via http.c's own chunking). */
#define CACHE_READ_CHUNK 512

/* ---------------------------------------------------------------------
 * Catalog storage - exactly ONE heap allocation for the whole program's
 * life (see the task report). Sized to the actual declared row count
 * (capped at MAX_CATALOG_ROWS) the first time a catalog is loaded, and
 * only grown (never shrunk) by a later load that legitimately needs more
 * rows than the first one did - which in practice never happens, since
 * T/S filtered fetches only ever narrow the unfiltered catalog. No
 * per-row allocation anywhere: dr_entry is copied by value into the one
 * array.
 * ------------------------------------------------------------------- */

typedef struct {
    dr_entry *rows;             /* single malloc'd/realloc'd array */
    unsigned long capacity;     /* rows the current allocation can hold */
    unsigned long count;        /* rows actually populated this load */
    unsigned long declared_count; /* header's <count> field, pre-cap */
    int format_version;
    char revision[48];
    /* Rows refused THIS load because entry->archive failed
     * flow_is_safe_archive_filename() (CWE-22 defense - see flow.h).
     * Refusing the row, not the whole catalog, is deliberate: the other
     * ~3300 legitimate entries must stay usable even if one row is
     * hostile or corrupted. first_unsafe_archive_name is the first such
     * refused name (bounded, truncated), kept so the sysop-facing
     * message can name it for reporting upstream; empty when
     * unsafe_archive_rows == 0. */
    unsigned long unsafe_archive_rows;
    char first_unsafe_archive_name[80];
} dr_catalog;

/* Streaming parse state shared by the fresh-HTTP-fetch path and the
 * read-from-local-cache path - one line accumulator, fed byte chunks of
 * any size by either caller. */
typedef struct {
    dr_catalog *cat;
    char linebuf[LISTTXT_LINE_MAX];
    unsigned long linelen;
    int header_done;
    int header_ok;
    int alloc_failed;
    unsigned long rows_skipped; /* malformed data rows, not fatal to the catalog */
    FILE *mirror;               /* non-NULL: also write raw bytes here (cache write) */
    unsigned long total_bytes;  /* bytes seen so far this fetch, checked against MAX_CATALOG_BYTES */
    int size_exceeded;          /* set by catalog_sink() if total_bytes would exceed MAX_CATALOG_BYTES */
} listtxt_parse_state;

static void parse_state_init(listtxt_parse_state *st, dr_catalog *cat, FILE *mirror)
{
    st->cat = cat;
    st->linelen = 0;
    st->header_done = 0;
    st->header_ok = 0;
    st->alloc_failed = 0;
    st->rows_skipped = 0;
    st->mirror = mirror;
    st->total_bytes = 0;
    st->size_exceeded = 0;
}

/* Grows cat->rows to hold at least `needed` entries, if it does not
 * already. Never shrinks (so a later, smaller catalog just reuses the
 * existing allocation with a smaller cat->count). Returns 0 on success,
 * non-zero if realloc() failed (existing allocation, if any, is left
 * intact and usable - only the growth attempt failed). */
static int ensure_capacity(dr_catalog *cat, unsigned long needed)
{
    dr_entry *grown;

    if (needed <= cat->capacity) {
        return 0;
    }
    grown = (dr_entry *) realloc(cat->rows, (size_t) (needed * sizeof(dr_entry)));
    if (grown == (dr_entry *) 0) {
        return 1;
    }
    cat->rows = grown;
    cat->capacity = needed;
    return 0;
}

/* Handles one already-line-buffered, NUL-terminated line (no CRLF) from
 * list.txt: the first line is always the header, every line after that is
 * a data row. Returns 0 to keep going, non-zero to abort the whole parse
 * (only the header can trigger this - a malformed header means "refuse
 * this catalog", per listtxt.h; a malformed DATA row is skipped and
 * counted, not fatal). */
static int handle_line(listtxt_parse_state *st, const char *line)
{
    if (!st->header_done) {
        st->header_done = 1;
        if (listtxt_parse_header(line, &st->cat->format_version,
                                  st->cat->revision, sizeof(st->cat->revision),
                                  &st->cat->declared_count) != 0) {
            st->header_ok = 0;
            return 1; /* malformed header: refuse the catalog outright */
        }
        st->header_ok = 1;
        st->cat->count = 0;
        st->cat->unsafe_archive_rows = 0;
        st->cat->first_unsafe_archive_name[0] = '\0';
        {
            unsigned long want = flow_effective_row_count(st->cat->declared_count, MAX_CATALOG_ROWS);
            if (ensure_capacity(st->cat, want) != 0) {
                st->alloc_failed = 1;
                return 1;
            }
        }
        return 0;
    }

    /* Data row. A row beyond the capacity we allocated (only possible if
     * the header's declared count was itself capped, i.e. the catalog
     * legitimately exceeds MAX_CATALOG_ROWS) is silently not stored - the
     * cap message printed by the caller already told the sysop why. */
    if (st->cat->count < st->cat->capacity) {
        if (listtxt_parse_row(line, &st->cat->rows[st->cat->count]) == 0) {
            /* CWE-22 defense: validate the archive name as a bare
             * filename BEFORE it ever enters cat->rows[] as a selectable
             * entry - this is what actually stops the traversal, since
             * everything downstream (view_entry(), attempt_download(),
             * the pre-system() re-check) can then only ever see rows
             * that already passed this gate. A row refused here is
             * dropped, not the whole catalog - the other legitimate rows
             * must stay usable. */
            if (flow_is_safe_archive_filename(st->cat->rows[st->cat->count].archive)) {
                st->cat->count += 1;
            } else {
                st->cat->unsafe_archive_rows += 1;
                if (st->cat->first_unsafe_archive_name[0] == '\0') {
                    strncpy(st->cat->first_unsafe_archive_name,
                            st->cat->rows[st->cat->count].archive,
                            sizeof(st->cat->first_unsafe_archive_name) - 1);
                    st->cat->first_unsafe_archive_name[sizeof(st->cat->first_unsafe_archive_name) - 1] = '\0';
                }
            }
        } else {
            st->rows_skipped += 1;
        }
    }
    return 0;
}

/* Feeds `len` raw bytes into the line accumulator, calling handle_line()
 * for each complete line found. Returns 0 to keep going, non-zero once
 * handle_line() has signalled a fatal header failure (the caller must stop
 * feeding further bytes at that point). */
static int feed_bytes(listtxt_parse_state *st, const unsigned char *buf, unsigned long len)
{
    unsigned long i;

    for (i = 0; i < len; i++) {
        unsigned char ch = buf[i];
        if (ch == '\n') {
            st->linebuf[st->linelen] = '\0';
            if (handle_line(st, st->linebuf) != 0) {
                return 1;
            }
            st->linelen = 0;
            continue;
        }
        if (ch == '\r') {
            continue; /* CRLF: drop the CR, the LF above ends the line */
        }
        if (st->linelen + 1 < sizeof(st->linebuf)) {
            st->linebuf[st->linelen++] = (char) ch;
        }
        /* An absurdly long line (beyond LISTTXT_LINE_MAX) is truncated
         * here rather than overrunning linebuf - handle_line() will then
         * see a truncated row and listtxt_parse_row() will reject it via
         * the normal "fewer than six fields" path if truncation landed
         * mid-row, which is exactly the "skip this one row" behavior
         * above, not a crash. */
    }
    return 0;
}

/* Flushes a final, non-empty line that had no trailing newline (should not
 * happen for a well-formed list.txt, which always ends with CRLF per the
 * format doc, but a truncated/corrupted response must not silently drop
 * its last row). */
static void feed_flush(listtxt_parse_state *st)
{
    if (st->linelen > 0) {
        st->linebuf[st->linelen] = '\0';
        handle_line(st, st->linebuf);
        st->linelen = 0;
    }
}

static int catalog_sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    listtxt_parse_state *st = (listtxt_parse_state *) ctx;

    /* Enforced BEFORE a single byte of this chunk is mirrored to the
     * cache file or handed to the line parser - MAX_CATALOG_ROWS only
     * ever bounded memory (dr_entry rows kept), never the response body
     * itself, so a listing declaring "<count>=1" followed by megabytes
     * of junk previously wrote every byte to disk before the row cap got
     * a chance to matter (confirmed live: 20,971,596 bytes for exactly
     * that shape of attack). See MAX_CATALOG_BYTES's definition for the
     * real-catalog measurement behind the chosen number. */
    if (st->total_bytes + len > MAX_CATALOG_BYTES) {
        st->size_exceeded = 1;
        return 1; /* abort - this chunk is never written or parsed */
    }
    st->total_bytes += len;

    if (st->mirror != (FILE *) 0) {
        fwrite(buf, 1, (size_t) len, st->mirror);
    }
    return feed_bytes(st, buf, len);
}

/* Fetches "<cfg->path>/list.txt<query>" fresh over HTTP, parsing it into
 * `cat` as it streams (never buffering the whole response), and mirroring
 * the raw bytes to `cache_out` if non-NULL. Returns HTTP_OK on a fully
 * received, well-formed (header-parseable) response; an HTTP_ERR_* code on
 * a transport failure; or 1 if the header itself was malformed (the
 * transport succeeded but the catalog must be refused). */
static int fetch_catalog(const dr_config *cfg, dr_catalog *cat,
                          const char *query, FILE *cache_out)
{
    listtxt_parse_state st;
    http_response resp;
    char path[256];
    int rc;

    parse_state_init(&st, cat, cache_out);

    strncpy(path, cfg->path, sizeof(path) - 1);
    path[sizeof(path) - 1] = '\0';
    strncat(path, "/list.txt", sizeof(path) - 1 - strlen(path));
    if (query != (const char *) 0 && query[0] != '\0') {
        strncat(path, query, sizeof(path) - 1 - strlen(path));
    }

    rc = http_get(cfg, path, &resp, catalog_sink, &st);
    if (st.size_exceeded) {
        /* Checked BEFORE the generic rc != HTTP_OK branch below: the
         * sink's abort makes http_get() return HTTP_ERR_SINK_ABORT,
         * which is also `!= HTTP_OK`, but the caller needs to report
         * THIS specific reason, not a generic "network error". */
        return FETCH_ERR_CATALOG_TOO_LARGE;
    }
    if (rc != HTTP_OK) {
        return rc;
    }
    if (resp.status != 200) {
        return HTTP_ERR_READ; /* treat any non-200 as "could not load the catalog" */
    }
    feed_flush(&st);

    if (st.alloc_failed) {
        return HTTP_ERR_READ; /* out of memory - nothing more we can do */
    }
    if (!st.header_ok) {
        return 1; /* malformed header: refuse this catalog */
    }
    return HTTP_OK;
}

/* Reads a previously cached list.txt (this program's own earlier mirror
 * copy) from disk into `cat`, using the same feed_bytes()/handle_line()
 * logic as the fresh-fetch path - so cache and network agree on parsing
 * behavior by construction, not by duplicated code. Returns 0 on success,
 * non-zero if the file could not be opened or its header was malformed. */
static int load_catalog_from_cache(const char *path, dr_catalog *cat)
{
    listtxt_parse_state st;
    FILE *f;
    unsigned char buf[CACHE_READ_CHUNK];
    size_t n;

    f = fopen(path, "rb");
    if (f == (FILE *) 0) {
        return 1;
    }

    parse_state_init(&st, cat, (FILE *) 0);

    while ((n = fread(buf, 1, sizeof(buf), f)) > 0) {
        if (feed_bytes(&st, buf, (unsigned long) n) != 0) {
            break;
        }
    }
    fclose(f);
    feed_flush(&st);

    if (st.alloc_failed || !st.header_ok) {
        return 1;
    }
    return 0;
}

/* Reads just the header line of a cache file (cheap: does not touch the
 * data rows at all), to learn its revision for the cache-reuse decision.
 * Returns 0 on success (revision populated, bounded+NUL-terminated), non-
 * zero if the file does not exist or its header cannot be parsed. */
static int read_cache_revision(const char *path, char *revision, unsigned long revlen)
{
    FILE *f;
    char line[LISTTXT_LINE_MAX];
    int ch;
    unsigned long n;
    int format_version;
    unsigned long count;

    f = fopen(path, "rb");
    if (f == (FILE *) 0) {
        return 1;
    }

    n = 0;
    for (;;) {
        ch = fgetc(f);
        if (ch == EOF || ch == '\n') {
            break;
        }
        if (ch == '\r') {
            continue;
        }
        if (n + 1 < sizeof(line)) {
            line[n++] = (char) ch;
        }
    }
    line[n] = '\0';
    fclose(f);

    return listtxt_parse_header(line, &format_version, revision, revlen, &count);
}

/* Fetches the cheap /health endpoint purely to learn the server's current
 * catalog revision (docs/DOOR-REPO-API.md section 7's recommended header-
 * based update-detection flow) - the body is discarded. Returns 0 on
 * success with `revision` populated, non-zero on any transport failure. */
/* Deliberately discards the /health body - only the revision header
 * (already captured onto `resp` by http.c) matters to the caller. Counts
 * the discarded bytes into a file-scope counter (of no use to anyone, but
 * a genuine side effect) rather than casting each parameter to void: a
 * bare "(void) x;" cast statement is flagged by vbcc as "statement has no
 * effect" (see netio.c's NETIO_STUB branch for the same trade-off
 * documented in more depth), while a plain unused named parameter is
 * flagged by cc -Wextra as -Wunused-parameter - this is the one form
 * silent on both toolchains, since this function (unlike netio.c's stub
 * branch) is compiled unconditionally on every build. */
static unsigned long g_health_body_bytes_discarded = 0;

static int discard_sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    if (ctx != (void *) 0 && buf != (const unsigned char *) 0) {
        g_health_body_bytes_discarded += len;
    }
    return 0;
}

static int fetch_server_revision(const dr_config *cfg, char *revision, unsigned long revlen)
{
    http_response resp;
    char path[160];
    int rc;

    strncpy(path, cfg->path, sizeof(path) - 1);
    path[sizeof(path) - 1] = '\0';
    strncat(path, "/health", sizeof(path) - 1 - strlen(path));

    rc = http_get(cfg, path, &resp, discard_sink, (void *) 0);
    if (rc != HTTP_OK || resp.status != 200) {
        return 1;
    }
    strncpy(revision, resp.revision, revlen - 1);
    revision[revlen - 1] = '\0';
    return 0;
}

/* ---------------------------------------------------------------------
 * Logging
 * ------------------------------------------------------------------- */

static void log_line(const dr_config *cfg, const char *msg)
{
    FILE *f;
    f = fopen(cfg->log_file, "a");
    if (f == (FILE *) 0) {
        return; /* best-effort: a door must not fail because logging failed */
    }
    fputs(msg, f);
    fputc('\n', f);
    fclose(f);
}

/* ---------------------------------------------------------------------
 * Carrier-loss handling - checked in every input loop per the brief.
 * ------------------------------------------------------------------- */

static void stop_for_carrier_loss(void)
{
    ae_shutdown();
    /* Unreachable on the Amiga backend (ae_shutdown() never returns
     * there). The native twin's ae_shutdown() is a no-op that DOES
     * return, so exit() here is what actually stops a native run when
     * the (simulated) carrier is lost - see aedoor.h. */
    exit(0);
}

static int carrier_lost(void)
{
    return ae_check() != 0;
}

/* aedoor_native.c's ae_check() is ALWAYS 0 - "there is no BBS connection to
 * lose" (aedoor_native.c's own header comment) - and ae_get() on a real
 * carrier loss (Amiga) vs. a genuinely blank Enter keypress are both
 * spelled the same way at this interface: an empty string. On the real
 * Amiga backend this is harmless (JH_LI's Data == -1 sets ae_check() true
 * on the very next call, caught immediately by carrier_lost() above). On
 * the native dev/test backend, though, stdin reaching EOF (piped input
 * exhausted, terminal closed) makes every further ae_get() return an
 * empty string forever, indistinguishable from an impatient user mashing
 * Enter - without this guard, a browse loop that just does "empty input:
 * redraw the page and ask again" spins at 100% CPU forever. A handful of
 * consecutive empty responses is tolerated (a real user legitimately
 * might mis-hit Enter a couple of times); this many in a row is
 * overwhelmingly more likely to be an exhausted input stream than a
 * patient human, so it is treated the same as carrier loss. */
#define MAX_CONSECUTIVE_EMPTY_INPUT 5

static int note_empty_input_and_check_giveup(int *consecutive_empty)
{
    *consecutive_empty += 1;
    return *consecutive_empty >= MAX_CONSECUTIVE_EMPTY_INPUT;
}

/* ---------------------------------------------------------------------
 * Banner and the unfiltered-catalog cache/reuse flow (step 2)
 * ------------------------------------------------------------------- */

static void print_banner(void)
{
    ae_put(DOOR_NAME " v" DOOR_VERSION " - AmiExpress Door Repository Client", 1);
    ae_put("", 1);
}

/* Loads the FULL, unfiltered catalog, applying the revision-based cache
 * check from docs/DOOR-REPO-API.md section 7: a cheap /health request
 * gets the server's current revision; if it matches the cached copy's
 * (flow_should_use_cache()), the cache is re-parsed from disk with no
 * further network traffic; otherwise list.txt is fetched fresh and the
 * cache file is overwritten with the new copy. Prints a short status line
 * either way. Returns 0 on success, non-zero on a fatal catalog-load
 * failure (network AND cache both unusable, or the header was malformed
 * both times). */
/* Surfaces a sysop-facing warning when the just-loaded catalog contained
 * one or more rows refused for an unsafe archive name (CWE-22 defense -
 * see flow_is_safe_archive_filename() in flow.h). Called at every
 * success exit of a catalog load, since a load can succeed (with rows
 * dropped) via the cache path, the network-down fallback, or a fresh
 * fetch. Deliberately does NOT abort the catalog load - the other
 * legitimate rows stay usable - but a repo server sending even one
 * traversal-shaped row is worth surfacing loudly, since this door speaks
 * plain HTTP and any on-path attacker could have rewritten list.txt. */
static void report_unsafe_archive_rows(const dr_config *cfg, const dr_catalog *cat)
{
    char msg[320];

    if (cat->unsafe_archive_rows == 0) {
        return;
    }
    sprintf(msg, "WARNING: %lu catalog row(s) were refused for an unsafe archive name (e.g. '%.60s'). "
                 "This repo server may be compromised or misconfigured - consider reporting it to the repo owner.",
            cat->unsafe_archive_rows, cat->first_unsafe_archive_name);
    ae_put(msg, 1);
    log_line(cfg, "CATALOG: unsafe archive name(s) refused, see WARNING shown to user");
}

static int load_full_catalog(const dr_config *cfg, dr_catalog *cat, char *cache_path, unsigned long cache_path_size)
{
    char server_rev[48];
    char cached_rev[48];
    int have_server_rev;
    int have_cache;

    /* A DownloadDir long enough to make this fail is not reachable given
     * dr_config's fixed field widths (download_dir[128] + the fixed cache
     * filename comfortably fits cache_path_size), but flow_build_local_path()
     * leaves `out` untouched on failure - initialize to empty first so an
     * unreachable-in-practice failure still yields a clean, reportable
     * error rather than reading uninitialized stack memory as a path. */
    cache_path[0] = '\0';
    if (flow_build_local_path(cache_path, cache_path_size, cfg->download_dir, DOOR_CACHE_NAME) < 0) {
        ae_put("DownloadDir in " DOOR_CONFIG_PATH " is too long to build a cache file path.", 1);
        return 1;
    }

    have_server_rev = (fetch_server_revision(cfg, server_rev, sizeof(server_rev)) == 0);
    have_cache = (read_cache_revision(cache_path, cached_rev, sizeof(cached_rev)) == 0);

    if (have_server_rev && have_cache
        && flow_should_use_cache(cached_rev, server_rev)) {
        if (load_catalog_from_cache(cache_path, cat) == 0) {
            ae_put("Catalog unchanged since last run - using cached copy.", 1);
            report_unsafe_archive_rows(cfg, cat);
            return 0;
        }
        /* Cache claimed to match but failed to re-parse (corrupted on
         * disk since it was written) - fall through to a fresh fetch. */
    }

    if (!have_server_rev && have_cache) {
        /* Server unreachable for the cheap revision check, but a cache
         * exists: better to browse a possibly-stale catalog than to fail
         * outright. */
        if (load_catalog_from_cache(cache_path, cat) == 0) {
            ae_put("Could not reach the repository server - using the cached catalog from a previous run.", 1);
            report_unsafe_archive_rows(cfg, cat);
            return 0;
        }
    }

    {
        FILE *cache_out;
        int rc;

        cache_out = fopen(cache_path, "wb");
        rc = fetch_catalog(cfg, cat, (const char *) 0, cache_out);
        if (cache_out != (FILE *) 0) {
            fclose(cache_out);
        }

        if (rc != HTTP_OK) {
            if (rc == FETCH_ERR_CATALOG_TOO_LARGE) {
                char msg[200];
                sprintf(msg, "The repository server sent a catalog response larger than %lu bytes - refusing it as a probable error or attack. Please try again later or contact the repo owner.",
                        MAX_CATALOG_BYTES);
                ae_put(msg, 1);
                log_line(cfg, "CATALOG: response exceeded MAX_CATALOG_BYTES, aborted");
            } else if (rc == 1) {
                ae_put("The repository server sent a catalog this door does not understand (malformed header). Cannot continue.", 1);
            } else if (rc == HTTP_ERR_CONNECT) {
                /* The transport never came up. net_last_error() distinguishes
                 * a refused port from a timeout, an unreachable network and a
                 * failed name lookup - four situations with four different
                 * fixes, and a sysop staring at "could not reach the server"
                 * cannot tell which one they have. net_last_error() is at
                 * most 127 characters (netio.c bounds it), so this buffer
                 * cannot be overrun by it. */
                char msg[220];
                sprintf(msg, "Could not reach the door repository server (%s). Please try again later.",
                        net_last_error());
                ae_put(msg, 1);
                log_line(cfg, msg);
            } else {
                ae_put("Could not reach the door repository server. Please try again later.", 1);
            }
            remove(cache_path); /* do not leave a half-written or unusable cache lying around */
            return 1;
        }

        if (flow_declared_count_exceeds_cap(cat->declared_count, MAX_CATALOG_ROWS)) {
            char msg[160];
            sprintf(msg, "Note: the repository has %lu doors; this door can only hold %lu at once. Showing the first %lu.",
                    cat->declared_count, MAX_CATALOG_ROWS, MAX_CATALOG_ROWS);
            ae_put(msg, 1);
        }
        report_unsafe_archive_rows(cfg, cat);
    }

    return 0;
}

/* ---------------------------------------------------------------------
 * Paged browse (step 3)
 * ------------------------------------------------------------------- */

static void print_row(unsigned long global_index, const dr_entry *e)
{
    char line[256];
    unsigned long kb;

    /* Round up so any nonzero size shows at least 1 KB, computed without
     * an addition that could overflow for an absurd e->size close to
     * ULONG_MAX (division and modulo cannot overflow the way
     * "size + 1023" could). */
    kb = e->size / 1024UL + ((e->size % 1024UL != 0UL) ? 1UL : 0UL);
    sprintf(line, "%4lu  %-20.20s %-4.4s %6lu KB  %-.40s",
            global_index, e->archive, e->type, kb, e->name[0] != '\0' ? e->name : e->desc);
    ae_put(line, 1);
}

static void print_page(const dr_catalog *cat, const flow_page_info *info, const char *filter_desc)
{
    unsigned long i;

    if (filter_desc != (const char *) 0 && filter_desc[0] != '\0') {
        ae_put(filter_desc, 1);
    }

    if (cat->count == 0) {
        ae_put("No matching doors found.", 1);
        return;
    }

    {
        char header[80];
        sprintf(header, "Page %lu of %lu (%lu doors total)", info->page_number, info->page_count, cat->count);
        ae_put(header, 1);
    }
    ae_put("INDEX ARCHIVE              TYPE   SIZE  NAME", 1);

    for (i = 0; i < info->row_count; i++) {
        print_row(info->start_index + i + 1, &cat->rows[info->start_index + i]);
    }
    ae_put("", 1);
}

/* Reads one line of user input at the browse/entry prompts and trims
 * trailing/leading ASCII whitespace in place, so a stray space typed
 * before or after a hotkey or a number does not break the interpretation
 * below. */
static void get_trimmed_line(char *buf, int maxlen)
{
    char *start;
    unsigned long len;

    ae_get(buf, maxlen);
    start = buf;
    while (*start == ' ' || *start == '\t') {
        start++;
    }
    if (start != buf) {
        memmove(buf, start, strlen(start) + 1);
    }
    len = (unsigned long) strlen(buf);
    while (len > 0 && (buf[len - 1] == ' ' || buf[len - 1] == '\t')) {
        buf[--len] = '\0';
    }
}

static int is_all_digits(const char *s)
{
    if (*s == '\0') {
        return 0;
    }
    while (*s != '\0') {
        if (*s < '0' || *s > '9') {
            return 0;
        }
        s++;
    }
    return 1;
}

static void view_entry(const dr_config *cfg, dr_catalog *cat, unsigned long global_index);

/* Runs the paged browse loop over whatever catalog `cat` currently holds
 * (the full catalog, or a server-side type/search-filtered one - the
 * caller decides which by what it loaded beforehand). Returns when the
 * user quits ('Q') or asks for a different filter/scope ('T', 'S', 'A') -
 * the return value tells main() which, so it can reload the catalog
 * accordingly and re-enter this loop. */
typedef enum {
    BROWSE_QUIT,
    BROWSE_FILTER_TYPE,
    BROWSE_FILTER_SEARCH,
    BROWSE_ALL
} browse_exit;

static browse_exit browse_loop(const dr_config *cfg, dr_catalog *cat, const char *filter_desc)
{
    int page_number = 1;
    char input[64];
    int consecutive_empty = 0;

    for (;;) {
        flow_page_info info;

        if (carrier_lost()) {
            stop_for_carrier_loss();
        }

        flow_compute_page(cat->count, cfg->page_size, page_number, &info);
        page_number = (int) info.page_number;
        print_page(cat, &info, filter_desc);

        ae_put("Selection (number), [N]ext [P]rev [T]ype [S]earch [A]ll [Q]uit: ", 0);
        get_trimmed_line(input, sizeof(input));

        if (carrier_lost()) {
            stop_for_carrier_loss();
        }

        if (input[0] == '\0') {
            if (note_empty_input_and_check_giveup(&consecutive_empty)) {
                /* Confirmed live: without this line, five blank Enters on
                 * a real (non-EOF) connection disconnect with no message
                 * at all - indistinguishable from a crash during native
                 * testing. Printed before stop_for_carrier_loss() so a
                 * genuinely patient human sees why the session ended;
                 * harmless best-effort on a real EOF/dead connection,
                 * where the write either lands nowhere or is simply lost. */
                ae_put("No input received - disconnecting.", 1);
                stop_for_carrier_loss();
            }
            continue;
        }
        consecutive_empty = 0;

        if (is_all_digits(input)) {
            unsigned long sel = strtoul(input, (char **) 0, 10);
            if (sel >= 1 && sel <= cat->count) {
                view_entry(cfg, cat, sel);
            } else {
                ae_put("No such entry number.", 1);
            }
            continue;
        }

        switch (input[0]) {
        case 'n': case 'N':
            page_number += 1;
            break;
        case 'p': case 'P':
            page_number -= 1;
            break;
        case 't': case 'T':
            return BROWSE_FILTER_TYPE;
        case 's': case 'S':
            return BROWSE_FILTER_SEARCH;
        case 'a': case 'A':
            return BROWSE_ALL;
        case 'q': case 'Q':
            return BROWSE_QUIT;
        default:
            ae_put("Unrecognized selection.", 1);
            break;
        }
    }
}

/* ---------------------------------------------------------------------
 * Entry view + download + verify + optional extraction (steps 4-7)
 * ------------------------------------------------------------------- */

typedef struct {
    FILE *file;
    md5_ctx md5;
    unsigned long received;
    unsigned long last_progress_report;
    unsigned long max_bytes;      /* ceiling from flow_archive_byte_ceiling(), enforced below */
    int aborted_for_carrier_loss;
    int aborted_for_oversized;
} download_ctx;

static int download_sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    download_ctx *dc = (download_ctx *) ctx;

    if (carrier_lost()) {
        dc->aborted_for_carrier_loss = 1;
        return 1; /* abort http_get's transfer immediately */
    }

    /* Enforced BEFORE this chunk is written to disk - the catalog's own
     * declared archiveSize was previously never checked against what the
     * server actually sent, so a row declaring archiveSize=100 streamed
     * an unbounded amount of data to disk and logged DOWNLOAD OK once
     * the (irrelevant) MD5/Content-Length checks ran afterward. See
     * flow_archive_byte_ceiling()'s doc comment for how max_bytes is
     * computed. */
    if (dc->received + len > dc->max_bytes) {
        dc->aborted_for_oversized = 1;
        return 1;
    }

    fwrite(buf, 1, (size_t) len, dc->file);
    md5_update(&dc->md5, buf, len);
    dc->received += len;

    if (dc->received - dc->last_progress_report >= PROGRESS_INTERVAL) {
        char msg[64];
        sprintf(msg, "  ... %lu KB received", dc->received / 1024UL);
        ae_put(msg, 1);
        dc->last_progress_report = dc->received;
    }

    return 0;
}

/* Performs one download attempt of `entry` into `local_path`, hashing as
 * it streams. Returns 1 if the archive was written AND its MD5 matches
 * the catalog's listing (or the listing had no digest to compare - see
 * below), 0 otherwise (transport failure, HTTP error, length mismatch, or
 * digest mismatch - the caller distinguishes these via *out_had_digest
 * and *out_computed_md5 for the retry state machine and the log line). */
static int attempt_download(const dr_config *cfg, const dr_entry *entry,
                             const char *local_path, char *computed_md5_out)
{
    download_ctx dc;
    unsigned char digest[16];
    char path[256];
    http_response resp;
    int rc;

    /* RepoPath[128] + "/archive/" + a real catalog archiveName always fits
     * sizeof(path); initialize to empty first regardless, so an
     * unreachable-in-practice failure cannot leave a garbage request path. */
    path[0] = '\0';
    if (flow_build_archive_path(path, sizeof(path), cfg->path, entry->archive) < 0) {
        ae_put("Could not build the download URL for this archive (path too long).", 1);
        return 0;
    }

    dc.file = fopen(local_path, "wb");
    if (dc.file == (FILE *) 0) {
        ae_put("Could not open the local file for writing. Check DownloadDir in DoorRepo.cfg.", 1);
        return 0;
    }
    md5_init(&dc.md5);
    dc.received = 0;
    dc.last_progress_report = 0;
    dc.max_bytes = flow_archive_byte_ceiling(entry->size, ARCHIVE_ABSOLUTE_MAX_BYTES,
                                              ARCHIVE_SLACK_FLOOR_BYTES, ARCHIVE_SLACK_PERCENT);
    dc.aborted_for_carrier_loss = 0;
    dc.aborted_for_oversized = 0;

    {
        char msg[128];
        sprintf(msg, "Downloading %s ...", entry->archive);
        ae_put(msg, 1);
    }

    rc = http_get(cfg, path, &resp, download_sink, &dc);
    fclose(dc.file);

    if (dc.aborted_for_carrier_loss) {
        remove(local_path);
        stop_for_carrier_loss();
        return 0; /* unreachable on Amiga; keeps the native build's control flow sane */
    }

    if (dc.aborted_for_oversized) {
        char msg[192];
        sprintf(msg, "Download aborted: the server sent more than %lu bytes (declared size %lu, allowed up to %lu). Discarding.",
                dc.max_bytes, entry->size, dc.max_bytes);
        ae_put(msg, 1);
        remove(local_path);
        {
            char logmsg[192];
            sprintf(logmsg, "DOWNLOAD ABORTED (oversized) archive=%s declared_size=%lu max_bytes=%lu",
                    entry->archive, entry->size, dc.max_bytes);
            log_line(cfg, logmsg);
        }
        return 0;
    }

    if (rc != HTTP_OK) {
        ae_put("Download failed (network error).", 1);
        remove(local_path);
        return 0;
    }
    if (resp.status != 200) {
        char msg[64];
        sprintf(msg, "Download failed: server returned status %d.", resp.status);
        ae_put(msg, 1);
        remove(local_path);
        return 0;
    }
    if (resp.have_content_length && dc.received != resp.content_length) {
        ae_put("Download incomplete: fewer bytes arrived than Content-Length promised.", 1);
        remove(local_path);
        return 0;
    }

    md5_final(&dc.md5, digest);
    md5_hex(digest, computed_md5_out);

    if (entry->md5[0] == '\0') {
        ae_put("Note: the catalog has no MD5 on file for this archive; skipping digest verification.", 1);
        return 1;
    }

    {
        int i;
        int matches = 1;
        for (i = 0; computed_md5_out[i] != '\0' && entry->md5[i] != '\0'; i++) {
            char a = computed_md5_out[i];
            char b = entry->md5[i];
            if (a >= 'A' && a <= 'Z') a = (char) (a - 'A' + 'a');
            if (b >= 'A' && b <= 'Z') b = (char) (b - 'A' + 'a');
            if (a != b) { matches = 0; break; }
        }
        if (strlen(computed_md5_out) != strlen(entry->md5)) {
            matches = 0;
        }
        return matches;
    }
}

static void download_and_verify(const dr_config *cfg, const dr_entry *entry)
{
    char local_path[256];
    char computed_md5[33];
    int attempt;
    int matched;
    flow_verify_outcome outcome;

    /* CWE-22 defense, layer 2: entry->archive was already validated at
     * catalog-parse time (handle_line() in this file never lets an
     * unsafe name into cat->rows[], so `entry` should never point at one)
     * - this is defense in depth against a future code path that could
     * reach download_and_verify() with an entry that bypassed that gate
     * (a bug, a future direct-download-by-name feature). Checked BEFORE
     * flow_build_local_path() even runs, since that is the function whose
     * output feeds straight into fopen(local_path, "wb") below. */
    if (!flow_is_safe_archive_filename(entry->archive)) {
        ae_put("Download refused: this catalog entry's archive name is not a safe filename.", 1);
        log_line(cfg, "DOWNLOAD REFUSED: unsafe archive name");
        return;
    }

    /* DownloadDir[128] + a real catalog archiveName always fits
     * sizeof(local_path); initialize to empty first regardless, so an
     * unreachable-in-practice failure cannot leave a garbage local path. */
    local_path[0] = '\0';
    if (flow_build_local_path(local_path, sizeof(local_path), cfg->download_dir, entry->archive) < 0) {
        ae_put("Could not build a local file path for this archive (DownloadDir + name too long).", 1);
        return;
    }

    computed_md5[0] = '\0'; /* never read uninitialized if attempt_download() fails before computing a digest */

    attempt = 1;
    for (;;) {
        matched = attempt_download(cfg, entry, local_path, computed_md5);

        if (entry->md5[0] == '\0') {
            /* No listing digest to compare against - attempt_download()
             * already reported the specific reason on failure; nothing
             * left for the retry machine to decide either way (see the
             * comment in flow.h: this door only ever drives the machine
             * when a real digest is available). Crucially, `matched`
             * must still be checked here: attempt_download() returns 1
             * in this branch ONLY when the transfer itself genuinely
             * succeeded (see its own comment), so a FAILED download with
             * no catalog digest must stop here too, not fall through to
             * extraction below with nothing at local_path (previously it
             * did - this is what let a failed download with an empty
             * digest still attempt extraction of whatever sat at that
             * path). */
            if (!matched) {
                log_line(cfg, "DOWNLOAD FAILED (no catalog digest to verify)");
                return;
            }
            log_line(cfg, "DOWNLOAD OK (no catalog digest to verify)");
            break;
        }

        outcome = flow_next_verify_outcome(attempt, matched);

        if (outcome == FLOW_VERIFY_OK) {
            char msg[64];
            sprintf(msg, "Checksum verified OK (MD5 %s).", computed_md5);
            ae_put(msg, 1);
            {
                char logmsg[256];
                sprintf(logmsg, "DOWNLOAD OK archive=%s attempt=%d md5=%s", entry->archive, attempt, computed_md5);
                log_line(cfg, logmsg);
            }
            break;
        }

        {
            char msg[192];
            sprintf(msg, "Checksum MISMATCH: catalog says %s, downloaded file is %s.", entry->md5, computed_md5);
            ae_put(msg, 1);
        }
        remove(local_path);

        if (outcome == FLOW_VERIFY_RETRY) {
            ae_put("Retrying download once...", 1);
            {
                char logmsg[256];
                sprintf(logmsg, "DOWNLOAD MISMATCH archive=%s attempt=%d listing_md5=%s computed_md5=%s (retrying)",
                        entry->archive, attempt, entry->md5, computed_md5);
                log_line(cfg, logmsg);
            }
            attempt = 2;
            continue;
        }

        /* FLOW_VERIFY_ABORT */
        ae_put("Second attempt also mismatched. This may be a stale digest recorded on the", 1);
        ae_put("server rather than a corrupted download (see docs/DOOR-REPO-API.md, 'Digest", 1);
        ae_put("freshness'). The file has been discarded. Please contact the repo owner if", 1);
        ae_put("this persists.", 1);
        {
            char logmsg[256];
            sprintf(logmsg, "DOWNLOAD ABORT archive=%s attempt=%d listing_md5=%s computed_md5=%s",
                    entry->archive, attempt, entry->md5, computed_md5);
            log_line(cfg, logmsg);
        }
        return;
    }

    if (cfg->extract_after_download) {
        /* Re-validate immediately before building the system() command
         * line, even though config.c already rejected an unsafe
         * cfg->lha_command/cfg->download_dir/etc when DoorRepo.cfg was
         * parsed. Two independent reasons this check happens AGAIN here,
         * not just once at parse time:
         *   1. Defense in depth against config.c's check ever being
         *      bypassed by a future code path that sets cfg fields
         *      without going through config_load() (a hardcoded
         *      fallback, a future admin-API, a bug) - the boundary that
         *      actually matters is "immediately before the dangerous
         *      operation", not "somewhere upstream, hopefully".
         *   2. entry->archive is SERVER-supplied, not sysop config -
         *      config.c's check never sees it at all. It flows into this
         *      same system() string via local_path (built from
         *      DownloadDir + archive name) and docs/DOOR-REPO-API.md
         *      section 5 documents real, CURRENT catalog rows containing
         *      "$" (and "!"/"&"/"^"/"~") - "curation happens in git"
         *      bounds who can add a name, not what characters a name may
         *      contain, so this is a second live injection path into the
         *      exact same system() call the config-value check protects,
         *      and it needed catching independently.
         *
         * cfg->lha_command uses the ALLOWLIST (flow_is_valid_command_token()),
         * NOT the denylist used for the other two: it sits UNQUOTED at the
         * front of the command line below, and a denylist was proven -
         * twice, live - unable to defend an unquoted position (see
         * flow.h's block comment for the full history, including the
         * "#"-comment bypass this exact re-check exists to catch a second
         * time). cfg->download_dir and entry->archive both sit INSIDE
         * double quotes, where the denylist remains the right tool for
         * SHELL safety - but entry->archive ALSO gets the separate
         * CWE-22 filename check (flow_is_safe_archive_filename()), a
         * different concern (path structure, not shell metacharacters)
         * that download_and_verify() already checked once at the top of
         * this function; re-checked here too for the same reason
         * cfg->lha_command/cfg->download_dir are re-checked twice. */
        if (!flow_is_valid_command_token(cfg->lha_command, sizeof(cfg->lha_command))
            || flow_contains_forbidden_shell_char(cfg->download_dir)
            || flow_contains_forbidden_shell_char(entry->archive)
            || !flow_is_safe_archive_filename(entry->archive)) {
            ae_put("Extraction refused: LhaCommand, DownloadDir, or the archive name is not safe to pass to a shell command. The archive was downloaded and verified but NOT extracted.", 1);
            log_line(cfg, "EXTRACT REFUSED: LhaCommand/DownloadDir/archive name failed validation");
            return;
        }

        {
            char cmd[600];
            int rc;
            /* system() is a dev-convenience choice, not the Amiga-native
             * idiom: AmigaDOS's real equivalent is SystemTags()/Execute()
             * (dos.library), which this reference client does not use
             * because no AmigaDOS-specific process-execution module was
             * built in Tasks 1-5 and system() is standard, portable C89
             * that works identically on both backends for a dev/test
             * build. The validation above is required on EITHER idiom -
             * SystemTags() parses the same AmigaDOS shell command-line
             * syntax and is subject to the same class of injection via
             * an unescaped argument, so switching mechanisms would not
             * remove the need for this check.
             *
             * cfg->lha_command is ALSO quoted here (it was not before the
             * "#"-comment bypass), belt and braces: the allowlist above
             * already guarantees it can contain no quote character, space,
             * or shell metacharacter at all, so quoting it changes nothing
             * about what runs today - but it means a future, more
             * permissive edit to the allowlist cannot immediately become
             * an unquoted-argument execution bug the way LhaCommand's
             * denylist just did. */
            sprintf(cmd, "\"%s\" x \"%s\" \"%s\"", cfg->lha_command, local_path, cfg->download_dir);
            ae_put("Extracting archive...", 1);
            rc = system(cmd);
            if (rc == 0) {
                ae_put("Extraction complete.", 1);
                log_line(cfg, "EXTRACT OK");
            } else {
                char msg[64];
                sprintf(msg, "Extraction failed (exit code %d).", rc);
                ae_put(msg, 1);
                log_line(cfg, "EXTRACT FAILED");
            }
        }
    }
}

static void view_entry(const dr_config *cfg, dr_catalog *cat, unsigned long global_index)
{
    const dr_entry *entry = &cat->rows[global_index - 1];
    char line[256];

    for (;;) {
        if (carrier_lost()) {
            stop_for_carrier_loss();
        }

        ae_put("", 1);
        sprintf(line, "Archive:     %s", entry->archive);
        ae_put(line, 1);
        sprintf(line, "Type:        %s", entry->type);
        ae_put(line, 1);
        sprintf(line, "Size:        %lu bytes", entry->size);
        ae_put(line, 1);
        sprintf(line, "Name:        %s", entry->name);
        ae_put(line, 1);
        sprintf(line, "Description: %s", entry->desc);
        ae_put(line, 1);
        ae_put("", 1);
        ae_put("[D]ownload [Q]uit to browse: ", 0);

        {
            int key = ae_key();
            if (key == -1) {
                stop_for_carrier_loss();
            }
            if (key == 'd' || key == 'D') {
                ae_put("", 1);
                download_and_verify(cfg, entry);
                continue;
            }
            if (key == 'q' || key == 'Q') {
                return;
            }
        }
    }
}

/* ---------------------------------------------------------------------
 * main()
 * ------------------------------------------------------------------- */

int main(int argc, char **argv)
{
    dr_config cfg;
    int skipped;
    int node;
    dr_catalog cat;
    char cache_path[256];
    browse_exit exit_reason;
    char filter_type[16];
    char filter_query[64];
    char filter_desc[128];

    if (argc < 2) {
        fprintf(stderr, "usage: %s <node-number>\n", argv[0]);
        return 1;
    }
    node = atoi(argv[1]);

    if (ae_start(node) != 0) {
        return 1; /* not running under AmiExpress (or setup failed); nothing to report to */
    }

    config_defaults(&cfg);
    skipped = 0;
    config_load(&cfg, DOOR_CONFIG_PATH, &skipped);

    print_banner();

    if (skipped > 0) {
        /* An unsafe-value rejection is a materially different event from
         * an out-of-range number or a typo'd key - it means DoorRepo.cfg
         * contained a value shaped like a shell-injection attempt (see
         * flow.h's flow_contains_forbidden_shell_char() for DownloadDir/
         * LogFile/RepoPath, or flow_is_valid_command_token() for
         * LhaCommand's stricter single-token allowlist), which is worth a
         * sysop's attention even if the rest of the file is fine.
         * Reported separately from ordinary invalid lines rather than
         * folded into one generic count. */
        int unsafe = config_last_unsafe_value_count();
        int ordinary = skipped - unsafe;

        if (unsafe > 0) {
            char msg[320];
            char logmsg[192];
            sprintf(msg, "WARNING: %d line(s) in " DOOR_CONFIG_PATH
                         " were rejected as unsafe (forbidden characters such as quotes/backticks/$/;/\\/|/&/</>/#/CR/LF in DownloadDir, LogFile or RepoPath; or LhaCommand not a single plain command name/path) and used defaults instead. This may indicate a misconfigured or tampered config file.",
                    unsafe);
            ae_put(msg, 1);
            sprintf(logmsg, "CONFIG: %d line(s) in " DOOR_CONFIG_PATH " rejected for forbidden characters, defaults used", unsafe);
            log_line(&cfg, logmsg);
        }
        if (ordinary > 0) {
            char msg[128];
            char logmsg[128];
            sprintf(msg, "Note: %d configuration line(s) in " DOOR_CONFIG_PATH " were invalid (out of range or unrecognized) and used defaults instead.", ordinary);
            ae_put(msg, 1);
            sprintf(logmsg, "CONFIG: %d invalid line(s) in " DOOR_CONFIG_PATH ", defaults used", ordinary);
            log_line(&cfg, logmsg);
        }
    }

    cat.rows = (dr_entry *) 0;
    cat.capacity = 0;
    cat.count = 0;
    cat.unsafe_archive_rows = 0;
    cat.first_unsafe_archive_name[0] = '\0';

    if (load_full_catalog(&cfg, &cat, cache_path, sizeof(cache_path)) != 0) {
        ae_fatal(1);
        return 1; /* unreachable on Amiga */
    }

    filter_desc[0] = '\0';

    for (;;) {
        exit_reason = browse_loop(&cfg, &cat, filter_desc);

        if (exit_reason == BROWSE_QUIT) {
            break;
        }

        if (exit_reason == BROWSE_ALL) {
            filter_desc[0] = '\0';
            if (load_full_catalog(&cfg, &cat, cache_path, sizeof(cache_path)) != 0) {
                ae_fatal(1);
                return 1;
            }
            continue;
        }

        if (exit_reason == BROWSE_FILTER_TYPE) {
            ae_put("Type (e.g. XIM, DD, REXX): ", 0);
            get_trimmed_line(filter_type, sizeof(filter_type));
            if (carrier_lost()) {
                stop_for_carrier_loss();
            }
            /* Real doorType values (XIM/DD/REXX/...) are always plain
             * alphanumeric tokens (docs/DOOR-REPO-API.md section 8), and
             * flow_build_list_query() deliberately does NOT URL-encode
             * this parameter to match that. A user-typed value
             * containing '&'/'='/etc would otherwise be embedded
             * unencoded into the query string and inject extra,
             * unintended query parameters into the request. */
            if (filter_type[0] != '\0' && !flow_is_plain_alnum(filter_type)) {
                ae_put("Type filter must be letters/digits only (e.g. XIM, DD, REXX) - ignoring.", 1);
                filter_type[0] = '\0';
            }
        } else {
            filter_type[0] = '\0';
        }

        if (exit_reason == BROWSE_FILTER_SEARCH) {
            ae_put("Search text: ", 0);
            get_trimmed_line(filter_query, sizeof(filter_query));
            if (carrier_lost()) {
                stop_for_carrier_loss();
            }
        } else {
            filter_query[0] = '\0';
        }

        {
            char query[256];
            int rc;

            /* filter_type[16] URL-encoded (worst case 3x) plus
             * filter_query[64] always fits sizeof(query); initialize to
             * empty first regardless, so an unreachable-in-practice
             * failure falls back to an unfiltered fetch rather than an
             * uninitialized query string. */
            query[0] = '\0';
            if (flow_build_list_query(query, sizeof(query), filter_type, filter_query) < 0) {
                ae_put("Filter text too long to build a search request. Try a shorter search.", 1);
                continue;
            }
            rc = fetch_catalog(&cfg, &cat, query, (FILE *) 0);
            if (rc != HTTP_OK) {
                ae_put("Could not fetch the filtered catalog from the server. Showing the previous results.", 1);
                continue;
            }
            report_unsafe_archive_rows(&cfg, &cat);
            sprintf(filter_desc, "Filter: type='%s' search='%s'", filter_type, filter_query);
        }
    }

    ae_put("Goodbye!", 1);
    ae_shutdown();
    return 0; /* unreachable on Amiga; keeps the native build well-formed */
}
