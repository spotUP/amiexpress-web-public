/*
 * ae_chunk - see ae_chunk.h. Lifted from flow.c with its reasoning.
 */

#include "ae_chunk.h"

unsigned long ae_safe_chunk(const char *text, unsigned long len,
                              unsigned long budget)
{
    unsigned long take;
    unsigned long i;
    long esc = -1;

    if (text == (const char *) 0 || len == 0 || budget == 0) {
        return 0;
    }
    take = (len < budget) ? len : budget;

    /* The last ESC in what is about to be sent. Anything earlier has been
     * terminated already, or this one would not be the last. */
    for (i = 0; i < take; i++) {
        if (text[i] == '\033') {
            esc = (long) i;
        }
    }
    if (esc < 0) {
        return take;
    }

    /* Terminated inside the chunk? A CSI sequence ends on its final byte,
     * anything in 0x40..0x7e after the '['. */
    for (i = (unsigned long) esc + 2; i < take; i++) {
        unsigned char c = (unsigned char) text[i];
        if (c >= 0x40 && c <= 0x7e) {
            return take;
        }
    }

    /* Unterminated: cut before it and let the next message carry it whole. */
    if (esc == 0) {
        return take;                 /* longer than a whole message: send on */
    }
    return (unsigned long) esc;
}
