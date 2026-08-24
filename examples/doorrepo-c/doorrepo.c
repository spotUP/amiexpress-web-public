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
#include "sha256.h"
#include "guide.h"
#include "aedoor.h"
#include "flow.h"
#include "netio.h"
#include "ansi.h"
#include "infocache.h"
#include "shell.h"

#define DOOR_NAME "DoorRepo"
#define DOOR_VERSION "1.0"
#define DOOR_CONFIG_PATH "DoorRepo.cfg"
#define DOOR_CACHE_NAME "listtxt.cache"

/* Hard cap on catalog rows held in memory at once (brief requirement 10).
 * At sizeof(dr_entry) == 408 bytes (measured on this host after list.txt
 * fields 7-10 were added on 2026-08-18; it was 312 before. The layout is
 * platform-independent since every field is a fixed-size char array, a
 * long, or an int), 4096 rows is ~1.6 MB - a deliberate, disclosed
 * ceiling, not a number chosen to fit some specific machine's free RAM.
 * See the task report's memory-accounting section. */
#define MAX_CATALOG_ROWS 4096UL

/* One line of list.txt, generously bounded: archive(64) + type(8) +
 * size(<=20 digits) + md5(32) + name(64) + description(120, per the format
 * doc's 120-char truncation rule) + author(48) + releaseGroup(32) +
 * junkCount(<=10 digits) + hasDoc(1) + 9 '|' separators + CRLF + slack.
 * That worst case is ~410 bytes, so 512 still holds a full row. */
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
 * (the fresh-fetch path already streams via http.c's own chunking).
 *
 * Each fread() here is a dos.library Read() across the emulator boundary, so
 * this size decides how many of them a warm start costs: the cached catalog
 * is ~580 KB, which at the original 512 bytes meant over 1100 Read() calls
 * before the door could draw anything. At 8 KB it is ~72. The buffer is
 * static for the same reason http.c's is - the door's icon declares
 * STACK=8192, so an 8 KB automatic array would not fit. */
#define CACHE_READ_CHUNK 8192

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
    static unsigned char buf[CACHE_READ_CHUNK];
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
    /* The whole row must fit an 80-column terminal, which is what a real BBS
     * session gives you. The fixed part costs 43 columns:
     *   %4lu(4) + 2 + %-20.20s(20) + 1 + %-4.4s(4) + 1 + %6lu(6) + " KB"(3) + 2
     * leaving 37 for the name. It used to allow 40, so every catalog row with
     * a long name emitted an 83-column line and wrapped mid-word onto the next
     * line, breaking the column alignment for the whole page. Seen live with
     * "2MWBICNS.LHA  MagicWB drawer icons for AmiExpress and". */
    sprintf(line, "%4lu  %-20.20s %-4.4s %6lu KB  %-.37s",
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
static void download_and_verify(const dr_config *cfg, const dr_entry *entry);

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

/* ---------------------------------------------------------------------
 * Full-screen ANSI browser
 *
 * Mirrors the repo section of DOORMAN (this project's TypeScript door,
 * Doors/door-manager/app.ts) panel for panel, so a sysop moving between the
 * two sees the same thing: a white-on-blue header bar, a cyan-bordered list
 * on the left labelled " REPO (n) " with the selected row highlighted
 * white-on-blue, a blue-bordered detail pane on the right, and a
 * white-on-blue footer of hotkeys with the trigger letters in yellow.
 *
 * DOORMAN's geometry, reproduced here: header and footer are 3 rows each,
 * the list is 35% of the width, the detail pane takes the remaining 65%,
 * and both sit between the bars (blessed's "100%-6").
 *
 * Deliberately NOT copied from DOORMAN: bare-ESC as "back". A lone ESC is
 * indistinguishable from the start of an arrow sequence without a timer,
 * and that exact ambiguity cost DOORMAN six debugging rounds (see
 * handoff.md, 2026-08-17). Here ESC is only ever read as the lead byte of a
 * CSI sequence, and Q is the single documented way out.
 * ------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
 * FILE_ID.DIZ fetch (GET <path>/diz/<archive>)
 *
 * list.txt collapses every newline to a space by design - it is one row per
 * line, so it has to - which means multi-line DIZ art cannot be
 * reconstructed from a catalog row. It arrives as one flat line and renders
 * as noise. The API therefore exposes the raw DIZ per archive, and this is
 * the only place that reads it.
 *
 * Backed by an LRU (infocache.h). It used to be cached for exactly ONE
 * archive, on the reasoning that a larger cache "would buy little - moving
 * the cursor is the only thing that invalidates it". That is backwards:
 * moving the cursor is what browsing IS. Measured against the live server,
 * every arrow key opened a fresh TCP connection and took 430-620 ms, and
 * arrowing back onto the entry you had just left fetched it all over again.
 *
 * 32 entries is two screens' worth, so the up-and-down movement that
 * dominates browsing stops touching the network entirely. The slab is
 * static (66 KB) and sits against a door that already reserves 1.6 MB for
 * the catalog itself.
 * ------------------------------------------------------------------- */

#define DIZ_MAX_BYTES 2048
#define DIZ_CACHE_SLOTS 32

static char g_diz[DIZ_MAX_BYTES + 1];
static unsigned long g_diz_len = 0;
static char g_diz_archive[64] = "";
static int g_diz_ok = 0;

static info_cache g_diz_cache;
static info_cache_slot g_diz_cache_slots[DIZ_CACHE_SLOTS];
static char g_diz_cache_data[DIZ_CACHE_SLOTS * (DIZ_MAX_BYTES + 1)];

/* Sink context: the destination buffer and how much of it is used. Passing
 * this through http_get()'s ctx parameter - rather than writing to the
 * file-scope cache directly - keeps the sink honest for both toolchains
 * (clang -Wextra warns on an unused parameter, vbcc warns on the
 * "(void) ctx;" idiom used to silence it) and matches how the other sinks
 * in this file are written. */
typedef struct {
    char *buf;
    unsigned long len;
    unsigned long cap;
} diz_ctx;

static int diz_sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    diz_ctx *d = (diz_ctx *) ctx;
    unsigned long i;

    if (d == (diz_ctx *) 0 || buf == (const unsigned char *) 0) {
        return 0;
    }
    for (i = 0; i < len; i++) {
        if (d->len >= d->cap) {
            /* Bounded like every other response body this door reads: a
             * hostile or broken server cannot grow this past its buffer. */
            break;
        }
        d->buf[d->len++] = (char) buf[i];
    }
    d->buf[d->len] = '\0';
    return 0;
}

/* Loads the DIZ for `archive` into the cache. Silent on failure: a missing
 * DIZ is a 404 and an entirely normal state (most catalog rows have none),
 * so it must not interrupt browsing with an error. */
static void diz_load(const dr_config *cfg, const char *archive)
{
    char path[256];
    http_response resp;
    diz_ctx dc;
    int rc;

    int slot;

    if (strcmp(g_diz_archive, archive) == 0) {
        return; /* already the one on screen */
    }

    strncpy(g_diz_archive, archive, sizeof(g_diz_archive) - 1);
    g_diz_archive[sizeof(g_diz_archive) - 1] = '\0';
    g_diz_len = 0;
    g_diz[0] = '\0';
    g_diz_ok = 0;

    /* Seen before - including "the server has no DIZ for this one", which
     * is the commonest answer and so the one most worth remembering. */
    slot = info_cache_find(&g_diz_cache, archive);
    if (slot >= 0) {
        g_diz_len = g_diz_cache.slots[slot].len;
        memcpy(g_diz, info_cache_buffer(&g_diz_cache, slot), (size_t) g_diz_len);
        g_diz[g_diz_len] = '\0';
        g_diz_ok = g_diz_cache.slots[slot].present;
        return;
    }

    if (flow_build_diz_path(path, sizeof(path), cfg->path, archive) < 0) {
        return;
    }

    dc.buf = g_diz;
    dc.len = 0;
    dc.cap = (unsigned long) DIZ_MAX_BYTES;

    rc = http_get(cfg, path, &resp, diz_sink, &dc);
    g_diz_len = dc.len;
    if (rc == HTTP_OK && resp.status == 200 && g_diz_len > 0) {
        g_diz_ok = 1;
    } else {
        g_diz_len = 0;
        g_diz[0] = '\0';
    }

    /* A transport failure is NOT cached: that is a link problem, not a fact
     * about the archive, and the next attempt deserves to reach the server.
     * A 200 and a 404 are both facts and are both kept. */
    if (rc == HTTP_OK) {
        unsigned long cap = 0;
        slot = info_cache_reserve(&g_diz_cache, archive, &cap);
        if (slot >= 0) {
            memcpy(info_cache_buffer(&g_diz_cache, slot), g_diz, (size_t) g_diz_len);
            info_cache_commit(&g_diz_cache, slot, g_diz_len, g_diz_ok);
        }
    }
}

/* ---------------------------------------------------------------------
 * Live filtering, client side
 *
 * DOORMAN filters its repo list in place, over the rows it already holds,
 * with no server round trip (Doors/door-manager/app.ts: filterByDoorType()
 * + its filter box). This door holds the whole catalog in memory too, so it
 * does the same: `view` is an index into cat->rows of the entries currently
 * shown, rebuilt whenever the text or type filter changes.
 *
 * The older line-mode path still asks the server for a filtered catalog
 * (BROWSE_FILTER_* exits); that remains for Ansi=no. Filtering in memory is
 * both closer to DOORMAN and dramatically faster on a dial-up link, where a
 * refetch of 3300 rows to narrow a list is not a reasonable thing to do.
 * ------------------------------------------------------------------- */

#define UI_FILTER_MAX 32

/* What the detail pane is showing. DOORMAN offers the same three views of an
 * entry: its DIZ, its archive contents ("A"), and its documentation ("V"). */
#define UI_INFO_DIZ   0
#define UI_INFO_FILES 1
#define UI_INFO_DOC   2

typedef struct {
    unsigned long *index;      /* into cat->rows */
    unsigned long count;
    char text[UI_FILTER_MAX + 1];
    char type[16];             /* "" = every type */
    unsigned long scroll_top;  /* first visible view row, for the scrollbar */
} ui_view;

/* Case-insensitive ASCII compare of one byte. */
static int ui_lower(int c)
{
    if (c >= 'A' && c <= 'Z') {
        return c - 'A' + 'a';
    }
    return c;
}

/* Case-insensitive substring test. Returns non-zero when `needle` occurs in
 * `hay`; an empty needle always matches. */
static int ui_contains_ci(const char *hay, const char *needle)
{
    unsigned long i;
    unsigned long j;

    if (needle[0] == '\0') {
        return 1;
    }
    for (i = 0; hay[i] != '\0'; i++) {
        for (j = 0; needle[j] != '\0'; j++) {
            if (ui_lower((unsigned char) hay[i + j]) != ui_lower((unsigned char) needle[j])) {
                break;
            }
        }
        if (needle[j] == '\0') {
            return 1;
        }
    }
    return 0;
}

static int ui_equals_ci(const char *a, const char *b)
{
    unsigned long i;

    for (i = 0; a[i] != '\0' && b[i] != '\0'; i++) {
        if (ui_lower((unsigned char) a[i]) != ui_lower((unsigned char) b[i])) {
            return 0;
        }
    }
    return a[i] == '\0' && b[i] == '\0';
}

/* Rebuilds `v->index` from the current filters. Text matches the archive
 * name, door name, description, author and release group - the same five
 * catalog fields the server's own ?q= search matches (DOOR-REPO-API.md
 * section 8) and the same ones DOORMAN filters on.
 *
 * Author and group only became matchable when list.txt grew fields 7 and 8
 * (2026-08-18). Before that this door searched three fields while the
 * server searched six, so the SAME query typed into the ANSI browser (which
 * filters in memory) and into the line-mode search (which asks the server)
 * returned different results - typing a group name found nothing here and
 * everything there. Against a server that predates the append the two
 * fields are simply empty and match nothing, which is the old behaviour. */
static void ui_view_rebuild(ui_view *v, const dr_catalog *cat)
{
    unsigned long i;

    v->count = 0;
    for (i = 0; i < cat->count; i++) {
        const dr_entry *e = &cat->rows[i];

        if (v->type[0] != '\0' && !ui_equals_ci(e->type, v->type)) {
            continue;
        }
        if (v->text[0] != '\0'
            && !ui_contains_ci(e->archive, v->text)
            && !ui_contains_ci(e->name, v->text)
            && !ui_contains_ci(e->desc, v->text)
            && !ui_contains_ci(e->author, v->text)
            && !ui_contains_ci(e->group, v->text)) {
            continue;
        }
        v->index[v->count++] = i;
    }
}

/* Advances `v->type` to the next distinct type present in the catalog,
 * wrapping through "" (= all). Mirrors DOORMAN's cycleSystemFilter, which
 * cycles the types actually present rather than a hardcoded list, so a
 * catalog with no DD doors never offers a DD filter that yields nothing. */
static void ui_view_cycle_type(ui_view *v, const dr_catalog *cat)
{
    char seen[16][16];
    int nseen = 0;
    unsigned long i;
    int j;
    int cur;

    for (i = 0; i < cat->count && nseen < 16; i++) {
        const char *t = cat->rows[i].type;
        int dup = 0;
        if (t[0] == '\0') {
            continue;
        }
        for (j = 0; j < nseen; j++) {
            if (ui_equals_ci(seen[j], t)) {
                dup = 1;
                break;
            }
        }
        if (!dup) {
            strncpy(seen[nseen], t, sizeof(seen[0]) - 1);
            seen[nseen][sizeof(seen[0]) - 1] = '\0';
            nseen++;
        }
    }

    /* Position in the cycle: -1 is "all", then each distinct type in turn. */
    cur = -1;
    for (j = 0; j < nseen; j++) {
        if (ui_equals_ci(seen[j], v->type)) {
            cur = j;
            break;
        }
    }
    cur++;
    if (cur >= nseen) {
        v->type[0] = '\0';
    } else {
        strncpy(v->type, seen[cur], sizeof(v->type) - 1);
        v->type[sizeof(v->type) - 1] = '\0';
    }
}

/* ---------------------------------------------------------------------
 * Archive contents (GET <path>/files/<archive>)
 *
 * DOORMAN's info pane lists what is inside an archive and how many of those
 * files are ads ("N files / N ad files"). Same idea here, but fetched ONLY
 * when the user asks for it with V: on a real Amiga link, pulling a contents
 * listing on every cursor move would cost more than it is worth. Cached for
 * one archive, exactly like the DIZ.
 * ------------------------------------------------------------------- */

/* Raised from 4096 on 2026-08-18. The listing stopped being only a display
 * for the [A]rchive pane when install arrived: it is now the manifest the
 * door picks the executable from and deletes ad files by, and a truncated
 * manifest silently leaves ads on disk. 16 KB holds the full listing for
 * every archive in the current catalog. Static, not stack. */
#define FILES_MAX_BYTES 16384
/* Four entries, not the DIZ pane's 32: these are 16 KB each, and the archive
 * listing is something a sysop opens for one door at a time rather than
 * scrolls a page of. Enough to make going back to the previous few free. */
#define FILES_CACHE_SLOTS 4

static char g_files[FILES_MAX_BYTES + 1];
static char g_files_archive[64] = "";
static int g_files_ok = 0;

static info_cache g_files_cache;
static info_cache_slot g_files_cache_slots[FILES_CACHE_SLOTS];
static char g_files_cache_data[FILES_CACHE_SLOTS * (FILES_MAX_BYTES + 1)];

static int files_sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    diz_ctx *d = (diz_ctx *) ctx;
    unsigned long i;

    if (d == (diz_ctx *) 0 || buf == (const unsigned char *) 0) {
        return 0;
    }
    for (i = 0; i < len; i++) {
        if (d->len >= d->cap) {
            break;
        }
        d->buf[d->len++] = (char) buf[i];
    }
    d->buf[d->len] = '\0';
    return 0;
}

/* Raised from 8192 on 2026-08-18, when node navigation arrived: 918 of the
 * catalog's 3218 documents are larger than 8 KB, so more than a quarter of
 * them used to be cut off - and a truncated AmigaGuide loses whole nodes,
 * not just a tail. 24 KB covers all but 186 of them. It is static, not
 * stack (this door's icon declares STACK=8192). */
#define DOC_MAX_BYTES 24576
/* Two: a document is read, not skimmed past, and at 24 KB each these are the
 * most expensive entries in the door. Two makes "back to the one before"
 * free, which is the only revisit that happens in practice. */
#define DOC_CACHE_SLOTS 2

static char g_doc[DOC_MAX_BYTES + 1];
static char g_doc_archive[64] = "";
static int g_doc_ok = 0;

static info_cache g_doc_cache;
static info_cache_slot g_doc_cache_slots[DOC_CACHE_SLOTS];
static char g_doc_cache_data[DOC_CACHE_SLOTS * (DOC_MAX_BYTES + 1)];

