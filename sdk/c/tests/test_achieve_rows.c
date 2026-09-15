/*
 * The C ACHIEVE door prints the rows its TypeScript twin prints.
 *
 * Backlog 4.13, the acceptance for the C SDK plan's second proof door. The
 * two doors are the same door for a caller: `Doors/achieve` on the web
 * terminal, `Doors/ACHIEVEC/achievec` on a 68K node. A caller who reads the
 * board scoreboard through one and then the other must not see two different
 * boards.
 *
 * Neither implementation is the contract. `tests/fixtures/achieve-rows.golden`
 * is, and both sides are asserted against it: this file for the C door, and
 * `web/backend/tests/doors/achieve-rows-match-the-c-door.test.ts` for the
 * twin. The listings are the server's own `|`-separated text
 * (`achieve-board.listing`, `achieve-catalog.listing`), so one fixture feeds
 * both languages and there is no second copy of the data to drift.
 *
 * What parity does NOT cover is written down in the golden's own header and
 * in achieve_rows.h: the twin's profile view, its account states, its
 * unlocked mark, its family headings. The C door cannot do those at all.
 */

#include "../examples/achieve/achieve_rows.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_GOLDEN_LINES 64
#define MAX_LINE 256

static char golden_storage[16384];
static const char *golden_line[MAX_GOLDEN_LINES];
static int golden_count;

static char board_listing[8192];
static char catalog_listing[8192];

/** The whole file, or die saying which one. */
static void slurp(const char *path, char *buf, unsigned long size)
{
    FILE *f = fopen(path, "rb");
    unsigned long n;

    if (f == 0) {
        printf("  [FAIL] cannot open %s\n", path);
        exit(1);
    }
    n = (unsigned long)fread(buf, 1, size - 1, f);
    buf[n] = '\0';
    fclose(f);
}

/**
 * The lines of one `[section]` of the golden, in order, comments and blanks
 * dropped. Returns how many, and points `golden_line` at them.
 */
static int golden_section(const char *name)
{
    char wanted[64];
    char *p = golden_storage;
    int inside = 0;

    /* Re-read: the walk below NUL-terminates each line in place, so the
       previous section's scan has already eaten the newlines this one needs. */
    slurp("tests/fixtures/achieve-rows.golden", golden_storage, sizeof golden_storage);
    sprintf(wanted, "[%s]", name);
    golden_count = 0;

    while (*p != '\0') {
        char *line = p;
        char *end = strchr(p, '\n');

        if (end != 0) {
            *end = '\0';
            p = end + 1;
        } else {
            p = line + strlen(line);
        }
        if (end != 0 && end > line && end[-1] == '\r') end[-1] = '\0';

        if (line[0] == '#') continue;
        if (line[0] == '[') {
            inside = (strcmp(line, wanted) == 0);
            continue;
        }
        if (!inside || line[0] == '\0') continue;
        assert(golden_count < MAX_GOLDEN_LINES);
        golden_line[golden_count++] = line;
    }
    assert(golden_count > 0);
    return golden_count;
}

static void same(const char *what, int index, const char *got, const char *want)
{
    if (strcmp(got, want) != 0) {
        printf("  [FAIL] %s row %d\n    got  \"%s\"\n    want \"%s\"\n",
               what, index, got, want);
        exit(1);
    }
}

/* ------------------------------------------------------------------ cases */

static void the_menu_says_what_the_twin_says(void)
{
    int i;

    golden_section("menu.wide");
    for (i = 0; i < golden_count; i++) same("menu.wide", i, achieve_menu_row(i, 1), golden_line[i]);
    printf("  [OK] the menu labels are the twin's, at 80 columns\n");

    golden_section("menu.compact");
    for (i = 0; i < golden_count; i++) same("menu.compact", i, achieve_menu_row(i, 0), golden_line[i]);
    printf("  [OK] and its short labels at 40\n");
}

static void the_scoreboard_row_is_the_twin_s(void)
{
    achieve_rows rows;
    char buf[MAX_LINE];
    int i;

    slurp("tests/fixtures/achieve-board.listing", board_listing, sizeof board_listing);
    achieve_rows_split(board_listing, &rows);
    assert(rows.count == 4);

    golden_section("board.wide");
    assert(golden_count == rows.count);
    for (i = 0; i < rows.count; i++)
        same("board.wide", i, achieve_board_row(&rows, i, 1, buf, sizeof buf), golden_line[i]);
    printf("  [OK] a scoreboard row at 80 columns, handle twenty wide\n");

    golden_section("board.compact");
    for (i = 0; i < rows.count; i++)
        same("board.compact", i, achieve_board_row(&rows, i, 0, buf, sizeof buf), golden_line[i]);
    printf("  [OK] and at 40, handle sixteen wide\n");
}

