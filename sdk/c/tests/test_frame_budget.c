/*
 * What one keystroke COSTS, in bytes on the wire.
 *
 * THE GAP THIS CLOSES. On 2026-09-13/14 the sysop walked the new message
 * editor and found six faults. Three of them were one root cause, and none of
 * the existing tests could have caught any of the three:
 *
 *   - the cursor ran to the right of the screen on every keystroke, because
 *     ui_input padded its row to the field width and the closing cursor-goto
 *     fell past the end of a single XIM message, arriving a fifth of a second
 *     later in a second one;
 *   - the first line of a message vanished as the second was typed, because
 *     the editor repainted every row per keystroke and the frame arrived in
 *     pieces that did not agree with each other;
 *   - the masthead animation stole the cursor between keystrokes.
 *
 * Every widget test in this suite drives a scripted key stream and asserts the
 * TEXT that comes out. None of them looks at how many BYTES that took. So a
 * frame could triple in size and every test stayed green while the board fell
 * apart in front of a caller.
 *
 * RULES.md already states the rule - "repaint only what changed; ~198 bytes is
 * one XIM message on 68K" - and nothing enforced it. This does.
 *
 * The budget is deliberately generous. It is not a style guide for shaving
 * bytes; it is a tripwire for a repaint that has gone from a row to a screen.
 */

#include "../include/ui_ansi.h"
#include "../include/ui_editor.h"
#include "../include/ui_input.h"
#include "../include/ui_key.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

/** One XIM message on 68K, the number RULES.md uses. */
#define ONE_XIM_MESSAGE 198

/** A caller who typed this, one byte at a time. */
typedef struct { const char *keys; int at; } typist;

static int typist_next(void *ctx)
{
    typist *t = (typist *)ctx;
    if (!t->keys[t->at]) return -1;
    return (unsigned char)t->keys[t->at++];
}
static int typist_pending(void *ctx)
{
    typist *t = (typist *)ctx;
    return t->keys[t->at] != '\0';
}

/**
 * Bytes the widget produced between one blocking read and the next.
 *
 * The flush callback is where a real door hands its frame to the board, so it
 * is exactly where a frame's size can be weighed - and it runs once per
 * keystroke, which is the unit the rule is written in.
 */
static long biggest_frame;
static long first_frame;
static long last_len;
static int frames;
static ansi_buf *watched;

static void measuring_flush(void *ctx)
{
    long grew;
    (void)ctx;

    grew = watched->len - last_len;
    last_len = watched->len;
    frames++;

    /*
     * THE OPENING PAINT IS NOT A KEYSTROKE. A door is entitled to spend a
     * whole screen laying its chrome down once - what the rule forbids is
     * spending one on every key after that. So the first frame is recorded
     * separately and every later one is what gets weighed.
     */
    if (frames == 1) { first_frame = grew; return; }
    if (grew > biggest_frame) biggest_frame = grew;
}

static ui_key_source source_for(typist *t)
{
    ui_key_source src;
    src.next = typist_next;
    src.pending = typist_pending;
    src.settle = 0;
    src.idle = 0;
    src.flush = measuring_flush;
    src.ctx = t;
    return src;
}

static char storage[262144];

static void reset(ansi_buf *b)
{
    ansi_begin(b, storage, (long) sizeof storage);
    watched = b;
    biggest_frame = 0;
    first_frame = 0;
    last_len = 0;
    frames = 0;
}

static void a_prompt_keystroke_costs_one_message(void)
{
    /*
     * ui_input repaints ONE ROW. The row is its fill, its text and a cursor
     * goto - nowhere near a full message even at 132 columns.
     *
     * This is the test that would have caught the padding: writing the text
     * out to the full field width, when ansi_fill had already blanked the row,
     * roughly doubled the row and pushed the trailing goto over the edge.
     */
    ansi_buf b;
    ui_input_style st;
    typist t;
    ui_key_source src;
    char buf[80];
    int pushback = -1;

    reset(&b);
    ui_input_style_init(&st);
    /*
     * 80, because that is the widest a door is ever told about: the board
     * answers BB_SCRWIDTH with 80 even for a 132-column caller
     * (xim/bbs-info.ts:376-381), so the axis that really varies here is
     * HEIGHT. At a hypothetical 132 the fill alone is 132 bytes and the row
     * cannot fit one message - which is a fact about the terminal, not a
     * fault in the widget, and not what this guard is for.
     */
    st.row = 12; st.left = 1; st.cols = 80;

    t.keys = "hello there\r"; t.at = 0;
    src = source_for(&t);
    buf[0] = '\0';
    ui_input(&b, &src, &pushback, &st, "Subject:", buf, (int) sizeof buf);

    printf("      (widest prompt frame: %ld bytes)\n", biggest_frame);
    assert(biggest_frame <= ONE_XIM_MESSAGE);
    printf("  [OK] one keystroke at a prompt fits one XIM message\n");
}

