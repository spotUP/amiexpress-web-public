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
#include "../include/ui_theme.h"

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
    /* Distinct plain colours so a test can tell track from thumb by SGR. */
    list.scroll_track = ANSI_RED;       /* 41 */
    list.scroll_thumb = ANSI_GREEN;     /* 42 */
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

    /* The thumb is a space on the thumb colour (42 here): no glyph. */
    assert(strstr(drawn(&scrolling), "42m") != 0);
    assert(strstr(drawn(&fitting), "42m") == 0);
    assert(strstr(drawn(&fitting), "41m") == 0);

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
    for (i = 0; top[i]; i++) if (top[i] == '4' && top[i+1] == '2' && top[i+2] == 'm') { top_row = i; break; }

    ui_list_select(&list, 99);
    out = drawn(&list);
    for (i = 0; out[i]; i++) if (out[i] == '4' && out[i+1] == '2' && out[i+2] == 'm') { bottom_row = i; break; }

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

/**
 * A cursor move repaints two rows, not the box.
 *
 * Every byte is an XIM message on a 68K door, and the full draw of this
 * fifty-row list is what THEMEC sent on every keypress - "its slow"
 * (sysop, 2026-09-07). The changed-rows path must be a small fraction of
 * it, and it must address exactly the row that was left and the row that
 * was reached.
 */
/*
 * The row the cursor LEAVES loses its caret.
 *
 * `draw_row` starts a row's text after the caret column so the list does not
 * shuffle sideways as the cursor moves - and nothing ever wrote over the
 * caret of the row being left, so a caller who pressed Down four times was
 * looking at five ">>" marks down the theme picker (sysop, 2026-09-07).
 *
 * Asserted on the BYTES of the changed-rows repaint, which is what reaches
 * the caller: the row left behind must carry blanks where its caret was, and
 * the row reached must carry the caret.
 */
static void the_row_left_behind_loses_its_caret(void)
{
    ui_list list = a_list(50, 10);
    static ansi_buf b;
    const char *left_row;
    const char *reached_row;

    list.caret = ">>";
    ui_list_select(&list, 0);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(&list, &b);

    ui_list_move(&list, 1);                    /* row 0 -> row 1 */
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw_changed(&list, &b, 0);
    frame[b.len] = '\0';

    /* Row 0 is screen row 2 under a border, row 1 is screen row 3. Each
       repaint addresses its row first, so the text that follows the address
       belongs to that row. */
    left_row = strstr(frame, "\033[2;");
    reached_row = strstr(frame, "\033[3;");
    assert(left_row != 0);
    assert(reached_row != 0);

    /* The caret is on the row that has it now... */
    assert(strstr(reached_row, ">>") != 0);

    /* ...and the row it left is REPAINTED FROM THE CARET COLUMN.
       
       Absence of ">>" in these bytes proves nothing - the bug was that the
       old caret was never written over, so it does not appear in the stream
       either way (a first version of this test passed on the broken code for
       exactly that reason). What separates them is WHERE the row starts: the
       fix addresses the caret column and writes blanks into it, the bug
       addresses the column after it and leaves the mark standing. */
    {
        static char before[512];
        long n = (long)(reached_row - left_row);
        if (n > (long)sizeof(before) - 1) n = (long)sizeof(before) - 1;
        memcpy(before, left_row, (size_t)n);
        before[n] = '\0';
        /* Screen row 2, column 2: the first inner cell, which is where the
           caret of a selected row goes. */
        assert(strstr(before, "\033[2;2H") != 0);
        assert(strstr(before, ">>") == 0);
    }
    printf("  [OK] the row left behind loses its caret\n");
}

static void a_cursor_move_repaints_two_rows(void)
{
    ui_list list = a_list(50, 10);
    static ansi_buf b;
    long full_len, delta_len;

    ui_list_select(&list, 0);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(&list, &b);
    full_len = b.len;

    ui_list_move(&list, 1);           /* row 0 -> row 1, same window */
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw_changed(&list, &b, 0);
    delta_len = b.len;
    frame[b.len] = '\0';

    assert(delta_len > 0);
    assert(delta_len * 4 < full_len);           /* well under a quarter */
    /* Row 0 (screen row top+1 under a border) and row 1, and nothing else
       is addressed. */
    assert(strstr(frame, "\033[2;") != 0);
    assert(strstr(frame, "\033[3;") != 0);
    assert(strstr(frame, "\033[4;") == 0);

    /* Nothing moved: nothing is written. */
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw_changed(&list, &b, 0);
    assert(b.len == 0);

    /* A scroll is a full draw again. */
    ui_list_select(&list, 40);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw_changed(&list, &b, 0);
    assert(b.len * 4 > full_len);
    printf("  [OK] a cursor move repaints two rows, not the box\n");
}

