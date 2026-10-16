#include "../include/ui_grid.h"
#include "../include/ui_key.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static char frame[32768];
static const char *KEYS[] = { "R", "E", "C", "F", "D", "U", "N", "LINKDISCORD", "J", "CF" };
static const char *LABELS[] = { "Read Mail", "Enter Message", "Comment to Sysop", "File Listings", "Download",
                                "Upload", "New Files", "Link Discord", "Join Conference", "Conference Flags" };
static const int SECTION[] = { 0, 0, 0, 1, 1, 1, 1, 1, 2, 2 };
static const char *TITLES[] = { "Messages", "Files", "Conferences" };
static const char *RIGHTS[] = { "", "", "", "", "", "", "", "", "12 new", "" };
static const char *FLAGS[] = { "", "", "", "", "", "", "", "", "CL", "G" };
static const char *k(void *c, int i) { (void)c; return KEYS[i]; }
static const char *l(void *c, int i) { (void)c; return LABELS[i]; }
static const char *t(void *c, int i) { (void)c; return TITLES[i]; }
static const char *r(void *c, int i) { (void)c; return RIGHTS[i]; }
static const char *f(void *c, int i) { (void)c; return FLAGS[i]; }

static ui_grid a_grid(int width, int height, int mode)
{
    ui_grid g;
    ui_grid_init(&g);
    g.top = 3; g.left = 1; g.width = width; g.height = height; g.mode = mode;
    g.entry_count = 10; g.section_count = 3; g.entry_section = SECTION;
    g.key = k; g.label = l; g.section_title = t; g.right = r; g.flags = f;
    ui_grid_layout(&g);
    return g;
}

static const char *drawn(ui_grid *g)
{
    static ansi_buf b;
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_grid_draw(g, &b);
    frame[b.len] = '\0';
    return frame;
}

static void eighty_columns_lay_entries_out_side_by_side(void)
{
    ui_grid g = a_grid(80, 20, UI_GRID_SCROLL);
    assert(g.columns >= 2);
    assert(g.key_width == 11);                     /* LINKDISCORD is never cut */
    assert(g.lines[0].kind == UI_GL_HEADER && g.lines[1].kind == UI_GL_ITEMS);
}

static void forty_columns_are_one_column(void)
{
    ui_grid g = a_grid(40, 20, UI_GRID_PAGES);
    assert(g.columns == 1);
    assert(g.col_width <= 40);
}

static void down_keeps_the_column_and_crosses_a_header(void)
{
    ui_grid g = a_grid(80, 20, UI_GRID_SCROLL);
    ui_grid_select(&g, 1);                         /* E, second column of Messages if 2+ columns */
    ui_grid_move(&g, UI_KEY_DOWN);
    assert(SECTION[g.selected] >= 0 && g.selected > 1);
    ui_grid_select(&g, 9);
    assert(ui_grid_move(&g, UI_KEY_DOWN) == 0);    /* clamps at the end */
    assert(g.selected == 9);
}

static void right_walks_reading_order_and_left_clamps(void)
{
    ui_grid g = a_grid(80, 20, UI_GRID_SCROLL);
    ui_grid_select(&g, 0);
    ui_grid_move(&g, UI_KEY_RIGHT);
    assert(g.selected == 1);
    ui_grid_select(&g, 0);
    assert(ui_grid_move(&g, UI_KEY_LEFT) == 0);
}

static void pages_never_end_on_a_header(void)
{
    int p;
    ui_grid g = a_grid(40, 6, UI_GRID_PAGES);
    assert(g.page_count >= 2);
    for (p = 1; p < g.page_count; p++)
        assert(g.lines[g.page_start[p] - 1].kind != UI_GL_HEADER);
}

static void a_page_that_would_end_on_a_header_ends_a_line_earlier(void)
{
    int p;
    ui_grid g = a_grid(40, 5, UI_GRID_PAGES);       /* line 4 is the Files header */
    assert(g.page_count >= 2);
    for (p = 1; p < g.page_count; p++)
        assert(g.lines[g.page_start[p] - 1].kind != UI_GL_HEADER);
    assert(g.lines[g.page_start[1]].kind == UI_GL_HEADER);
}

static void a_page_turn_repaints_the_box_and_a_move_inside_does_not(void)
{
    static ansi_buf b;
    ui_grid g = a_grid(40, 6, UI_GRID_PAGES);
    drawn(&g);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_grid_move(&g, UI_KEY_DOWN);
    assert(ui_grid_draw_changed(&g, &b) == 0);
    assert(b.len < 300);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_grid_move(&g, UI_KEY_PGDN);
    assert(ui_grid_draw_changed(&g, &b) == 1);
}