/* ---- AmigaGuide state -------------------------------------------------
 *
 * A third of the catalog's documentation is AmigaGuide. Rendering happens
 * once per node visit, into g_guide_render, and the pane then windows over
 * that buffer exactly as it does over a plain document - so link numbers
 * stay put while the reader scrolls, and scrolling costs no re-parsing.
 * All of it is static for the same reason as g_doc. */
static guide_doc g_guide;
static guide_link g_guide_links[GUIDE_MAX_LINKS];
static char g_guide_render[DOC_MAX_BYTES + 2048];
static int g_guide_ok = 0;
static int g_guide_link_count = 0;
static int g_guide_node = -1;
/* Where B goes back to. 16 deep: real documents are shallow, and a reader
 * who has gone deeper than that still gets back one step at a time. */
static int g_guide_history[16];
static int g_guide_history_len = 0;

/* Renders `node` into g_guide_render and makes it the current node. */
static void guide_show_node(int node)
{
    if (node < 0 || node >= g_guide.node_count) {
        return;
    }
    g_guide_node = node;
    (void) guide_render_node(g_doc, &g_guide, node, g_guide_render,
                             (unsigned long) sizeof(g_guide_render),
                             g_guide_links, GUIDE_MAX_LINKS, &g_guide_link_count);
}

static void doc_load(const dr_config *cfg, const char *archive)
{
    char path[256];
    http_response resp;
    diz_ctx dc;
    int rc;

    int slot;

    if (strcmp(g_doc_archive, archive) == 0) {
        return;
    }

    strncpy(g_doc_archive, archive, sizeof(g_doc_archive) - 1);
    g_doc_archive[sizeof(g_doc_archive) - 1] = '\0';
    g_doc[0] = '\0';
    g_doc_ok = 0;
    g_guide_ok = 0;
    g_guide_node = -1;
    g_guide_link_count = 0;
    g_guide_history_len = 0;

    /* A cached document is re-parsed rather than the parse being cached
     * alongside it. guide_doc holds offsets into g_doc and the renderer
     * reads its node/link/history state from single globals, so keeping N
     * parsed guides would mean N copies of all of that; re-parsing is local
     * CPU against an HTTP fetch, and it keeps one source of truth for what
     * the reader is currently looking at. */
    slot = info_cache_find(&g_doc_cache, archive);
    if (slot >= 0) {
        unsigned long len = g_doc_cache.slots[slot].len;
        memcpy(g_doc, info_cache_buffer(&g_doc_cache, slot), (size_t) len);
        g_doc[len] = '\0';
        g_doc_ok = g_doc_cache.slots[slot].present;
        if (g_doc_ok && guide_looks_like_guide(g_doc) && guide_parse(g_doc, &g_guide) > 0) {
            g_guide_ok = 1;
            guide_show_node(g_guide.main_node >= 0 ? g_guide.main_node : 0);
        }
        return;
    }

    if (flow_build_doc_path(path, sizeof(path), cfg->path, archive) < 0) {
        return;
    }

    dc.buf = g_doc;
    dc.len = 0;
    dc.cap = (unsigned long) DOC_MAX_BYTES;

    rc = http_get(cfg, path, &resp, files_sink, &dc);
    if (rc == HTTP_OK && resp.status == 200 && dc.len > 0) {
        g_doc_ok = 1;
        if (guide_looks_like_guide(g_doc) && guide_parse(g_doc, &g_guide) > 0) {
            g_guide_ok = 1;
            guide_show_node(g_guide.main_node >= 0 ? g_guide.main_node : 0);
        }
    } else {
        g_doc[0] = '\0';
        dc.len = 0;
    }

    if (rc == HTTP_OK) {
        unsigned long cap = 0;
        slot = info_cache_reserve(&g_doc_cache, archive, &cap);
        if (slot >= 0) {
            memcpy(info_cache_buffer(&g_doc_cache, slot), g_doc, (size_t) dc.len);
            info_cache_commit(&g_doc_cache, slot, dc.len, g_doc_ok);
        }
    }
}

static void files_load(const dr_config *cfg, const char *archive)
{
    char path[256];
    http_response resp;
    diz_ctx fc;
    int rc;

    int slot;

    if (strcmp(g_files_archive, archive) == 0) {
        return;
    }

    strncpy(g_files_archive, archive, sizeof(g_files_archive) - 1);
    g_files_archive[sizeof(g_files_archive) - 1] = '\0';
    g_files[0] = '\0';
    g_files_ok = 0;

    slot = info_cache_find(&g_files_cache, archive);
    if (slot >= 0) {
        unsigned long len = g_files_cache.slots[slot].len;
        memcpy(g_files, info_cache_buffer(&g_files_cache, slot), (size_t) len);
        g_files[len] = '\0';
        g_files_ok = g_files_cache.slots[slot].present;
        return;
    }

    if (flow_build_files_path(path, sizeof(path), cfg->path, archive) < 0) {
        return;
    }

    fc.buf = g_files;
    fc.len = 0;
    fc.cap = (unsigned long) FILES_MAX_BYTES;

    rc = http_get(cfg, path, &resp, files_sink, &fc);
    if (rc == HTTP_OK && resp.status == 200 && fc.len > 0) {
        g_files_ok = 1;
    } else {
        g_files[0] = '\0';
        fc.len = 0;
    }

    if (rc == HTTP_OK) {
        unsigned long cap = 0;
        slot = info_cache_reserve(&g_files_cache, archive, &cap);
        if (slot >= 0) {
            memcpy(info_cache_buffer(&g_files_cache, slot), g_files, (size_t) fc.len);
            info_cache_commit(&g_files_cache, slot, fc.len, g_files_ok);
        }
    }
}

/* Whether selecting `archive` in `mode` will actually go to the network.
 * The browser paints "Fetching..." before a load, and after the caches
 * arrived that banner was the only thing still behaving as if every
 * selection change were a fetch - it would flash on entries being served
 * from memory in well under a millisecond. */
static int info_needs_fetch(int mode, const char *archive)
{
    info_cache *cache = (mode == UI_INFO_FILES) ? &g_files_cache :
                        (mode == UI_INFO_DOC)   ? &g_doc_cache :
                                                  &g_diz_cache;
    const char *current = (mode == UI_INFO_FILES) ? g_files_archive :
                          (mode == UI_INFO_DOC)   ? g_doc_archive :
                                                    g_diz_archive;

    if (strcmp(current, archive) == 0) {
        return 0;
    }
    return info_cache_find(cache, archive) < 0;
}

/* Sets up the info-pane caches. Called once at startup, before the browser
 * runs: the slabs are static, so this only has to establish the bookkeeping. */
static void info_caches_init(void)
{
    info_cache_init(&g_diz_cache, g_diz_cache_slots, g_diz_cache_data,
                    DIZ_CACHE_SLOTS, (unsigned long) DIZ_MAX_BYTES);
    info_cache_init(&g_files_cache, g_files_cache_slots, g_files_cache_data,
                    FILES_CACHE_SLOTS, (unsigned long) FILES_MAX_BYTES);
    info_cache_init(&g_doc_cache, g_doc_cache_slots, g_doc_cache_data,
                    DOC_CACHE_SLOTS, (unsigned long) DOC_MAX_BYTES);
}

static int ui_already_downloaded(const dr_config *cfg, const char *archive);

#define UI_HEADER_ROWS 3
#define UI_FOOTER_ROWS 3

/* One composed frame. 80x24 of text plus the escapes for colour changes and
 * cursor moves fits well inside this; ansi.c truncates rather than
 * overflowing if a much larger terminal is configured. */
#define UI_FRAME_BYTES 16384

/* How long the detail pane waits for the user to settle before it draws.
 *
 * Moving the highlight is cheap - two list rows and a footer. Filling the
 * pane beside it is not: it can be an HTTP fetch plus most of a screenful of
 * output, and on a BBS link every 198 bytes of that is a separate round
 * trip. Drawing it for a row the cursor is passing over is pure waste, and
 * it is what makes a list feel like it is fighting back.
 *
 * So the pane holds off for a quiet period after the selection moves. The
 * wait is done in slices with Delay(), checking between them whether the
 * user has typed again - so a held cursor key never pays the full wait, it
 * just keeps postponing the pane until the user stops.
 *
 * 3 x 4 ticks = 240ms at 50 ticks/second. Long enough to swallow a fast
 * repeat, short enough that a deliberate single keypress does not feel
 * laggy. */
#define PANE_DEBOUNCE_SLICES 3
#define PANE_DEBOUNCE_TICKS  4

typedef struct {
    int rows;
    int cols;
    int list_left;
    int list_width;
    int info_left;
    int info_width;
    int pane_top;
    int pane_height;
    int visible_rows;
} ui_geometry;

/* `wide` drops the list and gives the detail pane the whole screen.
 *
 * The archive listing and the documentation are the two views that are
 * genuinely too big for 65% of an 80-column terminal: Amiga documentation is
 * written to 80 columns, so reading it through a 51-column window wraps
 * every line of it, and a file listing loses its size column. Nothing is
 * given up by hiding the list while one of them is open - the cursor keys
 * scroll the pane rather than the list in that state (see the browser loop),
 * so the list is not interactive there at all. */
static void ui_compute_geometry(const dr_config *cfg, ui_geometry *g, int wide)
{
    g->rows = cfg->screen_rows;
    g->cols = cfg->screen_cols;
    g->list_left = 1;
    if (wide) {
        g->list_width = 0;
        g->info_left = g->list_left;
        g->info_width = g->cols;
    } else {
        /* 35% of the width, matching DoormanLayout's listPanel. */
        g->list_width = (g->cols * 35) / 100;
        if (g->list_width < 18) {
            g->list_width = 18;
        }
        g->info_left = g->list_left + g->list_width;
        g->info_width = g->cols - g->list_width;
    }
    g->pane_top = UI_HEADER_ROWS + 1;
    g->pane_height = g->rows - UI_HEADER_ROWS - UI_FOOTER_ROWS;
    if (g->pane_height < 3) {
        g->pane_height = 3;
    }
    /* Two rows of the panel are its own top and bottom border. */
    g->visible_rows = g->pane_height - 2;
    if (g->visible_rows < 1) {
        g->visible_rows = 1;
    }
}

/* Appends the decimal form of an unsigned long to a NUL-terminated buffer. */
static void ui_append_ulong(char *out, unsigned long v)
{
    char tmp[24];
    int i;
    int p;

    i = 0;
    if (v == 0UL) {
        tmp[i++] = '0';
    }
    while (v > 0UL) {
        tmp[i++] = (char) ('0' + (int) (v % 10UL));
        v /= 10UL;
    }
    p = (int) strlen(out);
    while (i > 0) {
        out[p++] = tmp[--i];
    }
    out[p] = '\0';
}

/* "<n>k", rounded the way DOORMAN rounds it (Math.round(bytes/1024)). */
static void ui_format_kb(char *out, unsigned long bytes)
{
    unsigned long kb;

    kb = bytes / 1024UL + ((bytes % 1024UL >= 512UL) ? 1UL : 0UL);
    out[0] = '\0';
    ui_append_ulong(out, kb);
    strcat(out, "k");
}

static void ui_draw_bar(ansi_buf *b, int top, int cols, const char *text)
{
    int i;

    for (i = 0; i < UI_HEADER_ROWS; i++) {
        ansi_fill(b, top + i, 1, cols, ANSI_WHITE, ANSI_BLUE);
    }
    ansi_color(b, ANSI_WHITE, ANSI_BLUE, 1);
    ansi_center(b, top + 1, 1, cols, text);
}

/* Install index, defined further down with the rest of its file I/O. The
 * browser needs it here: the list mark, the header count and the detail
 * pane's "[CMD]" tag all read it. */
static const char *index_lookup(const dr_config *cfg, const char *archive);
static int index_installed_count(const dr_config *cfg);

static void ui_draw_header(ansi_buf *b, const ui_geometry *g, const dr_catalog *cat,
                           const ui_view *v, const char *filter_desc,
                           int installed_count)
{
    char title[160];

    strcpy(title, "DoorRepo v");
    strcat(title, DOOR_VERSION);
    strcat(title, "   ");
    ui_append_ulong(title, v->count);
    strcat(title, " of ");
    ui_append_ulong(title, cat->count);
    strcat(title, " doors");
    /* "N installed" mirrors DOORMAN's own header, which reports the same
     * two numbers for the repo it is browsing. */
    if (installed_count > 0) {
        strcat(title, "   ");
        ui_append_ulong(title, (unsigned long) installed_count);
        strcat(title, " installed");
    }

    /* Show WHICH filters are active, not merely that some are - otherwise a
     * user who forgot a type filter sees a short list with no explanation. */
    if (v->type[0] != '\0') {
        strcat(title, "   type=");
        strncat(title, v->type, sizeof(title) - strlen(title) - 1);
    }
    if (v->text[0] != '\0') {
        strcat(title, "   find=");
        strncat(title, v->text, sizeof(title) - strlen(title) - 1);
    }
    if (filter_desc != (const char *) 0 && filter_desc[0] != '\0'
        && v->type[0] == '\0' && v->text[0] == '\0') {
        strcat(title, "   [server filter]");
    }
    ui_draw_bar(b, 1, g->cols, title);
}

/* Same shape as DOORMAN's repoViewFooterParts(), with this door's real
 * actions substituted for the ones it does not have (it downloads and
 * verifies rather than installing into the BBS).
 *
 * V=Doc appears only when the selected entry actually has documentation,
 * exactly as DOORMAN drops its "View doc" part when doc_raw is empty. The
 * flag rides in on list.txt field 10, so this costs no request: before that
 * field existed the key was advertised unconditionally and a user pressing
 * it on one of the 83 doc-less doors waited out a fetch to be told there
 * was nothing.
 *
 * `e` may be NULL (empty/filtered-to-nothing list), and e->has_doc may be
 * -1 ("the server never said" - an older repo, or a cached listing written
 * by one). Both show the key: an unknown is not a "no", and hiding a key
 * that would have worked is the worse error of the two. */
static void ui_draw_footer(ansi_buf *b, const ui_geometry *g, const dr_entry *e,
                          int installed, int has_junk)
{
    char bar[160];

    strcpy(bar, installed ? "ENTER/R=Get  U=Uninstall" : "ENTER/R=Get  I=Install");
    /* S appears on the same condition DOORMAN applies: the door is
     * installed AND its archive actually contains ads. Offering it
     * otherwise advertises an action that can only answer "nothing to
     * do". A junk count of -1 (an older server that does not report one)
     * counts as "might have some", the same way an unknown has_doc still
     * offers V. */
    if (installed && has_junk) {
        strcat(bar, "  S=Strip ads");
    }
    strcat(bar, "  A=Archive");
    if (e == (const dr_entry *) 0 || e->has_doc != 0) {
        strcat(bar, "  V=Doc");
    }
    strcat(bar, "  F=Find  C=System  Q=Quit");
    ui_draw_bar(b, g->rows - UI_FOOTER_ROWS + 1, g->cols, bar);
}

/* Draws list rows. `only_row_a`/`only_row_b` are visible-row indices to
 * repaint, or -1 for "all of them".
 *
 * Repainting just the two rows whose highlight changed is what makes cursor
 * movement feel immediate: ae_put() chunks at AE_MAX_LINE (198 bytes), so a
 * full-frame redraw costs about 25 XIM round trips per keystroke, while two
 * rows plus the detail pane costs about five. */
/* Paints one cell of the scrollbar on the list panel's right border, the
 * blessed list's { scrollbar: { bg:'blue' } } equivalent. The thumb spans
 * the proportion of the list currently visible, so it doubles as a
 * position indicator on a 3300-row catalog where the row numbers alone
 * give no sense of place. */
static void ui_draw_scroll_marker(ansi_buf *b, const ui_geometry *g,
                                  const ui_view *v, int visible_row)
{
    int col = g->list_left + g->list_width - 1;
    int row = g->pane_top + 1 + visible_row;
    unsigned long first;
    unsigned long last;
    unsigned long total = v->count;
    int thumb;

    if (total <= (unsigned long) g->visible_rows) {
        return; /* everything fits: no bar, same as blessed */
    }

    /* Which slice of the whole list this row of the bar represents. */
    first = ((unsigned long) visible_row * total) / (unsigned long) g->visible_rows;
    last  = ((unsigned long) (visible_row + 1) * total) / (unsigned long) g->visible_rows;
    thumb = 0;
    {
        unsigned long topv = v->scroll_top;
        unsigned long botv = topv + (unsigned long) g->visible_rows;
        if (last > topv && first < botv) {
            thumb = 1;
        }
    }

    if (thumb) {
        ansi_color(b, ANSI_WHITE, ANSI_BLUE, 0);
        ansi_text_raw(b, row, col, " ", 1);
    } else {
        ansi_color(b, ANSI_CYAN, ANSI_BLACK, 0);
        ansi_text_raw(b, row, col, "|", 1);
    }
}

