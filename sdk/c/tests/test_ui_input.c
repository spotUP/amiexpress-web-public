/*
 * Keys, and the prompts built on them.
 *
 * The decoder is lifted from a door that has been reading arrows on a real
 * board, so what is worth testing is the part its own comments say cost six
 * debugging rounds: ESC alone versus ESC as the start of a sequence, and the
 * byte that must be handed BACK when a user types ESC then Q quickly.
 */

#include "../include/ui_input.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

/** A caller who typed this, one byte at a time. */
typedef struct {
    const char *keys;
    int at;
    /** Bytes consumed after the stream ran out - a caller who hung up. */
    int overrun;
} typist;

static int typist_next(void *ctx)
{
    typist *t = (typist *)ctx;
    if (!t->keys[t->at]) { t->overrun++; return -1; }
    return (unsigned char)t->keys[t->at++];
}

static int typist_pending(void *ctx)
{
    typist *t = (typist *)ctx;
    return t->keys[t->at] != '\0';
}

static ui_key_source source_for(typist *t)
{
    ui_key_source src;
    src.next = typist_next;
    src.pending = typist_pending;
    src.settle = 0;                  /* nothing to wait for: the test is instant */
    src.ctx = t;
    return src;
}

static char frame[8192];

static void an_ordinary_key_is_itself(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "q"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    assert(ui_key_read(&src, &pushback) == 'q');
    printf("  [OK] an ordinary key is itself\n");
}

static void both_line_endings_mean_enter(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "\r\n"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    /* A telnet client sends CR, a raw socket LF. A door that knew only one
       would look dead to half its callers. */
    assert(ui_key_read(&src, &pushback) == UI_KEY_ENTER);
    assert(ui_key_read(&src, &pushback) == UI_KEY_ENTER);
    printf("  [OK] both line endings mean ENTER\n");
}

static void the_arrows_decode(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "\x1b[A\x1b[B\x1b[5~\x1b[6~\x1b[H\x1b[F"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    assert(ui_key_read(&src, &pushback) == UI_KEY_UP);
    assert(ui_key_read(&src, &pushback) == UI_KEY_DOWN);
    assert(ui_key_read(&src, &pushback) == UI_KEY_PGUP);
    assert(ui_key_read(&src, &pushback) == UI_KEY_PGDN);
    assert(ui_key_read(&src, &pushback) == UI_KEY_HOME);
    assert(ui_key_read(&src, &pushback) == UI_KEY_END);
    printf("  [OK] the arrows and page keys decode\n");
}

static void an_escape_alone_is_an_escape(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "\x1b"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    /* Nothing queued behind it, so it was a keypress and not the start of a
       sequence - the ambiguity DOORMAN spent six rounds on. */
    assert(ui_key_read(&src, &pushback) == UI_KEY_ESC);
    printf("  [OK] an escape with nothing behind it is an escape\n");
}

static void escape_then_a_key_delivers_both(void)
{
    typist t; ui_key_source src; int pushback = -1;
    int first, second;

    t.keys = "\x1bq"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    /* Typed fast, ESC and Q arrive together. The Q was read to find out and
       must be handed BACK, or a sysop's "ESC then Q" swallows the Q - which
       is exactly how ESC from a sub-screen once quit the whole door. */
    first = ui_key_read(&src, &pushback);
    assert(first == UI_KEY_ESC);
    assert(pushback == 'q');

    second = ui_key_read(&src, &pushback);
    assert(second == 'q');
    assert(pushback == -1);
    printf("  [OK] escape then a key delivers both, in order\n");
}

static void a_lost_caller_is_reported_not_guessed(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = ""; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    assert(ui_key_read(&src, &pushback) < 0);
    printf("  [OK] a lost caller is reported, not guessed at\n");
}

/* ---- the prompt ---- */

static int run_input(const char *typed, char *buf, int maxlen, int upper)
{
    typist t; ui_key_source src; ansi_buf b; ui_input_style st;
    int pushback = -1;

    t.keys = typed; t.at = 0; t.overrun = 0;
    src = source_for(&t);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_input_style_init(&st);
    st.upper = upper;
    return ui_input(&b, &src, &pushback, &st, "Name:", buf, maxlen);
}