static void scroll_follows_one_row_at_a_time(void)
{
    /* sysop 2026-10-15: Down past the bottom moves the window one line, Up past the top brings the header back. */
    ui_grid g = a_grid(40, 5, UI_GRID_SCROLL);
    int before, moved = 0;
    drawn(&g);
    while (g.selected < 9) {
        before = g.offset;
        ui_grid_move(&g, UI_KEY_DOWN);
        if (g.offset != before) { assert(g.offset - before == 1 || g.offset - before == 2); moved++; }   /* 2 only when a section header comes along */
    }
    assert(moved >= 2);
    while (g.selected > 0) ui_grid_move(&g, UI_KEY_UP);
    assert(g.offset == 0);
}

static void the_hit_test_answers_the_entry_under_the_mouse(void)
{
    ui_grid g = a_grid(80, 20, UI_GRID_SCROLL);
    assert(ui_grid_hit(&g, 3, 1) == -1);           /* the Messages header */
    assert(ui_grid_hit(&g, 4, 2) == 0);            /* R */
    assert(ui_grid_hit(&g, 4, 1 + g.col_width) == 1);
    assert(ui_grid_hit(&g, 30, 2) == -1);          /* below the box */
}

static void the_right_column_the_marker_and_a_greyed_row_are_drawn(void)
{
    ui_grid g = a_grid(80, 20, UI_GRID_SCROLL);
    const char *s = drawn(&g);
    assert(strstr(s, "12 new") != 0);
    assert(strstr(s, "* J") != 0 || strstr(s, "*J") != 0);
    assert(strstr(s, "LINKDISCORD") != 0);
}

static void a_band_takes_its_rows_after_its_section(void)
{
    ui_grid g;
    g = a_grid(80, 20, UI_GRID_SCROLL);
    g.band_after_section = 0; g.band_height = 3;
    ui_grid_layout(&g);
    assert(ui_grid_band_row(&g) > 0);
    assert(g.lines[ui_grid_band_row(&g) - g.top].kind == UI_GL_BAND);
}

static void an_empty_grid_is_not_a_crash(void)
{
    ui_grid g;
    ui_grid_init(&g);
    g.width = 80; g.height = 10; g.key = k; g.label = l; g.section_title = t;
    ui_grid_layout(&g);
    assert(ui_grid_move(&g, UI_KEY_DOWN) == 0);
    drawn(&g);
    assert(ui_grid_hit(&g, 1, 1) == -1);
}

/* Every cursor address in the frame, and every text run's reach, stays inside the box. */
static void nothing_is_drawn_outside_the_box(void)
{
    int w, mode;
    for (w = 40; w <= 80; w += 40)
        for (mode = 0; mode <= 1; mode++) {
            ui_grid g = a_grid(w, 6, mode);
            const char *s = drawn(&g);
            for (; *s; s++) {
                int row, col, n = 0;
                if (s[0] == 27 && s[1] == '[' && sscanf(s + 2, "%d;%d%n", &row, &col, &n) == 2 && s[2 + n] == 'H') {
                    assert(row >= g.top && row < g.top + g.height);
                    assert(col >= g.left && col < g.left + g.width);
                }
            }
        }
}

static void a_band_is_never_split_across_pages(void)
{
    int p;
    ui_grid g = a_grid(40, 6, UI_GRID_PAGES);
    g.band_after_section = 0; g.band_height = 3;
    ui_grid_layout(&g);
    for (p = 1; p < g.page_count; p++)
        assert(!(g.lines[g.page_start[p]].kind == UI_GL_BAND && g.lines[g.page_start[p] - 1].kind == UI_GL_BAND));
}

static void a_null_grid_is_refused_before_anything_is_read(void)
{
    assert(ui_grid_move(0, UI_KEY_DOWN) == 0);
}

static void a_band_taller_than_the_box_leaves_the_callers_height_alone(void)
{
    ui_grid g = a_grid(80, 6, UI_GRID_SCROLL);
    g.band_after_section = 0; g.band_height = 10;
    ui_grid_layout(&g);
    assert(g.band_rows == 0 && ui_grid_band_row(&g) == 0);   /* it can never show here */
    assert(g.band_height == 10);                             /* but the caller's field is not rewritten */
    g.height = 20;                                           /* the terminal grows */
    ui_grid_layout(&g);
    assert(g.band_rows == 10);
    assert(ui_grid_band_row(&g) > 0);                        /* the band comes back */
}