static void ui_draw_list(ansi_buf *b, const dr_config *cfg, const ui_geometry *g,
                         const dr_catalog *cat, const ui_view *v,
                         unsigned long top_index, unsigned long selected,
                         int only_row_a, int only_row_b)
{
    int i;
    int inner;

    /* No list at all while a detail view has the screen. Guarding here
     * rather than at each call site keeps the browser loop's redraw logic
     * (full / scrolled / two rows changed) in one shape for both layouts. */
    if (g->list_width <= 0) {
        return;
    }

    inner = g->list_width - 2;

    for (i = 0; i < g->visible_rows; i++) {
        unsigned long idx;
        int row;
        char line[256];
        char kb[24];
        int namew;
        int n;

        if (only_row_a >= 0 && i != only_row_a && i != only_row_b) {
            continue;
        }
        idx = top_index + (unsigned long) i;
        row = g->pane_top + 1 + i;

        if (idx >= v->count) {
            /* Blank rows past the end, so a shorter filtered result cannot
             * leave the previous listing visible underneath it. */
            ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
            ansi_text(b, row, g->list_left + 1, "", inner);
            ui_draw_scroll_marker(b, g, v, i);
            continue;
        }
        idx = v->index[idx];

        ui_format_kb(kb, cat->rows[idx].size);
        namew = inner - (int) strlen(kb) - 1;
        if (namew < 1) {
            namew = 1;
        }

        /* Two different states, two different marks, most significant
         * first: '+' means this archive is installed as a BBS command
         * (from the install index - no disk probe), '*' means it is merely
         * sitting in DownloadDir. DOORMAN shows the installed state the
         * same way round, as its own list mark rather than only in the
         * detail pane. The DownloadDir probe still happens only for rows
         * actually on screen. */
        n = 0;
        if (index_lookup(cfg, cat->rows[idx].archive) != (const char *) 0) {
            line[n++] = '+';
        } else {
            line[n++] = ui_already_downloaded(cfg, cat->rows[idx].archive) ? '*' : ' ';
        }
        while (n < namew && cat->rows[idx].archive[n - 1] != '\0') {
            line[n] = cat->rows[idx].archive[n - 1];
            n++;
        }
        while (n < namew) {
            line[n++] = ' ';
        }
        line[n++] = ' ';
        {
            const char *k = kb;
            while (*k != '\0' && n < inner) {
                line[n++] = *k++;
            }
        }
        line[n] = '\0';

        /* The selected row is white-on-blue for its full inner width, the
         * same as blessed's { selected: { bg:'blue', fg:'white' } }. Setting
         * the colour BEFORE the padded write is what makes the highlight
         * span the whole row rather than just the characters. */
        if (top_index + (unsigned long) i == selected) {
            ansi_color(b, ANSI_WHITE, ANSI_BLUE, 1);
        } else {
            ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
        }
        ansi_text(b, row, g->list_left + 1, line, inner);
        ui_draw_scroll_marker(b, g, v, i);
    }
    ansi_reset(b);
}

/* Writes `text` into the info pane starting at *row, wrapping at spaces
 * rather than mid-word, and stops at `last_row`. Returns via *row the next
 * free row. Word wrapping is what makes a FILE_ID.DIZ-style description
 * readable - chopping every N bytes split words across lines and was the
 * "renders broken" report. */
static void ui_wrap_text(ansi_buf *b, const ui_geometry *g, const char *text,
                         int *row, int last_row, int width)
{
    const char *p = text;

    while (*p != '\0' && *row <= last_row) {
        int take;
        int brk;
        int i;
        char chunk[256];

        /* How much fits. */
        take = 0;
        while (take < width && p[take] != '\0') {
            take++;
        }
        /* Back up to the last space unless the whole remainder fits. */
        brk = take;
        if (p[take] != '\0') {
            int sp = -1;
            for (i = 0; i < take; i++) {
                if (p[i] == ' ') {
                    sp = i;
                }
            }
            if (sp > 0) {
                brk = sp;
            }
        }
        if (brk > (int) sizeof(chunk) - 1) {
            brk = (int) sizeof(chunk) - 1;
        }
        for (i = 0; i < brk; i++) {
            chunk[i] = p[i];
        }
        chunk[brk] = '\0';

        ansi_text(b, *row, g->info_left + 2, chunk, width);
        (*row)++;

        p += brk;
        while (*p == ' ') {
            p++;
        }
    }
}

/* The static chrome: header bar, footer bar and both panel frames. None of
 * it changes while browsing, so it is painted once per full redraw instead
 * of on every keystroke. */
static void ui_draw_chrome(ansi_buf *b, const dr_config *cfg, const ui_geometry *g,
                           const dr_catalog *cat, const ui_view *v,
                           const char *filter_desc, const dr_entry *sel_entry)
{
    char label[48];

    /* Label carries the FILTERED count, like DOORMAN's ` REPO (n) `. */
    strcpy(label, "REPO (");
    ui_append_ulong(label, v->count);
    strcat(label, ")");

    ui_draw_header(b, g, cat, v, filter_desc, index_installed_count(cfg));
    if (g->list_width > 0) {
        ansi_box(b, g->pane_top, g->list_left, g->pane_height, g->list_width, ANSI_CYAN, label);
    }
    ansi_box(b, g->pane_top, g->info_left, g->pane_height, g->info_width, ANSI_BLUE,
             (const char *) 0);
    ui_draw_footer(b, g, sel_entry,
                   sel_entry != (const dr_entry *) 0
                       && index_lookup(cfg, sel_entry->archive) != (const char *) 0,
                   sel_entry != (const dr_entry *) 0 && sel_entry->junk != 0);
    ansi_reset(b);
}

/* Draws the detail pane and returns how many rows it used, so the next call
 * can blank exactly the rows the previous entry occupied instead of
 * repainting the whole pane. `used_last` is that count from the previous
 * call (0 on a full redraw). Every row this writes is space-padded to the
 * pane width, so it overwrites whatever was under it without a separate
 * clearing pass - only the tail beyond the new content needs blanking. */
/* Non-zero when this archive is already present in DownloadDir.
 *
 * DOORMAN tags an entry it has installed with a green "[installed_as]" in
 * its info pane; the local equivalent for this door - which downloads rather
 * than installs - is "already downloaded". Checked for the SELECTED entry
 * only, one stat per selection change, rather than for every visible row on
 * every redraw: on a real Amiga a directory probe per row per keystroke is a
 * cost with no payoff. */
static int ui_already_downloaded(const dr_config *cfg, const char *archive)
{
    char local[256];
    FILE *f;

    if (flow_build_local_path(local, sizeof(local), cfg->download_dir, archive) < 0) {
        return 0;
    }
    f = fopen(local, "rb");
    if (f == (FILE *) 0) {
        return 0;
    }
    fclose(f);
    return 1;
}

static int ui_draw_info(ansi_buf *b, const dr_config *cfg, const ui_geometry *g,
                        const dr_catalog *cat, const ui_view *v,
                        unsigned long selected, int used_last, int info_mode,
                        int info_scroll)
{
    int inner;
    int row;
    int last_row;
    int i;
    int first_row;
    const dr_entry *e;
    char line[256];
    char kb[24];

    inner = g->info_width - 2;
    row = g->pane_top + 1;
    first_row = row;
    last_row = g->pane_top + g->pane_height - 2;

    if (v->count == 0) {
        ansi_color(b, ANSI_YELLOW, ANSI_BLACK, 1);
        ansi_text(b, row, g->info_left + 1, " No matching doors found.", inner);
        ansi_reset(b);
        return 1;
    }

    e = &cat->rows[v->index[selected]];

    /* Same three fields, in the same order, as DOORMAN's updateInfo():
     * archive name in yellow, then type and size. */
    ansi_color(b, ANSI_YELLOW, ANSI_BLACK, 1);
    ansi_text(b, row, g->info_left + 2, e->archive, inner - 2);

    ui_format_kb(kb, e->size);
    strcpy(line, e->type[0] != '\0' ? e->type : "XIM");
    strcat(line, "   ");
    strcat(line, kb);
    strcat(line, "   #");
    ui_append_ulong(line, v->index[selected] + 1UL);
    ansi_color(b, ANSI_CYAN, ANSI_BLACK, 0);
    ansi_text(b, row + 1, g->info_left + 2, line, inner - 2);

    {
        /* DOORMAN puts a green "[installed_as]" here for a door it has
         * installed, and nothing else if it has not. Same rule: the
         * install state is the more useful fact, so it wins the space. */
        const char *installed_as = index_lookup(cfg, e->archive);
        int at = (int) strlen(line) + 3;

        if (installed_as != (const char *) 0) {
            char tag[32];
            strcpy(tag, "[");
            strncat(tag, installed_as, sizeof(tag) - 4);
            strcat(tag, "]");
            ansi_color(b, ANSI_GREEN, ANSI_BLACK, 1);
            ansi_text_raw(b, row + 1, g->info_left + 2 + at, tag, (int) strlen(tag));
        } else if (ui_already_downloaded(cfg, e->archive)) {
            ansi_color(b, ANSI_GREEN, ANSI_BLACK, 1);
            ansi_text_raw(b, row + 1, g->info_left + 2 + at, "[downloaded]", 12);
        }
    }

    /* Credits line: author and release group, both from list.txt fields 7
     * and 8, and the archive's ad-file count from field 9. DOORMAN shows
     * the same metadata from its local catalog; before those fields existed
     * this door could not show any of it, and the ad count in particular
     * needed a separate /files request per entry to learn.
     *
     * Painted unconditionally even when there is nothing to say - see the
     * spacer note below; a counted-but-unpainted row keeps the previous
     * entry's pixels. */
    line[0] = '\0';
    if (e->author[0] != '\0') {
        strcpy(line, "by ");
        strncat(line, e->author, sizeof(line) - 40);
    }
    if (e->group[0] != '\0') {
        strcat(line, (line[0] != '\0') ? " / " : "");
        strncat(line, e->group, 33);
    }
    ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
    ansi_text(b, row + 2, g->info_left + 2, line, inner - 2);
    if (e->junk > 0) {
        /* Right after the credits, in red, the way DOORMAN colours its ad
         * files: this is the number that decides whether [A]rchive is worth
         * opening. junk == -1 means the server never said, so nothing is
         * claimed either way. */
        char ads[32];
        int at = (int) strlen(line);
        strcpy(ads, "   ");
        ui_append_ulong(ads, (unsigned long) e->junk);
        strcat(ads, " ads");
        ansi_color(b, ANSI_RED, ANSI_BLACK, 1);
        ansi_text_raw(b, row + 2, g->info_left + 2 + at, ads, (int) strlen(ads));
    }

    /* The spacer row must be PAINTED, not merely skipped. Every row counted
     * as "used" is excluded from the blanking pass below, so a row that is
     * counted but never written keeps whatever the previously selected
     * entry left there - which showed up as a stray line of the previous
     * door's ASCII art hanging under a short entry. */
    ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
    ansi_text(b, row + 3, g->info_left + 1, "", inner);
    row += 4;

    if (info_mode == UI_INFO_DOC && g_doc_ok && strcmp(g_doc_archive, e->archive) == 0) {
        /* Documentation, rendered line for line and clipped, never
         * re-wrapped: Amiga door docs are laid out in columns and ASCII
         * art that reflowing would destroy. `info_scroll` is the first
         * source line shown, so the pane is a window onto a file far
         * larger than it.
         *
         * For an AmigaGuide document this shows the CURRENT NODE, already
         * rendered (markup stripped, links numbered) by guide_show_node,
         * with one header line naming the node and how to move around it.
         * Everything else below is shared with the plain-text path. */
        const char *p = g_guide_ok ? g_guide_render : g_doc;
        int skip = info_scroll;

        if (g_guide_ok) {
            char hdr[160];
            const char *title = (g_guide_node >= 0)
                ? g_guide.nodes[g_guide_node].title : "";

            strcpy(hdr, "Guide: ");
            strncat(hdr, title, sizeof(hdr) - 40);
            if (g_guide_link_count > 0) {
                strcat(hdr, "   [1-9] follow");
            }
            if (g_guide_history_len > 0) {
                strcat(hdr, "   B=back");
            }
            ansi_color(b, ANSI_CYAN, ANSI_BLACK, 1);
            ansi_text(b, row, g->info_left + 2, hdr, inner - 2);
            row++;
        }

        ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
        while (*p != '\0' && skip > 0) {
            while (*p != '\0' && *p != '\n') p++;
            while (*p == '\n' || *p == '\r') p++;
            skip--;
        }
        while (*p != '\0' && row <= last_row) {
            char dline[256];
            int n = 0;
            while (p[n] != '\0' && p[n] != '\n' && p[n] != '\r'
                   && n < inner - 2 && n < (int) sizeof(dline) - 1) {
                dline[n] = p[n];
                n++;
            }
            dline[n] = '\0';
            ansi_text(b, row, g->info_left + 2, dline, inner - 2);
            row++;
            while (p[n] != '\0' && p[n] != '\n') n++;
            p += n;
            while (*p == '\n' || *p == '\r') p++;
        }
    } else if (info_mode == UI_INFO_FILES && g_files_ok && strcmp(g_files_archive, e->archive) == 0) {
        /* "<size>|<junk>|<path>" lines, after a "FILES|<n>|<junk>" header.
         * Junk entries are marked with a red '!' the way DOORMAN flags its
         * "ad files", so a user can see at a glance whether an archive is
         * mostly door or mostly advertising. */
        const char *p = g_files;
        int first_line = 1;
        int skipped = 0;

        while (*p != '\0' && row <= last_row) {
            char field[3][160];
            int fi = 0;
            int fp = 0;
            char out[256];

            field[0][0] = '\0';
            field[1][0] = '\0';
            field[2][0] = '\0';
            while (*p != '\0' && *p != '\n' && *p != '\r') {
                if (*p == '|' && fi < 2) {
                    field[fi][fp] = '\0';
                    fi++;
                    fp = 0;
                } else if (fp < (int) sizeof(field[0]) - 1) {
                    field[fi][fp++] = *p;
                }
                p++;
            }
            field[fi][fp] = '\0';
            while (*p == '\n' || *p == '\r') {
                p++;
            }

            if (first_line) {
                first_line = 0;
                strcpy(out, "--- ");
                strncat(out, field[1], 8);
                strcat(out, " files, ");
                strncat(out, field[2], 8);
                strcat(out, " ads ---");
                ansi_color(b, ANSI_CYAN, ANSI_BLACK, 0);
                ansi_text(b, row, g->info_left + 2, out, inner - 2);
                row++;
                continue;
            }

            if (skipped < info_scroll) {
                skipped++;      /* scrolled past */
                continue;
            }
            {
                int isjunk = (field[1][0] == '1');
                strcpy(out, isjunk ? "! " : "  ");
                strncat(out, field[2], sizeof(out) - strlen(out) - 10);
                ansi_color(b, isjunk ? ANSI_RED : ANSI_WHITE, ANSI_BLACK, 0);
                ansi_text(b, row, g->info_left + 2, out, inner - 2);
                row++;
            }
        }
    } else if (info_mode == UI_INFO_DOC || info_mode == UI_INFO_FILES) {
        /* The view was asked for but there is nothing to show. Say so
         * explicitly rather than falling back to the DIZ: silently showing
         * something else makes "this door has no docs" indistinguishable
         * from "the fetch failed" or "it is still loading". DOORMAN states
         * its empty cases outright for the same reason. */
        ansi_color(b, ANSI_YELLOW, ANSI_BLACK, 1);
        ansi_text(b, row, g->info_left + 2,
                  (info_mode == UI_INFO_DOC)
                      ? "No documentation for this door."
                      : "No file listing for this door.",
                  inner - 2);
        row++;
    } else if (g_diz_ok && strcmp(g_diz_archive, e->archive) == 0) {
        /* Real FILE_ID.DIZ: render it line for line, exactly as authored.
         * This is the whole reason the /diz endpoint exists - the art only
         * means anything if its own line breaks are preserved, so it is
         * emitted verbatim (clipped at the pane width) and never wrapped. */
        const char *p = g_diz;
        ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
        while (*p != '\0' && row <= last_row) {
            char line2[256];
            int n = 0;
            while (p[n] != '\0' && p[n] != '\n' && p[n] != '\r'
                   && n < inner - 2 && n < (int) sizeof(line2) - 1) {
                line2[n] = p[n];
                n++;
            }
            line2[n] = '\0';
            ansi_text(b, row, g->info_left + 2, line2, inner - 2);
            row++;
            /* Advance past the rest of this source line and its terminator,
             * so a line longer than the pane is clipped rather than wrapped
             * into the next row and knocking the art out of alignment. */
            while (p[n] != '\0' && p[n] != '\n') {
                n++;
            }
            p += n;
            while (*p == '\n' || *p == '\r') {
                p++;
            }
        }
    } else {
        ansi_color(b, ANSI_WHITE, ANSI_BLACK, 1);
        if (e->name[0] != '\0') {
            ui_wrap_text(b, g, e->name, &row, last_row, inner - 2);
            /* Same rule as the spacer above: paint it, do not just skip it. */
            if (row <= last_row) {
                ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
                ansi_text(b, row, g->info_left + 1, "", inner);
                row++;
            }
        }
        ansi_color(b, ANSI_WHITE, ANSI_BLACK, 0);
        if (e->desc[0] != '\0') {
            ui_wrap_text(b, g, e->desc, &row, last_row, inner - 2);
        }
    }

    /* Blank only the rows the PREVIOUS entry used and this one does not. */
    for (i = row - first_row; i < used_last && first_row + i <= last_row; i++) {
        ansi_text(b, first_row + i, g->info_left + 1, "", inner);
    }
    ansi_reset(b);
    return row - first_row;
}