static void it_takes_a_line(void)
{
    char buf[32];
    buf[0] = '\0';
    assert(run_input("sysop\r", buf, (int)sizeof(buf), 0) == 1);
    assert(strcmp(buf, "sysop") == 0);
    printf("  [OK] it takes a line\n");
}

static void backspace_and_ctrl_u(void)
{
    char buf[32];

    buf[0] = '\0';
    assert(run_input("abc\x7f\r", buf, (int)sizeof(buf), 0) == 1);
    assert(strcmp(buf, "ab") == 0);

    buf[0] = '\0';
    assert(run_input("abc\x15xy\r", buf, (int)sizeof(buf), 0) == 1);
    assert(strcmp(buf, "xy") == 0);

    /* Backspace on an empty line is not an underflow. */
    buf[0] = '\0';
    assert(run_input("\x7f\x7f\r", buf, (int)sizeof(buf), 0) == 0);
    assert(buf[0] == '\0');
    printf("  [OK] backspace deletes and CTRL-U clears\n");
}

static void a_cursor_key_inside_a_prompt_means_nothing(void)
{
    char buf[32];
    buf[0] = '\0';

    /* Letting it through would put an escape sequence into text the door is
       about to act on. */
    assert(run_input("ab\x1b[Acd\r", buf, (int)sizeof(buf), 0) == 1);
    assert(strcmp(buf, "abcd") == 0);
    printf("  [OK] a cursor key inside a prompt means nothing\n");
}

static void it_stops_at_the_buffer(void)
{
    char buf[5];
    buf[0] = '\0';

    assert(run_input("abcdefgh\r", buf, (int)sizeof(buf), 0) == 1);
    assert(strlen(buf) == 4);           /* four characters and the terminator */
    printf("  [OK] it stops at the buffer rather than past it\n");
}

static void it_can_fold_to_upper_case(void)
{
    char buf[32];
    buf[0] = '\0';
    assert(run_input("cmd\r", buf, (int)sizeof(buf), 1) == 1);
    assert(strcmp(buf, "CMD") == 0);
    printf("  [OK] it can fold to upper case, for a command prompt\n");
}

static void a_caller_who_hangs_up_mid_edit_is_not_an_empty_answer(void)
{
    char buf[32];
    buf[0] = '\0';

    /* -1, not 0: a door must end the session rather than act on "".  */
    assert(run_input("abc", buf, (int)sizeof(buf), 0) == -1);
    printf("  [OK] a caller who hangs up mid-edit is not an empty answer\n");
}

/* ---- confirm ---- */

static int run_confirm(const char *typed, int default_yes)
{
    typist t; ui_key_source src; ansi_buf b; ui_input_style st;
    int pushback = -1;

    t.keys = typed; t.at = 0; t.overrun = 0;
    src = source_for(&t);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_input_style_init(&st);
    return ui_confirm(&b, &src, &pushback, &st, "Delete it?", default_yes);
}

static void confirm_answers_y_n_enter_and_escape(void)
{
    assert(run_confirm("y", 0) == 1);
    assert(run_confirm("N", 1) == 0);
    assert(run_confirm("\r", 1) == 1);
    assert(run_confirm("\r", 0) == 0);
    /* ESC is a no: the safe answer to a question somebody backed out of. */
    assert(run_confirm("\x1b", 1) == 0);
    /* Anything else is ignored rather than taken as an answer. */
    assert(run_confirm("xz\r", 1) == 1);
    printf("  [OK] confirm answers Y, N, ENTER and ESC - and ignores the rest\n");
}

int main(void)
{
    printf("ui_input\n");
    an_ordinary_key_is_itself();
    both_line_endings_mean_enter();
    the_arrows_decode();
    an_escape_alone_is_an_escape();
    escape_then_a_key_delivers_both();
    a_lost_caller_is_reported_not_guessed();
    it_takes_a_line();
    backspace_and_ctrl_u();
    a_cursor_key_inside_a_prompt_means_nothing();
    it_stops_at_the_buffer();
    it_can_fold_to_upper_case();
    a_caller_who_hangs_up_mid_edit_is_not_an_empty_answer();
    confirm_answers_y_n_enter_and_escape();
    printf("ui_input: all passed\n");
    return 0;
}
