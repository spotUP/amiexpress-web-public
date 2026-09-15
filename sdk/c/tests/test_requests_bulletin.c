/*
 * The bulletin REQUESTS writes fits the shortest terminal the board serves.
 *
 * The bug this pins, live on 2026-09-15: `Bulletins/bull9.txt` was 26 rows on
 * a 24-row terminal, so a caller met `(Pause)...More(y/n/ns)?` in the middle
 * of the request list. The classic door that wrote it had no row budget at
 * all - the file simply grew by one line per request - and it is no longer
 * wired to a command, so the screen had also been frozen since 2026-09-10.
 *
 * Two things are asserted, and the first is the one that regressed:
 *   1. the rendered bulletin never exceeds the budget, whatever the server
 *      hands back - 200 open requests still produce a screen that fits;
 *   2. the bytes are the classic door's, measured from the live file, so the
 *      art's columns still line up over the rows.
 */

#include "../examples/requests/requests_bulletin.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

/* The live art, trimmed to what matters here: 8 header rows, 2 tail rows. */
static const char *HEADER =
    "\033[35m_______\n"
    "\033[35m _\\_____________\n"
    "\033[35m  _\\____     /  _\n"
    "\033[35m /    _/   _/  __\n"
    "\033[35m/_____\\     \\____\n"
    "\033[34m.------\033[35m\\_____/\033[34m-.--\n"
    "\033[34m| \033[36mRequested by \033[34m| \033[36mDescription of File(s) Requested..\n"
    "\033[34m\246--------------\246---------\n";

static const char *TAIL =
    "\033[34m`------------ -`--------\n"
    "\033[34m - ---------------------'\n";

static char out[32768];

/** How many rows a caller sees: the trailing CRLF does not make one. */
static int rendered_rows(const char *text, unsigned long len)
{
    int rows = 0;
    unsigned long i;
    for (i = 0; i < len; i++) if (text[i] == '\n') rows++;
    if (len > 0 && text[len - 1] != '\n') rows++;
    return rows;
}

static int line_at(const char *text, unsigned long len, int wanted,
                   const char **start, unsigned long *out_len)
{
    unsigned long i = 0;
    int row = 0;
    while (i < len) {
        unsigned long begin = i;
        while (i < len && text[i] != '\n') i++;
        if (row == wanted) {
            unsigned long n = i - begin;
            if (n > 0 && text[begin + n - 1] == '\r') n--;
            *start = text + begin;
            *out_len = n;
            return 1;
        }
        row++;
        if (i < len) i++;
    }
    return 0;
}

static void art_rows_ignore_the_trailing_newline(void)
{
    assert(requests_bulletin_art_rows(HEADER) == 8);
    assert(requests_bulletin_art_rows(TAIL) == 2);
    assert(requests_bulletin_art_rows("one") == 1);
    assert(requests_bulletin_art_rows("one\n") == 1);
    assert(requests_bulletin_art_rows("one\r\ntwo\r\n") == 2);
    assert(requests_bulletin_art_rows("") == 0);
    assert(requests_bulletin_art_rows(0) == 0);
}

static void the_art_leaves_room_for_thirteen_requests(void)
{
    assert(requests_bulletin_capacity(HEADER, TAIL,
                                      REQUESTS_BULLETIN_ROW_BUDGET) == 13);
    /* Art taller than the budget yields no rows rather than a negative one. */
    assert(requests_bulletin_capacity(HEADER, TAIL, 4) == 0);
}

static void a_long_listing_still_fits_the_screen(void)
{
    requests_bulletin_row rows[200];
    unsigned long len;
    int i;

    for (i = 0; i < 200; i++) {
        rows[i].handle = "someone";
        rows[i].title = "a release that somebody wants uploaded";
    }

    len = requests_bulletin_render(out, sizeof out, HEADER, TAIL, rows, 200,
                                   REQUESTS_BULLETIN_ROW_BUDGET);
    assert(len > 0);
    /* THE REGRESSION: 26 rows is what shipped. */
    assert(rendered_rows(out, len) == REQUESTS_BULLETIN_ROW_BUDGET);
}

static void a_short_listing_is_not_padded_out(void)
{
    requests_bulletin_row rows[2];
    unsigned long len;

    rows[0].handle = "sysop";
    rows[0].title = "test";
    rows[1].handle = "Demon";
    rows[1].title = "Amiexpress 4.20";

    len = requests_bulletin_render(out, sizeof out, HEADER, TAIL, rows, 2,
                                   REQUESTS_BULLETIN_ROW_BUDGET);
    assert(rendered_rows(out, len) == 8 + 2 + 2);
}