/* AmiExpress converts arrow keys to single-byte internal codes before a
 * door ever sees them (express.e:7514-7528, mirrored by this project's
 * xim/io.ts processHotkeyToken): 2=LEFT, 3=RIGHT, 4=UP, 5=DOWN. A door
 * built for /X must decode THOSE, not the raw CSI sequence - the escape
 * form only arrives in rawArrow mode, or on a direct serial link with no
 * BBS in between. Both are handled, because this door runs under either. */
#define AE_ARROW_LEFT  2
#define AE_ARROW_RIGHT 3
#define AE_ARROW_UP    4
#define AE_ARROW_DOWN  5

#define UI_KEY_UP    1000
#define UI_KEY_DOWN  1001
#define UI_KEY_PGUP  1002
#define UI_KEY_PGDN  1003
#define UI_KEY_HOME  1004
#define UI_KEY_END   1005
#define UI_KEY_ENTER 1006

/* Turns a first byte into a UI_KEY_*. Continuation bytes of a CSI sequence
 * are read with the BLOCKING ae_key(), so this must only ever be called from
 * a path that is allowed to wait. Everything except the ESC branch decides
 * from the single byte it was given. */
static int ui_decode_key(int c)
{
    /* EOF on the input stream means the user is gone - a dropped carrier
     * on a real node, the end of a scripted session on the dev backend.
     * Handled HERE rather than in each caller because every one of them
     * (the browse loop, the filter box, the yes/no confirm, the install
     * prompt) reads keys in a loop whose only exit is a key: a -1 that
     * matches no case falls through to "redraw and read again", and the
     * loop spins as fast as the terminal will take output. That is not
     * theoretical - a run whose input ran out wrote 21 GB of frames in two
     * minutes before it was killed. Line mode already gives up on repeated
     * empty input (note_empty_input_and_check_giveup); this is the
     * full-screen equivalent, and putting it at the single point where
     * keys enter the door means no future prompt can forget it. */
    if (flow_key_ends_session(c)) {
        stop_for_carrier_loss();
    }
    if (c == '\r' || c == '\n') {
        return UI_KEY_ENTER;
    }
    if (c == AE_ARROW_UP)    return UI_KEY_UP;
    if (c == AE_ARROW_DOWN)  return UI_KEY_DOWN;
    if (c == AE_ARROW_LEFT)  return UI_KEY_PGUP;
    if (c == AE_ARROW_RIGHT) return UI_KEY_PGDN;
    if (c != 27) {
        return c;
    }

    /* ESC is only ever read as the lead byte of a CSI sequence. Bare-ESC is
     * deliberately not a binding: it is indistinguishable from the start of
     * an arrow sequence without a timer, and that exact ambiguity cost
     * DOORMAN six debugging rounds (handoff.md, 2026-08-17). Q is the one
     * documented way out. */
    c = ae_key();
    if (c != '[' && c != 'O') {
        return c;
    }
    c = ae_key();
    switch (c) {
    case 'A': return UI_KEY_UP;
    case 'B': return UI_KEY_DOWN;
    case 'C': return UI_KEY_PGDN;
    case 'D': return UI_KEY_PGUP;
    case 'H': return UI_KEY_HOME;
    case 'F': return UI_KEY_END;
    case '5': (void) ae_key(); return UI_KEY_PGUP;
    case '6': (void) ae_key(); return UI_KEY_PGDN;
    case '1': (void) ae_key(); return UI_KEY_HOME;
    case '4': (void) ae_key(); return UI_KEY_END;
    default:  return 0;
    }
}

static int ui_read_key(void)
{
    return ui_decode_key(ae_key());
}

/* The navigation action a UI key stands for, or FLOW_NAV_NONE. */
static int ui_nav_action(int key)
{
    switch (key) {
    case UI_KEY_UP:   return FLOW_NAV_UP;
    case UI_KEY_DOWN: return FLOW_NAV_DOWN;
    case UI_KEY_PGUP: case 'p': case 'P': return FLOW_NAV_PGUP;
    case UI_KEY_PGDN: case 'n': case 'N': return FLOW_NAV_PGDN;
    case UI_KEY_HOME: return FLOW_NAV_HOME;
    case UI_KEY_END:  return FLOW_NAV_END;
    default:          return FLOW_NAV_NONE;
    }
}

/* Reads a filter string with the box drawn in place, the way DOORMAN's
 * filter panel works: the list stays on screen and refilters on every
 * keystroke rather than the user being dropped to a line prompt.
 *
 * Returns 1 when the filter was accepted (ENTER) and 0 when abandoned. The
 * caller redraws either way. Backspace edits; CTRL-U clears. As everywhere
 * else in this browser, a bare ESC is not a binding - see ui_read_key(). */
static int ui_filter_prompt(ansi_buf *b, char *frame, long framecap,
                            const ui_geometry *g, ui_view *v,
                            const dr_catalog *cat)
{
    int len = (int) strlen(v->text);
    int boxw = g->list_width;
    int inner = boxw - 2;

    for (;;) {
        int key;

        ansi_begin(b, frame, framecap);
        ansi_box(b, g->pane_top, g->list_left, 3, boxw, ANSI_YELLOW, "FILTER");
        ansi_color(b, ANSI_YELLOW, ANSI_BLACK, 1);
        ansi_text(b, g->pane_top + 1, g->list_left + 1, v->text, inner);
        /* Park the cursor after the text so a terminal showing it looks right. */
        ansi_goto(b, g->pane_top + 1, g->list_left + 1 + len);
        ansi_cursor(b, 1);
        ansi_flush(b);

        key = ui_read_key();

        if (key == UI_KEY_ENTER) {
            ansi_begin(b, frame, framecap);
            ansi_cursor(b, 0);
            ansi_flush(b);
            return 1;
        }
        if (key == 8 || key == 127) {          /* backspace / delete */
            if (len > 0) {
                v->text[--len] = '\0';
            }
        } else if (key == 21) {                 /* CTRL-U: clear */
            len = 0;
            v->text[0] = '\0';
        } else if (key >= 32 && key < 127 && len < UI_FILTER_MAX) {
            v->text[len++] = (char) key;
            v->text[len] = '\0';
        } else if (key >= 1000) {
            continue;                           /* ignore cursor keys here */
        }

        /* Refilter live, so the count in the label tracks what was typed. */
        ui_view_rebuild(v, cat);
    }
}

/* Asks a yes/no question on the footer bar and returns non-zero for yes.
 *
 * Drawn in place rather than by dropping to a line prompt: the detail pane
 * already shows everything the old confirmation screen re-printed (archive,
 * type, size, name, description), so re-rendering it line-by-line was a
 * context switch that bought the user nothing. DOORMAN acts on the selected
 * entry directly; so does this now. */
static int ui_confirm(ansi_buf *b, char *frame, long framecap,
                      const ui_geometry *g, const char *question)
{
    int key;

    ansi_begin(b, frame, framecap);
    ansi_fill(b, g->rows - UI_FOOTER_ROWS + 2, 1, g->cols, ANSI_WHITE, ANSI_BLUE);
    ansi_color(b, ANSI_YELLOW, ANSI_BLUE, 1);
    ansi_center(b, g->rows - UI_FOOTER_ROWS + 2, 1, g->cols, question);
    ansi_flush(b);

    key = ui_read_key();

    /* Restore the colours this prompt set. A function that changes terminal
     * state owns putting it back: without this the white-on-blue bar's
     * attributes outlive the answer, and the next ansi_clear() repaints the
     * whole screen blue - reported from the live BBS after answering N. */
    ansi_begin(b, frame, framecap);
    ansi_reset(b);
    ansi_flush(b);

    return (key == 'y' || key == 'Y' || key == UI_KEY_ENTER);
}

/* ---------------------------------------------------------------------
 * Install index
 *
 * One line per installed door in <DownloadDir>DoorRepo.idx (see flow.h).
 * Held in memory for the whole session so the list can mark installed rows
 * without a disk probe per row per keystroke, and rewritten whole on every
 * change - the file is a few dozen lines at most, and rewriting it is the
 * only way to delete a record with portable C89 (no truncate, no rename
 * that is guaranteed to work on AmigaDOS from stdio alone).
 * ------------------------------------------------------------------- */

/* A node with more installed doors than this has bigger problems than a
 * missing marker; the browser still works, only the marks stop. */
#define INDEX_MAX_ENTRIES 256

typedef struct {
    char archive[64];
    char cmd[FLOW_MAX_BBS_COMMAND + 1];
} index_entry;

static index_entry g_index[INDEX_MAX_ENTRIES];
static int g_index_count = 0;
static int g_index_loaded = 0;

static void index_load(const dr_config *cfg)
{
    char path[256];
    char line[192];
    FILE *f;

    g_index_count = 0;
    g_index_loaded = 1;

    if (flow_build_index_path(path, sizeof(path), cfg->download_dir) < 0) {
        return;
    }
    f = fopen(path, "rb");
    if (f == (FILE *) 0) {
        return; /* nothing installed yet, or DownloadDir is not readable */
    }
    while (g_index_count < INDEX_MAX_ENTRIES && fgets(line, (int) sizeof(line), f) != (char *) 0) {
        index_entry *e = &g_index[g_index_count];
        if (flow_index_parse_line(line, e->archive, sizeof(e->archive),
                                   e->cmd, sizeof(e->cmd)) == 0) {
            g_index_count++;
        }
        /* A malformed line is skipped, not fatal: this file can be edited
         * by hand on a machine with no better tools. */
    }
    fclose(f);
}

/* Rewrites the whole file from the in-memory table. Returns 1 on success. */
static int index_save(const dr_config *cfg)
{
    char path[256];
    char line[192];
    FILE *f;
    int i;

    if (flow_build_index_path(path, sizeof(path), cfg->download_dir) < 0) {
        return 0;
    }
    f = fopen(path, "wb");
    if (f == (FILE *) 0) {
        return 0;
    }
    for (i = 0; i < g_index_count; i++) {
        if (flow_index_format_line(line, sizeof(line), g_index[i].archive, g_index[i].cmd) > 0) {
            fputs(line, f);
        }
    }
    fclose(f);
    return 1;
}

/* Command this archive was installed as, or NULL. */
static const char *index_lookup(const dr_config *cfg, const char *archive)
{
    int i;

    if (!g_index_loaded) {
        index_load(cfg);
    }
    for (i = 0; i < g_index_count; i++) {
        if (strcmp(g_index[i].archive, archive) == 0) {
            return g_index[i].cmd;
        }
    }
    return (const char *) 0;
}

static int index_installed_count(const dr_config *cfg)
{
    if (!g_index_loaded) {
        index_load(cfg);
    }
    return g_index_count;
}

static void index_add(const dr_config *cfg, const char *archive, const char *cmd)
{
    int i;

    if (!g_index_loaded) {
        index_load(cfg);
    }
    /* Re-installing an archive replaces its record rather than adding a
     * second one - otherwise the marker would be right and the uninstall
     * would act on whichever line happened to come first. */
    for (i = 0; i < g_index_count; i++) {
        if (strcmp(g_index[i].archive, archive) == 0) {
            strncpy(g_index[i].cmd, cmd, sizeof(g_index[i].cmd) - 1);
            g_index[i].cmd[sizeof(g_index[i].cmd) - 1] = '\0';
            (void) index_save(cfg);
            return;
        }
    }
    if (g_index_count >= INDEX_MAX_ENTRIES) {
        return;
    }
    strncpy(g_index[g_index_count].archive, archive, sizeof(g_index[0].archive) - 1);
    g_index[g_index_count].archive[sizeof(g_index[0].archive) - 1] = '\0';
    strncpy(g_index[g_index_count].cmd, cmd, sizeof(g_index[0].cmd) - 1);
    g_index[g_index_count].cmd[sizeof(g_index[0].cmd) - 1] = '\0';
    g_index_count++;
    (void) index_save(cfg);
}

static void index_remove(const dr_config *cfg, const char *archive)
{
    int i;

    if (!g_index_loaded) {
        index_load(cfg);
    }
    for (i = 0; i < g_index_count; i++) {
        if (strcmp(g_index[i].archive, archive) == 0) {
            int j;
            for (j = i + 1; j < g_index_count; j++) {
                g_index[j - 1] = g_index[j];
            }
            g_index_count--;
            (void) index_save(cfg);
            return;
        }
    }
}

/* Rebuilds `v->index` to hold only the catalog rows the install index
 * (g_index[], above) says are installed - the "installed doors" screen's
 * counterpart to ui_view_rebuild(), which filters on the user's text/type
 * search instead. Shares that function's shape: `v->count` is reset, then
 * `cat->rows[]` is walked once, appending a row's global index into
 * `v->index[]` when it belongs.
 *
 * `archives[]` is the known-installed set flow_is_installed_row() scans,
 * built from g_index[] once here rather than once per row - g_index[]
 * itself can only be read after index_load() has run, which is why this
 * function (unlike the pure predicate in flow.c) needs `cfg`.
 *
 * Also reports orphans via `orphan_count_out`: an archive in g_index[]
 * that matched no catalog row at all - installed, but since removed or
 * renamed upstream (see the plan's Scope Decision). flow_is_installed_row()
 * only answers yes/no for one row, so which known archive a row matched is
 * tracked in `matched[]`, updated on the SAME lookup that decides whether
 * to keep the row - no second walk of the catalog or the index just to
 * count orphans. */
static void ui_view_rebuild_installed(ui_view *v, const dr_catalog *cat,
                                      const dr_config *cfg,
                                      unsigned long *orphan_count_out)
{
    /* INDEX_MAX_ENTRIES-sized locals, static for the same reason
     * browse_loop_ansi()'s view_index is: 256 pointers plus 256 ints is a
     * large slice of a 68K door's STACK=8192 icon setting to spend on
     * locals a nested call chain (ANSI draw, prompts) will also be using. */
    static const char *archives[INDEX_MAX_ENTRIES];
    static int matched[INDEX_MAX_ENTRIES];
    int known_count;
    int i;
    unsigned long r;
    unsigned long matched_total = 0;

    if (!g_index_loaded) {
        index_load(cfg);
    }
    known_count = g_index_count;
    for (i = 0; i < known_count; i++) {
        archives[i] = g_index[i].archive;
        matched[i] = 0;
    }

    v->count = 0;
    for (r = 0; r < cat->count; r++) {
        const dr_entry *e = &cat->rows[r];

        if (!flow_is_installed_row(e->archive, archives, known_count)) {
            continue;
        }
        v->index[v->count++] = r;

        for (i = 0; i < known_count; i++) {
            if (!matched[i] && strcmp(archives[i], e->archive) == 0) {
                matched[i] = 1;
                break;
            }
        }
    }

    for (i = 0; i < known_count; i++) {
        if (matched[i]) {
            matched_total++;
        }
    }
    if (orphan_count_out != (unsigned long *) 0) {
        *orphan_count_out = (unsigned long) known_count - matched_total;
    }
}

/* Defined below, next to the other UI prompt helpers. */
static int ui_text_prompt(ansi_buf *b, char *frame, long framecap,
                          const ui_geometry *g, const char *label,
                          char *buf, int maxlen);

/* ---------------------------------------------------------------------
 * Install / uninstall (DOORMAN parity)
 *
 * Downloading leaves an archive in DownloadDir; installing turns it into a
 * BBS command. Three steps, the same three DOORMAN's install performs:
 * extract into <DoorsDir>/<CMD>/, find the executable inside it, and write
 * <BBSCmdDir>/<CMD>.info with the tooltypes the BBS reads.
 *
 * The one thing this door cannot do the way DOORMAN does is LOOK at what
 * came out of the archive: C89 has no directory enumeration, and the
 * portable backend exposes none. The /files listing stands in for it -
 * the server already knows every path inside the archive and which of them
 * are ads, so the same listing that draws the [A]rchive pane picks the
 * binary and drives the ad strip. That is also why the strip is offered at
 * install time rather than as a separate key on an installed door: the
 * listing describes the ARCHIVE, so it can only be trusted to name what
 * this door just extracted itself.
 * ------------------------------------------------------------------- */

/* Non-zero when `path` can be opened for reading - the only existence test
 * portable C89 offers. */
static int file_exists(const char *path)
{
    FILE *f = fopen(path, "rb");

    if (f == (FILE *) 0) {
        return 0;
    }
    fclose(f);
    return 1;
}

