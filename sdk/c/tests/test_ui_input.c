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
    src.idle = 0;                    /* and nothing to animate */
    src.flush = 0;
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

/**
 * The arrows a real board sends.
 *
 * AmiExpress converts cursor keys before a door is called - ESC[A/B/C/D
 * become 4, 5, 3 and 2 (express.e:7514-7528, ported in xim/io.ts) - and
 * JH_HK hands the door that one byte. The decoder read ESC sequences only,
 * so on a real board the arrow keys did nothing at all: THEMEC's list would
 * not move under them while this file's ESC cases passed (sysop,
 * 2026-09-06).
 */
static void the_function_keys_and_backtab_decode(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "\x1bOP\x1bOQ\x1bOR\x1bOS\x1b[Z\x85\x1b[15~\x1b[17~\x1b[18~\x86\x87\x1b[19~x"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    assert(ui_key_read(&src, &pushback) == UI_KEY_F1);
    assert(ui_key_read(&src, &pushback) == UI_KEY_F2);
    assert(ui_key_read(&src, &pushback) == UI_KEY_F3);
    assert(ui_key_read(&src, &pushback) == UI_KEY_F4);
    assert(ui_key_read(&src, &pushback) == UI_KEY_BACKTAB);
    assert(ui_key_read(&src, &pushback) == UI_KEY_F5);   /* the board's AE_KEY_F5 byte */
    assert(ui_key_read(&src, &pushback) == UI_KEY_F5);   /* ESC [ 1 5 ~ from a terminal: was HOME then '~' */
    assert(ui_key_read(&src, &pushback) == UI_KEY_F6);   /* ESC [ 1 7 ~ */
    assert(ui_key_read(&src, &pushback) == UI_KEY_F7);   /* ESC [ 1 8 ~ */
    assert(ui_key_read(&src, &pushback) == UI_KEY_F6);   /* the board's AE_KEY_F6 byte */
    assert(ui_key_read(&src, &pushback) == UI_KEY_F7);   /* the board's AE_KEY_F7 byte */
    assert(ui_key_read(&src, &pushback) == 0);           /* F8: read whole, not a key */
    assert(ui_key_read(&src, &pushback) == 'x');     /* nothing of a sequence leaks into the next key */
    printf("  [OK] F1-F7 (ESC O P..S, ESC [ 1 5/7/8 ~, board 0x85-0x87) and Shift-Tab (ESC [ Z) decode\n");
}

static void the_boards_own_arrow_codes_decode(void)
{
    typist t; ui_key_source src; int pushback = -1;
    /* 4 5 3 2 - up, down, right, left, as express.e numbers them. */
    t.keys = "\x04\x05\x03\x02"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    assert(ui_key_read(&src, &pushback) == UI_KEY_UP);
    assert(ui_key_read(&src, &pushback) == UI_KEY_DOWN);
    /* Left and right arrive as THEMSELVES now.
     *
     * They used to be decoded straight to PGDN/PGUP, because every widget
     * that read them wanted paging. A teletext reader wants the direction -
     * its arrows mean "the page before / after this one" - and a decoder
     * that has thrown the direction away cannot give it back. The widgets
     * that want paging map them at their own switch, so a list and the plain
     * reader page under left and right exactly as before; test_ui_doc pins
     * that half. */
    assert(ui_key_read(&src, &pushback) == UI_KEY_RIGHT);
    assert(ui_key_read(&src, &pushback) == UI_KEY_LEFT);
    printf("  [OK] the board's own arrow codes decode\n");
}

/* Home, End, Page Up, Page Down as the board delivers them: one converted byte each,
 * the same form as the arrows (xim/io-hotkey-tokens.ts NavigationKeyCodes). */
