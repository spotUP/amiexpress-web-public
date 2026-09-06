/*
 * The bordered list: scrolling, selection, and what it draws.
 *
 * This is the widget the plan says answers the sysop's question - "a door
 * can draw a bordered list with a scroll bar and a selection" - so the tests
 * are about the arithmetic every hand-rolled copy gets wrong, and about what
 * actually lands in the frame.
 */

#include "../include/ui_list.h"
#include "../include/ui_profile.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static char frame[16384];

static const char *numbered_row(void *context, int index)
{
    static char text[32];
    (void)context;
    /* C89: no snprintf. The list is ours and the numbers are small. */
    sprintf(text, "row %d", index);
    return text;
}

/** A list of `count` rows in a box `height` tall at the top-left. */
static ui_list a_list(int count, int height)
{
    ui_list list;
    ui_list_init(&list);
    list.top = 1;
    list.left = 1;
    list.height = height;
    list.width = 20;
    list.count = count;
    list.row = numbered_row;
    return list;
}

static void the_box_costs_two_rows(void)
{
    ui_list bordered = a_list(50, 10);
    ui_list bare = a_list(50, 10);

    bare.borders = 0;

    assert(ui_list_visible_rows(&bordered) == 8);
    /* At 40 columns there is no frame, and those two rows are text
       instead (ui_profile.h). */
    assert(ui_list_visible_rows(&bare) == 10);
    printf("  [OK] the box costs two rows, and a borderless list keeps them\n");
}

static void the_window_follows_the_selection(void)
{
    ui_list list = a_list(50, 10);      /* 8 visible */

    ui_list_select(&list, 0);
    assert(list.offset == 0);

    /* Down to the last visible row: still no scroll. */
    ui_list_select(&list, 7);
    assert(list.offset == 0);

    /* One more pulls the window by exactly one row. */
    ui_list_select(&list, 8);
    assert(list.offset == 1);
    assert(list.selected == 8);

    /* And back up the same way. */
    ui_list_select(&list, 1);
    assert(list.offset == 1);
    ui_list_select(&list, 0);
    assert(list.offset == 0);
    printf("  [OK] the window follows the selection, one row at a time\n");
}

static void it_clamps_rather_than_wrapping(void)
{
    ui_list list = a_list(50, 10);

    ui_list_move(&list, -5);
    assert(list.selected == 0);         /* not row 45 */

    ui_list_select(&list, 49);
    ui_list_move(&list, 5);
    assert(list.selected == 49);        /* not row 4 */

    /* A list that jumps end to end on one keypress is how somebody loses
       their place. */
    printf("  [OK] it clamps at both ends rather than wrapping\n");
}

static void the_window_never_shows_past_the_end(void)
{
    ui_list list = a_list(50, 10);      /* 8 visible, so offset tops out at 42 */

    ui_list_select(&list, 49);
    assert(list.offset == 42);
    assert(list.offset + ui_list_visible_rows(&list) == list.count);
    printf("  [OK] the window never shows past the last row\n");
}

static void a_short_list_does_not_scroll(void)
{
    ui_list list = a_list(3, 10);       /* three rows in a box that holds 8 */

    ui_list_select(&list, 2);
    assert(list.offset == 0);
    ui_list_move(&list, 5);
    assert(list.selected == 2);
    assert(list.offset == 0);
    printf("  [OK] a list shorter than its box does not scroll\n");
}

static void an_empty_list_is_not_a_crash(void)
{
    ui_list list = a_list(0, 10);
    ansi_buf b;

    ui_list_select(&list, 3);
    assert(list.selected == 0);
    assert(list.offset == 0);

    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(&list, &b);            /* draws a frame and no rows */
    assert(!b.overflow);
    printf("  [OK] an empty list draws its frame and nothing else\n");
}

/** Everything the list wrote, as one string. */
static const char *drawn(ui_list *list)
{
    static ansi_buf b;
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(list, &b);
    frame[b.len] = '\0';
    return frame;
}