/* Runs the archiver over `archive_path`, extracting into `dest_dir`.
 * Returns 1 when the archiver REPORTED success - which is not the same as
 * any file existing; flow_install_verdict() decides that.
 *
 * Both the command's spelling and the means of running it live behind
 * shell.h's platform pair, so this file keeps its no-platform-branches
 * rule. The Amiga side calls dos.library/Execute() rather than C system(),
 * because under this project's 68K emulator system() reaches nothing at
 * all: it returns 0 without a single DOS call, so every install "extracted"
 * an archive into a directory that was never created. */
static int run_extractor(const dr_config *cfg, const char *archive_path, const char *dest_dir)
{
    return shell_extract(cfg->lha_command, archive_path, dest_dir);
}

/* Deletes the files the /files listing flags as ads, under `install_dir`.
 * Returns how many were removed. Silent per-file failures are counted as
 * not-removed rather than aborting: a strip that half-worked has still
 * improved the install, and the caller reports the real number. */
/* Most ad-stripping decisions are made on one line of text, so that line has
 * to name the files. "This archive contains 1 ad file" tells a sysop nothing
 * they can judge - the whole question is WHICH file, because the listing's
 * idea of an ad is a heuristic and the file may be a genuine doc, a BBS
 * advert worth keeping, or the door's own README.
 *
 * Prints every file the listing flags, and returns how many there were. The
 * count comes from the rows rather than the FILES| header because the rows
 * are what strip_ad_files() will actually delete; if the two ever disagree,
 * the sysop should be shown the truth about what is about to happen.
 *
 * Bounded output: a pathological listing cannot scroll the screen away. */
#define AD_LIST_MAX 20

/* How many rows of the repository listing an install samples to answer
 * "did ANY file arrive?". fopen() per row is not free on an Amiga and the
 * first hit ends the walk, so this is only the ceiling for the negative
 * case - the one where nothing was unpacked at all. */
#define INSTALL_CENSUS_MAX 12

static int ui_show_ad_files(const char *files_body)
{
    const char *line = files_body;
    int found = 0;
    int shown = 0;

    if (line == (const char *) 0) {
        return 0;
    }
    if (strncmp(line, "FILES|", 6) == 0) {
        line = flow_files_next_line(line);
    }

    while (line != (const char *) 0) {
        char rel[160];
        int junk = 0;

        if (flow_files_parse_row(line, (unsigned long *) 0, &junk, rel, sizeof(rel)) == 0
            && junk) {
            found++;
            if (shown < AD_LIST_MAX) {
                char msg[192];
                sprintf(msg, "    %.170s", rel);
                ae_put(msg, 1);
                shown++;
            }
        }
        line = flow_files_next_line(line);
    }

    if (found > shown) {
        char msg[64];
        sprintf(msg, "    ... and %d more", found - shown);
        ae_put(msg, 1);
    }

    return found;
}

static int strip_ad_files(const char *install_dir, const char *files_body)
{
    const char *line = files_body;
    int removed = 0;

    if (line != (const char *) 0 && strncmp(line, "FILES|", 6) == 0) {
        line = flow_files_next_line(line);
    }

    while (line != (const char *) 0) {
        char rel[160];
        char full[320];
        int junk = 0;

        if (flow_files_parse_row(line, (unsigned long *) 0, &junk, rel, sizeof(rel)) == 0
            && junk) {
            if (flow_build_local_path(full, sizeof(full), install_dir, rel) >= 0) {
                if (remove(full) == 0) {
                    removed++;
                }
            }
        }
        line = flow_files_next_line(line);
    }

    return removed;
}

/* Removes the ad files from a door that is ALREADY installed - DOORMAN's
 * [S]trip, which works on an installed door at any time rather than only
 * during the install. Needs two things this door did not have until the
 * install index existed: which command the archive was installed as, and
 * therefore which directory to delete from.
 *
 * The ad paths come from the same /files listing the install used. That
 * listing describes the ARCHIVE, so it only names files this door itself
 * extracted - nothing a sysop added afterwards can match it. */
static void strip_installed_door(const dr_config *cfg, const char *archive,
                                 long junk, ansi_buf *b, char *frame, long framecap)
{
    const char *cmdname = index_lookup(cfg, archive);
    char install_dir[256];
    char msg[320];
    int removed;

    if (cmdname == (const char *) 0) {
        return; /* not installed by this door - S does nothing, per the footer */
    }
    if (junk == 0) {
        return; /* the server says there is nothing to strip */
    }
    if (flow_build_install_dir(install_dir, sizeof(install_dir), cfg->doors_dir, cmdname) < 0) {
        return;
    }

    /* The listing is fetched BEFORE anything is asked. The old order put the
     * confirm first and only then discovered which files were involved,
     * which meant the sysop agreed to delete a set nobody had shown them. */
    ansi_begin(b, frame, framecap);
    ansi_cursor(b, 1);
    ansi_reset(b);
    ansi_clear(b);
    ansi_flush(b);

    files_load(cfg, archive);
    if (!g_files_ok) {
        ae_put("The repository has no file listing for this archive, so there is no way", 1);
        ae_put("to tell which of its files are ads. Nothing was removed.", 1);
    } else {
        int listed;

        sprintf(msg, "Ad files in %s:", cmdname);
        ae_put(msg, 1);
        listed = ui_show_ad_files(g_files);

        if (listed == 0) {
            /* The catalog row said there were ads but the listing names
             * none - nothing can be deleted, and saying so is better than a
             * prompt that would remove nothing. */
            ae_put("The file listing names none of them, so there is nothing to remove.", 1);
        } else {
            ae_put("", 1);
            ae_put("Remove these?  [Y/N] ", 0);
            {
                int key = ae_key();
                ae_put("", 1);
                if (key != 'y' && key != 'Y') {
                    ae_put("Nothing was removed.", 1);
                } else {
                    removed = strip_ad_files(install_dir, g_files);
                    sprintf(msg, "Removed %d ad file(s) from %s.", removed, install_dir);
                    ae_put(msg, 1);
                    {
                        char logmsg[256];
                        sprintf(logmsg, "STRIP OK cmd=%s files=%d", cmdname, removed);
                        log_line(cfg, logmsg);
                    }
                }
            }
        }
    }

    ae_put("", 1);
    ae_put("Press any key to return to the list.", 1);
    (void) ae_key();
}

/* The whole install, from an entry in the list to a runnable BBS command.
 * Reports every step to the user, because on a real node this is the one
 * action that changes what the BBS itself will do. */
static void install_door(const dr_config *cfg, const dr_entry *entry,
                         ansi_buf *b, char *frame, long framecap,
                         const ui_geometry *g)
{
    char cmdname[FLOW_MAX_BBS_COMMAND + 1];
    char local_path[256];
    char install_dir[256];
    char info_path[256];
    char binary_rel[160];
    char binary_check[420];
    char info_content[320];
    char info_tmp_path[288];
    char msg[420];
    int extract_ok;
    int have_listing;
    int program_readable;
    int listed_checked;
    int listed_present;
    int verdict;
    FILE *f;

    /* The archive name has already passed the CWE-22 filename check at
     * catalog-parse time; re-checked here for the same reason the
     * download path re-checks it - this is a different dangerous
     * operation, and the check belongs next to it. */
    if (!flow_is_safe_archive_filename(entry->archive)) {
        ae_put("Install refused: this catalog entry's archive name is not a safe filename.", 1);
        return;
    }

    cmdname[0] = '\0';
    (void) flow_suggest_bbs_command(entry->archive, cmdname, sizeof(cmdname));

    if (!ui_text_prompt(b, frame, framecap, g, "Install as BBS command:",
                        cmdname, FLOW_MAX_BBS_COMMAND)) {
        return; /* empty answer = changed their mind */
    }
    if (!flow_is_valid_bbs_command(cmdname)) {
        ansi_begin(b, frame, framecap);
        ansi_cursor(b, 1);
        ansi_reset(b);
        ansi_clear(b);
        ansi_flush(b);
        ae_put("That is not a usable BBS command name: use A-Z and 0-9 only, up to 12", 1);
        ae_put("characters. Nothing was installed.", 1);
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }

    if (flow_build_local_path(local_path, sizeof(local_path), cfg->download_dir, entry->archive) < 0
        || flow_build_install_dir(install_dir, sizeof(install_dir), cfg->doors_dir, cmdname) < 0
        || flow_build_info_path(info_path, sizeof(info_path), cfg->bbscmd_dir, cmdname) < 0) {
        ae_put("Install refused: DownloadDir, DoorsDir or BBSCmdDir plus this name is too long.", 1);
        return;
    }

    if (file_exists(info_path)) {
        if (!ui_confirm(b, frame, framecap, g, "That BBS command already exists. Replace it?  [Y/N]")) {
            return;
        }
    }

    /* Leave the full-screen browser: everything from here on reports line
     * by line, exactly as the download does. */
    ansi_begin(b, frame, framecap);
    ansi_cursor(b, 1);
    ansi_reset(b);
    ansi_clear(b);
    ansi_flush(b);

    if (getenv("DOORREPO_TRACE") != (char *) 0) {
        sprintf(msg, "TRACE local_path=%s exists=%d", local_path, file_exists(local_path));
        ae_put(msg, 1);
    }
    if (!file_exists(local_path)) {
        ae_put("Archive not downloaded yet - fetching it first.", 1);
        download_and_verify(cfg, entry);
        if (!file_exists(local_path)) {
            ae_put("Install stopped: the archive was not downloaded.", 1);
            ae_put("", 1);
            ae_put("Press any key to return to the list.", 1);
            (void) ae_key();
            return;
        }
    }

    /* Same re-validation as the download path performs before ITS system()
     * call, for the same two reasons (a config field set without going
     * through config_load, and a server-supplied archive name that
     * config.c never sees). DoorsDir joins that list here because it is
     * interpolated into this command line too. */
    if (!flow_is_valid_command_token(cfg->lha_command, sizeof(cfg->lha_command))
        || flow_contains_forbidden_shell_char(cfg->download_dir)
        || flow_contains_forbidden_shell_char(cfg->doors_dir)
        || flow_contains_forbidden_shell_char(entry->archive)
        || !flow_is_safe_archive_filename(entry->archive)) {
        ae_put("Install refused: LhaCommand, DownloadDir, DoorsDir or the archive name is", 1);
        ae_put("not safe to pass to a shell command. Nothing was installed.", 1);
        log_line(cfg, "INSTALL REFUSED: unsafe value in the extraction command line");
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }

    sprintf(msg, "Extracting %s into %s ...", entry->archive, install_dir);
    ae_put(msg, 1);
    extract_ok = run_extractor(cfg, local_path, install_dir);

    /* The archive listing doubles as the manifest of what was just
     * extracted - see this section's header comment. */
    files_load(cfg, entry->archive);

    binary_rel[0] = '\0';
    if (!g_files_ok
        || flow_pick_door_binary(g_files, entry->archive, cmdname,
                                 binary_rel, sizeof(binary_rel)) < 0) {
        /* Same fallback DOORMAN uses when its own search comes up empty:
         * name the command itself and let the sysop correct LOCATION. */
        strcpy(binary_rel, cmdname);
        ae_put("Could not tell which extracted file is the door's program.", 1);
        sprintf(msg, "LOCATION was set to %s - check it in %s.", binary_rel, info_path);
        ae_put(msg, 1);
        /* Logged as its own line: the warning further down says "program not
         * readable", which reads as a protection-bit quirk and hides the
         * real situation - LOCATION is a GUESS, and the file it names has
         * never been seen. */
        log_line(cfg, "INSTALL WARN: program could not be identified, LOCATION guessed");
    }

    /* Whether the install worked is decided by the FILE the .info is about
     * to point at, not by the archiver's exit code.
     *
     * The exit code turned out to be the wrong test in both directions.
     * Amiga-authored archives routinely make Unix lha report a CRC error
     * or an unknown header level on one member while extracting every
     * other file perfectly (1OO-WALL.LHA does exactly this on this host) -
     * refusing there would have failed an install whose door is sitting on
     * disk, runnable. And an archiver that exits 0 having written nothing
     * useful would have produced a .info pointing at a file that does not
     * exist, which the BBS only discovers when a user picks the command.
     * So: check the program is really there, and report the archiver's
     * complaint as the warning it is. */
    have_listing = (g_files_ok && strncmp(g_files, "FILES|0|", 8) != 0);
    program_readable = (flow_build_local_path(binary_check, sizeof(binary_check),
                                              install_dir, binary_rel) >= 0)
        && file_exists(binary_check);

    /* How much weight the "is the program there?" check carries.
     *
     * fopen() is the only existence test portable C89 offers, and it
     * answers a narrower question than it looks: TELSER40.LHA extracts a
     * bin/ directory whose Amiga protection bits become a Unix mode with
     * no read permission, so bin/telser IS on disk and fopen() still
     * fails. Refusing there would block a perfectly good install on the
     * strength of a check that cannot tell "missing" from "unreadable" -
     * and on the real target the door needs the executable bit, not the
     * read bit, so the same file is fine.
     *
     * So an unopenable program is a WARNING on its own, and a refusal only
     * when the archiver ALSO reported failure - two independent signals
     * pointing the same way, which is the case where a .info would
     * genuinely point at nothing. */
    /* Did anything actually come out of the archive?
     *
     * "The archiver reported success" turned out to be worth nothing on
     * its own: under this project's 68K emulator the door's system() call
     * returned 0 without running a thing, so INSTALL OK was written for
     * archives that had never been unpacked and the BBS then answered "No
     * such command" for a door its own command config named. The listing
     * the server already sent names the files that SHOULD be there, so
     * sample it and look.
     *
     * Bounded at INSTALL_CENSUS_MAX rows because this is fopen() per row on
     * an Amiga, and the question ("did ANY file arrive?") is answered by
     * the first hit. */
    listed_checked = 0;
    listed_present = 0;
    if (have_listing) {
        const char *row = g_files;

        if (strncmp(row, "FILES|", 6) == 0) {
            row = flow_files_next_line(row);
        }
        while (row != (const char *) 0 && listed_checked < INSTALL_CENSUS_MAX) {
            char rel[160];
            char probe[420];

            if (flow_files_parse_row(row, (unsigned long *) 0, (int *) 0,
                                     rel, sizeof(rel)) == 0
                && rel[0] != '\0') {
                if (flow_build_local_path(probe, sizeof(probe), install_dir, rel) >= 0) {
                    listed_checked++;
                    if (file_exists(probe)) {
                        listed_present++;
                        break;  /* one hit is enough - files did arrive */
                    }
                }
            }
            row = flow_files_next_line(row);
        }
    }

    verdict = flow_install_verdict(extract_ok, have_listing, program_readable,
                                   listed_checked, listed_present);

    if (verdict == FLOW_INSTALL_REFUSE_ARCHIVER_AND_MISSING) {
        ae_put("Install stopped: the archiver reported an error and the door's program", 1);
        sprintf(msg, "is not readable at %s.", binary_check);
        ae_put(msg, 1);
        ae_put("The archive may be damaged, or LhaCommand may not handle this format.", 1);
        log_line(cfg, "INSTALL FAILED: archiver error and no readable program");
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }
    if (verdict == FLOW_INSTALL_REFUSE_NOTHING_EXTRACTED) {
        ae_put("Install stopped: the archiver said it succeeded, but not one of the files", 1);
        sprintf(msg, "it should have written is in %s.", install_dir);
        ae_put(msg, 1);
        ae_put("Nothing was installed. Check that LhaCommand names an archiver this", 1);
        ae_put("system can actually run.", 1);
        log_line(cfg, "INSTALL FAILED: archiver reported success but extracted nothing");
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }
    if (verdict == FLOW_INSTALL_WARN_NO_LISTING) {
        /* No listing at all - 35 of the catalog's 3301 archives have none,
         * because the server could not read their contents. Absent
         * evidence is not contradicting evidence: install with the command
         * name as LOCATION (what DOORMAN does whenever its own search
         * finds nothing) and say plainly that it needs checking. */
        ae_put("The repository has no file listing for this archive, so the door's program", 1);
        sprintf(msg, "could not be identified. LOCATION was set to %s and almost", binary_rel);
        ae_put(msg, 1);
        sprintf(msg, "certainly needs correcting in %s.", info_path);
        ae_put(msg, 1);
        log_line(cfg, "INSTALL WARN: no file listing, LOCATION guessed");
    } else if (verdict == FLOW_INSTALL_WARN_PROGRAM_UNREADABLE) {
        ae_put("Note: the door's program could not be opened for reading at", 1);
        sprintf(msg, "%s.", binary_check);
        ae_put(msg, 1);
        ae_put("On AmigaDOS that is usually just its protection bits and the door will run;", 1);
        ae_put("check LOCATION in the command config if it does not.", 1);
        log_line(cfg, "INSTALL WARN: program not readable, LOCATION kept");
    } else if (verdict == FLOW_INSTALL_WARN_ARCHIVER_ERROR) {
        ae_put("Note: the archiver reported an error, but the door's program did extract.", 1);
        ae_put("Some other file in the archive may be damaged or incomplete.", 1);
        log_line(cfg, "INSTALL WARN: archiver reported an error, program present");
    }

    /* The catalog classifies an ARCHIVE; the type says how to RUN what came
     * out of it, and for an ARexx script those differ - XIM would try to
     * execute a text file. See flow_effective_door_type() for the express.e
     * references. */
    if (flow_build_info_content(info_content, sizeof(info_content),
                                 flow_effective_door_type(entry->type, binary_rel),
                                 cmdname, binary_rel) < 0) {
        ae_put("Install failed: the command config would not fit its buffer.", 1);
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }

    /* Written to a temporary name and RENAMED into place, so the command
     * config appears in BBSCmd complete or not at all.
     *
     * Reported from the live BBS: a door installed while the BBS was running
     * was not recognised until the user reconnected. This server caches
     * BBSCmd and revalidates it on the directory's mtime
     * (command-execution.handler.ts) - and a directory's mtime changes when
     * a file is CREATED, not when it is later filled in. fopen() therefore
     * published an empty .info, and any command typed in the window before
     * fclose() made the BBS reload the directory, parse nothing useful for
     * this command, and mark itself fresh. Writing the content afterwards
     * does not touch the directory again, so the door stayed invisible until
     * a restart. The timestamps on the reported case show the gap exactly:
     * directory 22:33:30, file contents 22:33:31.
     *
     * rename() moves the finished file in as one directory operation, which
     * is also what makes the mtime change at the moment the CONTENT becomes
     * visible. C89 guarantees rename(); on AmigaDOS it is a Rename() within
     * the same directory, which is atomic. */
    if (flow_build_info_temp_path(info_tmp_path, sizeof(info_tmp_path), info_path) < 0) {
        ae_put("Install failed: the command config path would not fit its buffer.", 1);
        log_line(cfg, "INSTALL FAILED: .info temp path too long");
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }

    f = fopen(info_tmp_path, "wb");
    if (f == (FILE *) 0) {
        sprintf(msg, "Install failed: could not write %s.", info_tmp_path);
        ae_put(msg, 1);
        ae_put("Check BBSCmdDir in DoorRepo.cfg - the directory must already exist.", 1);
        log_line(cfg, "INSTALL FAILED: could not write the .info");
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }
    fputs(info_content, f);
    fclose(f);

    /* An existing config is replaced: rename() over an existing file is not
     * portable, and leaving the old one in place would silently keep the
     * door pointing at whatever it used to point at. */
    remove(info_path);
    if (rename(info_tmp_path, info_path) != 0) {
        remove(info_tmp_path);
        sprintf(msg, "Install failed: could not put %s in place.", info_path);
        ae_put(msg, 1);
        log_line(cfg, "INSTALL FAILED: could not rename the .info into place");
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }

    /* Ads are offered, never removed silently: they are files the archive's
     * author put there, and a sysop may want to read one. entry->junk is -1
     * against a server that does not report the count, in which case the
     * listing itself still knows and the offer is made from that. */
    if (g_files_ok) {
        int junk_total = 0;
        const char *line = g_files;

        if (strncmp(line, "FILES|", 6) == 0) {
            char header_junk[16];
            const char *p = line + 6;
            while (*p != '\0' && *p != '|') {
                p++;
            }
            if (*p == '|') {
                unsigned long n = 0;
                p++;
                while (*p >= '0' && *p <= '9' && n + 1 < sizeof(header_junk)) {
                    header_junk[n++] = *p++;
                }
                header_junk[n] = '\0';
                junk_total = atoi(header_junk);
            }
        }

        if (junk_total > 0) {
            int listed;

            sprintf(msg, "This archive contains %d ad file(s):", junk_total);
            ae_put(msg, 1);
            listed = ui_show_ad_files(g_files);
            if (listed > 0 && listed != junk_total) {
                /* The header and the rows disagree. What gets deleted is the
                 * rows, so say so rather than quietly using the other number. */
                sprintf(msg, "(%d are named above; those are the ones that would go.)", listed);
                ae_put(msg, 1);
            }
            ae_put("Remove them?  [Y/N] ", 0);
            {
                int key = ae_key();
                if (key == 'y' || key == 'Y') {
                    int removed = strip_ad_files(install_dir, g_files);
                    sprintf(msg, "Removed %d of %d ad file(s).", removed, junk_total);
                    ae_put("", 1);
                    ae_put(msg, 1);
                } else {
                    ae_put("", 1);
                }
            }
        }
    }

    /* Recorded BEFORE the success message, so what the user is told
     * matches what the door will remember. */
    index_add(cfg, entry->archive, cmdname);

    sprintf(msg, "Installed as %s.  Program: %s", cmdname, binary_rel);
    ae_put(msg, 1);
    sprintf(msg, "Command config written to %s.", info_path);
    ae_put(msg, 1);
    {
        char logmsg[256];
        sprintf(logmsg, "INSTALL OK archive=%s cmd=%s binary=%s", entry->archive, cmdname, binary_rel);
        log_line(cfg, logmsg);
    }

    ae_put("", 1);
    ae_put("Press any key to return to the list.", 1);
    (void) ae_key();
}

