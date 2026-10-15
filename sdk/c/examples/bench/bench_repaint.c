/*
 * What a repaint COSTS, measured instead of quoted.
 *
 * The plan's Risk 1 turns on one number nobody had taken: handoff.md says
 * "~45ms per 198-byte XIM message" and a full 80x24 coloured frame is 20-30
 * messages, which would make a frame over a second and force every widget in
 * phase 2 to carry a dirty-region interface from its first line.
 *
 * This door paints N full-screen coloured frames and exits. It is measured by
 * SLOPE, not by a single run: the harness times one frame and eleven, and the
 * difference divided by ten is what a frame costs with the emulator's start-up
 * and the door's own registration removed. A single timing would be mostly
 * start-up.
 *
 * The frame is deliberately the WORST case the plan describes: every row
 * painted, every row changing colour, nothing skipped.
 */

#include <stdlib.h>

#include "aedoor.h"
#include "ui_ansi.h"

/* One 80x24 frame of ANSI is comfortably under 8 KB; the buffer is sized so a
 * frame is built ONCE and sent as one stream, which is what a door does. */
static char storage[16384];

#define COLS 80
#define ROWS 24

/* How many frames this binary paints.
 *
 * COMPILE-TIME, because the harness's argument path does not reach the door:
 * AmigaDOS hands a door one command-line string and what arrives is the node
 * alone, so a frame count passed on the command line is silently ignored -
 * two runs that were supposed to differ produced identical output, which is
 * a measurement that measures nothing. Two binaries, one number each, is
 * beyond argument. */
#ifndef BENCH_FRAMES
#define BENCH_FRAMES 1
#endif

static void paint_one_frame(ansi_buf *b, int tint)
{
    int row;

    ansi_clear(b);
    for (row = 1; row <= ROWS; row++) {
        /* A different colour per row, and a different one each frame, so
         * nothing anywhere can elide a repaint as "no change". */
        int fg = ((row + tint) % 7) + 1;
        ansi_fill(b, row, 1, COLS, fg, ANSI_BLACK);
        ansi_color(b, fg, ANSI_BLACK, 0);
        ansi_text(b, row, 1,
                  "................................................"
                  "................................", COLS);
    }
}

int main(int argc, char **argv)
{
    int node = 1;
    int frames = BENCH_FRAMES;
    int i;

    /* AmigaDOS hands a door ONE command-line string, so a harness that means
     * to pass "1 11" may arrive as argv[1] = "1 11" with argc == 2 rather
     * than as two arguments. Read both shapes: the second argument if there
     * is one, otherwise the second number inside the first. */
    if (argc > 1) node = atoi(argv[1]);

    if (frames < 1) frames = 1;

    if (ae_start(node) != 0) return 20;

    for (i = 0; i < frames; i++) {
        ansi_buf b;
        ansi_begin(&b, storage, (long) sizeof(storage));
        paint_one_frame(&b, i);
        /* ae_put chunks at 198 characters, which is the message boundary the
         * measurement is about. */
        ae_put(storage, 0);
    }

    ae_shutdown();
    return 0;
}