static void the_boards_own_page_and_home_codes_decode(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "\x1f\x19\x1c\x1d"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    assert(ui_key_read(&src, &pushback) == UI_KEY_PGUP);
    assert(ui_key_read(&src, &pushback) == UI_KEY_PGDN);
    assert(ui_key_read(&src, &pushback) == UI_KEY_HOME);
    assert(ui_key_read(&src, &pushback) == UI_KEY_END);
    printf("  [OK] the board's own page and home codes decode\n");
}

/**
 * And an ordinary key is still itself: the four codes are control bytes no
 * caller types, but CTRL-B and CTRL-E reach a door as 2 and 5, so this is
 * worth saying out loud - they are arrows here, deliberately, because that
 * is what the board means by them.
 */
static void an_ordinary_key_is_untouched(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "aQ1"; t.at = 0; t.overrun = 0;
    src = source_for(&t);

    assert(ui_key_read(&src, &pushback) == 'a');
    assert(ui_key_read(&src, &pushback) == 'Q');
    assert(ui_key_read(&src, &pushback) == '1');
    printf("  [OK] an ordinary key is untouched\n");
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

static void a_swedish_letter_is_kept(void)
{
    char buf[32];
    buf[0] = '\0';
    assert(run_input("G\xf6teborg\r", buf, (int)sizeof(buf), 0) == 1);
    assert(strcmp(buf, "G\xf6teborg") == 0);
    printf("  [OK] a latin1 letter typed into a prompt is kept\n");
}

static void a_masked_prompt_never_echoes_the_text(void)
{
    typist t; ui_key_source src; ansi_buf b; ui_input_style st;
    int pushback = -1;
    char buf[16];
    buf[0] = '\0';
    t.keys = "hunter2\r"; t.at = 0; t.overrun = 0;
    src = source_for(&t);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_input_style_init(&st);
    st.mask = '*';
    assert(ui_input(&b, &src, &pushback, &st, "Password:", buf, (int)sizeof(buf)) == 1);
    frame[b.len] = '\0';
    assert(strcmp(buf, "hunter2") == 0);
    assert(strstr(frame, "hunter") == 0);
    assert(strstr(frame, "*******") != 0);
    printf("  [OK] a masked prompt echoes the mask, never the text\n");
}

static void a_masked_prompt_stays_masked_through_edits(void)
{
    typist t; ui_key_source src; ansi_buf b; ui_input_style st;
    int pushback = -1;
    char buf[16];
    const char *hidden = "qjkzy";
    buf[0] = '\0';
    t.keys = "qjk\x7fz\x15yq\r"; t.at = 0; t.overrun = 0;
    src = source_for(&t);
    ansi_begin(&b, frame, (long)sizeof(frame));
    ui_input_style_init(&st);
    st.mask = '*';
    assert(ui_input(&b, &src, &pushback, &st, "Password:", buf, (int)sizeof(buf)) == 1);
    frame[b.len] = '\0';
    assert(strcmp(buf, "yq") == 0);
    for (; *hidden; hidden++) assert(strchr(frame, *hidden) == 0);
    printf("  [OK] a masked prompt shows no text after backspace or CTRL-U\n");
}

static void the_latin1_bounds_are_exact(void)
{
    char buf[8];
    buf[0] = '\0'; assert(run_input("\xa0\r", buf, (int)sizeof(buf), 0) == 1 && (unsigned char)buf[0] == 0xA0);
    buf[0] = '\0'; assert(run_input("\xff\r", buf, (int)sizeof(buf), 0) == 1 && (unsigned char)buf[0] == 0xFF);
    buf[0] = '\0'; assert(run_input("\x9f\r", buf, (int)sizeof(buf), 0) == 0 && buf[0] == '\0');
    printf("  [OK] latin1 0xA0 and 0xFF are accepted, the C1 control 0x9F is not\n");
}

/* B3: the per-key line core - cursor, Home/End, Delete, and the Up/Down history ring with draft recall. */
/* K19: the board's Delete and Shift+cursor bytes, and the xterm spellings a
 * door driven straight from a terminal sees. ESC [ 1 ; 2 D used to decode as
 * HOME (the ';' taken for the tilde) and leave "2D" behind as typing. */
static void delete_and_shift_keys_decode(void)
{
    typist t; ui_key_source src; int pushback = -1;
    t.keys = "\x80\x81\x82\x83\x84\x1b[1;2D\x1b[1;2C\x1b[1;2H\x1b[1;2F\x1b[1;5Cz";
    t.at = 0; t.overrun = 0;
    src = source_for(&t);
    assert(ui_key_read(&src, &pushback) == UI_KEY_DELETE);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_LEFT);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_RIGHT);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_HOME);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_END);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_LEFT);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_RIGHT);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_HOME);
    assert(ui_key_read(&src, &pushback) == UI_KEY_SHIFT_END);
    assert(ui_key_read(&src, &pushback) == UI_KEY_RIGHT);   /* Ctrl+Right: the plain key */
    assert(ui_key_read(&src, &pushback) == 'z');            /* nothing of the tail leaks */
    printf("  [OK] Delete and Shift+cursor keys decode\n");
}