static void the_ground_is_painted_under_every_cell_and_never_left_to_the_terminal(void)
{
    ui_grid g = a_grid(80, 20, UI_GRID_SCROLL);
    char plain[32768];
    strcpy(plain, drawn(&g));
    g.ground = 4;                                            /* blue, a door's own background */
    ui_grid_layout(&g);
    assert(strcmp(drawn(&g), plain) != 0);
    assert(strstr(drawn(&g), "44") != 0);
    assert(strstr(plain, "44") == 0);                        /* -1 stays the terminal's own */
}

static void a_caret_marks_the_selection_at_forty_columns_without_a_bar(void)
{
    ui_grid g = a_grid(40, 20, UI_GRID_PAGES);
    g.caret = ">>";
    ui_grid_select(&g, 0);
    ui_grid_layout(&g);
    assert(strstr(drawn(&g), ">>") != 0);
    assert(strstr(drawn(&g), ">> R") != 0 || strstr(drawn(&g), ">>R") != 0);
    ui_grid_select(&g, 1);
    {
        const char *s = drawn(&g);
        assert(strstr(s, ">> E") != 0 || strstr(s, ">>E") != 0);
        assert(strstr(s, ">> R") == 0);                      /* the mark moved with the selection */
    }
}

/* Colour off: the board strips the bar and the grey ink, so with no caret
   of its own the grid marks the selection ">>" and a greyed entry " -". */
static const char *drawn_colourless(ui_grid *g)
{
    static ansi_buf b;
    ansi_begin(&b, frame, (long)sizeof(frame));
    ansi_set_colour(&b, 0);
    ui_grid_draw(g, &b);
    frame[b.len] = '\0';
    return frame;
}

static void colour_off_marks_the_selection_and_a_grey_entry_in_characters(void)
{
    ui_grid g = a_grid(80, 20, UI_GRID_SCROLL);
    const char *s;

    ui_grid_select(&g, 0);
    ui_grid_layout(&g);
    s = drawn_colourless(&g);
    assert(strstr(s, ">>R") != 0 || strstr(s, ">> R") != 0);
    assert(strstr(s, " -CF") != 0 || strstr(s, " - CF") != 0);
    s = drawn(&g);
    assert(strstr(s, ">>") == 0);                            /* colour on: the bar is the mark */
    assert(strstr(s, " -CF") == 0 && strstr(s, " - CF") == 0);
}

static void three_and_four_columns_each_answer_their_own_hit(void)
{
    int width, want, c;
    for (want = 3; want <= 4; want++) {
        ui_grid g;
        width = want == 3 ? 120 : 160;
        g = a_grid(width, 20, UI_GRID_SCROLL);
        assert(g.columns == want);
        for (c = 0; c < want; c++)
            assert(ui_grid_hit(&g, 6, g.left + c * g.col_width + 3) == 3 + c);   /* the Files row: entries 3.. */
        assert(ui_grid_hit(&g, 6, g.left + g.width) == -1);                  /* right of the box */
    }
}

static void max_columns_caps_the_columns_and_zero_means_four(void)
{
    ui_grid g = a_grid(160, 20, UI_GRID_SCROLL);
    assert(g.columns == 4);                                  /* the default cap */
    g.max_columns = 2;
    ui_grid_layout(&g);
    assert(g.columns == 2);
    g.max_columns = 0;
    ui_grid_layout(&g);
    assert(g.columns == 4);
}

int main(void)
{
    eighty_columns_lay_entries_out_side_by_side();
    forty_columns_are_one_column();
    down_keeps_the_column_and_crosses_a_header();
    right_walks_reading_order_and_left_clamps();
    pages_never_end_on_a_header();
    a_page_that_would_end_on_a_header_ends_a_line_earlier();
    a_page_turn_repaints_the_box_and_a_move_inside_does_not();
    scroll_follows_one_row_at_a_time();
    the_hit_test_answers_the_entry_under_the_mouse();
    the_right_column_the_marker_and_a_greyed_row_are_drawn();
    a_band_takes_its_rows_after_its_section();
    an_empty_grid_is_not_a_crash();
    nothing_is_drawn_outside_the_box();
    a_band_is_never_split_across_pages();
    a_null_grid_is_refused_before_anything_is_read();
    a_band_taller_than_the_box_leaves_the_callers_height_alone();
    the_ground_is_painted_under_every_cell_and_never_left_to_the_terminal();
    a_caret_marks_the_selection_at_forty_columns_without_a_bar();
    colour_off_marks_the_selection_and_a_grey_entry_in_characters();
    three_and_four_columns_each_answer_their_own_hit();
    max_columns_caps_the_columns_and_zero_means_four();
    puts("test_ui_grid: OK");
    return 0;
}