static void the_row_is_the_classic_doors_bytes(void)
{
    /* Measured from the live bull9.txt written by Request v2.1, row 19:
       ESC[34m| ESC[37m<handle:12> ESC[34m| ESC[37m<title:60>ESC[34m|ESC[37m__ */
    static const char EXPECTED[] =
        "\033[34m|\033[37m Ransom1122   \033[34m|\033[37m "
        "Rogue Declan CD32                                           "
        "\033[34m|\033[37m  ";
    requests_bulletin_row rows[1];
    const char *line;
    unsigned long len, line_len;

    rows[0].handle = "Ransom1122";
    rows[0].title = "Rogue Declan CD32";

    len = requests_bulletin_render(out, sizeof out, HEADER, TAIL, rows, 1,
                                   REQUESTS_BULLETIN_ROW_BUDGET);
    assert(line_at(out, len, 8, &line, &line_len));
    assert(line_len == sizeof EXPECTED - 1);
    assert(memcmp(line, EXPECTED, line_len) == 0);
    /* 80 visible columns: 1+1+12+1+1+1+60+1 printable, then two spaces. */
    assert(line_len == 110);
}

static void an_overlong_field_is_cut_not_wrapped(void)
{
    requests_bulletin_row rows[1];
    const char *line;
    unsigned long len, line_len;

    rows[0].handle = "a-handle-far-too-long-for-the-column";
    rows[0].title =
        "a description that runs well past the sixty columns the header art "
        "gives it, and must not become a second row";

    len = requests_bulletin_render(out, sizeof out, HEADER, TAIL, rows, 1,
                                   REQUESTS_BULLETIN_ROW_BUDGET);
    /* One row in, one row out - a wrap would push the tail off the screen. */
    assert(rendered_rows(out, len) == 8 + 1 + 2);
    assert(line_at(out, len, 8, &line, &line_len));
    assert(line_len == 110);
}

static void the_art_keeps_its_colours_and_the_last_line_resets(void)
{
    requests_bulletin_row rows[1];
    const char *line;
    unsigned long len, line_len;

    rows[0].handle = "sysop";
    rows[0].title = "test";
    len = requests_bulletin_render(out, sizeof out, HEADER, TAIL, rows, 1,
                                   REQUESTS_BULLETIN_ROW_BUDGET);

    /* The header's first line is 7 visible columns of art, padded to 80 - and
       NOTHING is inserted between the art and the padding. An ink reset there
       was the first version of this, and it came out of the board's emulator
       with the logo half white: the art's later lines set no colour of their
       own, they inherit the one before. */
    assert(line_at(out, len, 0, &line, &line_len));
    assert(line_len == 5 /* ESC[35m */ + 7 + 73 /* pad to 80 columns */);
    assert(memcmp(line + line_len - 5, "     ", 5) == 0);
    assert(memcmp(line, "\033[35m_______", 12) == 0);

    /* The very last line ends the screen's colour. */
    assert(line_at(out, len, 10, &line, &line_len));
    assert(line_len > 4);
    assert(memcmp(line + line_len - 4, "\033[0m", 4) == 0);
}

static void a_screen_already_on_disk_is_judged_by_the_same_rule(void)
{
    /* What the live board had on 2026-09-15: the classic door's 26 rows. The
       door must see that as needing a rewrite, or upgrading a board changes
       nothing until somebody posts a request. */
    char tall[64 * 32];
    char just_right[64 * 32];
    int i;

    tall[0] = '\0';
    for (i = 0; i < 26; i++) strcat(tall, "a row\r\n");
    assert(!requests_bulletin_fits(tall, REQUESTS_BULLETIN_ROW_BUDGET));

    just_right[0] = '\0';
    for (i = 0; i < REQUESTS_BULLETIN_ROW_BUDGET; i++) strcat(just_right, "a row\r\n");
    assert(requests_bulletin_fits(just_right, REQUESTS_BULLETIN_ROW_BUDGET));

    /* And what this door itself writes must never need rewriting next time. */
    {
        requests_bulletin_row rows[200];
        unsigned long len;
        for (i = 0; i < 200; i++) { rows[i].handle = "someone"; rows[i].title = "a thing"; }
        len = requests_bulletin_render(out, sizeof out, HEADER, TAIL, rows, 200,
                                       REQUESTS_BULLETIN_ROW_BUDGET);
        out[len] = '\0';
        assert(requests_bulletin_fits(out, REQUESTS_BULLETIN_ROW_BUDGET));
    }

    assert(!requests_bulletin_fits(0, REQUESTS_BULLETIN_ROW_BUDGET));
}

static void a_buffer_too_small_writes_nothing(void)
{
    requests_bulletin_row rows[1];
    char tiny[64];

    rows[0].handle = "sysop";
    rows[0].title = "test";
    memset(tiny, 'x', sizeof tiny);
    /* Zero, not a short bulletin. Half a screen written over the live file is
       worse than yesterday's, so the door writes only on a non-zero return
       and never has to judge whether what it got back is complete. */
    assert(requests_bulletin_render(tiny, sizeof tiny, HEADER, TAIL, rows, 1,
                                    REQUESTS_BULLETIN_ROW_BUDGET) == 0);
}

