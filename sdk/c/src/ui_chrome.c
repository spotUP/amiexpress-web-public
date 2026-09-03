/*
 * ui_chrome - see ui_chrome.h.
 *
 * ui_footer_build is lifted from examples/doorrepo-c/flow.c:1887 with its
 * reasoning intact; the two bars are new but follow the same discipline -
 * fill the row, and drop the decoration rather than the information.
 */

#include "ui_chrome.h"

#include <string.h>

int ui_footer_build(char *out, unsigned long cap, int cols,
                    const char *prefix,
                    const char *const *optional, int optional_count,
                    const char *suffix)
{
    unsigned long pos;
    unsigned long prefix_len;
    unsigned long suffix_len;
    int i;

    if (out == (char *) 0 || cap == 0) return -1;
    if (prefix == (const char *) 0) prefix = "";
    if (suffix == (const char *) 0) suffix = "";
    if (optional == (const char *const *) 0) optional_count = 0;
    if (cols < 0) cols = 0;

    prefix_len = (unsigned long) strlen(prefix);
    suffix_len = (unsigned long) strlen(suffix);
    pos = 0;

    if (prefix_len > 0) {
        if (prefix_len + 1 > cap) return -1;
        memcpy(out, prefix, prefix_len);
        pos = prefix_len;
    }

    /* Optional parts, highest priority first. Each is tried against the
     * `cols` budget with room for its own leading separator AND the
     * separator+suffix that must still follow it - so a part is only ever
     * added when the suffix is still guaranteed to fit afterwards. The
     * first part that would not fit stops the loop outright: lower-priority
     * parts are not tried in its place, since the array's order IS the
     * priority. */
    for (i = 0; i < optional_count; i++) {
        const char *part = optional[i];
        unsigned long part_len;
        unsigned long sep_len;
        unsigned long tail_len;
        unsigned long candidate;

        if (part == (const char *) 0 || part[0] == '\0') continue;

        part_len = (unsigned long) strlen(part);
        sep_len = (pos > 0) ? 2UL : 0UL;
        tail_len = (suffix_len > 0) ? 2UL + suffix_len : 0UL;
        candidate = pos + sep_len + part_len + tail_len;

        if (candidate > (unsigned long) cols) break;
        if (pos + sep_len + part_len + 1 > cap) break;

        if (sep_len > 0) { memcpy(out + pos, "  ", 2); pos += 2; }
        memcpy(out + pos, part, part_len);
        pos += part_len;
    }

    /* Appended unconditionally from here - never gated on `cols`. The only
     * way this returns without the full suffix is an undersized buffer,
     * never a narrow screen. */
    if (suffix_len > 0) {
        unsigned long sep_len = (pos > 0) ? 2UL : 0UL;

        if (pos + sep_len + suffix_len + 1 > cap) return -1;
        if (sep_len > 0) { memcpy(out + pos, "  ", 2); pos += 2; }
        memcpy(out + pos, suffix, suffix_len);
        pos += suffix_len;
    }

    out[pos] = '\0';
    return (int) pos;
}

void ui_bar_draw(ansi_buf *b, int row, int left, int cols,
                 const char *text, int fg, int bg)
{
    if (!b || cols <= 0) return;

    /* Fill first, then write: a bar drawn as coloured text alone ends where
       the words end, which reads as a half-painted screen. */
    ansi_fill(b, row, left, cols, fg, bg);
    ansi_color(b, fg, bg, 0);
    if (text && *text) ansi_text(b, row, left, text, cols);
}

void ui_masthead_draw(ansi_buf *b, int row, int left, int cols,
                      const char *title, const char *rail, int fg, int bg)
{
    char line[256];
    unsigned long title_len;
    unsigned long rail_len;
    unsigned long pos;
    int budget = cols;

    if (!b || cols <= 0) return;
    if (budget > (int) sizeof(line) - 1) budget = (int) sizeof(line) - 1;

    if (!title) title = "";
    title_len = (unsigned long) strlen(title);
    if (title_len > (unsigned long) budget) title_len = (unsigned long) budget;

    memcpy(line, title, title_len);
    pos = title_len;

    /* The rail is branding: it fills whatever the title left, and when there
       is nothing left it simply is not drawn. The title is never cut for it. */
    if (rail && *rail) {
        rail_len = (unsigned long) strlen(rail);
        if (pos < (unsigned long) budget) {
            line[pos++] = ' ';
            while (pos < (unsigned long) budget) {
                unsigned long i;
                for (i = 0; i < rail_len && pos < (unsigned long) budget; i++) {
                    line[pos++] = rail[i];
                }
            }
        }
    }

    line[pos] = '\0';
    ui_bar_draw(b, row, left, cols, line, fg, bg);
}

void ui_status_draw(ansi_buf *b, int row, int left, int cols,
                    const char *left_text, const char *right_text,
                    int fg, int bg)
{
    unsigned long left_len;
    unsigned long right_len;

    if (!b || cols <= 0) return;

    if (!left_text) left_text = "";
    if (!right_text) right_text = "";
    left_len = (unsigned long) strlen(left_text);
    right_len = (unsigned long) strlen(right_text);

    ui_bar_draw(b, row, left, cols, left_text, fg, bg);

    /* One space between them at minimum. If they cannot both fit, the RIGHT
       side goes: two strings colliding mid-row is the shape a caller reads
       as corruption, and the left side is the one carrying identity. */
    if (right_len > 0 && left_len + 1 + right_len <= (unsigned long) cols) {
        ansi_color(b, fg, bg, 0);
        ansi_text_raw(b, row, left + cols - (int) right_len,
                      right_text, (int) right_len);
    }
}
