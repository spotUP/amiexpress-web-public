/*
 * Writing a message inside the door.
 *
 * ui_editor is a port of express.e's `PROC edit` line editor
 * (express.e:10077-10574), so most of what is worth asserting is parity: the
 * bare ENTER that ends entry, the letters on the menu, and the fact that S and
 * A are not the same kind of leaving. A door that returned "aborted" for a
 * dropped carrier would send the caller back to a message list that is no
 * longer there.
 *
 * The wrap is tested hardest because it is the part with no parity target to
 * lean on and the part that ruins a quoted reply when it is wrong.
 */

#include "../include/ui_editor.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

/** A caller who typed this, one byte at a time. */
typedef struct {
    const char *keys;
    int at;
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

static int flushes;
static void counting_flush(void *ctx) { (void)ctx; flushes++; }

static ui_key_source source_for(typist *t)
{
    ui_key_source src;
    src.next = typist_next;
    src.pending = typist_pending;
    src.settle = 0;
    src.idle = 0;
    src.flush = counting_flush;
    src.ctx = t;
    return src;
}

static char frame[16384];

/** Run the editor over a scripted keystroke stream. */
static int run(const char *keys, ui_editor_text *text)
{
    ansi_buf b;
    ui_editor_style st;
    typist t;
    ui_key_source src;
    int pushback = -1;

    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_editor_style_init(&st);
    ui_editor_text_init(text);
    t.keys = keys; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    return ui_editor(&b, &src, &pushback, &st, text);
}

/* ------------------------------------------------------------------- wrap */

static void a_short_line_is_left_alone(void)
{
    ui_editor_text text;
    ui_editor_text_init(&text);

    assert(ui_editor_append_wrapped(&text, "hello", 20) == 1);
    assert(text.count == 1);
    assert(strcmp(text.line[0], "hello") == 0);
    printf("  [OK] a short line is left alone\n");
}

static void a_long_line_breaks_on_a_space(void)
{
    ui_editor_text text;
    ui_editor_text_init(&text);

    /* The break must fall between words. Splitting mid-word is what turns a
       quoted reply into rubble, and it is the whole reason this is exposed. */
    assert(ui_editor_append_wrapped(&text, "the quick brown fox jumps", 10) >= 2);
    assert(strcmp(text.line[0], "the quick") == 0);
    assert(strchr(text.line[0], ' ') != 0);
    {
        int i;
        for (i = 0; i < text.count; i++) assert((int)strlen(text.line[i]) <= 10);
    }
    printf("  [OK] a long line breaks on a space\n");
}

static void a_newline_is_a_break_the_writer_meant(void)
{
    ui_editor_text text;
    ui_editor_text_init(&text);

    assert(ui_editor_append_wrapped(&text, "one\ntwo", 40) == 2);
    assert(strcmp(text.line[0], "one") == 0);
    assert(strcmp(text.line[1], "two") == 0);
    printf("  [OK] a newline is a break the writer meant\n");
}

static void a_word_longer_than_the_line_is_cut_not_lost(void)
{
    ui_editor_text text;
    ui_editor_text_init(&text);

    /* There is nowhere to break. Dropping it would lose a URL silently; the
       board's own fixed-width buffer cuts, so this cuts. */
    assert(ui_editor_append_wrapped(&text, "aaaaaaaaaaaaaaaaaaaa", 8) >= 2);
    assert((int)strlen(text.line[0]) == 8);
    printf("  [OK] a word longer than the line is cut, not lost\n");
}

static void wrapping_stops_at_the_buffer_end(void)
{
    ui_editor_text text;
    int i;
    ui_editor_text_init(&text);

    for (i = 0; i < UI_EDITOR_MAX_LINES + 20; i++)
        ui_editor_append_wrapped(&text, "x", 10);

    assert(text.count == UI_EDITOR_MAX_LINES);
    assert(ui_editor_append_wrapped(&text, "x", 10) == 0);
    printf("  [OK] wrapping stops at the buffer end rather than running over\n");
}

/* ------------------------------------------------------------------ entry */

static void a_bare_enter_ends_entry(void)
{
    ui_editor_text text;

    /* express.e:10184 - and the empty line is NOT kept. */
    assert(run("hello\r\rS\r", &text) == 1);
    assert(text.count == 1);
    assert(strcmp(text.line[0], "hello") == 0);
    printf("  [OK] a bare ENTER ends entry, and is not kept as a line\n");
}

static void several_lines_are_collected_in_order(void)
{
    ui_editor_text text;

    assert(run("one\rtwo\rthree\r\rS\r", &text) == 1);
    assert(text.count == 3);
    assert(strcmp(text.line[0], "one") == 0);
    assert(strcmp(text.line[2], "three") == 0);
    printf("  [OK] several lines are collected in order\n");
}

static void the_editor_flushes_before_it_blocks(void)
{
    ui_editor_text text;

    /* Without this the prompt sits in a buffer nobody sent and the door looks
       hung - the "pressing P did nothing" bug, ui_key.h. */
    flushes = 0;
    run("hi\r\rS\r", &text);
    assert(flushes > 0);
    printf("  [OK] the editor flushes before it blocks\n");
}

/* ------------------------------------------------------------------- menu */

static void save_and_abort_are_different_answers(void)
{
    ui_editor_text text;

    assert(run("hi\r\rS\r", &text) == 1);              /* express.e:10557 */
    /* express.e:10567 asks, and the default is NO. */
    assert(run("hi\r\rA\ry\r", &text) == 0);
    printf("  [OK] S saves and A aborts, and they are different answers\n");
}

static void a_refused_abort_goes_back_to_the_menu(void)
{
    ui_editor_text text;

    /* A>bort, then "n" - the caller changed their mind, so the message must
       still be there and S must still save it. */
    assert(run("hi\r\rA\rn\rS\r", &text) == 1);
    assert(text.count == 1);
    printf("  [OK] a refused abort goes back to the menu with the text intact\n");
}

static void the_text_survives_an_abort_so_a_door_can_offer_it_back(void)
{
    ui_editor_text text;

    assert(run("keepme\r\rA\ry\r", &text) == 0);
    assert(text.count == 1);
    assert(strcmp(text.line[0], "keepme") == 0);
    printf("  [OK] the text survives an abort\n");
}

static void delete_removes_the_line_the_caller_confirmed(void)
{
    ui_editor_text text;

    /* three lines, end, D, line 2, confirm yes, save */
    assert(run("one\rtwo\rthree\r\rD\r2\ry\rS\r", &text) == 1);
    assert(text.count == 2);
    assert(strcmp(text.line[0], "one") == 0);
    assert(strcmp(text.line[1], "three") == 0);
    printf("  [OK] D removes the confirmed line and closes the gap\n");
}

static void a_refused_delete_changes_nothing(void)
{
    ui_editor_text text;

    assert(run("one\rtwo\r\rD\r1\rn\rS\r", &text) == 1);
    assert(text.count == 2);
    assert(strcmp(text.line[0], "one") == 0);
    printf("  [OK] a refused delete changes nothing\n");
}

static void a_line_number_that_does_not_exist_is_asked_again(void)
{
    ui_editor_text text;

    /* express.e:10420 says so and re-asks rather than acting on it. */
    assert(run("one\r\rD\r9\r2\r\rS\r", &text) == 1);
    assert(text.count == 1);
    printf("  [OK] an impossible line number is refused, not obeyed\n");
}

static void edit_replaces_a_line(void)
{
    ui_editor_text text;

    /* E, line 1, then the pre-filled text is cleared with CTRL-U (\x15) and
       retyped. Pre-fill is express.e:10489 handing `temp` back to lineInput. */
    assert(run("one\rtwo\r\rE\r1\r\x15" "fixed\rS\r", &text) == 1);
    assert(text.count == 2);
    assert(strcmp(text.line[0], "fixed") == 0);
    assert(strcmp(text.line[1], "two") == 0);
    printf("  [OK] E replaces the line it was given\n");
}

static void continue_reopens_the_last_line(void)
{
    ui_editor_text text;

    /* express.e:10452 steps back one line and resumes entry there. */
    assert(run("one\rtwo\r\rC\rthree\r\rS\r", &text) == 1);
    assert(text.count == 2);
    assert(strcmp(text.line[0], "one") == 0);
    assert(strcmp(text.line[1], "three") == 0);
    printf("  [OK] C steps back into the last line and keeps typing\n");
}

static void an_unknown_letter_asks_again_rather_than_guessing(void)
{
    ui_editor_text text;

    assert(run("hi\r\rZ\rS\r", &text) == 1);
    assert(text.count == 1);
    printf("  [OK] an unknown letter asks again rather than guessing\n");
}

/* ---------------------------------------------------------------- carrier */

static void a_lost_caller_is_not_an_abort(void)
{
    ui_editor_text text;

    /* -1, never 0. A door must end the session on this, not return to a
       message list the caller cannot see. */
    assert(run("half a line and then silence", &text) == -1);
    printf("  [OK] a lost caller is -1, not an abort\n");
}

static void a_lost_caller_at_the_menu_is_still_minus_one(void)
{
    ui_editor_text text;

    assert(run("hi\r\r", &text) == -1);
    printf("  [OK] a lost caller at the menu is still -1\n");
}

/* ------------------------------------------------------------------ width */

static void the_line_width_is_the_boards_seventy_five(void)
{
    /* express.e:10077 `PROC edit(allowFullscreen=TRUE,maxLineLen=75,...)`.
       NOT 76 - that is editorMaxWidth at :10117, which belongs to the
       external full-screen door and would wrap a column wider. */
    assert(UI_EDITOR_WIDTH == 75);
    printf("  [OK] the line width is the board's 75, not the door's 76\n");
}

static void a_style_with_no_width_takes_the_boards(void)
{
    ui_editor_style st;
    ui_editor_style_init(&st);
    assert(st.width == UI_EDITOR_WIDTH);
    printf("  [OK] a style with no width takes the board's\n");
}

int main(void)
{
    printf("ui_editor\n");
    a_short_line_is_left_alone();
    a_long_line_breaks_on_a_space();
    a_newline_is_a_break_the_writer_meant();
    a_word_longer_than_the_line_is_cut_not_lost();
    wrapping_stops_at_the_buffer_end();
    a_bare_enter_ends_entry();
    several_lines_are_collected_in_order();
    the_editor_flushes_before_it_blocks();
    save_and_abort_are_different_answers();
    a_refused_abort_goes_back_to_the_menu();
    the_text_survives_an_abort_so_a_door_can_offer_it_back();
    delete_removes_the_line_the_caller_confirmed();
    a_refused_delete_changes_nothing();
    a_line_number_that_does_not_exist_is_asked_again();
    edit_replaces_a_line();
    continue_reopens_the_last_line();
    an_unknown_letter_asks_again_rather_than_guessing();
    a_lost_caller_is_not_an_abort();
    a_lost_caller_at_the_menu_is_still_minus_one();
    the_line_width_is_the_boards_seventy_five();
    a_style_with_no_width_takes_the_boards();
    printf("ui_editor: all passed\n");
    return 0;
}
