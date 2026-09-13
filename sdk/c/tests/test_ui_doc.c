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

int main(void)
{
    printf("ui_doc\n");
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
    printf("ui_doc: all passed\n");
    return 0;
}
