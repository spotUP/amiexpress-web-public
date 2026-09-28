/*
 * The paged reader.
 *
 * Two things are worth testing and neither needs a terminal: the WRAP, which
 * is where a manual gets cut mid-word, and the PAGING, which is where a
 * reader walks off either end of a document. The drawing is exercised by
 * running a whole read through a scripted caller and asserting what came out
 * of the buffer.
 */

#include "../include/ui_doc.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

/** A caller who typed this, one byte at a time. */
typedef struct { const char *keys; int at; } typist;

static int typist_next(void *ctx)
{
    typist *t = (typist *) ctx;
    if (!t->keys[t->at]) return -1;
    return (unsigned char) t->keys[t->at++];
}

static int typist_pending(void *ctx)
{
    typist *t = (typist *) ctx;
    return t->keys[t->at] != '\0';
}

static ui_key_source source_for(typist *t)
{
    ui_key_source src;
    src.next = typist_next;
    src.pending = typist_pending;
    src.settle = 0;
    src.idle = 0;
    src.flush = 0;
    src.ctx = t;
    return src;
}

/* ------------------------------------------------------------------ */

static char lines[64][128];
static int line_count;

static void collect(void *context, const char *start, int len)
{
    (void) context;
    if (line_count >= 64) return;
    if (len > 127) len = 127;
    memcpy(lines[line_count], start, (size_t) len);
    lines[line_count][len] = '\0';
    line_count++;
}

static int wrap(const char *text, int width)
{
    line_count = 0;
    return ui_doc_wrap(text, width, collect, 0);
}

static void a_word_is_never_cut_in_half(void)
{
    /* The rule the blessed engine learned the hard way: "Slot 2: (empty)" at
       thirteen columns became "(e" / "mpty)" on a C64 (2026-09-06). */
    int n = wrap("Slot 2: (empty)", 13);

    assert(n == 2);
    assert(strcmp(lines[0], "Slot 2:") == 0);
    assert(strcmp(lines[1], "(empty)") == 0);
    printf("  [OK] a word is never cut in half\n");
}

static void a_word_wider_than_the_box_still_breaks(void)
{
    int n = wrap("supercalifragilistic", 8);

    assert(n > 1);
    assert(strlen(lines[0]) == 8);      /* nowhere else to break it */
    printf("  [OK] a word wider than the box still breaks\n");
}

static void a_newline_ends_its_line_wherever_it_falls(void)
{
    int n = wrap("one\ntwo three\nfour", 20);

    assert(n == 3);
    assert(strcmp(lines[0], "one") == 0);
    assert(strcmp(lines[1], "two three") == 0);
    assert(strcmp(lines[2], "four") == 0);
    printf("  [OK] a newline ends its line wherever it falls\n");
}

static void every_line_fits_the_box(void)
{
    const char *manual =
        "GRANDMASTER is a TGM-style tetris door. Hold rotates, the ghost "
        "shows where a piece lands, and a section is twenty levels. Press "
        "Q to leave at any time.";
    int n = wrap(manual, 24);
    int i;

    assert(n > 1);
    for (i = 0; i < n; i++) {
        assert((int) strlen(lines[i]) <= 24);
    }
    printf("  [OK] every line fits the box\n");
}

static void a_document_shorter_than_the_box_never_scrolls(void)
{
    assert(ui_doc_top_for(4, 10, 3) == 0);
    assert(ui_doc_top_for(4, 10, 99) == 0);
    assert(ui_doc_pages(4, 10) == 1);
    printf("  [OK] a document shorter than the box never scrolls\n");
}

static void paging_stops_at_both_ends(void)
{
    /* 30 lines in a 10-row box: the last page starts at 20, and nothing
       above it or below it exists to scroll to. */
    assert(ui_doc_top_for(30, 10, -5) == 0);
    assert(ui_doc_top_for(30, 10, 25) == 20);
    assert(ui_doc_top_for(30, 10, 20) == 20);
    assert(ui_doc_pages(30, 10) == 3);
    assert(ui_doc_pages(31, 10) == 4);   /* the ragged last page counts */
    printf("  [OK] paging stops at both ends\n");
}