/* Removes a BBS command this door installed: the .info first (that is what
 * makes the door reachable at all), then the files the archive listing says
 * are in its directory, then the directory itself.
 *
 * Why file-by-file rather than a recursive delete: C89 cannot enumerate a
 * directory, and building a "delete all" shell command would put a second,
 * far more destructive command line next to the extraction one. Deleting
 * exactly the paths the server says the archive contained is bounded by
 * something already known. Anything else in that directory - a config the
 * sysop wrote, a log the door kept - is deliberately left, and the final
 * message says so when the directory could not be removed. */
static void uninstall_door(const dr_config *cfg, const char *archive,
                           ansi_buf *b, char *frame, long framecap,
                           const ui_geometry *g)
{
    char cmdname[FLOW_MAX_BBS_COMMAND + 1];
    char install_dir[256];
    char info_path[256];
    char msg[320];
    int removed = 0;

    /* The index knows exactly what this archive was installed as, so the
     * prompt is pre-filled with the right answer instead of a guess from
     * the archive name - which was wrong for anyone who installed under a
     * name of their own. The prompt stays (a sysop may have installed the
     * same archive by hand under another name) but ENTER is now correct. */
    cmdname[0] = '\0';
    {
        const char *known = index_lookup(cfg, archive);
        if (known != (const char *) 0) {
            strncpy(cmdname, known, sizeof(cmdname) - 1);
            cmdname[sizeof(cmdname) - 1] = '\0';
        } else {
            (void) flow_suggest_bbs_command(archive, cmdname, sizeof(cmdname));
        }
    }

    if (!ui_text_prompt(b, frame, framecap, g, "Uninstall which BBS command:",
                        cmdname, FLOW_MAX_BBS_COMMAND)) {
        return;
    }
    if (!flow_is_valid_bbs_command(cmdname)
        || flow_build_install_dir(install_dir, sizeof(install_dir), cfg->doors_dir, cmdname) < 0
        || flow_build_info_path(info_path, sizeof(info_path), cfg->bbscmd_dir, cmdname) < 0) {
        return;
    }

    if (!file_exists(info_path)) {
        ansi_begin(b, frame, framecap);
        ansi_cursor(b, 1);
        ansi_reset(b);
        ansi_clear(b);
        ansi_flush(b);
        sprintf(msg, "No such BBS command: %s", info_path);
        ae_put(msg, 1);
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }

    sprintf(msg, "Uninstall %s?  [Y/N]", cmdname);
    if (!ui_confirm(b, frame, framecap, g, msg)) {
        return;
    }

    ansi_begin(b, frame, framecap);
    ansi_cursor(b, 1);
    ansi_reset(b);
    ansi_clear(b);
    ansi_flush(b);

    if (remove(info_path) != 0) {
        sprintf(msg, "Could not remove %s. The command is still installed.", info_path);
        ae_put(msg, 1);
        log_line(cfg, "UNINSTALL FAILED: could not remove the .info");
        ae_put("", 1);
        ae_put("Press any key to return to the list.", 1);
        (void) ae_key();
        return;
    }
    ae_put("BBS command removed.", 1);

    files_load(cfg, archive);
    if (g_files_ok) {
        const char *line = g_files;

        if (strncmp(line, "FILES|", 6) == 0) {
            line = flow_files_next_line(line);
        }
        while (line != (const char *) 0) {
            char rel[160];
            char full[320];

            if (flow_files_parse_row(line, (unsigned long *) 0, (int *) 0,
                                      rel, sizeof(rel)) == 0) {
                if (flow_build_local_path(full, sizeof(full), install_dir, rel) >= 0) {
                    if (remove(full) == 0) {
                        removed++;
                    }
                }
            }
            line = flow_files_next_line(line);
        }
    }

    sprintf(msg, "Removed %d file(s) from %s.", removed, install_dir);
    ae_put(msg, 1);

    if (remove(install_dir) != 0) {
        sprintf(msg, "%s still exists - it is not empty. Anything left there was not", install_dir);
        ae_put(msg, 1);
        ae_put("part of the archive and has been left alone.", 1);
    }

    index_remove(cfg, archive);

    {
        char logmsg[256];
        sprintf(logmsg, "UNINSTALL OK cmd=%s files=%d", cmdname, removed);
        log_line(cfg, logmsg);
    }

    ae_put("", 1);
    ae_put("Press any key to return to the list.", 1);
    (void) ae_key();
}

/* Reads a short line of text on the footer bar, seeded with `buf`'s current
 * contents (the caller's suggested default) so the common answer is one
 * keypress. Returns 1 when accepted with ENTER, 0 when abandoned with an
 * empty line. Upper-cases as it goes: every value asked for through here is
 * a BBS command name, and typing one in lower case is a mistake the door
 * should absorb rather than reject. */
static int ui_text_prompt(ansi_buf *b, char *frame, long framecap,
                          const ui_geometry *g, const char *label,
                          char *buf, int maxlen)
{
    int len = (int) strlen(buf);
    int row = g->rows - UI_FOOTER_ROWS + 2;

    for (;;) {
        char line[160];
        int key;

        strcpy(line, label);
        strcat(line, " ");
        strncat(line, buf, sizeof(line) - strlen(line) - 2);

        ansi_begin(b, frame, framecap);
        ansi_fill(b, row, 1, g->cols, ANSI_WHITE, ANSI_BLUE);
        ansi_color(b, ANSI_YELLOW, ANSI_BLUE, 1);
        ansi_text(b, row, 2, line, g->cols - 2);
        ansi_goto(b, row, 2 + (int) strlen(line));
        ansi_cursor(b, 1);
        ansi_flush(b);

        key = ui_read_key();

        if (key == UI_KEY_ENTER) {
            ansi_begin(b, frame, framecap);
            ansi_cursor(b, 0);
            ansi_reset(b);   /* same reason as ui_confirm: put the colours back */
            ansi_flush(b);
            return (buf[0] != '\0') ? 1 : 0;
        }
        if (key == 27 || key >= 1000) {
            continue; /* cursor keys and stray escapes mean nothing here */
        }
        if (key == 8 || key == 127) {
            if (len > 0) {
                buf[--len] = '\0';
            }
        } else if (key == 21) {              /* CTRL-U clears */
            len = 0;
            buf[0] = '\0';
        } else if (key >= 32 && key < 127 && len < maxlen) {
            char c = (char) key;
            if (c >= 'a' && c <= 'z') {
                c = (char) (c - 'a' + 'A');
            }
            buf[len++] = c;
            buf[len] = '\0';
        }
    }
}

