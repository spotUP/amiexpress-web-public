/*
 * ansi.h - doorrepo's view of the SDK's ANSI layer.
 *
 * This file used to BE the layer: 117 lines of primitives, plus 292 of
 * implementation in ansi.c. Both now live in sdk/c (include/ui_ansi.h,
 * src/ui_ansi.c), lifted there unchanged, and this door draws with the
 * library rather than a copy of it. Two copies of a renderer is how the
 * board ends up with two answers to "what does a panel look like".
 *
 * The one thing that had to change in the move: ansi_flush() no longer calls
 * ae_put() itself, because a library cannot own the board connection. This
 * door's sink does that, and ansi_flush_to_bbs() below is the old spelling
 * so the 69 call sites in doorrepo.c did not all have to move at once.
 */

#ifndef DOORREPO_ANSI_H
#define DOORREPO_ANSI_H

#include "ui_ansi.h"

/* Writes the frame to the BBS and empties the buffer - what ansi_flush() did
 * before the layer moved into the SDK. */
void ansi_flush_to_bbs(ansi_buf *b);

#endif /* DOORREPO_ANSI_H */
