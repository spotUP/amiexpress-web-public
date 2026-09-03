/*
 * ae_box - a drawn frame.
 *
 * One module, one archive member: vlink pulls an archive member only when
 * something references a symbol in it, so a door that never calls ae_box()
 * links none of this. That is the whole layering rule, and phase 0 measures
 * it rather than asserting it.
 */

#include "ae_box.h"
#include "ae_out.h"

#include <string.h>

/* ASCII, not the Amiga's own box characters: this has to survive a caller
   whose terminal is a C64 and whose bytes go through the board's PETSCII
   transducer. */
static const char CORNER = '+';
static const char ACROSS = '-';
static const char DOWN   = '|';

static void draw_rule(int width, const char *title)
{
    char line[256];
    int at = 0;
    int i;

    if (width < 2) return;
    if (width > 254) width = 254;

    line[at++] = CORNER;
    for (i = 0; i < width - 2; i++) line[at++] = ACROSS;
    line[at++] = CORNER;
    line[at] = '\0';

    if (title && *title) {
        size_t len = strlen(title);
        /* Sit the title in the top rule, two characters in, if it fits. */
        if ((int)len + 6 <= width) {
            line[2] = ' ';
            memcpy(line + 3, title, len);
            line[3 + len] = ' ';
        }
    }

    ae_write_line(line);
}

void ae_box(int width, int height, const char *title)
{
    char line[256];
    int row;
    int i;

    if (width < 2 || height < 2) return;
    if (width > 254) width = 254;

    draw_rule(width, title);

    line[0] = DOWN;
    for (i = 1; i < width - 1; i++) line[i] = ' ';
    line[width - 1] = DOWN;
    line[width] = '\0';

    for (row = 0; row < height - 2; row++) ae_write_line(line);

    draw_rule(width, 0);
}