static void sel(char *buf, int *len, int *cur, int *anchor, int key)
{
    ui_line_sel_key(buf, 32, len, cur, anchor, key, 0, 0);
}

static void a_selection_is_extended_replaced_and_deleted(void)
{
    char buf[32] = "";
    int len = 0, cur = 0, anchor = -1, i;
    const char *typed = "hello world";
    for (i = 0; typed[i]; i++) sel(buf, &len, &cur, &anchor, typed[i]);
    assert(anchor == -1);
    /* Shift+Left x5 selects "world"; typing replaces it. */
    for (i = 0; i < 5; i++) sel(buf, &len, &cur, &anchor, UI_KEY_SHIFT_LEFT);
    assert(anchor == 11 && cur == 6);
    sel(buf, &len, &cur, &anchor, 'X');
    assert(strcmp(buf, "hello X") == 0 && cur == 7 && len == 7 && anchor == -1);
    /* Shift+Home then Backspace removes all of it. */
    sel(buf, &len, &cur, &anchor, UI_KEY_SHIFT_HOME);
    assert(anchor == 7 && cur == 0);
    sel(buf, &len, &cur, &anchor, 8);
    assert(buf[0] == '\0' && len == 0 && cur == 0 && anchor == -1);
    /* Shift+End then Delete; a plain arrow drops the selection. */
    for (i = 0; typed[i]; i++) sel(buf, &len, &cur, &anchor, typed[i]);
    sel(buf, &len, &cur, &anchor, UI_KEY_HOME);
    sel(buf, &len, &cur, &anchor, UI_KEY_SHIFT_RIGHT);
    sel(buf, &len, &cur, &anchor, UI_KEY_RIGHT);
    assert(anchor == -1 && cur == 2);
    sel(buf, &len, &cur, &anchor, UI_KEY_SHIFT_END);
    sel(buf, &len, &cur, &anchor, UI_KEY_DELETE);
    assert(strcmp(buf, "he") == 0 && cur == 2 && anchor == -1);
    /* Selecting back to the anchor leaves no selection. */
    sel(buf, &len, &cur, &anchor, UI_KEY_SHIFT_LEFT);
    sel(buf, &len, &cur, &anchor, UI_KEY_SHIFT_RIGHT);
    assert(anchor == -1);
    /* Without an anchor the Shift keys are plain moves. */
    ui_line_key(buf, 32, &len, &cur, UI_KEY_SHIFT_HOME, 0, 0);
    assert(cur == 0 && strcmp(buf, "he") == 0);
    printf("  [OK] a selection is extended, replaced and deleted\n");
}

