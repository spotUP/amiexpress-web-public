#include "subs_scan.h"

#include <stdio.h>
#include <string.h>

/** The 40-column tier, by the same threshold ui_is_compact_width uses. */
static int narrow_width(int cols)
{
    return cols > 0 && cols < 64;
}

/**
 * `Amiga Chat: 740 messages, 6 new for you.`
 *
 * The conference's name is the board's to say and a message base does not know
 * it, so an empty name falls back to something true rather than to "SUBS".
 */
static void count_line(const ae_msg_stat *stat, const char *conf_name,
                       int narrow, char *out)
{
    const char *who = (conf_name != 0 && conf_name[0] != '\0')
        ? conf_name : "This conference";

    if (narrow) {
        sprintf(out, "[INFO] %.20s: %ld msgs, %ld new.", who, stat->total, stat->unread);
    } else {
        sprintf(out, "[INFO] %.30s: %ld messages, %ld new for you.",
                who, stat->total, stat->unread);
    }
}

/**
 * One topic.
 *
 * No 'N' marker: everything in this listing is new by construction, and a
 * column of identical flags is noise. The number is what the caller types at
 * the board's own `R` prompt, so it leads.
 */
static void topic_line(const ae_msg_row *row, int narrow, char *out)
{
    if (narrow) {
        sprintf(out, "  #%-5ld %.28s", row->number, row->subject);
    } else {
        sprintf(out, "  #%-5ld %-14.14s %.44s", row->number, row->from, row->subject);
    }
}

int subs_scan_compose(const ae_msg_stat *stat,
                      const ae_msg_row *rows, int row_count,
                      const char *conf_name, int cols,
                      char out[][SUBS_SCAN_LINE], int cap)
{
    int narrow = narrow_width(cols);
    int used = 0;
    int shown = 0;
    int i;
    long more;

    if (stat == 0 || out == 0 || cap <= 0) return 0;

    count_line(stat, conf_name, narrow, out[used]);
    used++;

    /*
     * CAUGHT UP IS ONE LINE. The sysop joins conferences all evening; a
     * heading, a blank line and "nothing new" three times over is worse than
     * the count he already has. Anything below this point is traffic he has
     * not seen.
     */
    if (stat->unread <= 0 || row_count <= 0 || rows == 0) return used;

    if (used < cap) { out[used][0] = '\0'; used++; }

    for (i = 0; i < row_count && used < cap && shown < SUBS_SCAN_ROWS; i++) {
        if (rows[i].flag != 'N') continue;       /* already read - not this list */
        topic_line(&rows[i], narrow, out[used]);
        used++;
        shown++;
    }

    /*
     * `+N more`, from the STAT rather than from the window. The window is the
     * newest few; a caller who has been away a month has hundreds of unread
     * messages that were never in it, and telling him about the fifteen he can
     * see while pretending the rest do not exist is the kind of lie that makes
     * somebody stop trusting a board's counts.
     */
    more = stat->unread - (long)shown;
    if (more > 0 && used < cap) {
        sprintf(out[used], "  +%ld more.", more);
        used++;
    }

    if (used < cap) {
        strcpy(out[used], narrow ? "  SUBS reads them." : "  Type SUBS to read them.");
        used++;
    }

    return used;
}
