/*
 * ae_out - writing to the caller.
 *
 * Phase 0 carries exactly two of these so the linking rule can be MEASURED
 * with one module used and one module not (see tools/measure-link.sh). They
 * are real, not stubs: every door writes text and clears the screen.
 */

#include "ae_out.h"

#include <stdio.h>

void ae_write(const char *text)
{
    if (!text) return;
    fputs(text, stdout);
    fflush(stdout);
}

void ae_write_line(const char *text)
{
    ae_write(text);
    /* CR LF: a caller on a real serial line needs both. */
    ae_write("\r\n");
}