static void the_reader_leaves_on_q_and_says_where_it_is(void)
{
    char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    const char *text =
        "line one\nline two\nline three\nline four\nline five\n"
        "line six\nline seven\nline eight\nline nine\nline ten";
    int rc;

    ui_doc_style_init(&st);
    st.height = 3; st.width = 40; st.top = 1; st.left = 1;

    t.keys = " q"; t.at = 0;             /* one page turn, then leave */
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));

    rc = ui_doc(&b, &src, &pushback, &st, " MANUAL ", text);

    assert(rc == 0);
    assert(strstr(storage, "PAGE") != 0);         /* it says where it is */
    assert(strstr(storage, "Q LEAVE") != 0);      /* and how to get out */
    assert(strstr(storage, "line four") != 0);    /* the second page drew */
    printf("  [OK] the reader leaves on Q and says where it is\n");
}

/**
 * A footer wider than the box is clipped from the RIGHT, which is where the
 * way out sits. A narrow reader must lose the page counter, never the key.
 */
static void a_narrow_reader_keeps_the_way_out(void)
{
    char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    const char *text = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight";

    ui_doc_style_init(&st);
    st.height = 3; st.width = 20; st.top = 1; st.left = 1;

    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));

    assert(ui_doc(&b, &src, &pushback, &st, " MANUAL ", text) == 0);
    assert(strstr(storage, "Q LEAVE") != 0);
    printf("  [OK] a narrow reader keeps the way out\n");
}

static void a_lost_caller_is_not_a_page_turn(void)
{
    char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;

    ui_doc_style_init(&st);
    st.height = 3; st.width = 20;

    t.keys = ""; t.at = 0;               /* nothing, ever: the caller hung up */
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));

    assert(ui_doc(&b, &src, &pushback, &st, " MANUAL ", "text") == -1);
    printf("  [OK] a lost caller is not a page turn\n");
}

static int visible_len(const char *row)
{
    int n = 0;
    const char *p = row;
    while (*p) {
        if (*p == UI_INK && p[1]) { p += (p[1] == 'T' && p[2]) ? 3 : 2; continue; }
        n++; p++;
    }
    return n;
}

static void a_pen_marker_costs_the_row_no_columns(void)
{
    /* A marker is UI_INK plus one byte and reaches the screen as nothing
       (ui_ansi.h). Counting its bytes as columns wrapped a coloured document
       two characters short for every colour change in the line - which is
       what a Text-TV page is made of, now that the door translates the
       proxy's SGR into markers. */
    int n = wrap("\001" "7aaa bbb \001" "2ccc ddd", 8);
    int i;

    for (i = 0; i < n; i++) assert(visible_len(lines[i]) <= 8);
    assert(strcmp(lines[0], "\001" "7aaa bbb") == 0);
    assert(n == 2);

    /* The token form is three bytes and also free. */
    n = wrap("\001T3hello world", 11);
    assert(n == 1);
    assert(visible_len(lines[0]) == 11);

    /* Mid-word breaking still lands on a whole column, not inside a
       marker: the break is taken in bytes where the walk stopped. */
    n = wrap("\001" "4abcdefghij", 4);
    assert(visible_len(lines[0]) == 4);
    printf("  [OK] a pen marker costs the row no columns\n");
}