/**
 * The same, onto a screen whose cells cannot carry a background - a C64.
 *
 * The widget asks for the same colours either way; ui_ansi decides how to
 * paint them (ui_ansi.h, cell_backgrounds).
 */
static const char *drawn_without_backgrounds(ui_list *list)
{
    static ansi_buf b;
    ansi_begin(&b, frame, (long)sizeof(frame));
    ansi_set_cell_backgrounds(&b, 0);
    ui_list_draw(list, &b);
    frame[b.len] = '\0';
    return frame;
}

static void it_draws_the_rows_that_are_visible(void)
{
    ui_list list = a_list(50, 10);
    const char *out;

    ui_list_select(&list, 20);
    out = drawn(&list);

    /* Rows 13..20 are the window when 20 is the last visible row. */
    assert(strstr(out, "row 20") != 0);
    assert(strstr(out, "row 13") != 0);
    /* And nothing outside it. */
    assert(strstr(out, "row 12") == 0);
    assert(strstr(out, "row 21") == 0);
    printf("  [OK] it draws the visible rows and no others\n");
}

static void the_scroll_bar_appears_only_when_it_can_move(void)
{
    ui_list scrolling = a_list(50, 10);
    ui_list fitting = a_list(3, 10);

    /* '#' is the thumb, '|' the track - but '|' is also the box's own side,
       so the thumb is what tells them apart. */
    assert(strchr(drawn(&scrolling), '#') != 0);
    assert(strchr(drawn(&fitting), '#') == 0);

    /* A list that fits keeps the column the bar would have taken: its rows
       are one character wider. */
    printf("  [OK] the scroll bar appears only when there is something to scroll\n");
}

static void the_thumb_moves_with_the_window(void)
{
    ui_list list = a_list(100, 10);
    char top[16384];
    const char *out;
    long i, top_row = 0, bottom_row = 0;

    ui_list_select(&list, 0);
    out = drawn(&list);
    strcpy(top, out);
    for (i = 0; top[i]; i++) if (top[i] == '#') { top_row = i; break; }

    ui_list_select(&list, 99);
    out = drawn(&list);
    for (i = 0; out[i]; i++) if (out[i] == '#') { bottom_row = i; break; }

    /* At the end of a hundred rows the thumb is further into the frame than
       it was at the start - the bar reports where you are. */
    assert(bottom_row > top_row);
    printf("  [OK] the thumb moves with the window\n");
}

static void the_selected_row_is_a_filled_bar(void)
{
    ui_list list = a_list(50, 10);
    const char *out;

    list.selected_bg = ANSI_BLUE;
    ui_list_select(&list, 0);
    out = drawn(&list);

    /* CSI 44 is a blue background: the selection is filled across the row,
       not just coloured text, so the eye can find it. */
    assert(strstr(out, ";44m") != 0 || strstr(out, "44m") != 0);
    printf("  [OK] the selected row is a filled bar\n");
}

/**
 * The C64's highlight, on the tier that is a C64.
 *
 * The sysop, 2026-09-06, on THEMEC over PETSCII: "i see no selected line".
 * The bar was there in the bytes and painted as a BACKGROUND, and per-cell
 * background has no C64 equivalent - sdk/petscii/ansi-to-petscii.ts drops
 * it. So the marked row arrived in exactly the colours of its neighbours.
 *
 * Where a cell cannot carry its own background the row is marked with
 * reverse video, which the same transducer turns into $12/$92.
 */
