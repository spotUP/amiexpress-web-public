#include "subs_scan.h"

#include <stdio.h>
#include <string.h>

/** The 40-column tier, by the same threshold ui_is_compact_width uses. */
static int narrow_width(int cols)
{
    return cols > 0 && cols < 64;
}

/**
 * Write `ESC[38;2;r;g;bm` for one token, or nothing at all.
 *
 * Truecolour, like every other C door here: the nearest-of-sixteen was the
 * right hue and the wrong shade on a web terminal (sysop, 2026-09-07), and a
 * C64's transducer maps truecolour to the nearest VIC on the way out.
 *
 * A zero colour writes NOTHING - not black, which on this board's ground would
 * be invisible. That is what makes an unthemed caller's listing plain text
 * rather than a screen of escapes.
 */
static char *pen(char *at, unsigned long rgb)
{
    if (rgb == 0) return at;
    at += sprintf(at, "\033[38;2;%lu;%lu;%lum",
                  (rgb >> 16) & 0xFFUL, (rgb >> 8) & 0xFFUL, rgb & 0xFFUL);
    return at;
}

/** Whether this caller has a theme at all. */
static int themed(const subs_scan_palette *p)
{
    return p->accent != 0 || p->ink != 0 || p->dim != 0 || p->warn != 0;
}

/**
 * Close a coloured line, so the board's own screen continues in ITS colours.
 *
 * This prints into a screen the door does not own - the join is mid-flight
 * around it - so leaving a pen in force would recolour whatever the board
 * writes next.
 */
static char *unpen(char *at, const subs_scan_palette *p)
{
    if (!themed(p)) return at;
    at += sprintf(at, "\033[0m");
    return at;
}

/**
 * `Amiga Chat  740 messages, 6 new posts`
 *
 * "new posts", not "new for you": SUBS counts every post above the caller's
 * scan pointer, the board's join scan counts mail addressed to him, and the
 * two must not read as one number contradicting the other (the sysop,
 * 2026-10-04).
 *
 * The conference's name is the board's to say and a message base does not know
 * it, so an empty name falls back to something true rather than to "SUBS". The
 * NEW count is the number the caller came for, so it is the one in warn.
 */
static void count_line(const ae_msg_stat *stat, const char *conf_name,
                       int narrow, const subs_scan_palette *p, char *out)
{
    const char *who = (conf_name != 0 && conf_name[0] != '\0')
        ? conf_name : "This conference";
    char *at = out;

    at = pen(at, p->accent);
    at += sprintf(at, "%.*s", narrow ? 20 : 30, who);
    at = pen(at, p->dim);
    at += sprintf(at, "  ");
    at = pen(at, p->ink);
    at += sprintf(at, "%ld message%s, ", stat->total, stat->total == 1 ? "" : "s");
    at = pen(at, p->warn);
    at += sprintf(at, "%ld", stat->unread);
    at = pen(at, p->ink);
    at += sprintf(at, " new post%s", stat->unread == 1 ? "" : "s");
    at = unpen(at, p);
    *at = '\0';
}

/**
 * A rule under the count, in the theme's dim.
 *
 * `-` and not a box-drawing byte: the wire is Latin-1 and a caller on a real
 * Amiga has Topaz and nothing else, so the rule is drawn from what every
 * terminal on this board can show.
 */
static void rule_line(int cols, const subs_scan_palette *p, char *out)
{
    int width = (cols > 0 && cols < 78) ? cols - 2 : 76;
    char *at = out;
    int i;

    if (width < 4) width = 4;

    at = pen(at, p->dim);
    for (i = 0; i < width; i++) *at++ = '-';
    at = unpen(at, p);
    *at = '\0';
}

/**
 * One topic: its number, who wrote it, what it is about.
 *
 * No 'N' marker - everything in this listing is new by construction, and a
 * column of identical flags is noise. The number LEADS because it is what the
 * caller types at the board's own `R` prompt.
 */
