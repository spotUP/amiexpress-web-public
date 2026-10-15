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
    const char *title = strstr(wide, "CARD LOBBY");
    const char *slash = strstr(wide, "/");

    assert(title != 0);
    assert(slash != 0);
    /* THE RAIL FIRST. `${rail(run)} ${ink(title)}` is chrome.ts's line(),
       and the C drew it the other way round until 2026-09-06 - which is
       one of the reasons the two theme pickers did not look like the same
       board. The order is the assertion now, not just the presence. */
    assert(slash < title);
    printf("  [OK] the masthead carries the rail, then the title\n");
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


static void a_themeless_masthead_has_nothing_to_animate(void)
{
    /* The sysop, 2026-09-15, in THEMEC and REQUESTS: "theme and uests are
       blinking" - the tail of each masthead title. The doors' idle hooks were
       repainting the row about five times a second, and with no rail every
       one of those frames is the previous frame, so the only thing the caller
       sees is the text being cleared and redrawn under him.

       Two assertions, and the second is the one that makes skipping safe:
       without a rail, two different ticks ARE the same bytes. */
    char frame_a[1024];
    char frame_b[1024];
    ansi_buf a;
    ansi_buf b;

    assert(ui_masthead_rail_animates("") == 0);
    assert(ui_masthead_rail_animates(0) == 0);
    assert(ui_masthead_rail_animates("///") != 0);

    ansi_begin(&a, frame_a, (long)sizeof frame_a);
    ansi_begin(&b, frame_b, (long)sizeof frame_b);
    ui_masthead_draw_tick(&a, 1, 1, 80, "GLOBAL REQUESTS", "", 7, 0, 3);
    ui_masthead_draw_tick(&b, 1, 1, 80, "GLOBAL REQUESTS", "", 7, 0, 97);
    assert(strcmp(frame_a, frame_b) == 0);
    printf("  [OK] without a rail every tick is the same row, so the idle hook may skip it\n");
}

static void a_rail_still_moves(void)
{
    /* And the other half: a theme WITH a rail must still animate, or the fix
       for the flicker would have stopped the branding everywhere. */
    char frame_a[1024];
    char frame_b[1024];
    ansi_buf a;
    ansi_buf b;

    ansi_begin(&a, frame_a, (long)sizeof frame_a);
    ansi_begin(&b, frame_b, (long)sizeof frame_b);
    ui_masthead_draw_tick(&a, 1, 1, 80, "DOOR THEME", "///", 7, 0, 3);
    ui_masthead_draw_tick(&b, 1, 1, 80, "DOOR THEME", "///", 7, 0, 4);
    assert(strcmp(frame_a, frame_b) != 0);
    printf("  [OK] a rail theme still moves between ticks\n");
}


static void an_animation_frame_leaves_the_title_alone(void)
{
    /* "themec still blinks" - the sysop, 2026-09-15, with the rail theme on.
       The tick redrew the whole row, so the title at the end of it was
       repainted about five times a second and the caller saw it flicker.

       An animation frame must carry the rail and NOT the title. */
    char frame[1024];
    ansi_buf b;

    /* Zeroed: ansi_begin does not clear the caller's buffer, so whatever the
       previous case left on the stack would be read past the frame's own
       bytes - and the previous case here draws the very title this one is
       asserting is absent. */
    memset(frame, 0, sizeof frame);
    ansi_begin(&b, frame, (long)sizeof frame);
    ui_masthead_rail_tick(&b, 1, 1, 80, "DOOR THEME", "///", 7, 0, 3);

    assert(strstr(frame, "DOOR THEME") == 0);
    assert(strstr(frame, "/") != 0);
    printf("  [OK] an animation frame carries the rail and not the title\n");
}

static void the_animation_still_moves(void)
{
    char frame_a[1024];
    char frame_b[1024];
    ansi_buf a;
    ansi_buf b;

    memset(frame_a, 0, sizeof frame_a);
    memset(frame_b, 0, sizeof frame_b);
    ansi_begin(&a, frame_a, (long)sizeof frame_a);
    ansi_begin(&b, frame_b, (long)sizeof frame_b);
    ui_masthead_rail_tick(&a, 1, 1, 80, "DOOR THEME", "///", 7, 0, 3);
    ui_masthead_rail_tick(&b, 1, 1, 80, "DOOR THEME", "///", 7, 0, 4);

    assert(frame_a[0] != '\0');
    assert(strcmp(frame_a, frame_b) != 0);
    printf("  [OK] and it still moves between ticks\n");
}

static void plain(const char *in, char *out, unsigned long cap)
{
    /* The printable cells of a frame: what the caller would see. */
    unsigned long at = 0;

    while (*in != '\0' && at + 1 < cap) {
        if (*in == '\033') {
            while (*in != '\0' && !((*in >= 'A' && *in <= 'Z') || (*in >= 'a' && *in <= 'z'))) in++;
            if (*in != '\0') in++;
            continue;
        }
        out[at++] = *in++;
    }
    out[at] = '\0';
}