static void a_screen_without_backgrounds_marks_the_row_in_reverse(void)
{
    ui_list list = a_list(50, 10);
    const char *out;

    list.selected_bg = ANSI_BLUE;
    ui_list_select(&list, 0);
    out = drawn_without_backgrounds(&list);

    /* SGR 7 on, and it is turned off again before the door draws anything
       else - a frame that leaves reverse latched paints the rest of the
       screen inside out. */
    assert(strstr(out, "\033[7m") != 0);
    assert(strstr(out, "\033[27m") != 0);
    /* And NO background is asked for, because asking is what gets dropped. */
    assert(strstr(out, ";44m") == 0);
    printf("  [OK] a screen with no cell backgrounds marks the row in reverse\n");
}

/**
 * The bar is painted in the BAR's colour, not the ink's.
 *
 * Reverse video swaps pen and ground, so the pen IS the bar. Five of the
 * seven themes carry a black selection ink - the colour meant to sit ON a
 * bright bar - and painting the bar in it put black on a black screen: the
 * sysop saw no highlight at all on 2026-09-06, except under phosphor-muted,
 * the one theme whose selection ink is not black.
 */
static void the_reversed_bar_takes_the_selection_background(void)
{
    ui_list list = a_list(50, 10);
    const char *out;

    list.selected_bg = ANSI_MAGENTA;   /* the bar */
    list.selected_fg = ANSI_BLACK;     /* the ink that sits on it */
    ui_list_select(&list, 0);
    out = drawn_without_backgrounds(&list);

    /* 30 + 5: magenta as a FOREGROUND, which reverse turns into the bar. */
    assert(strstr(out, "35m") != 0);
    /* And never the ink as the pen, which is the black-on-black case. */
    assert(strstr(out, ";30m") == 0);
    printf("  [OK] the reversed bar takes the selection background\n");
}

/**
 * phosphor-muted is the exception and it has to keep working: its selection
 * BACKGROUND is black and its ink is green, so there the ink is the half
 * that can be seen.
 */
static void a_black_selection_background_falls_back_to_the_ink(void)
{
    ui_list list = a_list(50, 10);
    const char *out;

    list.selected_bg = ANSI_BLACK;
    list.selected_fg = ANSI_GREEN;
    ui_list_select(&list, 0);
    out = drawn_without_backgrounds(&list);

    assert(strstr(out, "32m") != 0);   /* green pen */
    printf("  [OK] a black selection background falls back to the ink\n");
}

/**
 * The 80-column tier is untouched: it keeps the filled bar it always had,
 * and never emits reverse video.
 */
static void a_screen_with_backgrounds_keeps_the_filled_bar(void)
{
    ui_list list = a_list(50, 10);
    const char *out;

    list.selected_bg = ANSI_BLUE;
    ui_list_select(&list, 0);
    out = drawn(&list);

    assert(strstr(out, "44m") != 0);
    assert(strstr(out, "\033[7m") == 0);
    printf("  [OK] a screen with cell backgrounds keeps the filled bar\n");
}

/** The profile is where the rule lives, and 40 columns is a C64. */
static void the_profile_says_which_screens_have_backgrounds(void)
{
    assert(ui_profile_for(40).cell_backgrounds == 0);
    assert(ui_profile_for(80).cell_backgrounds == 1);
    printf("  [OK] the profile says which screens have cell backgrounds\n");
}

int main(void)
{
    printf("ui_list\n");
    the_box_costs_two_rows();
    the_window_follows_the_selection();
    it_clamps_rather_than_wrapping();
    the_window_never_shows_past_the_end();
    a_short_list_does_not_scroll();
    an_empty_list_is_not_a_crash();
    it_draws_the_rows_that_are_visible();
    the_scroll_bar_appears_only_when_it_can_move();
    the_thumb_moves_with_the_window();
    the_selected_row_is_a_filled_bar();
    a_screen_without_backgrounds_marks_the_row_in_reverse();
    the_reversed_bar_takes_the_selection_background();
    a_black_selection_background_falls_back_to_the_ink();
    a_screen_with_backgrounds_keeps_the_filled_bar();
    the_profile_says_which_screens_have_backgrounds();
    printf("ui_list: all passed\n");
    return 0;
}
