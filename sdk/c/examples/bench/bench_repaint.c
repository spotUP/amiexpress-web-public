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
    int node = argc > 1 ? atoi(argv[1]) : 1;
    int frames = argc > 2 ? atoi(argv[2]) : 1;
    int i;

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