static void a_cursor_picks_a_line_and_costs_two_rows(void)
{
    /* An index page: the caller moves a cursor between headlines and opens
       one with RETURN. The rows between them are not selectable. */
    static char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    const char *text =
        "one headline\n   101\n\ntwo headline\n   102\n\nthree headline\n   103";
    const int lines[3] = { 0, 3, 6 };
    int cur = -1;
    int rc;
    long full_bytes, move_bytes;

    ui_doc_style_init(&st);
    st.height = 8; st.width = 40; st.top = 1; st.left = 1;

    /* Down, down, RETURN: the third headline. */
    t.keys = "\x1b[B\x1b[B\r"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    rc = ui_doc_pick(&b, &src, &pushback, &st, " INDEX ", text, lines, 3, &cur);
    assert(rc == 1);
    assert(cur == 2);

    /* Q leaves without choosing, and keeps where the cursor was. */
    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    cur = 1;
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc_pick(&b, &src, &pushback, &st, " INDEX ", text, lines, 3, &cur) == 0);
    assert(cur == 1);

    /* With nothing selectable it is the plain reader: RETURN leaves. */
    cur = -1;
    t.keys = "\r"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc_pick(&b, &src, &pushback, &st, " INDEX ", text, 0, 0, &cur) == 0);

    /* THE COST. A cursor move repaints the row it left and the row it
       reached - not the page. Measured as bytes into the buffer: the first
       paint draws the frame, the footer and eight rows; a move must be a
       small fraction of that. */
    cur = 0;
    t.keys = "q"; t.at = 0;                       /* paint once, then leave */
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    ui_doc_pick(&b, &src, &pushback, &st, " INDEX ", text, lines, 3, &cur);
    /* b.len, not strlen: ansi_begin rewinds the buffer without clearing it,
       so the previous run's tail is still in `storage`. */
    full_bytes = b.len;

    cur = 0;
    t.keys = "\x1b[Bq"; t.at = 0;                 /* one move, then leave */
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    ui_doc_pick(&b, &src, &pushback, &st, " INDEX ", text, lines, 3, &cur);
    move_bytes = b.len - full_bytes;

    assert(move_bytes > 0);
    /* One XIM message is 198 bytes. A move must fit well inside one; the
       page costs ten. */
    assert(move_bytes < 198);
    assert(move_bytes < full_bytes / 4);
    printf("  [OK] a cursor picks a line, and a move costs %ld bytes against %ld for the page\n",
           move_bytes, full_bytes);
}

static void a_frameless_reader_uses_every_column(void)
{
    /* A framed reader needs width + 2 columns. A teletext row IS forty, so on
       a forty-column caller the frame ran off the screen: the title was cut
       mid-word, every row wrapped two characters early, and the panel's
       bottom-right corner appeared under the footer (sysop's C64 walk). */
    static char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    const char *forty = "  Dags for val - vallokalerna har oppnat";  /* exactly 40 */

    ui_doc_style_init(&st);
    st.height = 6; st.width = 40; st.left = 0; st.top = 1; st.frameless = 1;

    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc(&b, &src, &pushback, &st, "100 Dags for val", forty) == 0);

    /* The row is whole - it did not wrap - and the frame is not drawn. */
    assert(strstr(storage, "vallokalerna har oppnat") != 0);
    assert(strstr(storage, "+-") == 0);
    assert(strstr(storage, "Q LEAVE") != 0);      /* the way out survives */
    assert(strstr(storage, "100 Dags for val") != 0);  /* and the title */

    /* Framed, the same row does NOT fit: 40 columns of text want 42. */
    st.frameless = 0;
    st.width = 38;
    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc(&b, &src, &pushback, &st, "100 Dags for val", forty) == 0);
    assert(strstr(storage, "oppnat") != 0);       /* it wrapped, and still shows */
    printf("  [OK] a frameless reader uses every column\n");
}

static void a_coloured_row_keeps_its_tail(void)
{
    /* A pen marker is UI_INK plus one byte and costs no column. Clamping the
       drawn row at `width` BYTES cut the end off every coloured row - the
       sysop's C64 read "SVT:s mätn" where the page says "SVT:s mätning". */
    static char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    /* Twelve visible columns, with two markers worth four bytes. */
    const char *row = "\001" "7SVT:s \001" "3mig";

    ui_doc_style_init(&st);
    st.height = 3; st.width = 12; st.left = 1; st.top = 1; st.frameless = 1;

    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc(&b, &src, &pushback, &st, "T", row) == 0);

    /* The whole row reached the screen, markers and all. */
    assert(strstr(storage, "SVT:s ") != 0);
    assert(strstr(storage, "mig") != 0);
    printf("  [OK] a coloured row keeps its tail\n");
}

