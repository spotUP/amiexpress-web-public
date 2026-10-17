/* test_us_model.c - the W door's rows, at the three widths, without a board. */
#include "../examples/usersettings/us_model.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static us_model m;

static void fill(int doors)
{
    int n;
    memset(&m, 0, sizeof(m));
    for (n = 0; n < US_FIELDS; n++) {
        m.field[n].number = n; m.field[n].state = 'E'; m.field[n].kind = 'T';
        sprintf(m.field[n].label, "Field %d", n);
        strcpy(m.field[n].value, "value");
    }
    m.field[15].state = 'H';
    for (n = 0; n < doors; n++) {
        strcpy(m.door[n].command, n ? "THEME" : "NOTIFY");
        strcpy(m.door[n].section, n ? "Appearance" : "Communication");
        strcpy(m.door[n].label, n ? "Door colours" : "Notifications");
        strcpy(m.door[n].description, "What it does");
    }
    m.door_count = doors;
}

static void every_row_fits_forty_columns(void)
{
    int i;
    fill(2);
    us_model_layout(&m, 40);
    assert(m.stacked);
    for (i = 0; i < m.row_count; i++) {
        assert(strlen(us_row_text(&m, i)) <= 40);
        /* BEFORE the clip: the list shows only us_text_room() of it (caret and scroll bar take the rest). */
        assert(us_row_length(&m, i) <= us_text_room(40));
    }
    /* the longest label the board has still shows its field number whole */
    strcpy(m.field[8].label, "Background file check");
    us_model_layout(&m, 40);
    assert(strstr(us_row_text(&m, us_row_of_field(&m, 8)), "[ 8]") != 0);
    for (i = 0; i < m.row_count; i++) assert(us_row_length(&m, i) <= us_text_room(40));
    printf("  [OK] every row fits forty columns\n");
}

static void at_forty_the_value_has_its_own_line(void)
{
    int r;
    fill(0);
    us_model_layout(&m, 40);
    r = us_row_of_field(&m, 4);
    assert(m.row[r].kind == US_ROW_FIELD && m.row[r + 1].kind == US_ROW_VALUE && m.row[r + 1].ref == 4);
    assert(!us_row_selectable(&m, r + 1));
    printf("  [OK] at forty the value has its own line and is not a stop\n");
}

static void a_hidden_field_has_no_row(void)
{
    fill(0);
    us_model_layout(&m, 80);
    assert(us_row_of_field(&m, 15) < 0);
    printf("  [OK] a hidden field has no row\n");
}

static void moving_skips_headings(void)
{
    int from, to;
    fill(2);
    us_model_layout(&m, 80);
    from = us_row_of_field(&m, 16);
    to = us_step(&m, from, 1);
    assert(m.row[to].kind == US_ROW_DOOR);
    assert(us_step(&m, us_first(&m), -1) == us_first(&m));
    printf("  [OK] moving skips headings and stops at the ends\n");
}

static void doors_are_grouped_by_section(void)
{
    int i, seen_appearance = -1, seen_comm = -1;
    fill(2);
    us_model_layout(&m, 80);
    for (i = 0; i < m.row_count; i++) {
        if (m.row[i].kind != US_ROW_HEADER) continue;
        if (strstr(us_row_text(&m, i), "Appearance")) seen_appearance = i;
        if (strstr(us_row_text(&m, i), "Communication")) seen_comm = i;
    }
    assert(seen_appearance >= 0 && seen_comm > seen_appearance);
    printf("  [OK] declared doors sit under their own section headings, in section order\n");
}

static void two_digits_reach_sixteen(void)
{
    int pending = -1;
    assert(us_jump(&pending, '1') == 1);
    assert(us_jump(&pending, '6') == 16);
    assert(us_jump(&pending, '7') == 7);
    assert(us_jump(&pending, '1') == 1);
    assert(us_jump(&pending, '9') == 9);   /* 19 is no field: 9 starts again */
    printf("  [OK] digits jump, two of them reach 10-16\n");
}

