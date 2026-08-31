/* test_ansi.c - unit tests for the ANSI output buffer.
 *
 * C89. Run natively:
 *   cc -std=c89 -Wall -Wextra -pedantic \
 *       examples/doorrepo-c/ansi.c examples/doorrepo-c/tests/test_ansi.c \
 *       -o /tmp/test_ansi && /tmp/test_ansi
 *
 * The clear-screen test exists because of a real report from the live BBS:
 * answering N at a prompt turned the whole screen blue. ESC[2J fills the
 * screen with the CURRENT background colour, and the prompt had painted a
 * white-on-blue bar and returned without restoring the colour - so the next
 * redraw's clear inherited blue and painted everything with it.
 */

#include <stdio.h>
#include <string.h>
#include "../ansi.h"

static int failures = 0;

static void check(const char *label, int cond)
{
    if (cond) {
        printf("PASS %s\n", label);
    } else {
        printf("FAIL %s\n", label);
        failures++;
    }
}

static void test_clear_cannot_inherit_a_colour(void)
{
    ansi_buf b;
    char frame[256];

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 1);
    ansi_clear(&b);
    frame[b.len] = '\0';

    /* The reset must come BEFORE the erase, or the erase paints in blue. */
    {
        const char *reset = strstr(frame, "\033[0m");
        const char *erase = strstr(frame, "\033[2J");
        check("clear emits a reset", reset != (const char *) 0);
        check("clear emits an erase", erase != (const char *) 0);
        check("the reset precedes the erase", reset != (const char *) 0
              && erase != (const char *) 0 && reset < erase);
    }
}

static void test_clear_still_homes_the_cursor(void)
{
    ansi_buf b;
    char frame[256];

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_clear(&b);
    frame[b.len] = '\0';
    check("clear homes the cursor", strstr(frame, "\033[H") != (const char *) 0);
}


/* A dialog drawn OVER the catalog has to hide it.
 *
 * Reported 2026-08-31 with a screenshot: the "Not installed" notice opened
 * on top of the browser and the archive list and the ANSI art behind it
 * showed straight through the box, so the two sentences in it were barely
 * readable. ansi_box() draws a FRAME - four edges and a label - and never
 * touched the middle, which is correct everywhere it is used on a screen
 * that was just cleared and wrong for every dialog.
 */
static void test_a_panel_paints_over_what_is_behind_it(void)
{
    ansi_buf b;
    char frame[4096];
    int rows;
    const char *p;

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_panel(&b, 5, 10, 4, 20, ANSI_CYAN, ANSI_BLACK, "Not installed");
    frame[b.len] = '\0';

    /* One run of blanks per row of the panel, the full width each time. */
    rows = 0;
    for (p = frame; (p = strstr(p, "                    ")) != (const char *) 0; p++) {
        rows++;
    }
    check("every row of the panel is painted", rows >= 4);
    check("the panel still has its frame", strstr(frame, "+-") != (const char *) 0);
    check("and still carries its title", strstr(frame, "Not installed") != (const char *) 0);
}

static void test_a_panel_sets_the_background_it_paints_with(void)
{
    ansi_buf b;
    char frame[4096];

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_panel(&b, 2, 2, 3, 10, ANSI_CYAN, ANSI_BLUE, (const char *) 0);
    frame[b.len] = '\0';

    /* Blue background - 44. Without a colour the blanks would be painted in
     * whatever the screen underneath had set, which is how a "cleared" box
     * can still come out the colour of the thing it covered. */
    check("the fill names its background", strstr(frame, ";44m") != (const char *) 0);
}

static void test_a_panel_too_small_to_have_an_inside_draws_nothing(void)
{
    ansi_buf b;
    char frame[512];

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_panel(&b, 1, 1, 1, 1, ANSI_CYAN, ANSI_BLACK, (const char *) 0);
    check("nothing is emitted for a degenerate panel", b.len == 0);
}


/* A colour the terminal is already showing costs bytes and buys nothing.
 *
 * Measured on a captured DoorRepo session (XIM_DEBUG, 2026-09-01): one
 * full /help paint is 2559 bytes and carries 25 colour sequences, of which
 * NINETEEN repeat the colour already in effect - 190 wasted bytes. That
 * matters here far more than it would on a wire: the door pays about 45ms
 * of 68K emulation per 198-byte XIM message, so bytes are milliseconds.
 */
static void test_a_repeated_colour_is_not_sent_twice(void)
{
    ansi_buf b;
    char frame[512];
    int first, second;

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    first = b.len;
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    second = b.len;

    check("the same colour again writes nothing", second == first);
}

static void test_a_different_colour_is_still_sent(void)
{
    ansi_buf b;
    char frame[512];
    int first, second;

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    first = b.len;
    ansi_color(&b, ANSI_YELLOW, ANSI_BLUE, 0);
    second = b.len;

    check("a change is written", second > first);
}

static void test_bold_counts_as_a_change(void)
{
    ansi_buf b;
    char frame[512];
    int first, second;

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    first = b.len;
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 1);
    second = b.len;

    check("bold on the same colours is a change", second > first);
}

static void test_a_reset_forgets_what_was_set(void)
{
    /* ansi_reset() and ansi_clear() put the terminal back to defaults, so
     * the next colour must be written even if it matches what was asked
     * for before the reset. Skipping it would leave the text in whatever
     * the reset left behind - the class of bug that turned a whole screen
     * blue once already (see the clear test above). */
    ansi_buf b;
    char frame[512];
    int before, after;

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    ansi_reset(&b);
    before = b.len;
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    after = b.len;

    check("a colour after a reset is written again", after > before);
}

static void test_each_frame_starts_without_assumptions(void)
{
    /* Frames are flushed to a BBS that may write its own output between
     * them. Carrying the tracked colour across a flush would mean skipping
     * a sequence the terminal no longer has set. */
    ansi_buf b;
    char frame[512];
    int before, after;

    ansi_begin(&b, frame, (long) sizeof(frame));
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);

    ansi_begin(&b, frame, (long) sizeof(frame));
    before = b.len;
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    after = b.len;

    check("a new frame writes its first colour", after > before);
}

int main(void)
{
    test_clear_cannot_inherit_a_colour();
    test_clear_still_homes_the_cursor();
    test_a_panel_paints_over_what_is_behind_it();
    test_a_panel_sets_the_background_it_paints_with();
    test_a_panel_too_small_to_have_an_inside_draws_nothing();
    test_a_repeated_colour_is_not_sent_twice();
    test_a_different_colour_is_still_sent();
    test_bold_counts_as_a_change();
    test_a_reset_forgets_what_was_set();
    test_each_frame_starts_without_assumptions();

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }
    printf("%d TEST(S) FAILED\n", failures);
    return 1;
}