static void left_and_right_page_unless_the_caller_wants_them(void)
{
    /* ui_key used to decode LEFT and RIGHT as PGUP/PGDN because every widget
       that read them wanted paging. They arrive as themselves now, so this
       pins that the plain reader did NOT change: left and right still turn
       the page here. */
    static char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    const char *text =
        "line one\nline two\nline three\nline four\nline five\nline six";
    int cur = -1;
    const int lines[1] = { 0 };

    ui_doc_style_init(&st);
    st.height = 2; st.width = 40; st.top = 1; st.left = 1;

    t.keys = "\x1b[Cq"; t.at = 0;                 /* right, then leave */
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc(&b, &src, &pushback, &st, " M ", text) == 0);
    assert(strstr(storage, "line three") != 0);  /* it turned the page */

    /* The picker pages too, until the caller says the arrows mean pages. */
    t.keys = "\x1b[Cq"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc_pick(&b, &src, &pushback, &st, " M ", text, lines, 1, &cur) == UI_DOC_LEFT);
    assert(strstr(storage, "line three") != 0);

    /* With page_keys the direction is handed back instead. */
    st.page_keys = 1;
    t.keys = "\x1b[C"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc_pick(&b, &src, &pushback, &st, " M ", text, lines, 1, &cur) == UI_DOC_NEXT);
    t.keys = "\x1b[D"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc_pick(&b, &src, &pushback, &st, " M ", text, lines, 1, &cur) == UI_DOC_PREV);

    /* And the footer says so, since the title has no room at forty. */
    assert(strstr(storage, "<> PAGE") != 0);

    /* Forty columns carry the counter as well - the sysop reads the page
       number off the footer on a C64, where the title is already full. */
    st.height = 2; st.width = 40;
    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    (void) ui_doc_pick(&b, &src, &pushback, &st, " M ", text, lines, 1, &cur);
    assert(strstr(storage, "PAGE 1/3  <> PAGE  ENTER READS  Q LEAVE") != 0);
    printf("  [OK] left and right page, unless the caller wants the direction\n");
}

static void a_line_attribute_costs_the_row_no_columns(void)
{
    /* `UI_INK 'H' '3'` is DECDHL: the row the cursor is on is the top half
       of a double-height line. It is three bytes and zero columns, exactly
       like a theme token, so a headline sent twice under the two halves is
       still forty characters wide. */
    char text[128];
    static char storage[8192];
    ansi_buf b;
    ui_doc_style st;
    typist t; ui_key_source src; int pushback = -1;

    sprintf(text, "%sUP ROUGH BBS\n", UI_LINE_TOP);
    assert(ui_doc_wrap(text, 12, 0, 0) == 1);

    sprintf(text, "%sUP ROUGH\n%sUP ROUGH\n", UI_LINE_TOP, UI_LINE_BOTTOM);
    assert(ui_doc_wrap(text, 8, 0, 0) == 2);

    /* And it reaches the caller as the escape a VT100 knows. */
    ui_doc_style_init(&st);
    st.height = 4; st.width = 20; st.top = 1; st.left = 1;
    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    sprintf(text, "%sBIG\n%sBIG\n", UI_LINE_TOP, UI_LINE_BOTTOM);
    (void) ui_doc(&b, &src, &pushback, &st, " M ", text);
    assert(strstr(storage, "\x1b#3") != 0);
    assert(strstr(storage, "\x1b#4") != 0);
    printf("  [OK] a line attribute costs the row no columns\n");
}

static void a_pen_after_the_last_column_does_not_make_a_line(void)
{
    /* A teletext row is exactly forty columns and ends with a pen reset.
       The row is ONE line: the marker is zero-width and cannot need a line
       of its own. It used to get one, which doubled every Text-TV page at
       forty columns and moved every line index under the headline cursor. */
    char text[256];
    int n = 0;
    char row[64];
    int i;

    for (i = 0; i < 40; i++) row[i] = 'X';
    row[40] = '\0';
    sprintf(text, "\001""7%s\001R\n\001""7%s\001R\n", row, row);

    n = ui_doc_wrap(text, 40, 0, 0);
    assert(n == 2);

    /* The same for the three-byte token form of a marker. */
    sprintf(text, "\001""7%s\001T\001\n", row);
    assert(ui_doc_wrap(text, 40, 0, 0) == 1);

    /* And a row that really IS wider than the box still wraps. */
    sprintf(text, "%s and more words here\n", row);
    assert(ui_doc_wrap(text, 40, 0, 0) == 2);
    printf("  [OK] a pen after the last column does not make a line\n");
}

