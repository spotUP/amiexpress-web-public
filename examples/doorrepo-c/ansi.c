/*
 * ansi.c - the one thing doorrepo keeps of its old ANSI layer: where a
 * finished frame goes.
 *
 * Everything else is sdk/c/src/ui_ansi.c now. See ansi.h.
 */

#include "ansi.h"
#include "aedoor.h"

/** The sink: one composed frame, handed to the BBS in a single write. */
static void to_bbs(void *context, const char *bytes, long len)
{
    (void)context;
    (void)len;
    ae_put((char *)bytes, 0);
}

void ansi_flush_to_bbs(ansi_buf *b)
{
    ansi_flush(b, to_bbs, 0);
}
