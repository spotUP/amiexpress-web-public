/*
 * The three bars.
 *
 * The footer's budget is the one with history: DoorRepo's old footer
 * concatenated everything and cut at `cols`, which silently dropped Q=Quit
 * on any row that had ads AND a doc. The rule lifted here says the suffix is
 * never the thing that goes, and these tests are that promise.
 */

#include "../include/ui_chrome.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static char out[256];
static char frame[8192];

static const char *const KEYS[] = {
    "S=Strip ads", "M=Access", "T=Config", "A=Archive", "V=Doc",
};

static void a_wide_screen_shows_every_key(void)
{
    int len = ui_footer_build(out, sizeof(out), 200, "ENTER=Open", KEYS, 5, "Q=Quit");

    assert(len > 0);
    assert(strstr(out, "ENTER=Open") != 0);
    assert(strstr(out, "S=Strip ads") != 0);
    assert(strstr(out, "V=Doc") != 0);
    assert(strstr(out, "Q=Quit") != 0);
    printf("  [OK] a wide screen shows every key\n");
}

static void a_narrow_screen_never_drops_the_way_out(void)
{
    int cols;

    /* Every width from useless to generous: Q=Quit survives all of them.
       This is the bug the rule exists for. */
    for (cols = 10; cols < 200; cols++) {
        int len = ui_footer_build(out, sizeof(out), cols, "ENTER=Open", KEYS, 5, "Q=Quit");
        assert(len > 0);
        assert(strstr(out, "Q=Quit") != 0);
    }
    printf("  [OK] a narrow screen never drops the way out\n");
}

static void it_drops_in_priority_order(void)
{
    /* Widths chosen from the rule's own arithmetic, not by eye:
       "P" + "  AAAAAAAAAA" + "  Q=Quit" is 21 columns, and adding "  B"
       needs 24. At 22 the first key fits and the second does not - and the
       second must NOT appear just because it is shorter. */
    const char *const keys[] = { "AAAAAAAAAA", "B" };
    int len = ui_footer_build(out, sizeof(out), 22, "P", keys, 2, "Q=Quit");

    assert(len > 0);
    assert(strstr(out, "AAAAAAAAAA") != 0);
    assert(strstr(out, "  B") == 0);
    assert(strstr(out, "Q=Quit") != 0);

    /* And at 24 both fit, which is what says the 22 case was the budget
       talking and not an off-by-one somewhere. */
    len = ui_footer_build(out, sizeof(out), 24, "P", keys, 2, "Q=Quit");
    assert(len > 0);
    assert(strstr(out, "  B") != 0);
    printf("  [OK] it drops in priority order, not by what happens to fit\n");
}

static void an_undersized_buffer_is_an_error_a_narrow_screen_is_not(void)
{
    char tiny[8];

    /* A narrow screen is normal and answers something. */
    assert(ui_footer_build(out, sizeof(out), 4, "", KEYS, 5, "Q") > 0);
    /* A buffer too small for the mandatory parts is a programming error. */
    assert(ui_footer_build(tiny, sizeof(tiny), 200, "ENTER=Open", KEYS, 5, "Q=Quit") == -1);
    printf("  [OK] an undersized buffer is an error; a narrow screen is not\n");
}

/** What was drawn, as a string. */
static const char *drew(void (*paint)(ansi_buf *b))
{
    static ansi_buf b;
    ansi_begin(&b, frame, (long)sizeof(frame));
    paint(&b);
    frame[b.len] = '\0';
    return frame;
}

static void paint_masthead(ansi_buf *b)
{
    ui_masthead_draw(b, 1, 1, 40, "CARD LOBBY", "/", ANSI_BLACK, ANSI_YELLOW);
}

static void paint_masthead_no_rail(ansi_buf *b)
{
    ui_masthead_draw(b, 1, 1, 40, "CARD LOBBY", "", ANSI_BLACK, ANSI_YELLOW);
}

static void paint_narrow_masthead(ansi_buf *b)
{
    /* Ten columns: the title alone is that wide, so the rail has nowhere. */
    ui_masthead_draw(b, 1, 1, 10, "CARD LOBBY", "/", ANSI_BLACK, ANSI_YELLOW);
}

static void the_masthead_carries_the_title_then_the_rail(void)
{
    const char *wide = drew(paint_masthead);
    assert(strstr(wide, "CARD LOBBY") != 0);
    assert(strstr(wide, "/") != 0);
    printf("  [OK] the masthead carries the title, then the rail\n");
}