static void the_catalogue_row_is_the_twin_s(void)
{
    achieve_rows rows;
    char buf[MAX_LINE];
    int i;

    slurp("tests/fixtures/achieve-catalog.listing", catalog_listing, sizeof catalog_listing);
    achieve_rows_split(catalog_listing, &rows);
    assert(rows.count == 4);

    golden_section("catalog.wide");
    for (i = 0; i < rows.count; i++)
        same("catalog.wide", i, achieve_catalog_row(&rows, i, 1, buf, sizeof buf), golden_line[i]);
    printf("  [OK] a catalogue row at 80 columns, name twenty wide then the description\n");

    golden_section("catalog.compact");
    for (i = 0; i < rows.count; i++)
        same("catalog.compact", i, achieve_catalog_row(&rows, i, 0, buf, sizeof buf), golden_line[i]);
    printf("  [OK] and at 40, the name alone\n");
}

static void an_unknown_tier_keeps_three_letters(void)
{
    /* The twin's TIER_TAG falls back to `tier.slice(0,3).toUpperCase()`, so a
       tier the board has never heard of still fits the bracket. `mythic` is
       in the fixture for exactly this. */
    achieve_rows rows;
    char buf[MAX_LINE];

    slurp("tests/fixtures/achieve-catalog.listing", catalog_listing, sizeof catalog_listing);
    achieve_rows_split(catalog_listing, &rows);
    assert(strstr(achieve_catalog_row(&rows, 3, 1, buf, sizeof buf), "[MYT]") != 0);
    printf("  [OK] a tier nobody has heard of still gets three upper-case letters\n");
}

static void a_row_too_long_is_clipped_with_a_tilde(void)
{
    /* clip(): the twin never folds, because a folded row eats the row under
       it. Too long is `width - 1` characters and a `~`. */
    char buf[MAX_LINE];

    same("clip", 0, achieve_clip("abcdefgh", 4, buf, sizeof buf), "abc~");
    same("clip", 1, achieve_clip("abcd", 4, buf, sizeof buf), "abcd");
    same("clip", 2, achieve_clip("abcd", 0, buf, sizeof buf), "~");
    printf("  [OK] a row past the panel is clipped, never folded\n");
}

static void the_header_line_is_not_a_row(void)
{
    /* `ACHIEVE|1|<revision>|<count>` is the server's business. A door that
       showed it would put a version string at the top of the scoreboard. */
    achieve_rows rows;
    char listing[64];

    strcpy(listing, "ACHIEVE|1|7|1\r\n1|spot|10|1\r\n");
    achieve_rows_split(listing, &rows);
    assert(rows.count == 1);
    same("header", 0, achieve_rows_field(&rows, 0, 1), "spot");
    printf("  [OK] the header line is consumed, not shown\n");
}

static void a_row_that_grew_is_still_a_row(void)
{
    /* The format is append-only: a conforming parser ignores trailing fields
       it does not know. Refusing the row would blank a caller's scoreboard
       the day the server adds a column. */
    achieve_rows rows;
    char listing[256];
    char buf[MAX_LINE];

    strcpy(listing, "ACHIEVE|1|7|1\r\n1|spot|10|1|something|new|and|unknown|here|too|and|more\r\n");
    achieve_rows_split(listing, &rows);
    assert(rows.count == 1);
    assert(rows.row[0].fields == ACHIEVE_FIELDS_MAX);
    same("grown", 0, achieve_board_row(&rows, 0, 1, buf, sizeof buf),
         "  1. spot                    10 pts   1");
    printf("  [OK] a row with fields we do not know still prints\n");
}

static void no_rows_is_an_empty_string_not_a_crash(void)
{
    achieve_rows rows;
    char buf[MAX_LINE];
    char listing[32];

    strcpy(listing, "ACHIEVE|1|7|0\r\n");
    achieve_rows_split(listing, &rows);
    assert(rows.count == 0);
    same("empty", 0, achieve_board_row(&rows, 0, 1, buf, sizeof buf), "");
    same("empty", 1, achieve_catalog_row(&rows, -1, 1, buf, sizeof buf), "");
    same("empty", 2, achieve_rows_field(&rows, 0, 0), "");
    printf("  [OK] an empty listing asks for no rows and gets none\n");
}

int main(void)
{
    printf("achieve rows, against the twin\n");

    the_menu_says_what_the_twin_says();
    the_scoreboard_row_is_the_twin_s();
    the_catalogue_row_is_the_twin_s();
    an_unknown_tier_keeps_three_letters();
    a_row_too_long_is_clipped_with_a_tilde();
    the_header_line_is_not_a_row();
    a_row_that_grew_is_still_a_row();
    no_rows_is_an_empty_string_not_a_crash();
    printf("achieve rows: all passed\n");
    return 0;
}