static void the_line_core_edits_at_the_cursor_and_recalls_history(void)
{
    char buf[32] = "";
    int len = 0, cur = 0, i;
    ui_hist h;
    const char *typed = "abc";
    ui_hist_init(&h);
    for (i = 0; typed[i]; i++) ui_line_key(buf, 32, &len, &cur, typed[i], &h, 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_LEFT, &h, 0);
    ui_line_key(buf, 32, &len, &cur, 'X', &h, 0);
    assert(strcmp(buf, "abXc") == 0 && cur == 3);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_HOME, &h, 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_DELETE, &h, 0);
    assert(strcmp(buf, "bXc") == 0 && cur == 0 && len == 3);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_END, &h, 0);
    assert(cur == 3);
    ui_hist_add(&h, "one");
    ui_hist_add(&h, "two");
    ui_line_key(buf, 32, &len, &cur, UI_KEY_UP, &h, 0);
    assert(strcmp(buf, "two") == 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_UP, &h, 0);
    assert(strcmp(buf, "one") == 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_DOWN, &h, 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_DOWN, &h, 0);
    assert(strcmp(buf, "bXc") == 0 && cur == len);                 /* the draft comes back */
    printf("  [OK] the line core edits at the cursor, deletes forward and recalls history with the draft\n");
}

/* TS input-history.ts: entries carry message ids; a recalled entry is the one being edited; the
   clientId is renamed to the server id on the ack; Down past the newest drops the edit. */
static void history_entries_carry_ids_for_editing_and_rekey(void)
{
    char buf[32] = "";
    int len = 0, cur = 0;
    ui_hist h;
    ui_hist_init(&h);
    assert(ui_hist_last_id(&h) == 0);
    ui_hist_add_id(&h, "abcdefgh-1", "first");
    ui_hist_add(&h, "no id");
    ui_hist_add_id(&h, "abcdefgh-2", "second");
    assert(strcmp(ui_hist_last_id(&h), "abcdefgh-2") == 0);
    assert(ui_hist_editing(&h) == 0);
    ui_line_key(buf, 32, &len, &cur, 'x', &h, 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_UP, &h, 0);
    assert(strcmp(buf, "second") == 0 && strcmp(ui_hist_editing(&h), "abcdefgh-2") == 0);
    ui_hist_rekey(&h, "abcdefgh-2", "m9");
    assert(strcmp(ui_hist_editing(&h), "m9") == 0 && strcmp(ui_hist_last_id(&h), "m9") == 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_UP, &h, 0);
    assert(strcmp(buf, "no id") == 0 && ui_hist_editing(&h) == 0);  /* an id-less entry is not an edit */
    ui_line_key(buf, 32, &len, &cur, UI_KEY_UP, &h, 0);
    assert(strcmp(ui_hist_editing(&h), "abcdefgh-1") == 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_DOWN, &h, 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_DOWN, &h, 0);
    ui_line_key(buf, 32, &len, &cur, UI_KEY_DOWN, &h, 0);
    assert(strcmp(buf, "x") == 0 && ui_hist_editing(&h) == 0);     /* back to the draft: no edit */
    printf("  [OK] history entries carry ids: recall edits, the ack rekeys, the draft drops the edit\n");
}

int main(void)
{
    printf("ui_input\n");
    an_ordinary_key_is_itself();
    both_line_endings_mean_enter();
    the_arrows_decode();
    the_function_keys_and_backtab_decode();
    the_boards_own_arrow_codes_decode();
    the_boards_own_page_and_home_codes_decode();
    an_ordinary_key_is_untouched();
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
    a_swedish_letter_is_kept();
    the_line_core_edits_at_the_cursor_and_recalls_history();
    history_entries_carry_ids_for_editing_and_rekey();
    a_masked_prompt_never_echoes_the_text();
    a_masked_prompt_stays_masked_through_edits();
    the_latin1_bounds_are_exact();
    delete_and_shift_keys_decode();
    a_selection_is_extended_replaced_and_deleted();
    printf("ui_input: all passed\n");
    return 0;
}
