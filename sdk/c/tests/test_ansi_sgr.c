/* test_ansi_sgr.c - ansi_color writes only the SGR parts that changed. */
#include "../include/ui_ansi.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static char mem[2048];
static const unsigned long rgb[2] = { 0x112233UL, 0x445566UL };
static const unsigned char idx[2] = { 7, 2 };

static ansi_buf fresh(void)
{
    ansi_buf b;
    memset(mem, 0, sizeof mem);
    ansi_begin(&b, mem, (long) sizeof mem);
    ansi_set_cell_backgrounds(&b, 1);
    ansi_set_palette(&b, rgb, idx, 2);
    return b;
}

static const char *since(const ansi_buf *b, long from)
{
    mem[b->len] = '\0';
    return mem + from;
}

static void a_foreground_change_repeats_no_background(void)
{
    ansi_buf b = fresh();
    long mark;

    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(1), 0);
    assert(strstr(since(&b, 0), "48;2;68;85;102") != 0);   /* the first one is whole */
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(1), UI_TOKEN(1), 0);
    assert(strcmp(since(&b, mark), "\033[38;2;68;85;102m") == 0);
    assert(strstr(since(&b, mark), "48;") == 0);
}

static void a_background_change_repeats_no_foreground(void)
{
    ansi_buf b = fresh();
    long mark;

    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(0), 0);
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(1), 0);
    assert(strcmp(since(&b, mark), "\033[48;2;68;85;102m") == 0);
}

static void an_unknown_cache_writes_the_whole_sgr(void)
{
    ansi_buf b = fresh();
    long mark;

    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(1), 0);
    ansi_reset(&b);                       /* the terminal forgot everything */
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(1), UI_TOKEN(1), 0);
    assert(strstr(since(&b, mark), "38;2;68;85;102;48;2;68;85;102m") != 0);

    ansi_set_palette(&b, rgb, idx, 2);    /* palette swap: cache unknown again */
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(1), UI_TOKEN(1), 0);
    assert(strstr(since(&b, mark), "38;2;68;85;102;48;2;68;85;102m") != 0);

    ansi_clear(&b);
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(1), 0);
    assert(strstr(since(&b, mark), "48;2;68;85;102m") != 0);
    assert(strstr(since(&b, mark), "38;2;17;34;51") != 0);
}

static void a_bold_change_keeps_the_background(void)
{
    ansi_buf b = fresh();
    long mark;

    ansi_color(&b, ANSI_RED, ANSI_BLUE, 0);
    mark = (long) b.len;
    ansi_color(&b, ANSI_BRIGHT + ANSI_RED, ANSI_BLUE, 0);   /* bold red */
    assert(strstr(since(&b, mark), "48;") == 0);
    assert(strncmp(since(&b, mark), "\033[1;", 4) == 0);
    mark = (long) b.len;
    ansi_color(&b, ANSI_RED, ANSI_BLUE, 0);
    assert(strstr(since(&b, mark), "48;") == 0);
    assert(strncmp(since(&b, mark), "\033[22;", 5) == 0);
}

static void a_dropped_background_resets(void)
{
    ansi_buf b = fresh();
    long mark;

    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(1), 0);
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(0), -1, 0);   /* no background: only SGR 0 can drop one */
    assert(strncmp(since(&b, mark), "\033[0;", 4) == 0);
}

/* A C64 has no cell backgrounds: a bar is reverse video in the BAR's colour.
   With the theme's palette the exact colour went out as the INK (black in
   five themes), so the selected row was black on black. */
static void a_bar_without_backgrounds_is_reverse_in_the_bar_colour(void)
{
    static const unsigned long theme[2] = { 0x000000UL, 0xAA00AAUL };   /* selection ink, selection bar */
    static const unsigned char near[2] = { 0, 5 };
    ansi_buf b = fresh();
    ansi_set_cell_backgrounds(&b, 0);
    ansi_set_palette(&b, theme, near, 2);
    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(1), 1);
    assert(strstr(since(&b, 0), "\033[7m") != 0);
    assert(strstr(since(&b, 0), "38;2;170;0;170") != 0);
    assert(strstr(since(&b, 0), "38;2;0;0;0") == 0);
    /* a background of the screen's own colour is no bar: the ink stays the pen */
    ansi_color(&b, UI_TOKEN(1), ANSI_BLACK, 0);
    assert(strstr(since(&b, 0), "\033[27m") != 0);
}

/* macOS Terminal draws the default background transparent, so an explicit
   black one shows as a black block. Black goes out as 49, both as a colour
   number and as an exact RGB of 000000; other grounds are untouched. */
static void a_black_background_is_the_terminal_default(void)
{
    static const unsigned long dark[2] = { 0x112233UL, 0x000000UL };
    ansi_buf b = fresh();
    long mark;

    ansi_color(&b, ANSI_WHITE, ANSI_BLACK, 0);
    assert(strstr(since(&b, 0), ";49m") != 0);
    assert(strstr(since(&b, 0), "40") == 0);
    mark = (long) b.len;
    ansi_color(&b, ANSI_WHITE, ANSI_BLUE, 0);
    assert(strcmp(since(&b, mark), "\033[44m") == 0);
    mark = (long) b.len;
    ansi_color(&b, ANSI_WHITE, ANSI_BLACK, 0);
    assert(strcmp(since(&b, mark), "\033[49m") == 0);

    ansi_set_palette(&b, dark, idx, 2);
    ansi_reset(&b);
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(1), 0);
    assert(strstr(since(&b, mark), "48;2;0;0;0") == 0);
    assert(strstr(since(&b, mark), ";49m") != 0);
    mark = (long) b.len;
    ansi_color(&b, UI_TOKEN(0), UI_TOKEN(0), 0);
    assert(strcmp(since(&b, mark), "\033[48;2;17;34;51m") == 0);
}

int main(void)
{
    a_bar_without_backgrounds_is_reverse_in_the_bar_colour();
    a_foreground_change_repeats_no_background();
    a_background_change_repeats_no_foreground();
    an_unknown_cache_writes_the_whole_sgr();
    a_bold_change_keeps_the_background();
    a_dropped_background_resets();
    a_black_background_is_the_terminal_default();
    printf("test_ansi_sgr: ok\n");
    return 0;
}