static void the_rail_is_what_gets_cut(void)
{
    const char *narrow = drew(paint_narrow_masthead);
    const char *plain = drew(paint_masthead_no_rail);

    /* The title survives a row too narrow for anything else... */
    assert(strstr(narrow, "CARD LOBBY") != 0);
    /* ...and a theme with no rail draws a plain bar rather than nothing. */
    assert(strstr(plain, "CARD LOBBY") != 0);
    printf("  [OK] the rail is what gets cut, never the title\n");
}

static void paint_status(ansi_buf *b)
{
    ui_status_draw(b, 24, 1, 40, "sysop  1200 chips", "NODE 3", ANSI_BLACK, ANSI_YELLOW);
}

static void paint_crowded_status(ansi_buf *b)
{
    ui_status_draw(b, 24, 1, 20, "sysop has a very long line here", "NODE 3",
                   ANSI_BLACK, ANSI_YELLOW);
}

static void the_status_line_puts_the_right_side_right(void)
{
    const char *out_text = drew(paint_status);
    assert(strstr(out_text, "sysop") != 0);
    assert(strstr(out_text, "NODE 3") != 0);
    printf("  [OK] the status line puts the right side on the right\n");
}

static void a_crowded_status_drops_the_right_rather_than_colliding(void)
{
    const char *crowded = drew(paint_crowded_status);

    /* Two strings overlapping mid-row is what a caller reads as corruption;
       the left side carries identity, so the right one goes. */
    assert(strstr(crowded, "NODE 3") == 0);
    printf("  [OK] a crowded status drops the right side rather than colliding\n");
}

/**
 * The rail stream is the TypeScript's, byte for byte.
 *
 * Every string below came OUT of sdk/engines/ui/theme/chrome.ts's
 * railStream() - captured 2026-09-06, printed from the module itself, not
 * typed from reading it. A C door's masthead and a TypeScript door's are
 * the same branding or they are two brandings; the sysop asked for 1:1.
 *
 * If this fails after a change to chrome.ts, the two have parted: re-capture
 * and decide which one is right, rather than editing the expectation.
 */
static void the_rail_stream_matches_the_typescript(void)
{
    char out[128];

    ui_rail_stream("/", 24, 0, 1UL, out, sizeof(out));
    assert(strcmp(out, "///  /////   //  ///////") == 0);

    ui_rail_stream("/", 24, 1, 1UL, out, sizeof(out));
    assert(strcmp(out, "//  /////   //  /////// ") == 0);

    ui_rail_stream("/", 24, 7, 1UL, out, sizeof(out));
    assert(strcmp(out, "///   //  ///////  //  /") == 0);

    ui_rail_stream("///", 30, 0, 1UL, out, sizeof(out));
    assert(strcmp(out, "/////////  ///////////////   /") == 0);

    ui_rail_stream("//", 16, 3, 5UL, out, sizeof(out));
    assert(strcmp(out, "///   //////   /") == 0);

    ui_rail_stream("/", 40, 13, 3UL, out, sizeof(out));
    assert(strcmp(out, "   ////   //////  //   ///   /////   ///") == 0);

    printf("  [OK] the rail stream matches the TypeScript, byte for byte\n");
}

/** And it MOVES: consecutive offsets are different windows. */
static void the_rail_travels(void)
{
    char a[64], b[64];

    ui_rail_stream("///", 40, 0, 1UL, a, sizeof(a));
    ui_rail_stream("///", 40, 1, 1UL, b, sizeof(b));
    /* Tiling a run of identical marks would give the same string at every
       offset - which is exactly what the first C version did, and why the
       sysop saw slashes that never moved. */
    assert(strcmp(a, b) != 0);
    printf("  [OK] the rail travels rather than sitting still\n");
}

int main(void)
{
    printf("ui_chrome\n");
    the_rail_stream_matches_the_typescript();
    the_rail_travels();
    a_wide_screen_shows_every_key();
    a_narrow_screen_never_drops_the_way_out();
    it_drops_in_priority_order();
    an_undersized_buffer_is_an_error_a_narrow_screen_is_not();
    the_masthead_carries_the_title_then_the_rail();
    the_rail_is_what_gets_cut();
    the_status_line_puts_the_right_side_right();
    a_crowded_status_drops_the_right_rather_than_colliding();
    printf("ui_chrome: all passed\n");
    return 0;
}
