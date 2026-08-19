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

int main(void)
{
    test_clear_cannot_inherit_a_colour();
    test_clear_still_homes_the_cursor();

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }
    printf("%d TEST(S) FAILED\n", failures);
    return 1;
}