static void one_changed_row_repaints_only_that_row(void)
{
    ui_list list = a_list(50, 10);
    static ansi_buf b;
    ui_list_select(&list, 0);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(&list, &b);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw_row(&list, &b, 3);      /* screen row top+1+3 = 5 under a border */
    frame[b.len] = '\0';
    assert(strstr(frame, "\033[5;") != 0);
    assert(strstr(frame, "\033[2;") == 0);
    assert(strstr(frame, "\033[4;") == 0);
    assert(strstr(frame, "\033[6;") == 0);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw_row(&list, &b, 40);     /* not visible: nothing */
    assert(b.len == 0);
    printf("  [OK] one changed row repaints that row and nothing else\n");
}

static void page_follow_scrolls_a_page_not_a_row(void)
{
    ui_list list = a_list(50, 10);              /* 8 rows visible inside the border */
    int i, scrolls = 0, last = 0;
    list.page_follow = 1;
    ui_list_select(&list, 0);
    for (i = 1; i < 30; i++) {
        ui_list_move(&list, 1);
        if (list.offset != last) { scrolls++; last = list.offset; }
        assert(list.selected >= list.offset && list.selected < list.offset + 8);
    }
    assert(scrolls == 3);                       /* 29 steps: a page each 8 rows, not a scroll per row */
    for (i = 0; i < 29; i++) ui_list_move(&list, -1);
    assert(list.selected == 0 && list.offset == 0);
    printf("  [OK] page follow: crossing the edge scrolls a page, then the cursor moves free\n");
}

static void follow_extra_keeps_rows_below_the_selection_visible(void)
{
    ui_list list = a_list(50, 10);
    int i;
    list.follow_extra = 1;
    for (i = 0; i < 50; i++) {
        ui_list_select(&list, i);
        assert(i + 1 < list.offset + 8 || i == 49);
    }
    list.page_follow = 1;
    for (i = 0; i < 49; i++) {
        ui_list_select(&list, i);
        assert(i + 1 < list.offset + 8);
        assert(i >= list.offset);
    }
    for (i = 48; i >= 0; i--) {
        ui_list_select(&list, i);
        assert(i + 1 < list.offset + 8 && i >= list.offset);
    }
    printf("  [OK] follow_extra keeps the value line under the selection in the window\n");
}

static const char *label_value_row(void *context, int index)
{
    (void)context; (void)index;
    return "Label  value";
}

static int label_value_style(void *context, int index, int *head, int *tail)
{
    (void)context;
    *head = ANSI_RED;
    *tail = ANSI_GREEN;
    return index == 0 ? 7 : 0;      /* row 0 splits after "Label  ", the others are one piece */
}

/* A colour on the ground: whole ("31;44m") or, when only the pen moved, just the pen ("[31m"). */
static const char *ink_on_ground(const char *from, const char *pen, const char *ground)
{
    char whole[16], bare[16];
    const char *w, *n;
    sprintf(whole, "%s;%sm", pen, ground);
    sprintf(bare, "[%sm", pen);
    w = strstr(from, whole);
    n = strstr(from, bare);
    return (w && (!n || w < n)) ? w : n;
}

static void a_row_can_carry_a_label_ink_and_a_value_ink(void)
{
    ui_list list = a_list(3, 10);
    static ansi_buf b;
    const char *head, *value;

    list.borders = 0;
    list.ground = ANSI_BLUE;
    list.row = label_value_row;
    list.style = label_value_style;
    list.selected = 2;
    list.drawn_selected = -1;
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(&list, &b);
    frame[b.len] = '\0';
    head = ink_on_ground(frame, "31", "44");           /* the head ink, on the ground, before the label */
    value = strstr(frame, "Label  ");
    assert(head != 0 && value != 0 && head < value);
    assert(ink_on_ground(frame, "32", "44") != 0);      /* the tail ink, on the ground */
    assert(ink_on_ground(frame, "32", "44") > value && ink_on_ground(frame, "32", "44") < strstr(frame, "value"));
    /* row 1 is one piece: only row 0 ever switches to the tail ink */
    assert(ink_on_ground(ink_on_ground(frame, "32", "44") + 1, "32", "44") == 0);
    printf("  [OK] a row can carry a label ink and a value ink, on the list's ground\n");
}