/**
 * The bulletin has to notice when the ART changed, not only when a request
 * did.
 *
 * Sysop, 2026-09-15: "i uploaded a header and footer for the request door now
 * but its not used in the bulletin". It was behaving as built - a rewrite was
 * judged by whether a REQUEST had changed - so new art sat unused while the
 * old bulletin still fitted its row budget. Measured on the live board: the
 * art was written at 19:48 and bull9.txt was still the one from 10:01.
 *
 * The door compares these blocks against the file's own start and end, which
 * is why they must come out byte-identical to what `render` writes. Compare
 * the raw .txt instead and every bulletin looks stale for ever: the art is
 * padded to the bulletin's columns on the way in, and the tail closes with a
 * reset and no trailing newline.
 */
static void the_blocks_match_what_render_writes(void)
{
    requests_bulletin_row rows[1];
    char full[4096];
    char head[4096];
    char tail[4096];
    unsigned long n_full, n_head, n_tail;

    rows[0].handle = "sysop";
    rows[0].title = "a request";

    n_full = requests_bulletin_render(full, sizeof full, HEADER, TAIL, rows, 1,
                                      REQUESTS_BULLETIN_ROW_BUDGET);
    n_head = requests_bulletin_render_header(head, sizeof head, HEADER);
    n_tail = requests_bulletin_render_tail(tail, sizeof tail, TAIL);

    assert(n_full > 0 && n_head > 0 && n_tail > 0);
    /* The header block IS the start of the bulletin. */
    assert(strncmp(full, head, n_head) == 0);
    /* And the tail block IS its end. */
    assert(n_full >= n_tail);
    assert(strncmp(full + (n_full - n_tail), tail, n_tail) == 0);
}

/** Different art, different block - which is what makes staleness visible. */
static void other_art_renders_a_different_block(void)
{
    char a[4096];
    char b[4096];
    unsigned long na, nb;

    na = requests_bulletin_render_header(a, sizeof a, HEADER);
    nb = requests_bulletin_render_header(b, sizeof b, "\033[93mSOMETHING ELSE\n");

    assert(na > 0 && nb > 0);
    assert(na != nb || strncmp(a, b, na) != 0);
}

/** A buffer too small answers zero, so the door cannot judge on half a block. */
static void a_small_buffer_renders_no_block(void)
{
    char tiny[8];

    assert(requests_bulletin_render_header(tiny, sizeof tiny, HEADER) == 0);
    assert(requests_bulletin_render_tail(tiny, sizeof tiny, TAIL) == 0);
}

/**
 * Art can be too big to be a header.
 *
 * The sysop's new header was 23 rows of a 23-row budget (measured on the live
 * board, 2026-09-15), which leaves room for no requests at all. `capacity`
 * says so, and the door is expected to abandon the write rather than replace
 * a working bulletin with a screen that lists nothing.
 *
 * Pinned here because the number is what the door branches on: if capacity
 * ever answered a floor of 1 instead of 0, the guard would never fire and the
 * bulletin would go out empty.
 */
static void art_that_fills_the_screen_leaves_no_capacity(void)
{
    char big[4096];
    int i;

    big[0] = '\0';
    for (i = 0; i < REQUESTS_BULLETIN_ROW_BUDGET; i++) strcat(big, "X\n");

    assert(requests_bulletin_art_rows(big) == REQUESTS_BULLETIN_ROW_BUDGET);
    assert(requests_bulletin_capacity(big, TAIL, REQUESTS_BULLETIN_ROW_BUDGET) < 1);
}

/** And ordinary art still leaves the room the door was built around. */
static void a_header_that_fits_still_leaves_rows(void)
{
    assert(requests_bulletin_capacity(HEADER, TAIL,
                                      REQUESTS_BULLETIN_ROW_BUDGET) > 0);
}

int main(void)
{
    art_that_fills_the_screen_leaves_no_capacity();
    a_header_that_fits_still_leaves_rows();
    the_blocks_match_what_render_writes();
    other_art_renders_a_different_block();
    a_small_buffer_renders_no_block();
    art_rows_ignore_the_trailing_newline();
    the_art_leaves_room_for_thirteen_requests();
    a_long_listing_still_fits_the_screen();
    a_short_listing_is_not_padded_out();
    the_row_is_the_classic_doors_bytes();
    an_overlong_field_is_cut_not_wrapped();
    the_art_keeps_its_colours_and_the_last_line_resets();
    a_screen_already_on_disk_is_judged_by_the_same_rule();
    a_buffer_too_small_writes_nothing();
    printf("test_requests_bulletin: ok\n");
    return 0;
}