static void a_refusal_wraps_into_the_message_rows(void)
{
    char lines[4][81];
    int n = us_wrap("\r\nPassword must have at least 3 of these:\r\n  upper case,lower case, numeric and symbols - changes not saved", us_message_width(40), lines, 4);
    assert(us_message_width(40) == 39);
    assert(n == 3);
    assert(strstr(lines[2], "changes not saved") != 0);    /* the last words must survive the three rows at 40 */
    assert(strcmp(lines[0], "Password must have at least 3 of these:") == 0);
    assert(strlen(lines[1]) <= 39 && strlen(lines[2]) <= 39);
    n = us_wrap("\r\nPassword must have at least 3 of these:\r\n  upper case,lower case, numeric and symbols - changes not saved", us_message_width(80), lines, 4);
    assert(n == 2);
    printf("  [OK] a refusal wraps into the message rows, leading break dropped\n");
}

static void the_wide_screen_shows_a_description(void)
{
    int r;
    fill(1);
    us_model_layout(&m, 132);
    for (r = 0; r < m.row_count && m.row[r].kind != US_ROW_DOOR; r++) {}
    assert(strstr(us_row_text(&m, r), "What it does") != 0);
    us_model_layout(&m, 80);
    for (r = 0; r < m.row_count && m.row[r].kind != US_ROW_DOOR; r++) {}
    assert(strstr(us_row_text(&m, r), "What it does") == 0);
    printf("  [OK] a wide screen shows a door's description, 80 columns does not\n");
}

/* C3: the editor and the row text agree on where the value starts. The list
   draws the caret (2 columns) before the row text, 1-based screen columns. */
static void the_editor_starts_where_the_value_is_drawn(void)
{
    int cols[3] = { 80, 40, 132 }, k;
    for (k = 0; k < 3; k++) {
        int r;
        const char *t;
        fill(0);
        us_model_layout(&m, cols[k]);
        strcpy(m.field[4].value, "VALUEMARK");
        r = us_row_of_field(&m, 4);
        if (m.stacked) r++;
        t = us_row_text(&m, r);
        assert(strstr(t, "VALUEMARK") != 0);
        assert(US_CARET_WIDTH + 1 + (int) (strstr(t, "VALUEMARK") - t) == us_value_column(&m));
        assert(us_editor_left(&m) + 1 == us_value_column(&m));   /* ui_input's text sits one column right of its bar */
        if (!m.stacked) {                 /* the editor must not cover the [ n] field number */
            r = us_row_of_field(&m, 4);
            t = us_row_text(&m, r);
            assert(US_CARET_WIDTH + 1 + (int) (strstr(t, "[ 4]") - t) + 4 < us_value_column(&m));
        }
    }
    us_model_layout(&m, 80);
    assert(us_value_column(&m) == 34);
    us_model_layout(&m, 40);
    assert(us_value_column(&m) == 8);
    printf("  [OK] the editor starts where the value is drawn, at 80, 40 and 132\n");
}

static void no_duplicate_board_settings_heading(void)
{
    int i, count = 0;
    fill(2);
    m.door[0].section[0] = '\0';
    us_model_layout(&m, 80);
    for (i = 0; i < m.row_count; i++)
        if (m.row[i].kind == US_ROW_HEADER && strcmp(us_row_text(&m, i), "Board settings") == 0) count++;
    assert(count == 1);
    /* ROW ORDER: the sectionless door sits right under the outer heading, before any named section. */
    for (i = 0; i < m.row_count && !(m.row[i].kind == US_ROW_HEADER && strcmp(us_row_text(&m, i), "Board settings") == 0); i++) {}
    assert(m.row[i + 1].kind == US_ROW_DOOR && strcmp(m.door[m.row[i + 1].ref].label, "Notifications") == 0);
    assert(m.row[i + 2].kind == US_ROW_BLANK && m.row[i + 3].kind == US_ROW_HEADER && strcmp(us_row_text(&m, i + 3), "Appearance") == 0);
    assert(m.row[i + 4].kind == US_ROW_DOOR && strcmp(m.door[m.row[i + 4].ref].label, "Door colours") == 0);
    printf("  [OK] a door with no section does not repeat the Board settings heading\n");
}

static void sections_are_separated_by_one_empty_row(void)
{
    int i, k, headers = 0;
    int widths[2] = { 80, 40 };
    for (k = 0; k < 2; k++) {
        fill(2);
        us_model_layout(&m, widths[k]);
        assert(m.row[0].kind == US_ROW_HEADER);             /* nothing before the first heading */
        for (i = 1; i < m.row_count; i++) {
            if (m.row[i].kind == US_ROW_HEADER) {
                headers++;
                assert(m.row[i - 1].kind == US_ROW_BLANK);   /* exactly one empty row before a later heading */
                assert(m.row[i - 2].kind != US_ROW_BLANK);
            }
            if (m.row[i].kind == US_ROW_BLANK) {
                assert(m.row[i + 1].kind == US_ROW_HEADER);
                assert(!us_row_selectable(&m, i));
                assert(strlen(us_row_text(&m, i)) == 0);
            }
        }
        assert(headers >= 5);
    }
    printf("  [OK] one empty, unselectable row between sections, none before the first\n");
}