static browse_exit browse_loop_ansi(const dr_config *cfg, dr_catalog *cat, const char *filter_desc)
{
    ui_geometry g;
    unsigned long selected = 0;
    unsigned long top_index = 0;
    static char frame[UI_FRAME_BYTES];
    /* One index slot per catalog row. Static rather than automatic: this is
     * MAX_CATALOG_ROWS pointers-worth of longs, far too much for a 68K
     * door's stack. */
    static unsigned long view_index[MAX_CATALOG_ROWS];
    ui_view view;
    ansi_buf buf;
    int need_full_redraw = 1;
    unsigned long prev_selected = 0;
    unsigned long prev_top = 0;
    int info_rows_used = 0;
    int info_mode = UI_INFO_DIZ;
    int prev_info_mode = UI_INFO_DIZ;
    int info_scroll = 0;
    /* Which row the detail pane currently describes, so a pass can tell
     * whether the pane is stale without asking the network. ULONG_MAX-ish
     * sentinel: nothing drawn yet. */
    unsigned long pane_selected = (unsigned long) -1;
    int pane_is_stale = 0;

    ui_compute_geometry(cfg, &g, 0);

    view.index = view_index;
    view.count = 0;
    view.text[0] = '\0';
    view.type[0] = '\0';
    view.scroll_top = 0;
    ui_view_rebuild(&view, cat);

    for (;;) {
        int key;
        const dr_entry *sel_entry;

        if (carrier_lost()) {
            ansi_begin(&buf, frame, (long) sizeof(frame));
            ansi_cursor(&buf, 1);
            ansi_reset(&buf);
            ansi_flush(&buf);
            stop_for_carrier_loss();
        }

        /* Opening or closing a detail view changes the LAYOUT, not just the
         * contents: the list disappears and the pane takes the full width.
         * Recomputing here, at the top of the pass that will draw it, keeps
         * every drawing routine reading one geometry that already matches
         * the mode it is drawing. */
        if (info_mode != prev_info_mode) {
            ui_compute_geometry(cfg, &g, info_mode != UI_INFO_DIZ);
            need_full_redraw = 1;
            prev_info_mode = info_mode;
        }

        /* Whether to pay for the detail pane on this pass.
         *
         * Moving the selection is cheap and local; loading the pane for it is
         * an HTTP fetch. Holding the cursor key down used to buy one fetch per
         * key, for entries the user was already scrolling past.
         *
         * GETKEY answers "has the user typed something already?" WITHOUT
         * consuming it (express.e:3811-3813), so the loop can skip the fetch
         * while they are still moving and do it once when they stop. The list
         * is still redrawn on every pass, which is the part that has to stay
         * immediate - an earlier attempt deferred the redraw too, so nothing
         * moved while keys were being pressed, which just made the user press
         * more.
         *
         * Skipping degrades honestly rather than lying: ui_draw_info() only
         * renders DIZ/files/doc when the cached copy belongs to the selected
         * entry, so a skipped pass shows the catalog's own description
         * instead of the previous door's art. */
        /* The pane is stale whenever the highlight has moved away from the
         * row it was drawn for. The cheap part of the frame never waits for
         * this - only the pane does. */
        pane_is_stale = (selected != pane_selected) || need_full_redraw;

        if (selected != prev_selected) {
            info_scroll = 0;   /* a different entry starts at its own top */
        }
        /* Re-anchors selected/top_index to view.count every pass,
         * unconditionally - the same invariant installed_loop_ansi() applies
         * explicitly right after an uninstall (see flow_clamp_view()'s
         * doc comment in flow.h). This screen's view never actually shrinks
         * out from under the cursor today (its 'F'/'C' mutators both reset
         * selected/top_index to 0 themselves before this point), so the call
         * is defensive here rather than fixing an observed defect - but it
         * is the same tested logic installed_loop_ansi() depends on for
         * real, not a second hand-written copy that could drift from it. */
        flow_clamp_view(&selected, &top_index, view.count, (unsigned long) g.visible_rows);

        /* ONE frame, ONE write, and as small a frame as the change allows.
         * Composing into a buffer and flushing once removed the ~100 XIM
         * round trips per keystroke the first version cost; repainting only
         * the rows that actually changed removes most of what was left. */
        view.scroll_top = top_index;

        /* The entry the footer describes. NULL when the filter matched
         * nothing, which ui_draw_footer treats as "show every key". */
        sel_entry = (view.count > 0)
            ? &cat->rows[view.index[selected]]
            : (const dr_entry *) 0;

        /* PHASE 1: the cheap frame - chrome, the two list rows whose
         * highlight changed, and the footer. This ALWAYS paints, so the
         * cursor keeps up with the user no matter what else is deferred.
         * An earlier version gated the whole frame on "is input waiting",
         * which meant a queue that never drained froze the display.
         *
         * A frame costs real time on a BBS link - it is a screenful of
         * escapes chunked over XIM at AE_MAX_LINE - and every one drawn for
         * a row the user is already scrolling past is time they spend
         * watching the screen crawl. Holding an arrow now moves the
         * selection silently and paints once, where they stopped.
         *
         */
        ansi_begin(&buf, frame, (long) sizeof(frame));
        if (need_full_redraw) {
            ansi_clear(&buf);
            ansi_cursor(&buf, 0);
            ui_draw_chrome(&buf, cfg, &g, cat, &view, filter_desc, sel_entry);
            ui_draw_list(&buf, cfg, &g, cat, &view, top_index, selected, -1, -1);
            /* ansi_clear() already blanked the pane, so the next pane draw
             * must not try to blank rows from before the clear. */
            info_rows_used = 0;
        } else if (top_index != prev_top) {
            /* The window scrolled: every row is different. */
            ui_draw_list(&buf, cfg, &g, cat, &view, top_index, selected, -1, -1);
        } else if (selected != prev_selected) {
            /* Only the highlight moved: repaint the row that lost it and the
             * row that gained it. */
            ui_draw_list(&buf, cfg, &g, cat, &view, top_index, selected,
                         (int) (prev_selected - top_index),
                         (int) (selected - top_index));
        }
        /* The footer describes the SELECTED entry (V=Doc appears only for a
         * door that has documentation), so it is repainted whenever the
         * selection moves. One 60-byte row inside the frame already being
         * composed - it is flushed with everything else, so it does not
         * reintroduce the blue-flash of an out-of-band write. */
        if (selected != prev_selected) {
            ui_draw_footer(&buf, &g, sel_entry,
                           sel_entry != (const dr_entry *) 0
                               && index_lookup(cfg, sel_entry->archive) != (const char *) 0,
                           sel_entry != (const dr_entry *) 0 && sel_entry->junk != 0);
            ansi_reset(&buf);
        }
        /* Park the cursor out of the way, bottom-right, so a terminal that
         * ignores the hide request does not leave it blinking mid-listing. */
        ansi_goto(&buf, g.rows, g.cols);
        ansi_flush(&buf);
        prev_selected = selected;
        prev_top = top_index;
        need_full_redraw = 0;

        /* PHASE 2: the detail pane, once the user has stopped moving.
         *
         * The wait is sliced so a held cursor key never pays for it: each
         * slice checks whether another key has arrived and abandons the pane
         * immediately if so, leaving it stale for the next pass to deal
         * with. Only a genuine pause gets the fetch and the pane repaint. */
        if (pane_is_stale && view.count > 0) {
            int settled = 1;
            int slice;

            for (slice = 0; slice < PANE_DEBOUNCE_SLICES; slice++) {
                if (ae_input_pending()) {
                    settled = 0;
                    break;
                }
                ae_delay_ticks(PANE_DEBOUNCE_TICKS);
            }
            if (settled && ae_input_pending()) {
                settled = 0;
            }

            if (settled) {
                const char *sel_archive = cat->rows[view.index[selected]].archive;

                /* Every load below is a blocking HTTP fetch. On a real link
                 * that is seconds, during which the screen would otherwise
                 * sit there looking hung, so say what is happening first -
                 * but only when the cache will actually miss.
                 *
                 * Drawn INTO THE DETAIL PANE, whose first row ui_draw_info()
                 * overwrites moments later anyway. An earlier version wrote
                 * over the footer and then forced a full redraw to restore
                 * it, which repainted the header and footer bars on every
                 * selection change and flashed blue across the screen. */
                if (info_needs_fetch(info_mode, sel_archive)) {
                    ansi_begin(&buf, frame, (long) sizeof(frame));
                    ansi_color(&buf, ANSI_YELLOW, ANSI_BLACK, 1);
                    ansi_text(&buf, g.pane_top + 1, g.info_left + 2,
                              "Fetching...", g.info_width - 4);
                    ansi_flush(&buf);
                }

                if (info_mode == UI_INFO_FILES) {
                    files_load(cfg, sel_archive);
                } else if (info_mode == UI_INFO_DOC) {
                    doc_load(cfg, sel_archive);
                } else {
                    diz_load(cfg, sel_archive);
                }

                ansi_begin(&buf, frame, (long) sizeof(frame));
                info_rows_used = ui_draw_info(&buf, cfg, &g, cat, &view, selected,
                                              info_rows_used, info_mode, info_scroll);
                ansi_goto(&buf, g.rows, g.cols);
                ansi_flush(&buf);
                pane_selected = selected;
            }
        }

        key = ui_read_key();

        if (carrier_lost()) {
            ansi_begin(&buf, frame, (long) sizeof(frame));
            ansi_cursor(&buf, 1);
            ansi_reset(&buf);
            ansi_flush(&buf);
            stop_for_carrier_loss();
        }

        /* While a detail view is open the cursor keys scroll IT, not the
         * list - the pane is a window onto a file much larger than itself,
         * and moving the selection would just refetch and reset it. The
         * same key that opened the view closes it. */
        if (info_mode != UI_INFO_DIZ
            && (key == UI_KEY_UP || key == UI_KEY_DOWN
                || key == UI_KEY_PGUP || key == UI_KEY_PGDN
                || key == UI_KEY_HOME || key == UI_KEY_END)) {
            int page = g.visible_rows - 1;
            if (page < 1) page = 1;
            if (key == UI_KEY_UP && info_scroll > 0) info_scroll--;
            else if (key == UI_KEY_DOWN) info_scroll++;
            else if (key == UI_KEY_PGUP) info_scroll = (info_scroll > page) ? info_scroll - page : 0;
            else if (key == UI_KEY_PGDN) info_scroll += page;
            else if (key == UI_KEY_HOME) info_scroll = 0;
            /* Deliberately NOT a full redraw: the detail pane is repainted on
             * every pass anyway, and ui_draw_info() blanks whatever the last
             * draw used. Forcing a full redraw here repainted the header and
             * footer bars on every scroll keystroke. */
            continue;
        }

        switch (key) {
        /* All six go through flow_nav_target(), the same call the coalescing
         * drain above makes - two places moving the selection by two sets of
         * rules is how they end up disagreeing. */
        case UI_KEY_UP:
        case UI_KEY_DOWN:
        case UI_KEY_PGUP: case 'p': case 'P':
        case UI_KEY_PGDN: case 'n': case 'N':
        case UI_KEY_HOME:
        case UI_KEY_END:
            selected = flow_nav_target(ui_nav_action(key), selected, view.count,
                                        (unsigned long) g.visible_rows);
            break;
        case UI_KEY_ENTER:
        case 'r': case 'R':
            if (view.count > 0) {
                const dr_entry *sel = &cat->rows[view.index[selected]];
                char question[160];

                strcpy(question, "Download ");
                strncat(question, sel->archive, sizeof(question) - 40);
                strcat(question, "?  [Y/N]");

                if (ui_confirm(&buf, frame, (long) sizeof(frame), &g, question)) {
                    /* download_and_verify() reports progress line by line, so
                     * give the terminal back in a clean state, let it run, and
                     * repaint the browser afterwards. */
                    ansi_begin(&buf, frame, (long) sizeof(frame));
                    ansi_cursor(&buf, 1);
                    ansi_reset(&buf);
                    ansi_clear(&buf);
                    ansi_flush(&buf);

                    download_and_verify(cfg, sel);

                    ae_put("", 1);
                    ae_put("Press any key to return to the list.", 1);
                    (void) ae_key();
                    ansi_begin(&buf, frame, (long) sizeof(frame));
                    ansi_cursor(&buf, 0);
                    ansi_flush(&buf);
                }
                need_full_redraw = 1;
            }
            break;
        case 'f': case 'F':
            /* Filter in place over the rows already loaded - no refetch. */
            ui_filter_prompt(&buf, frame, (long) sizeof(frame), &g, &view, cat);
            selected = 0;
            top_index = 0;
            need_full_redraw = 1;
            break;
        case 'a': case 'A':
            info_mode = (info_mode == UI_INFO_FILES) ? UI_INFO_DIZ : UI_INFO_FILES;
            info_scroll = 0;
            break;
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9':
            /* Follow an AmigaGuide link by number, the same numbering
             * DOORMAN's viewer uses. Only meaningful while a guide is on
             * screen; anywhere else a digit stays unbound, as before. */
            if (info_mode == UI_INFO_DOC && g_guide_ok) {
                int idx = key - '1';
                if (idx < g_guide_link_count) {
                    int target = guide_find_node(&g_guide, g_guide_links[idx].target);
                    if (target >= 0) {
                        if (g_guide_history_len
                            < (int) (sizeof(g_guide_history) / sizeof(g_guide_history[0]))) {
                            g_guide_history[g_guide_history_len++] = g_guide_node;
                        }
                        guide_show_node(target);
                        info_scroll = 0;
                    }
                    /* A link to a node this document does not contain (an
                     * external file, or a typo in the original) is left
                     * alone rather than clearing the pane: the reader
                     * keeps what they were reading. */
                }
            }
            break;
        case 'i': case 'I':
            if (view.count > 0) {
                install_door(cfg, &cat->rows[view.index[selected]], &buf, frame,
                             (long) sizeof(frame), &g);
                ansi_begin(&buf, frame, (long) sizeof(frame));
                ansi_cursor(&buf, 0);
                ansi_flush(&buf);
                need_full_redraw = 1;
            }
            break;
        case 's': case 'S':
            if (view.count > 0) {
                strip_installed_door(cfg, cat->rows[view.index[selected]].archive,
                                     cat->rows[view.index[selected]].junk, &buf, frame,
                                     (long) sizeof(frame));
                ansi_begin(&buf, frame, (long) sizeof(frame));
                ansi_cursor(&buf, 0);
                ansi_flush(&buf);
                need_full_redraw = 1;
            }
            break;
        case 'u': case 'U':
            if (view.count > 0) {
                uninstall_door(cfg, cat->rows[view.index[selected]].archive, &buf, frame,
                               (long) sizeof(frame), &g);
                ansi_begin(&buf, frame, (long) sizeof(frame));
                ansi_cursor(&buf, 0);
                ansi_flush(&buf);
                need_full_redraw = 1;
            }
            break;
        case 'b': case 'B':
            if (info_mode == UI_INFO_DOC && g_guide_ok && g_guide_history_len > 0) {
                guide_show_node(g_guide_history[--g_guide_history_len]);
                info_scroll = 0;
            }
            break;
        case 'v': case 'V':
            /* Gated on the same flag as the footer's V=Doc part: hiding a
             * key while still honouring it would make the footer a lie in
             * the other direction, and pressing it on a doc-less door
             * costs a request that can only answer "nothing here". A -1
             * (server never said) still opens the view, as before. */
            if (sel_entry != (const dr_entry *) 0 && sel_entry->has_doc == 0) {
                break;
            }
            info_mode = (info_mode == UI_INFO_DOC) ? UI_INFO_DIZ : UI_INFO_DOC;
            info_scroll = 0;
            break;
        case 'c': case 'C':
            ui_view_cycle_type(&view, cat);
            ui_view_rebuild(&view, cat);
            selected = 0;
            top_index = 0;
            need_full_redraw = 1;
            break;
        case 'q': case 'Q':
            ansi_begin(&buf, frame, (long) sizeof(frame));
            ansi_cursor(&buf, 1);
            ansi_reset(&buf);
            ansi_clear(&buf);
            ansi_flush(&buf);
            return BROWSE_QUIT;
        default:
            break;
        }
    }
}

/* ---------------------------------------------------------------------
 * Installed doors screen
 *
 * A second full-screen ANSI view, entered from the main browser (Task 4
 * wires the entry key), over the same list+detail layout as
 * browse_loop_ansi() but restricted to the rows ui_view_rebuild_installed()
 * (Task 2) says are installed. Trimmed of every key that does not make
 * sense once the list is already "installed only": no F=Find or C=System
 * (nothing left to narrow further), no I=Install (nothing to install from
 * here), no digit guide-links or B=Back-in-guide (v1 scope cut - V still
 * opens documentation, just without in-doc link-following).
 * ------------------------------------------------------------------- */

/* Step 4's header: "N installed" - `v->count`, the number of catalog rows
 * this screen actually matched, NOT index_installed_count(cfg)'s raw
 * install-index size, which also counts orphans (see below). Folding
 * orphans into that number would overstate what is actually usable from
 * this screen, so they get their own line instead, and only when there are
 * any - an all-zero "(+0 not in current catalog listing)" under an
 * otherwise ordinary list would read as something being wrong. */
static void ui_draw_installed_header(ansi_buf *b, const ui_geometry *g,
                                     unsigned long installed_count,
                                     unsigned long orphan_count)
{
    char title[96];

    strcpy(title, "DoorRepo v");
    strcat(title, DOOR_VERSION);
    strcat(title, "   ");
    ui_append_ulong(title, installed_count);
    strcat(title, " installed");

    ui_draw_bar(b, 1, g->cols, title);

    if (orphan_count > 0) {
        char orphan_line[64];

        strcpy(orphan_line, "(+");
        ui_append_ulong(orphan_line, orphan_count);
        strcat(orphan_line, " not in current catalog listing)");
        ansi_color(b, ANSI_YELLOW, ANSI_BLUE, 0);
        ansi_center(b, 1 + 2, 1, g->cols, orphan_line);
    }
}

/* Step 5's footer legend: `ENTER/R=Get  A=Archive  V=Doc  U=Uninstall
 * S=Strip  Q=Back`, F=Find/C=System/I=Install dropped along with the keys
 * they name. Every row here is already installed, so unlike
 * ui_draw_footer()'s browse-screen version there is no install/uninstall
 * ternary - U=Uninstall is unconditional. V and S keep the same gates
 * ui_draw_footer() applies (has_doc, has_junk) for the same reason: hiding
 * a key that would still work is the worse of the two errors. */
static void ui_draw_footer_installed(ansi_buf *b, const ui_geometry *g,
                                     const dr_entry *e, int has_junk)
{
    char bar[160];

    strcpy(bar, "ENTER/R=Get  A=Archive");
    if (e == (const dr_entry *) 0 || e->has_doc != 0) {
        strcat(bar, "  V=Doc");
    }
    strcat(bar, "  U=Uninstall");
    if (has_junk) {
        strcat(bar, "  S=Strip");
    }
    strcat(bar, "  Q=Back");
    ui_draw_bar(b, g->rows - UI_FOOTER_ROWS + 1, g->cols, bar);
}

static void ui_draw_installed_chrome(ansi_buf *b, const ui_geometry *g,
                                     const ui_view *v, unsigned long orphan_count,
                                     const dr_entry *sel_entry, int has_junk)
{
    char label[48];

    strcpy(label, "INSTALLED (");
    ui_append_ulong(label, v->count);
    strcat(label, ")");

    ui_draw_installed_header(b, g, v->count, orphan_count);
    if (g->list_width > 0) {
        ansi_box(b, g->pane_top, g->list_left, g->pane_height, g->list_width, ANSI_CYAN, label);
    }
    ansi_box(b, g->pane_top, g->info_left, g->pane_height, g->info_width, ANSI_BLUE,
             (const char *) 0);
    ui_draw_footer_installed(b, g, sel_entry, has_junk);
    ansi_reset(b);
}

