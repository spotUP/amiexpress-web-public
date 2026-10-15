/*
 * write-message - drive ae_msg_write from a shell, so the ROUND TRIP can be
 * tested across the language boundary.
 *
 * The plan's gate for release 2 is not "the C tests pass": it is that a
 * message this C writer puts on disk is read back correctly BY THE BOARD'S OWN
 * READER, byte for byte, out of a copy of a real conference. The board's
 * reader is TypeScript (MessageIndexManager), so something has to run the C
 * writer from a jest test, and this is it.
 *
 * A C test cannot close that loop by itself. It would be checking this
 * module's bytes with this module's own parser - the exact shape that lets a
 * writer and a reader agree with each other and disagree with the board.
 *
 *   write-message <dir> <status> <to> <from> <subject> <date> [body]
 *
 * Prints the assigned number on success, or "ERR <code>" and exits non-zero.
 */

#include "ae_msgbase.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(int argc, char **argv)
{
    ae_msg_new msg;
    const char *body;
    long n;

    if (argc < 7) {
        fprintf(stderr,
                "usage: write-message <dir> <status> <to> <from> <subject> <date> [body]\n");
        return 2;
    }

    /* Opened as a sysop so the open itself cannot filter anything out; this
       tool is about writing, and visibility is the reader's test. */
    if (ae_msg_open(argv[1], argv[4], 1, 0) != AE_MSG_OK) {
        fprintf(stderr, "ERR cannot open base %s\n", argv[1]);
        return 3;
    }

    msg.status  = (int)(unsigned char)argv[2][0];
    msg.to      = argv[3];
    msg.from    = argv[4];
    msg.subject = argv[5];
    msg.date    = atol(argv[6]);

    body = (argc > 7) ? argv[7] : "";

    n = ae_msg_write(&msg, body, (unsigned long)strlen(body));
    if (n < 0) {
        fprintf(stderr, "ERR %ld\n", n);
        return 1;
    }

    printf("%ld\n", n);
    return 0;
}