static void the_frame_stops_where_the_title_starts(void)
{
    /* The two paths have to agree about the run's width, or the animation
       creeps onto the title a column at a time. Measured on what reaches the
       glass: the tick's whole output is the run, and the full row is that
       same run followed by the space before the title. */
    char tick_frame[1024];
    char full_frame[1024];
    char tick_text[1024];
    char full_text[1024];
    ansi_buf t;
    ansi_buf f;
    unsigned long run_len;

    memset(tick_frame, 0, sizeof tick_frame);
    memset(full_frame, 0, sizeof full_frame);
    ansi_begin(&t, tick_frame, (long)sizeof tick_frame);
    ansi_begin(&f, full_frame, (long)sizeof full_frame);
    ui_masthead_rail_tick(&t, 1, 1, 80, "DOOR THEME", "///", 7, 0, 5);
    ui_masthead_draw_tick(&f, 1, 1, 80, "DOOR THEME", "///", 7, 0, 5);

    plain(tick_frame, tick_text, sizeof tick_text);
    plain(full_frame, full_text, sizeof full_text);

    run_len = (unsigned long)strlen(tick_text);
    assert(run_len > 0);

    /* The full row is its fill, then the same run, then a space and the
       title. The tick is the run alone - which is the whole point: 69 cells
       instead of 160, and none of them the title's. */
    {
        const char *run_in_full = strstr(full_text, tick_text);
        assert(run_in_full != 0);
        assert(strncmp(run_in_full + run_len, " DOOR THEME", 11) == 0);
        assert(strlen(full_text) > run_len);
    }
    printf("  [OK] the frame is exactly the run, and stops where the title starts\n");
}

/**
 * An animation frame puts the caller's cursor back.
 *
 * The rail repaints five times a second, and `ansi_text` leaves the terminal
 * cursor at the end of what it wrote - the top right of the screen. A caller
 * typing into a prompt therefore watched their cursor sit up in the banner
 * while their text went into the field. Reported with a screenshot of POST A
 * REQUEST (sysop, 2026-09-15: "the cursor is in the upper right corner of the
 * screen when i type in the input").
 *
 * Pinned because the obvious future optimisation - this frame must fit one
 * XIM message, ~198 bytes on 68K - is to start deleting bytes from it, and
 * these four are the ones that look most like decoration.
 */
static void an_animation_frame_leaves_the_cursor_where_it_found_it(void)
{
    ansi_buf b;

    memset(frame, 0, sizeof frame);
    ansi_begin(&b, frame, (long)sizeof frame);
    ui_masthead_rail_tick(&b, 1, 1, 80, "DOOR THEME", "///", 7, 0, 3);
    frame[b.len] = '\0';

    /* DECSC before the paint, DECRC after: whatever the cursor was doing, it
       is doing it again by the time the caller's next keystroke arrives. */
    assert(strstr(frame, "\0337") != 0);
    assert(strstr(frame, "\0338") != 0);
    assert(strstr(frame, "\0337") < strstr(frame, "\0338"));
    printf("  [OK] an animation frame leaves the cursor where it found it\n");
}

/**
 * EVERY animation frame paints the rail in the rail's colour.
 *
 * The first tick did; the second and every later one wrote the run in the
 * CALLER's colour (sysop, live: magenta slashes after a key press repaints
 * the masthead, grey on each idle tick). The frame brackets itself in
 * DECSC/DECRC, and DECRC puts the terminal's colour back to what it was at
 * the save - but the buffer's colour cache kept "the rail's colour", so the
 * next frame's ansi_color() was judged redundant and skipped.
 */
static int segment_sets_colour(const char *seg_start, const char *seg_end, const char *sgr_part)
{
    const char *at;
    for (at = seg_start; at < seg_end; at++) {
        if (at[0] == '\033' && at[1] == '[') {
            const char *q = at + 2;
            while (q < seg_end && *q != 'm' && *q != 'H') q++;
            if (q < seg_end && *q == 'm') {
                char tmp[32];
                unsigned long n = (unsigned long)(q - (at + 2));
                if (n < sizeof tmp) {
                    memcpy(tmp, at + 2, n);
                    tmp[n] = '\0';
                    if (strstr(tmp, sgr_part) != 0) return 1;
                }
            }
        }
    }
    return 0;
}

static void every_animation_frame_paints_the_rail_in_the_rail_colour(void)
{
    ansi_buf b;
    int tick;
    unsigned long after_first = 0;

    memset(frame, 0, sizeof frame);
    ansi_begin(&b, frame, (long)sizeof frame);
    /* Rail ink 5 (magenta), the caller's own pen 7 (grey). */
    ui_masthead_draw_tick(&b, 1, 1, 80, "DOOR THEME", "///", 5, 0, 0);
    ansi_color(&b, 7, 0, 0);
    after_first = (unsigned long)b.len;
    for (tick = 1; tick <= 3; tick++) {
        unsigned long from = (unsigned long)b.len;
        const char *save;
        const char *restore;
        ui_masthead_rail_tick(&b, 1, 1, 80, "DOOR THEME", "///", 5, 0, tick);
        frame[b.len] = '\0';
        save = frame + from;
        restore = frame + b.len;
        assert(segment_sets_colour(save, restore, "35"));
    }
    (void)after_first;

    /* And the caller's colour is still known to be 7: DECRC put it back, so
       asking for it again must cost nothing. */
    {
        long before = b.len;
        ansi_color(&b, 7, 0, 0);
        assert(b.len == before);
    }
    printf("  [OK] every animation frame paints the rail in the rail's colour\n");
}

int main(void)
{
    printf("ui_chrome\n");
    an_animation_frame_leaves_the_cursor_where_it_found_it();
    every_animation_frame_paints_the_rail_in_the_rail_colour();
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
    a_themeless_masthead_has_nothing_to_animate();
    a_rail_still_moves();
    an_animation_frame_leaves_the_title_alone();
    the_animation_still_moves();
    the_frame_stops_where_the_title_starts();
    printf("ui_chrome: all passed\n");
    return 0;
}
