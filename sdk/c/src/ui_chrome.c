/*
 * ui_chrome - see ui_chrome.h.
 *
 * ui_footer_build is lifted from examples/doorrepo-c/flow.c:1887 with its
 * reasoning intact; the two bars are new but follow the same discipline -
 * fill the row, and drop the decoration rather than the information.
 */

#include "ui_chrome.h"
#include "ui_theme.h"

#include <string.h>

int ui_footer_build(char *out, unsigned long cap, int cols,
                    const char *prefix,
                    const char *const *optional, int optional_count,
                    const char *suffix)
{
    unsigned long pos;
    unsigned long prefix_len;
    unsigned long suffix_len;
    unsigned long used = 0;      /* columns written, for the cols budget */
    int i;

    if (out == (char *) 0 || cap == 0) return -1;
    if (prefix == (const char *) 0) prefix = "";
    if (suffix == (const char *) 0) suffix = "";
    if (optional == (const char *const *) 0) optional_count = 0;
    if (cols < 0) cols = 0;

    /* TWO measurements, and mixing them up eats text: `_len` is COLUMNS,
       for the width budget, and `_bytes` is what a memcpy moves. A coloured
       string has more bytes than columns (ui_ansi.h's markers), so copying
       `_len` of it cuts the tail off - which is how "Ent: Use" arrived on
       screen as "ENT:" with nothing after it. */
    prefix_len = ui_printable_len(prefix);
    suffix_len = ui_printable_len(suffix);
    pos = 0;

    if (prefix_len > 0) {
        unsigned long prefix_bytes = (unsigned long) strlen(prefix);
        if (prefix_bytes + 1 > cap) return -1;
        memcpy(out, prefix, prefix_bytes);
        pos = prefix_bytes;
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

        unsigned long part_bytes = (unsigned long) strlen(part);

        part_len = ui_printable_len(part);
        sep_len = (pos > 0) ? 2UL : 0UL;
        tail_len = (suffix_len > 0) ? 2UL + suffix_len : 0UL;
        /* The budget is columns, and `pos` counts bytes - so what has been
           written so far is measured the same way as what is being added. */
        candidate = used + sep_len + part_len + tail_len;

        if (candidate > (unsigned long) cols) break;
        if (pos + sep_len + part_bytes + 1 > cap) break;

        if (sep_len > 0) { memcpy(out + pos, "  ", 2); pos += 2; used += 2; }
        memcpy(out + pos, part, part_bytes);
        pos += part_bytes;
        used += part_len;
    }

    /* Appended unconditionally from here - never gated on `cols`. The only
     * way this returns without the full suffix is an undersized buffer,
     * never a narrow screen. */
    if (suffix_len > 0) {
        unsigned long sep_len = (pos > 0) ? 2UL : 0UL;
        unsigned long suffix_bytes = (unsigned long) strlen(suffix);

        if (pos + sep_len + suffix_bytes + 1 > cap) return -1;
        if (sep_len > 0) { memcpy(out + pos, "  ", 2); pos += 2; }
        memcpy(out + pos, suffix, suffix_bytes);
        pos += suffix_bytes;
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

/* The ring the window slides along. See ui_chrome.h: this is railStream()
   from the TypeScript, same generator, same run and gap ranges. */
void ui_rail_stream(const char *rail, int width, int offset,
                    unsigned long seed, char *out, unsigned long cap)
{
    static char ring[512];
    unsigned long state;
    unsigned long rail_len;
    unsigned long ring_len;
    unsigned long want;
    unsigned long start;
    unsigned long i;

    if (!out || cap == 0) return;
    out[0] = '\0';
    if (!rail || !*rail || width <= 0) return;
    if ((unsigned long) width > cap - 1) width = (int) (cap - 1);

    rail_len = (unsigned long) strlen(rail);
    state = seed ? (seed & 0xffffffffUL) : 1UL;

    /* Math.max(width * 2, 64), and never past the ring we have. */
    want = (unsigned long) width * 2;
    if (want < 64) want = 64;
    if (want > sizeof(ring) / 2) want = sizeof(ring) / 2;

    ring_len = 0;
    while (ring_len < want) {
        unsigned long marks;
        unsigned long gap;
        unsigned long r;

        /* next(): state = (state * 1664525 + 1013904223) >>> 0, / 2^32.
           Done in integers - a 68000 has no FPU and the ranges are small:
           2 + floor(x * 7) is 2 + (state >> 8) * 7 >> 24 in fixed point. */
        state = (state * 1664525UL + 1013904223UL) & 0xffffffffUL;
        marks = 2 + (unsigned long) (((state >> 16) * 7UL) >> 16);
        state = (state * 1664525UL + 1013904223UL) & 0xffffffffUL;
        gap = 1 + (unsigned long) (((state >> 16) * 3UL) >> 16);

        for (r = 0; r < marks && ring_len + rail_len < sizeof(ring); r++) {
            memcpy(ring + ring_len, rail, rail_len);
            ring_len += rail_len;
        }
        while (gap-- > 0 && ring_len < sizeof(ring)) ring[ring_len++] = ' ';
    }

    start = (unsigned long) ((offset % (int) ring_len + (int) ring_len)
                             % (int) ring_len);
    for (i = 0; i < (unsigned long) width; i++) {
        out[i] = ring[(start + i) % ring_len];
    }
    out[width] = '\0';
}

void ui_masthead_draw(ansi_buf *b, int row, int left, int cols,
                      const char *title, const char *rail, int fg, int bg)
{
    ui_masthead_draw_tick(b, row, left, cols, title, rail, fg, bg, 0);
}

void ui_masthead_draw_tick(ansi_buf *b, int row, int left, int cols,
                           const char *title, const char *rail,
                           int fg, int bg, int tick)
{
    char line[256];
    char run[256];
    unsigned long title_len;
    unsigned long run_width;
    int budget = cols;

    if (!b || cols <= 0) return;
    if (budget > (int) sizeof(line) - 1) budget = (int) sizeof(line) - 1;

    if (!title) title = "";
    title_len = ui_printable_len(title);
    if (title_len > (unsigned long) budget) title_len = (unsigned long) budget;

    /* THE RAIL FIRST, THE TITLE AT THE END OF IT.
     *
     * `${rail(run)} ${ink(title)}` - chrome.ts's line(), and the order
     * matters to a reader: the branding sweeps in and the name of the
     * screen is where the eye stops. The C drew it the other way round and
     * the two doors did not look like the same board (sysop, 2026-09-06).
     *
     * One column short of the width is the caller's job; the RUN is sized
     * here, title and its separating space taken off. */
    if (!rail || !*rail) {
        /* No rail: ` ${title} `, exactly - chrome.ts sets that content and
           returns, and the space in front of it is on the glass. */
        unsigned long at = 0;
        if ((unsigned long) budget > title_len + 1) line[at++] = ' ';
        memcpy(line + at, title, title_len);
        at += title_len;
        if ((unsigned long) budget > at) line[at++] = ' ';
        line[at] = '\0';
        ui_bar_draw(b, row, left, cols, line, fg, bg);
        return;
    }

    /* No room for a rail beside the title - which is a narrow screen, not a
       theme without one - so the title takes the row alone. Computed BEFORE
       the subtraction: these are unsigned, and budget - title_len - 1 on a
       40-column screen with a long title wraps to four billion and smashes
       the stack (it did, on the first run of the C suite after this). */
    if ((unsigned long) budget <= title_len + 1) {
        memcpy(line, title, title_len);
        line[title_len] = '\0';
        ui_bar_draw(b, row, left, cols, line, fg, bg);
        return;
    }

    run_width = (unsigned long) budget - title_len - 1;
    if (run_width > sizeof(run) - 1) run_width = sizeof(run) - 1;
    /* Room for the run, the space, the title AND the colour marker between
       them - four bytes that reach the wire but not the screen. Leaving
       them out of the clamp overran `line` and the rail vanished. */
    if (run_width > sizeof(line) - title_len - 6) {
        run_width = sizeof(line) - title_len - 6;
    }
    ui_rail_stream(rail, (int) run_width, tick, 1UL, run, sizeof(run));

    /* Two colours, not one: the rail is branding and the title is the name
       of the screen, and chrome.ts paints them with different stylers -
       `${rail(run)} ${ink(title)}`. `fg` is the rail's; the title takes the
       ink token, which the palette resolves to the theme's exact colour. */
    {
        unsigned long at = 0;
        char pen[4];

        memcpy(line + at, run, strlen(run));
        at += strlen(run);
        line[at++] = ' ';
        ui_ink(pen, UI_TOKEN(UI_T_INK));
        memcpy(line + at, pen, strlen(pen));
        at += strlen(pen);
        memcpy(line + at, title, title_len);
        at += title_len;
        line[at] = '\0';
    }

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
    left_len = ui_printable_len(left_text);
    right_len = ui_printable_len(right_text);

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