static void installed_loop_ansi(const dr_config *cfg, dr_catalog *cat)
{
    ui_geometry g;
    unsigned long selected = 0;
    unsigned long top_index = 0;
    static char frame[UI_FRAME_BYTES];
    /* Own static index array, separate from browse_loop_ansi()'s - both
     * screens can be mid-loop on the call stack (this one is entered FROM
     * the browser), so they cannot share one buffer. */
    static unsigned long view_index[MAX_CATALOG_ROWS];
    ui_view view;
    unsigned long orphan_count = 0;
    ansi_buf buf;
    int need_full_redraw = 1;
    unsigned long prev_selected = 0;
    unsigned long prev_top = 0;
    int info_rows_used = 0;
    int info_mode = UI_INFO_DIZ;
    int prev_info_mode = UI_INFO_DIZ;
    int info_scroll = 0;
    unsigned long pane_selected = (unsigned long) -1;
    int pane_is_stale = 0;

    ui_compute_geometry(cfg, &g, 0);

    view.index = view_index;
    view.count = 0;
    view.text[0] = '\0';
    view.type[0] = '\0';
    view.scroll_top = 0;
    /* Built once on entry - this list only changes when something is
     * uninstalled from inside this same screen, at which point the 'u'/'U'
     * case below rebuilds it again. */
    ui_view_rebuild_installed(&view, cat, cfg, &orphan_count);

    for (;;) {
        int key;
        const dr_entry *sel_entry;

        if (carrier_lost()) {
            ansi_begin(&buf, frame, (long) sizeof(frame));
            ansi_cursor(&buf, 1);
            ansi_reset(&buf);
            ansi_flush(&buf);
            stop_for_carrier_loss();
        }

        if (info_mode != prev_info_mode) {
            ui_compute_geometry(cfg, &g, info_mode != UI_INFO_DIZ);
            need_full_redraw = 1;
            prev_info_mode = info_mode;
        }

        pane_is_stale = (selected != pane_selected) || need_full_redraw;

        if (selected != prev_selected) {
            info_scroll = 0;
        }
        /* Step 3a's fix, reused rather than re-derived: the same clamp
         * browse_loop_ansi() now also calls, applied here every pass for
         * the same reason - and again, explicitly, right after the 'u'/'U'
         * case rebuilds a SHRUNKEN view below, so the very next
         * cat->rows[view.index[selected]] in this same pass is already
         * safe. */
        flow_clamp_view(&selected, &top_index, view.count, (unsigned long) g.visible_rows);

        view.scroll_top = top_index;

        sel_entry = (view.count > 0)
            ? &cat->rows[view.index[selected]]
            : (const dr_entry *) 0;

        ansi_begin(&buf, frame, (long) sizeof(frame));
        if (need_full_redraw) {
            ansi_clear(&buf);
            ansi_cursor(&buf, 0);
            ui_draw_installed_chrome(&buf, &g, &view, orphan_count, sel_entry,
                                     sel_entry != (const dr_entry *) 0 && sel_entry->junk != 0);
            ui_draw_list(&buf, cfg, &g, cat, &view, top_index, selected, -1, -1);
            info_rows_used = 0;
        } else if (top_index != prev_top) {
            ui_draw_list(&buf, cfg, &g, cat, &view, top_index, selected, -1, -1);
        } else if (selected != prev_selected) {
            ui_draw_list(&buf, cfg, &g, cat, &view, top_index, selected,
                         (int) (prev_selected - top_index),
                         (int) (selected - top_index));
        }
        if (selected != prev_selected) {
            ui_draw_footer_installed(&buf, &g, sel_entry,
                                     sel_entry != (const dr_entry *) 0 && sel_entry->junk != 0);
            ansi_reset(&buf);
        }
        ansi_goto(&buf, g.rows, g.cols);
        ansi_flush(&buf);
        prev_selected = selected;
        prev_top = top_index;
        need_full_redraw = 0;

        if (pane_is_stale && view.count > 0) {
            int settled = 1;
            int slice;

            for (slice = 0; slice < PANE_DEBOUNCE_SLICES; slice++) {
                if (ae_input_pending()) {
                    settled = 0;
                    break;
                }
                ae_delay_ticks(PANE_DEBOUNCE_TICKS);
            }
            if (settled && ae_input_pending()) {
                settled = 0;
            }

            if (settled) {
                const char *sel_archive = cat->rows[view.index[selected]].archive;

                if (info_needs_fetch(info_mode, sel_archive)) {
                    ansi_begin(&buf, frame, (long) sizeof(frame));
                    ansi_color(&buf, ANSI_YELLOW, ANSI_BLACK, 1);
                    ansi_text(&buf, g.pane_top + 1, g.info_left + 2,
                              "Fetching...", g.info_width - 4);
                    ansi_flush(&buf);
                }

                if (info_mode == UI_INFO_FILES) {
                    files_load(cfg, sel_archive);
                } else if (info_mode == UI_INFO_DOC) {
                    doc_load(cfg, sel_archive);
                } else {
                    diz_load(cfg, sel_archive);
                }

                ansi_begin(&buf, frame, (long) sizeof(frame));
                info_rows_used = ui_draw_info(&buf, cfg, &g, cat, &view, selected,
                                              info_rows_used, info_mode, info_scroll);
                ansi_goto(&buf, g.rows, g.cols);
                ansi_flush(&buf);
                pane_selected = selected;
            }
        }

        key = ui_read_key();

        if (carrier_lost()) {
            ansi_begin(&buf, frame, (long) sizeof(frame));
            ansi_cursor(&buf, 1);
            ansi_reset(&buf);
            ansi_flush(&buf);
            stop_for_carrier_loss();
        }

        if (info_mode != UI_INFO_DIZ
            && (key == UI_KEY_UP || key == UI_KEY_DOWN
                || key == UI_KEY_PGUP || key == UI_KEY_PGDN
                || key == UI_KEY_HOME || key == UI_KEY_END)) {
            int page = g.visible_rows - 1;
            if (page < 1) page = 1;
            if (key == UI_KEY_UP && info_scroll > 0) info_scroll--;
            else if (key == UI_KEY_DOWN) info_scroll++;
            else if (key == UI_KEY_PGUP) info_scroll = (info_scroll > page) ? info_scroll - page : 0;
            else if (key == UI_KEY_PGDN) info_scroll += page;
            else if (key == UI_KEY_HOME) info_scroll = 0;
            continue;
        }

        switch (key) {
        case UI_KEY_UP:
        case UI_KEY_DOWN:
        case UI_KEY_PGUP: case 'p': case 'P':
        case UI_KEY_PGDN: case 'n': case 'N':
        case UI_KEY_HOME:
        case UI_KEY_END:
            selected = flow_nav_target(ui_nav_action(key), selected, view.count,
                                        (unsigned long) g.visible_rows);
            break;
        case UI_KEY_ENTER:
        case 'r': case 'R':
            if (view.count > 0) {
                const dr_entry *sel = &cat->rows[view.index[selected]];
                char question[160];

                strcpy(question, "Download ");
                strncat(question, sel->archive, sizeof(question) - 40);
                strcat(question, "?  [Y/N]");

                if (ui_confirm(&buf, frame, (long) sizeof(frame), &g, question)) {
                    ansi_begin(&buf, frame, (long) sizeof(frame));
                    ansi_cursor(&buf, 1);
                    ansi_reset(&buf);
                    ansi_clear(&buf);
                    ansi_flush(&buf);

                    download_and_verify(cfg, sel);

                    ae_put("", 1);
                    ae_put("Press any key to return to the list.", 1);
                    (void) ae_key();
                    ansi_begin(&buf, frame, (long) sizeof(frame));
                    ansi_cursor(&buf, 0);
                    ansi_flush(&buf);
                }
                need_full_redraw = 1;
            }
            break;
        case 'a': case 'A':
            info_mode = (info_mode == UI_INFO_FILES) ? UI_INFO_DIZ : UI_INFO_FILES;
            info_scroll = 0;
            break;
        case 's': case 'S':
            if (view.count > 0) {
                strip_installed_door(cfg, cat->rows[view.index[selected]].archive,
                                     cat->rows[view.index[selected]].junk, &buf, frame,
                                     (long) sizeof(frame));
                ansi_begin(&buf, frame, (long) sizeof(frame));
                ansi_cursor(&buf, 0);
                ansi_flush(&buf);
                need_full_redraw = 1;
            }
            break;
        case 'u': case 'U':
            if (view.count > 0) {
                uninstall_door(cfg, cat->rows[view.index[selected]].archive, &buf, frame,
                               (long) sizeof(frame), &g);
                /* The uninstalled row must disappear: rebuild against the
                 * now-current install index, then clamp immediately (Step
                 * 3, reusing Step 3a's fix) rather than leaving selected/
                 * top_index stale until the next pass happens to fix them
                 * up before anything dereferences view.index[selected]. */
                ui_view_rebuild_installed(&view, cat, cfg, &orphan_count);
                flow_clamp_view(&selected, &top_index, view.count,
                                (unsigned long) g.visible_rows);
                ansi_begin(&buf, frame, (long) sizeof(frame));
                ansi_cursor(&buf, 0);
                ansi_flush(&buf);
                need_full_redraw = 1;
            }
            break;
        case 'v': case 'V':
            if (sel_entry != (const dr_entry *) 0 && sel_entry->has_doc == 0) {
                break;
            }
            info_mode = (info_mode == UI_INFO_DOC) ? UI_INFO_DIZ : UI_INFO_DOC;
            info_scroll = 0;
            break;
        case 'q': case 'Q':
            ansi_begin(&buf, frame, (long) sizeof(frame));
            ansi_cursor(&buf, 1);
            ansi_reset(&buf);
            ansi_clear(&buf);
            ansi_flush(&buf);
            return;
        default:
            break;
        }
    }
}

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
    /* Both digests are computed in the SAME pass over the stream. The
     * bytes are in memory once, on their way to disk; hashing them twice
     * there costs one extra pass of arithmetic, while computing SHA-256
     * afterwards would mean reading the whole archive back off an Amiga
     * floppy or hard disk a second time. */
    sha256_ctx sha;
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
    sha256_update(&dc->sha, buf, len);
    dc->received += len;

    if (dc->received - dc->last_progress_report >= PROGRESS_INTERVAL) {
        char msg[64];
        sprintf(msg, "  ... %lu KB received", dc->received / 1024UL);
        ae_put(msg, 1);
        dc->last_progress_report = dc->received;
    }

    return 0;
}

/* Case-insensitive comparison of two hex digest strings. Both sides are
 * lowercase hex by contract, but a hand-edited catalog row or a proxy that
 * upper-cases a header should not read as a mismatch. */
static int hex_digest_equals(const char *a, const char *b)
{
    int i;

    for (i = 0; a[i] != '\0' && b[i] != '\0'; i++) {
        char x = a[i];
        char y = b[i];
        if (x >= 'A' && x <= 'Z') x = (char) (x - 'A' + 'a');
        if (y >= 'A' && y <= 'Z') y = (char) (y - 'A' + 'a');
        if (x != y) {
            return 0;
        }
    }
    return strlen(a) == strlen(b);
}

/* Performs one download attempt of `entry` into `local_path`, hashing as
 * it streams. Returns 1 if the archive was written AND its digest matched,
 * 0 otherwise (transport failure, HTTP error, length mismatch, or digest
 * mismatch - the caller distinguishes these via the out-parameters for the
 * retry state machine and the log line).
 *
 * WHICH digest decides:
 *
 *   1. The X-Archive-SHA256 response header, when the server sent one.
 *      The server computes it from the very file it is streaming (see
 *      door-repo.routes.ts: getArchiveChecksums on the resolved path,
 *      keyed by mtime+size), so it describes THESE bytes rather than
 *      whatever was indexed weeks ago - and SHA-256 is what DOORMAN, the
 *      other client of this same API, has always verified.
 *   2. Failing that, the catalog row's MD5, which is what this door used
 *      exclusively before 2026-08-18 and remains the fallback for a
 *      server too old to send the header.
 *
 * *used_sha_out reports which one ran, so the caller's messages and log
 * lines can name the digest they are talking about instead of always
 * saying "MD5". When SHA-256 decided AND the catalog also carried an MD5,
 * a disagreement between the computed MD5 and that catalog value is
 * reported as a stale-catalog note rather than a failure: the archive
 * itself verified against a digest of the actual bytes, and the format
 * doc's "Digest freshness" section already documents catalog digests as
 * potentially out of date. */
static int attempt_download(const dr_config *cfg, const dr_entry *entry,
                             const char *local_path, char *computed_md5_out,
                             char *computed_sha_out, int *used_sha_out)
{
    download_ctx dc;
    unsigned char digest[16];
    unsigned char shadigest[32];
    char path[256];
    http_response resp;
    int rc;

    *used_sha_out = 0;

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
    sha256_init(&dc.sha);
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
    sha256_final(&dc.sha, shadigest);
    sha256_hex(shadigest, computed_sha_out);

    if (resp.sha256[0] != '\0') {
        *used_sha_out = 1;
        if (entry->md5[0] != '\0' && !hex_digest_equals(computed_md5_out, entry->md5)) {
            /* Not a failure: see this function's header comment. Worth
             * saying out loud because it is actionable for the repo
             * owner - it means the catalog row was indexed from a
             * different copy of this archive than the one being served. */
            ae_put("Note: this archive's catalog MD5 does not match the file the server sent;", 1);
            ae_put("the catalog digest is probably stale. Verifying against SHA-256 instead.", 1);
        }
        return hex_digest_equals(computed_sha_out, resp.sha256);
    }

    if (entry->md5[0] == '\0') {
        ae_put("Note: neither a SHA-256 header nor a catalog MD5 is available for this", 1);
        ae_put("archive; skipping digest verification.", 1);
        return 1;
    }

    return hex_digest_equals(computed_md5_out, entry->md5);
}

/* Disposes of a download whose digest did not match.
 *
 * Default: delete it, so a corrupt archive never sits around waiting to be
 * mistaken for a good one. With KeepFailedDownloads on it is renamed to
 * "<name>.bad" instead, because the bytes are the only thing that can
 * explain a mismatch and the door deleting them is what left the -D-CALC.LHA
 * case unanswerable (see flow_build_bad_path()'s comment).
 *
 * Any previous .bad for the same archive is removed first: rename() over an
 * existing file is not portable, and the retry would otherwise leave the
 * FIRST attempt's bytes on disk while reporting the second's digest. Falling
 * back to remove() when the rename fails keeps the default promise - a
 * mismatching file is never left where a good one belongs. */
static void discard_mismatched_download(const dr_config *cfg, const char *local_path)
{
    char bad_path[288];

    if (!cfg->keep_failed_downloads
        || flow_build_bad_path(bad_path, sizeof(bad_path), local_path) < 0) {
        remove(local_path);
        return;
    }

    remove(bad_path);
    if (rename(local_path, bad_path) != 0) {
        remove(local_path);
        return;
    }

    {
        char msg[192];
        sprintf(msg, "Kept the mismatching file as %.160s for inspection.", bad_path);
        ae_put(msg, 1);
    }
    {
        char logmsg[256];
        sprintf(logmsg, "DOWNLOAD KEPT-BAD path=%.200s", bad_path);
        log_line(cfg, logmsg);
    }
}

static void download_and_verify(const dr_config *cfg, const dr_entry *entry)
{
    char local_path[256];
    char computed_md5[33];
    char computed_sha[65];
    int used_sha;
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

    /* Never read uninitialized if attempt_download() fails before it
     * computes a digest. */
    computed_md5[0] = '\0';
    computed_sha[0] = '\0';
    used_sha = 0;

    attempt = 1;
    for (;;) {
        matched = attempt_download(cfg, entry, local_path, computed_md5,
                                    computed_sha, &used_sha);

        /* "Nothing to verify against" now means BOTH digests were absent:
         * a server that sent X-Archive-SHA256 has given this door a real
         * check even when the catalog row's md5 field is empty (which is
         * a documented, ordinary state - see "Digest freshness"). */
        if (!used_sha && entry->md5[0] == '\0') {
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
                log_line(cfg, "DOWNLOAD FAILED (no digest to verify)");
                return;
            }
            log_line(cfg, "DOWNLOAD OK (no digest to verify)");
            break;
        }

        outcome = flow_next_verify_outcome(attempt, matched);

        if (outcome == FLOW_VERIFY_OK) {
            /* 96 bytes was enough while only a 32-character MD5 could
             * appear here; a 64-character SHA-256 needs 97 and smashed the
             * stack (found by AddressSanitizer on a real download, after
             * the verification itself had already succeeded). Sized for
             * the longest digest plus the sentence around it. */
            char msg[160];
            sprintf(msg, "Checksum verified OK (%s %s).",
                    used_sha ? "SHA-256" : "MD5",
                    used_sha ? computed_sha : computed_md5);
            ae_put(msg, 1);
            {
                char logmsg[256];
                sprintf(logmsg, "DOWNLOAD OK archive=%s attempt=%d %s=%s", entry->archive, attempt,
                        used_sha ? "sha256" : "md5",
                        used_sha ? computed_sha : computed_md5);
                log_line(cfg, logmsg);
            }
            break;
        }

        {
            char msg[224];
            sprintf(msg, "Checksum MISMATCH (%s): server says %s, downloaded file is %s.",
                    used_sha ? "SHA-256" : "MD5",
                    used_sha ? "the SHA-256 it sent with the file" : entry->md5,
                    used_sha ? computed_sha : computed_md5);
            ae_put(msg, 1);
        }
        discard_mismatched_download(cfg, local_path);

        if (outcome == FLOW_VERIFY_RETRY) {
            ae_put("Retrying download once...", 1);
            {
                char logmsg[256];
                sprintf(logmsg, "DOWNLOAD MISMATCH archive=%s attempt=%d digest=%s computed=%s (retrying)",
                        entry->archive, attempt,
                        used_sha ? "sha256" : "md5",
                        used_sha ? computed_sha : computed_md5);
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
            sprintf(logmsg, "DOWNLOAD ABORT archive=%s attempt=%d digest=%s computed=%s",
                    entry->archive, attempt,
                    used_sha ? "sha256" : "md5",
                    used_sha ? computed_sha : computed_md5);
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
            ae_put("Extracting archive...", 1);
            rc = run_extractor(cfg, local_path, cfg->download_dir) ? 0 : 1;
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

    /* Ask the BBS to stop eating the cursor keys. Without this a real
     * AmiExpress node marks every arrow as a control key and readChar()
     * loops right past it, so the door is never told a key was pressed at
     * all - reported from a real node as "cannot navigate with the cursor
     * keys", and invisible here because this project's emulator delivers
     * arrows either way. See ae_raw_arrows() in aedoor.h. The backend
     * restores the previous state on every shutdown path. */
    ae_raw_arrows(1);

    info_caches_init();

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
        /* Ansi=yes (the default) gets the full-screen browser that mirrors
         * DOORMAN's repo view; Ansi=no keeps the original line-at-a-time
         * listing for a terminal that cannot do CSI sequences. */
        exit_reason = cfg.ansi
            ? browse_loop_ansi(&cfg, &cat, filter_desc)
            : browse_loop(&cfg, &cat, filter_desc);

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
