/*
 * What a conference join PRINTS, as a pure function.
 *
 * The join listing is the one part of this door a caller cannot avoid: it runs
 * inside `joinConf` while the board is mid-screen, before the menu prompt, for
 * everybody. So it is written where it can be tested on its own, the way
 * texttv_parse.c is - the door body does the I/O, this decides the text.
 *
 * The sysop's rule, 2026-09-14: "it should only list the topics here and exit
 * to the prompt". NEW messages only, newest last, capped, `+N more` when it
 * overflows, and one line for a caller who is caught up. A conference with 740
 * messages must never put 740 rows in front of somebody who only joined it.
 */
#ifndef SUBS_SCAN_H
#define SUBS_SCAN_H

#include "ae_msgbase.h"

/** Rows of traffic the listing will show. The rest become `+N more`. */
#define SUBS_SCAN_ROWS 15

/**
 * One printed line, NUL-terminated: eighty columns of text plus the colour it
 * is written in.
 *
 * A themed row carries four truecolour introducers and a reset - about ninety
 * bytes of SGR on top of the eighty it prints - and the whole line still has
 * to fit ONE XIM message (198 bytes on 68K, RULES.md), which is what this
 * number is really about.
 */
#define SUBS_SCAN_LINE 192

/** Lines the composer can ever produce: the count, a blank, the rows, +N, the hint. */
#define SUBS_SCAN_LINES (SUBS_SCAN_ROWS + 4)

/**
 * The caller's own colours, 0xRRGGBB, straight out of their theme.
 *
 * Written as truecolour (`38;2;r;g;b`), which is what every other C door on
 * this board writes since 2026-09-07 - the nearest-of-sixteen was the right
 * hue and the wrong shade on a web terminal, and the PETSCII transducer maps
 * truecolour to the nearest VIC for a C64 anyway.
 *
 * ALL ZERO means a caller whose theme could not be read, and then the listing
 * is written in plain text. That is not a fallback worth avoiding: this runs
 * mid-join on a screen the door does not own, and no colour at all is better
 * than colour the caller did not choose.
 */
typedef struct {
    unsigned long accent;   /**< the message number, and the way in */
    unsigned long ink;      /**< who wrote it */
    unsigned long dim;      /**< the subject, the rule, the "+N more" */
    unsigned long warn;     /**< how many are new - the number he came for */
} subs_scan_palette;

/**
 * Compose the join listing.
 *
 * `rows`/`row_count` is a window of the base's NEWEST readable messages, in
 * ascending order - what `ae_msg_list(-1, ...)` answers. Anything in it that
 * this caller has already read is dropped here rather than by the caller, so
 * the rule lives in one place: a row is new when its flag is 'N', which
 * ae_msgbase sets from the caller's own scan pointer.
 *
 * `cols` is the caller's terminal width; at 40 the rows lose the sender and
 * the subject is clipped rather than wrapped, because a wrapped row in the
 * middle of a join looks like a broken screen.
 *
 * Writes NUL-terminated lines into `out` and returns how many. Never more than
 * `cap`, never fewer than one when there is any traffic at all.
 */
int subs_scan_compose(const ae_msg_stat *stat,
                      const ae_msg_row *rows, int row_count,
                      const char *conf_name, int cols,
                      const subs_scan_palette *palette,
                      char out[][SUBS_SCAN_LINE], int cap);

#endif