static void topic_line(const ae_msg_row *row, int narrow,
                       const subs_scan_palette *p, char *out)
{
    char *at = out;

    at = pen(at, p->accent);
    at += sprintf(at, "  #%-5ld ", row->number);
    if (!narrow) {
        at = pen(at, p->ink);
        at += sprintf(at, "%-14.14s ", row->from);
    }
    at = pen(at, p->dim);
    at += sprintf(at, "%.*s", narrow ? 28 : 44, row->subject);
    at = unpen(at, p);
    *at = '\0';
}

int subs_scan_compose(const ae_msg_stat *stat,
                      const ae_msg_row *rows, int row_count,
                      const char *conf_name, int cols,
                      const subs_scan_palette *palette,
                      char out[][SUBS_SCAN_LINE], int cap)
{
    static const subs_scan_palette unthemed = { 0, 0, 0, 0 };
    const subs_scan_palette *p = palette != 0 ? palette : &unthemed;
    int narrow = narrow_width(cols);
    int used = 0;
    int shown = 0;
    int i;
    long more;
    char *at;

    if (stat == 0 || out == 0 || cap <= 0) return 0;

    count_line(stat, conf_name, narrow, p, out[used]);
    used++;

    /*
     * CAUGHT UP IS ONE LINE. The sysop joins conferences all evening; a
     * heading, a rule and "nothing new" three times over is worse than the
     * count he already has. Anything below this point is traffic he has not
     * seen.
     */
    if (stat->unread <= 0 || row_count <= 0 || rows == 0) return used;

    if (used < cap) { rule_line(cols, p, out[used]); used++; }

    for (i = 0; i < row_count && used < cap && shown < SUBS_SCAN_ROWS; i++) {
        if (rows[i].flag != 'N') continue;       /* already read - not this list */
        topic_line(&rows[i], narrow, p, out[used]);
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
        at = out[used];
        at = pen(at, p->dim);
        at += sprintf(at, "  +%ld more", more);
        at = unpen(at, p);
        *at = '\0';
        used++;
    }

    if (used < cap) {
        at = out[used];
        at = pen(at, p->accent);
        at += sprintf(at, "  %s", narrow ? "SUBS reads them" : "Type SUBS to read them");
        at = unpen(at, p);
        *at = '\0';
        used++;
    }

    return used;
}

void subs_status_compose(char *out, int cap, int wide,
                         long total, long unread, long unreadable)
{
    char line[160];

    if (out == 0 || cap <= 0) return;
    out[0] = '\0';
    if (total <= 0) return;

    /* Posts, not "for you" - see count_line. */
    if (wide) {
        if (unread > 0) {
            sprintf(line, "[INFO] %ld messages here, %ld new post%s.",
                    total, unread, unread == 1 ? "" : "s");
        } else {
            sprintf(line, "[INFO] %ld messages here, no new posts.", total);
        }
        /* Records the layout pass could not explain. Never silently
           swallowed: a door that quietly shows fewer messages than the board
           does is worse than one that admits it could not read some. */
        if (unreadable > 0) {
            sprintf(line + strlen(line), " %ld unreadable.", unreadable);
        }
    } else {
        sprintf(line, "[INFO] %ld msgs, %ld new", total, unread);
    }
    strncpy(out, line, (size_t)(cap - 1));
    out[cap - 1] = '\0';
}

long subs_scan_pointer_after(long highest_opened)
{
    return highest_opened >= 1 ? highest_opened + 1 : 0;
}

int subs_same_name(const char *a, const char *b)
{
    int i = 0;
    if (a == 0 || b == 0) return 0;
    for (;;) {
        char x = a[i];
        char y = b[i];
        if (x >= 'A' && x <= 'Z') x = (char)(x - 'A' + 'a');
        if (y >= 'A' && y <= 'Z') y = (char)(y - 'A' + 'a');
        if (x != y) return 0;
        if (x == '\0') return 1;
        i++;
    }
}