static void a_caret_bar_fills_the_whole_selected_row(void)
{
    ui_list list = a_list(3, 10);
    static ansi_buf b;
    const char *row;

    list.borders = 0;
    list.caret = ">>";
    list.caret_bar = 1;
    list.selected_fg = ANSI_WHITE;
    list.selected_bg = ANSI_MAGENTA;
    ui_list_select(&list, 1);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(&list, &b);
    frame[b.len] = '\0';
    row = strstr(frame, "45m");
    assert(row != 0 && row < strstr(frame, ">>"));
    printf("  [OK] a caret bar paints the selection colours under the caret too\n");
}

static void a_cursor_move_leaves_the_scroll_bar_alone(void)
{
    ui_list list = a_list(50, 10);
    static ansi_buf b;

    list.borders = 0;
    ui_list_select(&list, 0);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw(&list, &b);
    frame[b.len] = '\0';
    assert(strstr(frame, "42m") != 0);        /* the full draw paints the thumb */
    ui_list_move(&list, 1);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_list_draw_changed(&list, &b, 0);
    frame[b.len] = '\0';
    assert(strstr(frame, "42m") == 0 && strstr(frame, "41m") == 0);   /* a move at the same offset cannot move it */
    printf("  [OK] a cursor move does not rewrite the scroll bar\n");
}

/**
 * THE ONE SCROLLBAR (sysop, 2026-10-15): solid colour bars, no glyphs.
 * Track on the theme's DIM, thumb on its INK - the roles the TypeScript
 * scrollbarRoles() names, from the same tokens.
 */
static void the_scroll_bar_is_solid_colour_with_no_glyph(void)
{
    ui_list list = a_list(50, 10);
    const char *out;

    list.borders = 0;
    ui_list_select(&list, 0);
    out = drawn(&list);
    /* No '#' glyph and no '|' track glyph anywhere in the frame. */
    assert(strchr(out, '#') == 0);
    assert(strchr(out, '|') == 0);
    printf("  [OK] the scroll bar draws no glyph\n");
}

static void the_scroll_bar_defaults_to_the_themes_dim_and_ink(void)
{
    const ui_theme *theme = ui_theme_by_id("uprough-neon");
    ui_list list;
    static ansi_buf b;
    char want_track[40], want_thumb[40];

    ui_list_init(&list);
    assert(list.scroll_track == UI_TOKEN(UI_T_DIM));
    assert(list.scroll_thumb == UI_TOKEN(UI_T_INK));

    list.top = 1; list.left = 1; list.height = 10; list.width = 20;
    list.count = 50; list.row = numbered_row; list.borders = 0;
    ui_list_select(&list, 0);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ansi_set_palette(&b, theme->rgb, theme->idx, UI_TOKEN_COUNT);
    ui_list_draw(&list, &b);
    frame[b.len] = '\0';

    sprintf(want_track, "48;2;%lu;%lu;%lu", (theme->rgb[UI_T_DIM] >> 16) & 0xff,
            (theme->rgb[UI_T_DIM] >> 8) & 0xff, theme->rgb[UI_T_DIM] & 0xff);
    sprintf(want_thumb, "48;2;%lu;%lu;%lu", (theme->rgb[UI_T_INK] >> 16) & 0xff,
            (theme->rgb[UI_T_INK] >> 8) & 0xff, theme->rgb[UI_T_INK] & 0xff);
    assert(strstr(frame, want_track) != 0);
    assert(strstr(frame, want_thumb) != 0);
    printf("  [OK] the scroll bar is DIM and INK from the theme\n");
}

static void on_a_c64_each_scroll_bar_cell_is_a_reverse_video_space(void)
{
    ui_list list = a_list(50, 10);
    const char *out;
    const char *bar;

    list.borders = 0;
    ui_list_select(&list, 0);
    out = drawn_without_backgrounds(&list);
    /* The thumb colour (green) becomes the pen, with SGR 7 latched: the
       transducer turns that into $12 and a space - a solid block. */
    bar = strstr(out, "32m");
    assert(bar != 0);
    assert(strstr(out, "\033[7m") != 0);
    printf("  [OK] a C64 gets reverse-video spaces for the scroll bar\n");
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
    a_cursor_move_repaints_two_rows();
    the_row_left_behind_loses_its_caret();
    one_changed_row_repaints_only_that_row();
    page_follow_scrolls_a_page_not_a_row();
    follow_extra_keeps_rows_below_the_selection_visible();
    a_row_can_carry_a_label_ink_and_a_value_ink();
    a_caret_bar_fills_the_whole_selected_row();
    a_cursor_move_leaves_the_scroll_bar_alone();
    the_scroll_bar_is_solid_colour_with_no_glyph();
    the_scroll_bar_defaults_to_the_themes_dim_and_ink();
    on_a_c64_each_scroll_bar_cell_is_a_reverse_video_space();
    printf("ui_list: all passed\n");
    return 0;
}