static void a_double_height_headline_highlights_both_halves(void)
{
    /* A double-height headline is TWO rows and ONE line. Highlighting only
       the row the cursor is on cut the bar across the middle of the letters
       (sysop, 2026-09-14). */
    static char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    char text[256];
    int cur = 0;
    const int lines[2] = { 0, 2 };
    const char *inverted;
    int bars;

    sprintf(text, "%sBIG\n%sBIG\nplain\n", UI_LINE_TOP, UI_LINE_BOTTOM);

    ui_doc_style_init(&st);
    st.height = 4; st.width = 20; st.top = 1; st.left = 1;
    st.fg = 7; st.bg = 0;

    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    (void) ui_doc_pick(&b, &src, &pushback, &st, " M ", text, lines, 2, &cur);

    /* The inverted pen is ground-on-ink: both halves must carry it. */
    bars = 0;
    inverted = storage;
    for (;;) {
        inverted = strstr(inverted, "\x1b[0;30;47m");
        if (!inverted) break;
        bars++;
        inverted += 1;
    }
    assert(bars >= 2);

    /* And the row below the pair is NOT dragged into the selection. */
    {
        const char *plain = strstr(storage, "plain");
        assert(plain != 0);
    }
    printf("  [OK] a double-height headline highlights both halves\n");
}

static void h_is_the_way_home_for_a_caller_that_walks(void)
{
    /* Six flips into the numbering, one key back to where the set starts.
       A reader that does NOT navigate documents must not lose an 'h' to
       this - it is an ordinary letter there. */
    static char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    const char *text =
        "line one\nline two\nline three\nline four\nline five\nline six";
    int cur = -1;
    const int lines[1] = { 0 };

    ui_doc_style_init(&st);
    st.height = 2; st.width = 76; st.top = 1; st.left = 1;

    st.page_keys = 1;
    t.keys = "h"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc_pick(&b, &src, &pushback, &st, " M ", text, lines, 1, &cur) == UI_DOC_HOME);
    /* And where there is room, the footer says the key exists. */
    assert(strstr(storage, "H HOME") != 0);

    /* Without page_keys 'h' is not a key at all: the reader stays put and
       leaves on q, as it did before this existed. */
    st.page_keys = 0;
    t.keys = "hq"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc_pick(&b, &src, &pushback, &st, " M ", text, lines, 1, &cur) == UI_DOC_LEFT);
    assert(strstr(storage, "H HOME") == 0);

    /* The plain reader never had an 'h' either. */
    t.keys = "hq"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));
    assert(ui_doc(&b, &src, &pushback, &st, " M ", text) == 0);
    printf("  [OK] h is the way home, for a caller that walks documents\n");
}

/** Collect the wrapped lines so a test can look at them. */
static char rawline[16][256];
static int rawline_count;
static void collect_raw(void *ctx, const char *start, int len)
{
    (void)ctx;
    if (rawline_count >= 16) return;
    if (len > 255) len = 255;
    memcpy(rawline[rawline_count], start, (size_t)len);
    rawline[rawline_count][len] = '\0';
    rawline_count++;
}