static void moving_and_jumping_skip_blank_rows(void)
{
    int i, last_account, r;
    fill(0);
    us_model_layout(&m, 80);
    last_account = us_row_of_field(&m, 6);
    r = us_step(&m, last_account, 1);
    assert(m.row[r].kind == US_ROW_FIELD && m.row[r].ref == 7);    /* over the blank and the heading */
    assert(us_step(&m, r, -1) == last_account);
    for (i = 0; i < US_FIELDS; i++) if (i != 15) assert(m.row[us_row_of_field(&m, i)].ref == i);
    printf("  [OK] stepping crosses blank and heading rows; every field number still has its row\n");
}

static void a_value_row_splits_after_its_label(void)
{
    int r;
    fill(1);
    us_model_layout(&m, 80);
    r = us_row_of_field(&m, 4);
    assert(us_row_split(&m, r) == us_value_column(&m) - US_CARET_WIDTH - 1);
    assert(strncmp(us_row_text(&m, r) + us_row_split(&m, r), "value", 5) == 0);
    us_model_layout(&m, 40);
    assert(us_row_split(&m, us_row_of_field(&m, 4)) == 0);
    printf("  [OK] a wide row splits exactly where its value starts\n");
}

/* W4: cover flow pages are the runs between header rows. ACHIEVE, NOTIFY and THEME each name a section, so the
   empty Board settings run is no page, and every page fits the 40x25 list (rows 25 - top 2 - 4 footer = 19). */
static void pages_are_the_runs_between_headers(void)
{
    static const char *cmd[3] = { "ACHIEVE", "NOTIFY", "THEME" };
    static const char *sec[3] = { "Achievements", "Communication", "Appearance" };
    int p, first, last, i, n, headers = 0;
    fill(3);
    for (n = 0; n < 3; n++) { strcpy(m.door[n].command, cmd[n]); strcpy(m.door[n].section, sec[n]); }
    us_model_layout(&m, 40);
    for (i = 0; i < m.row_count; i++) if (m.row[i].kind == US_ROW_HEADER) headers++;
    n = us_page_count(&m);
    assert(n == headers - 1);                         /* Board settings holds nothing of its own */
    assert(!us_page_rows(&m, n, &first, &last) && !us_page_rows(&m, -1, &first, &last));
    for (p = 0; p < n; p++) {
        assert(us_page_rows(&m, p, &first, &last));
        assert(m.row[first].kind == US_ROW_HEADER && m.row[last].kind != US_ROW_BLANK);
        assert(last + 1 == m.row_count || m.row[last + 1].kind == US_ROW_BLANK);
        assert(last - first + 1 <= 19);
        for (i = first + 1; i <= last; i++) assert(m.row[i].kind != US_ROW_HEADER);
        for (i = first; i <= last; i++) assert(us_page_of_row(&m, i) == p);
        assert(strcmp(us_page_title(&m, p), us_row_text(&m, first)) == 0);
    }
    assert(strcmp(us_page_title(&m, n - 3), "Achievements") == 0);
    assert(strcmp(us_page_title(&m, n - 2), "Appearance") == 0);
    assert(strcmp(us_page_title(&m, n - 1), "Communication") == 0);
    printf("  [OK] cover flow pages are the header runs and each fits the 40x25 list\n");
}

int main(void)
{
    printf("us_model\n");
    every_row_fits_forty_columns();
    at_forty_the_value_has_its_own_line();
    a_hidden_field_has_no_row();
    moving_skips_headings();
    doors_are_grouped_by_section();
    two_digits_reach_sixteen();
    a_refusal_wraps_into_the_message_rows();
    the_wide_screen_shows_a_description();
    the_editor_starts_where_the_value_is_drawn();
    no_duplicate_board_settings_heading();
    sections_are_separated_by_one_empty_row();
    moving_and_jumping_skip_blank_rows();
    a_value_row_splits_after_its_label();
    pages_are_the_runs_between_headers();
    printf("us_model: all passed\n");
    return 0;
}
