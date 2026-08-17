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
 *   ae_put()      -> stdout, chunked at AE_MAX_LINE like the real backend.
 *   ae_get()      -> one line via fgets(), truncated safely at maxlen.
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

#include "aedoor.h"

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

    if (text == NULL) {
        text = "";
    }

    len = (unsigned long)strlen(text);
    offset = 0;

    /* Chunk at AE_MAX_LINE even though stdout has no such limit, so the
     * boundary logic is identical to -- and testable as a twin of -- the
     * real backend, which genuinely cannot send more than that per call. */
    while (offset < len) {
        chunk = len - offset;
        if (chunk > AE_MAX_LINE) {
            chunk = AE_MAX_LINE;
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

    if (buf == NULL || maxlen <= 0) {
        return;
    }

    /* fgets() never writes more than maxlen bytes (including the NUL), so
     * this cannot overflow buf regardless of how long the actual input
     * line is; any remainder beyond maxlen-1 chars simply stays queued on
     * stdin, which is the safe-truncation behaviour this function
     * promises. */
    if (fgets(buf, maxlen, stdin) == NULL) {
        buf[0] = '\0';
        return;
    }

    newline = strchr(buf, '\n');
    if (newline != NULL) {
        *newline = '\0';
    }
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
