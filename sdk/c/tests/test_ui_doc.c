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

int main(void)
{
    printf("ui_doc\n");
    a_word_is_never_cut_in_half();
    a_word_wider_than_the_box_still_breaks();
    a_newline_ends_its_line_wherever_it_falls();
    every_line_fits_the_box();
    a_document_shorter_than_the_box_never_scrolls();
    paging_stops_at_both_ends();
    the_reader_leaves_on_q_and_says_where_it_is();
    a_narrow_reader_keeps_the_way_out();
    a_lost_caller_is_not_a_page_turn();
    printf("ui_doc: all passed\n");
    return 0;
}
