/* aedoor_native.c - stdio twin of the AmiExpress XIM door I/O layer.
 *
 * Implements aedoor.h over plain stdio so the DoorRepo door logic (Task 6)
 * can be written once, TDD'd, and run on a dev machine without a live
 * AmiExpress node or an m68k emulator, then cross-compiled unchanged
 * against aedoor_amiga.c for the real target. There is no "#ifdef AMIGA"
 * anywhere in this file -- the choice of THIS file over aedoor_amiga.c,
 * made by the Makefile (Task 6), is the entire platform mechanism.
 *
 * Mapping to the real protocol (see aedoor.h and aedoor_amiga.c for the
 * wire-level citations):
 *   ae_put()      -> stdout, chunked at AE_MAX_LINE like the real backend,
 *                     with the same "bbs:" reroute guard (see
 *                     would_reroute_to_file_display() below) so a caller
 *                     sees byte-identical output on either backend.
 *   ae_get()      -> one line via fgets(), truncated safely at maxlen, and
 *                     draining any unread remainder of an over-long line so
 *                     the next call starts at the following line.
 *   ae_key()      -> one character via getchar(); EOF reports as -1,
 *                     mirroring the real backend's carrier-loss code.
 *   ae_check()    -> always 0: there is no BBS connection to lose.
 *   ae_start()    -> no-op success (nothing to register with).
 *   ae_shutdown() -> no-op that RETURNS (no BBS to notify, no reason to
 *                     end the caller's process early).
 *   ae_fatal()    -> still terminates the process via exit(code); a fatal
 *                     error must stop execution on every backend, even
 *                     though there is nothing to notify here.
 *
 * C89. ASCII only.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#include "aedoor.h"

/* AmiExpress doors sometimes deliberately send "bbs:" device/volume paths
 * via JH_SM to trigger file display instead of a printed line: our emulator
 * matches this by trimming the message text and testing a case-insensitive
 * prefix (io.ts:657-666 -- "const trimmed = text.trim(); ... if
 * (trimmed.toLowerCase().startsWith('bbs:')) { ...handleShowFile(...);
 * return; }"). This door only ever wants JH_SM/ae_put to print. A sysop can
 * legitimately configure a download directory as "bbs:doors/", so a wholly
 * ordinary status line like "bbs:doors/FOO.LHA saved" would otherwise be
 * silently rerouted on the Amiga backend -- guarded identically here so the
 * native twin's output matches byte-for-byte and the behaviour is testable
 * without a live emulator.
 *
 * MUST be evaluated PER CHUNK, not once against the caller's whole string:
 * the BBS's reroute check runs on each JH_SM message independently, so any
 * chunk whose OWN first bytes spell "bbs:" is just as vulnerable as the
 * first chunk -- see the matching comment in aedoor_amiga.c's ae_put() for
 * the full reasoning. This is a stdio twin with no real 198-byte send
 * limit, but ae_put() below still walks the same AE_MAX_LINE chunk
 * boundaries as the real backend and re-checks on every iteration, so a
 * caller (and the test suite) sees byte-identical placement of the guard
 * byte on both backends.
 *
 * A leading SPACE does NOT defeat the real check: the BBS trims leading/
 * trailing whitespace BEFORE testing the prefix (text.trim(), io.ts:659),
 * and messages.ts:200 builds that JS string via String.fromCharCode() on
 * the raw bytes, so both an ASCII space (0x20) and a Latin-1 NBSP (0xA0)
 * are still classified as whitespace and stripped by .trim() -- verified
 * against the actual check: " bbs:x".trim().startsWith("bbs:") is true.
 * The guard byte must be printable and non-whitespace to survive trim();
 * a single leading period reliably breaks the match and renders as an
 * ordinary visible character on every terminal. */
static int would_reroute_to_file_display(const char *text, unsigned long n)
{
    unsigned long i;

    i = 0;
    while (i < n && isspace((unsigned char)text[i])) {
        i++;
    }
    if (i + 4 > n) {
        return 0; /* fewer than 4 bytes left in THIS message -- cannot match */
    }
    return (text[i] == 'b' || text[i] == 'B')
        && (text[i + 1] == 'b' || text[i + 1] == 'B')
        && (text[i + 2] == 's' || text[i + 2] == 'S')
        && text[i + 3] == ':';
}

int ae_start(int node)
{
    (void)node; /* nothing to register with when there is no AmiExpress */
    return 0;
}

void ae_put(const char *text, int newline)
{
    unsigned long len;
    unsigned long offset;
    unsigned long chunk;
    unsigned long remaining;
    unsigned long check_len;
    unsigned long budget;
    int prefixed;

    if (text == NULL) {
        text = "";
    }

    len = (unsigned long)strlen(text);
    offset = 0;

    /* Chunk at AE_MAX_LINE even though stdout has no such limit, so the
     * boundary logic is identical to -- and testable as a twin of -- the
     * real backend, which genuinely cannot send more than that per call.
     * The bbs: reroute guard is re-evaluated on EVERY iteration against
     * exactly the bytes that iteration is about to write -- see the
     * comment above would_reroute_to_file_display(). */
    while (offset < len) {
        remaining = len - offset;
        check_len = (remaining > (unsigned long)AE_MAX_LINE) ? (unsigned long)AE_MAX_LINE : remaining;
        prefixed = would_reroute_to_file_display(text + offset, check_len) ? 1 : 0;

        budget = (unsigned long)AE_MAX_LINE - (unsigned long)prefixed;
        chunk = remaining;
        if (chunk > budget) {
            chunk = budget;
        }

        if (prefixed) {
            fputc('.', stdout); /* guard byte: breaks the trimmed "bbs:" prefix match, see would_reroute_to_file_display() above */
        }
        fwrite(text + offset, 1, (size_t)chunk, stdout);

        offset += chunk;
    }

    if (newline) {
        fputc('\n', stdout);
    }
}

void ae_get(char *buf, int maxlen)
{
    char *newline;
    int c;

    if (buf == NULL || maxlen <= 0) {
        return;
    }

    /* fgets() never writes more than maxlen bytes (including the NUL), so
     * this cannot overflow buf regardless of how long the actual input
     * line is. */
    if (fgets(buf, maxlen, stdin) == NULL) {
        buf[0] = '\0';
        return;
    }

    newline = strchr(buf, '\n');
    if (newline != NULL) {
        *newline = '\0';
        return;
    }

    /* No newline landed in buf: the input line was longer than maxlen-1
     * chars and its remainder is still queued on stdin. Drain it here so
     * the NEXT ae_get() call starts cleanly at the following line instead
     * of reading leftovers from this one -- otherwise a single over-long
     * answer desynchronises every prompt that follows it. Stops at EOF too,
     * so this can never spin if the stream simply ends mid-line. */
    do {
        c = getchar();
    } while (c != '\n' && c != EOF);
}

int ae_key(void)
{
    int c;

    c = getchar();
    if (c == EOF) {
        return -1;
    }
    return c;
}

int ae_check(void)
{
    return 0;
}

void ae_shutdown(void)
{
    /* no-op: nothing to notify, and no reason to end the caller's process
     * early when there is no BBS on the other end. */
}

void ae_fatal(int code)
{
    exit(code);
}
