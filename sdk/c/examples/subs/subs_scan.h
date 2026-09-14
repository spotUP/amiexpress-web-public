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

/** One printed line, NUL-terminated. 80 columns plus room to not think. */
#define SUBS_SCAN_LINE 100

/** Lines the composer can ever produce: the count, a blank, the rows, +N, the hint. */
#define SUBS_SCAN_LINES (SUBS_SCAN_ROWS + 4)

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
                      char out[][SUBS_SCAN_LINE], int cap);

#endif