static void raw_ansi_costs_no_columns_and_is_never_split(void)
{
    /*
     * A MESSAGE IS NOT THE DOOR'S TEXT. It is whatever a caller wrote, and on
     * this board that is very often raw ANSI - the Conftop results, bulletins,
     * art. Those carry real `ESC [ ... m`, not the SDK's UI_INK markers.
     *
     * Counting those bytes as columns wrapped a coloured table two characters
     * short on every row, and breaking inside one left the tail rendering as
     * text: the sysop saw a bare "[32m12." printed on the live board where the
     * ESC had been left on the line above (2026-09-14).
     */
    char text[512];
    int n, i;

    /* Eighty columns of content, coloured, on an eighty-column reader: it is
       ONE line, and the colour costs nothing. */
    rawline_count = 0;
    sprintf(text, "\x1b[32m%s\x1b[0m\n", "12345678901234567890");
    n = ui_doc_wrap(text, 20, collect_raw, 0);
    assert(n == 1);
    assert(strstr(rawline[0], "12345678901234567890") != 0);

    /* No line may end part-way through an escape - that is what renders as
       text. Every ESC in a line must be followed by its final byte. */
    rawline_count = 0;
    sprintf(text, "%s\x1b[32m%s\x1b[0m%s\n",
            "aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc");
    ui_doc_wrap(text, 12, collect_raw, 0);
    for (i = 0; i < rawline_count; i++) {
        const char *e = strchr(rawline[i], 0x1b);
        while (e) {
            /* ESC [ ... final byte, all inside this line. */
            const char *f = e + 2;
            assert(e[1] == '[');
            while (*f && ((unsigned char)*f < 0x40 || (unsigned char)*f > 0x7e)) f++;
            assert(*f != '\0');
            e = strchr(f, 0x1b);
        }
    }
    printf("  [OK] raw ANSI costs no columns and is never split across lines\n");
}

/**
 * A message's own colour reaches the screen as colour, on every row.
 *
 * The pager turned the ESC of a caller's raw ANSI into a space, so a Conftop
 * results message went out as ` [32m16.` and the board patched the bare
 * `[32m` back into colour one XIM message at a time. Where a message boundary
 * fell between the `[` and the `32m`, the patch missed and the caller read
 * `[32m17.` on the page's last row (SUBS, 2026-09-28).
 */
static void a_messages_own_colour_reaches_the_screen(void)
{
    char storage[16384];
    ansi_buf b;
    typist t; ui_key_source src; int pushback = -1;
    ui_doc_style st;
    const char *text = "\033[32m16.\n\033[32m17.\n\033[32m18.";

    ui_doc_style_init(&st);
    st.frameless = 1; st.height = 3; st.width = 40; st.top = 1; st.left = 1;
    t.keys = "q"; t.at = 0;
    src = source_for(&t);
    ansi_begin(&b, storage, (long) sizeof(storage));

    ui_doc(&b, &src, &pushback, &st, "#264", text);

    assert(strstr(storage, "\033[32m17.") != 0);   /* the colour, as colour */
    assert(strstr(storage, " [32m") == 0);          /* never as text */
    assert(strstr(storage, "[32m17") == strstr(storage, "\033[32m17") + 1);
    printf("  [OK] a message's own colour reaches the screen as colour\n");
}

int main(void)
{
    printf("ui_doc\n");
    a_messages_own_colour_reaches_the_screen();
    a_word_is_never_cut_in_half();
    a_pen_marker_costs_the_row_no_columns();
    a_word_wider_than_the_box_still_breaks();
    a_newline_ends_its_line_wherever_it_falls();
    every_line_fits_the_box();
    a_document_shorter_than_the_box_never_scrolls();
    paging_stops_at_both_ends();
    the_reader_leaves_on_q_and_says_where_it_is();
    a_narrow_reader_keeps_the_way_out();
    a_lost_caller_is_not_a_page_turn();
    a_cursor_picks_a_line_and_costs_two_rows();
    a_frameless_reader_uses_every_column();
    a_coloured_row_keeps_its_tail();
    left_and_right_page_unless_the_caller_wants_them();
    h_is_the_way_home_for_a_caller_that_walks();
    a_double_height_headline_highlights_both_halves();
    a_pen_after_the_last_column_does_not_make_a_line();
    a_line_attribute_costs_the_row_no_columns();
    raw_ansi_costs_no_columns_and_is_never_split();
    printf("ui_doc: all passed\n");
    return 0;
}