static void an_editor_line_costs_one_message(void)
{
    /*
     * And the editor must cost the same, because it is the same row plus one
     * line drawn when a line is accepted. The version that repainted the
     * header, the instructions and every text row per keystroke produced
     * frames several times this, which is what broke the display.
     */
    ansi_buf b;
    ui_editor_style st;
    ui_editor_text text;
    typist t;
    ui_key_source src;
    int pushback = -1;

    reset(&b);
    ui_editor_style_init(&st);
    st.top = 2; st.left = 1; st.cols = 80; st.rows = 24;
    st.to = "EALL"; st.subject = "a subject";

    ui_editor_text_init(&text);
    /* three lines, end entry, then save */
    t.keys = "line one\rline two\rline three\r\rS\r"; t.at = 0;
    src = source_for(&t);
    ui_editor(&b, &src, &pushback, &st, &text);

    printf("      (opening paint: %ld bytes, widest keystroke after: %ld)\n",
           first_frame, biggest_frame);
    assert(text.count == 3);
    /*
     * TWO messages, not one: a pass that accepts a line draws the new row AND
     * the prompt row beneath it. The version that repainted the header, the
     * instructions and every text row per keystroke produced frames ten times
     * this, which is what made the display disagree with itself.
     */
    assert(biggest_frame <= ONE_XIM_MESSAGE * 2);
    printf("  [OK] entering a line costs at most two XIM messages\n");
}

static void the_cost_does_not_grow_with_the_message(void)
{
    /*
     * THE REAL RULE. A door may spend a screen on its first paint; what it
     * may not do is spend more on the twentieth line than on the second,
     * because that is a repaint of everything rather than of what changed.
     */
    ansi_buf b;
    ui_editor_style st;
    ui_editor_text text;
    typist t;
    ui_key_source src;
    int pushback = -1;
    long few, many;

    ui_editor_style_init(&st);
    st.top = 2; st.left = 1; st.cols = 80; st.rows = 24;

    reset(&b);
    ui_editor_text_init(&text);
    t.keys = "a\rb\r\rS\r"; t.at = 0;
    src = source_for(&t);
    ui_editor(&b, &src, &pushback, &st, &text);
    few = biggest_frame;

    reset(&b);
    ui_editor_text_init(&text);
    pushback = -1;
    t.keys = "a\rb\rc\rd\re\rf\rg\rh\ri\rj\rk\rl\r\rS\r"; t.at = 0;
    src = source_for(&t);
    ui_editor(&b, &src, &pushback, &st, &text);
    many = biggest_frame;

    printf("      (2 lines: %ld bytes, 12 lines: %ld bytes)\n", few, many);
    /*
     * A SMALL SLACK, not a proportional one. The twelfth line's prompt reads
     * "12>" where the second's reads " 2>", so a couple of bytes of honest
     * difference are expected and a strict <= would fail on the digit.
     *
     * What this is actually watching for is a repaint that walks the whole
     * document: that version produced frames around 2100 bytes where these are
     * around 240, so the regression is an order of magnitude away from the
     * slack and cannot hide inside it.
     */
    assert(many <= few + 64);
    printf("  [OK] the twelfth line costs no more than the second\n");
}

int main(void)
{
    printf("frame budget\n");
    a_prompt_keystroke_costs_one_message();
    an_editor_line_costs_one_message();
    the_cost_does_not_grow_with_the_message();
    printf("frame budget: all passed\n");
    return 0;
}
