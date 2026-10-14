/*
 * usersettings.c - W, the caller's settings, as a C door on sdk/c.
 *
 * express.e internalCommandW (express.e:25712-26092) with every rule on
 * the board (AEW_USERFIELD, ae_userfield.h): this file draws, reads keys
 * and asks. Plus the settings hub: doors that declare SETTINGS=YES in
 * their .info are listed under Board settings; choosing one hands it back
 * as the return command and the board reopens W on the same row.
 *
 * Structure from examples/theme-picker/theme_picker.c. C89. ASCII only.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "aedoor.h"
#include "ae_session.h"
#include "ae_userfield.h"
#include "ui_ansi.h"
#include "ui_chrome.h"
#include "ui_input.h"
#include "ui_key.h"
#include "ui_list.h"
#include "ui_profile.h"
#include "ui_screen.h"
#include "ui_theme.h"
#include "us_model.h"

static char frame_buffer[16384];
static char session_storage[AE_SESSION_MIN_STORAGE];
static char theme_id[32];
static us_model model;
static ui_screen screen;
static ui_list list;
static ui_key_source keys;
static const ui_theme *theme;
static int pushback = -1;
static int message_lines = 0;     /* message rows that hold text: only those are ever cleared */

static int door_key(void *ctx) { (void)ctx; return ae_key(); }
static int door_pending(void *ctx) { (void)ctx; return ae_input_pending(); }
static void door_settle(void *ctx) { (void)ctx; ae_delay_ticks(2); }
static void door_flush(void *ctx) { (void)ctx; ui_screen_flush(&screen); }

static const char *row_text(void *ctx, int index) { (void)ctx; return us_row_text(&model, index); }

static int message_row(void) { return screen.rows - 1; }

/** Clear the message rows, then write `text` wrapped into them (refusals arrive in express.e's words). */
static void show_message(const char *text)
{
    char lines[3][81];
    int n, i, max = screen.profile.collapse_chrome ? 3 : 2;
    if (message_lines == 0 && (!text || !text[0])) return;   /* nothing on the glass, nothing to repaint */
    for (i = 0; i < max; i++) ansi_fill(&screen.buf, message_row() - (max - 1) + i, 1, screen.cols, UI_TOKEN(UI_T_INK), -1);
    message_lines = 0;
    if (!text || !text[0]) return;
    n = us_wrap(text, screen.cols - 2, lines, max);
    message_lines = n;
    ansi_color(&screen.buf, UI_TOKEN(UI_T_WARN), -1, 0);
    for (i = 0; i < n; i++) ansi_text(&screen.buf, message_row() - (n - 1) + i, 2, lines[i], screen.cols - 2);
}

static void draw_key_bar(void)
{
    char footer[160];
    const char *optional[1];
    optional[0] = "0-16: Jump";
    ui_footer_build(footer, sizeof(footer), screen.cols - 1, "Up/Down: Move  Enter: Change", optional,
                    screen.profile.collapse_chrome ? 0 : 1, "Q: Leave");
    if (screen.profile.collapse_chrome) {
        ansi_color(&screen.buf, UI_TOKEN(UI_T_DIM), -1, 0);
        ansi_text(&screen.buf, screen.rows, 1, footer, screen.cols - 1);
    } else {
        ui_bar_draw(&screen.buf, screen.rows, 1, screen.cols, footer, UI_TOKEN(UI_T_DIM), UI_TOKEN(UI_T_BAR));
    }
}

static void draw_full(void)
{
    ansi_clear(&screen.buf);
    message_lines = 0;
    ui_masthead_draw(&screen.buf, 1, 1, screen.cols, "USER CONFIGURATION",
                     screen.profile.collapse_chrome ? "" : theme->rail, UI_TOKEN(UI_T_ACCENT), UI_TOKEN(UI_T_GROUND));
    ui_list_draw(&list, &screen.buf);
    draw_key_bar();
    /* Leave the pen in the list's ink: the first keypress then opens with a row, not a colour change. */
    ansi_color(&screen.buf, UI_TOKEN(UI_T_INK), -1, 0);
}

/** Re-read one field from the board and repaint its row(s) only. */
static void refresh_field(int n)
{
    int r;
    if (ae_uf_get(n, &model.field[n]) < 0) return;
    r = us_row_of_field(&model, n);
    if (r < 0) return;
    ui_list_draw_row(&list, &screen.buf, r);
    if (model.stacked) ui_list_draw_row(&list, &screen.buf, r + 1);
}

/** Where the editor sits: exactly where the row draws the value (us_value_column, ruling C3). */
static void editor_style(ui_input_style *st, int r, int mask)
{
    ui_input_style_init(st);
    st->row = list.top + ((model.stacked ? r + 1 : r) - list.offset);
    st->left = us_value_column(&model);
    st->cols = screen.cols - st->left;     /* the last column stays free */
    st->fg = UI_TOKEN(UI_T_SELECTION_INK);
    st->bg = UI_TOKEN(UI_T_SELECTION_BG);
    st->ink = UI_TOKEN(UI_T_SELECTION_INK);
    st->mask = mask;
}

static int edit_text(const ae_uf_field *f, int r)
{
    char buf[104];
    ui_input_style st;
    ae_uf_answer a;
    int got;
    int cap = f->maxlen + 1 > (int)sizeof(buf) ? (int)sizeof(buf) : f->maxlen + 1;
    strncpy(buf, f->value, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';
    for (;;) {
        editor_style(&st, r, 0);
        got = ui_input(&screen.buf, &keys, &pushback, &st, "", buf, cap);
        if (got < 0) return -1;
        if (ae_uf_set(f->number, buf, &a) == AE_UF_GONE) return -1;
        show_message(a.outcome == AE_UF_REFUSED ? a.text : "");
        if (a.outcome == AE_UF_REFUSED && a.retry) continue;
        if (a.outcome == AE_UF_AGAIN) continue;
        return 0;
    }
}

static int edit_password(int r)
{
    char first[52], second[52];
    ui_input_style st;
    ae_uf_answer a;
    first[0] = second[0] = '\0';
    editor_style(&st, r, '*');
    if (ui_input(&screen.buf, &keys, &pushback, &st, model.stacked ? "" : "New:", first, 51) < 0) return -1;
    if (ui_input(&screen.buf, &keys, &pushback, &st, model.stacked ? "" : "Again:", second, 51) < 0) {
        memset(first, 0, sizeof(first));
        return -1;
    }
    ae_uf_password(first, second, &a);
    memset(first, 0, sizeof(first));
    memset(second, 0, sizeof(second));
    show_message(a.outcome == AE_UF_REFUSED ? a.text : (a.outcome == AE_UF_STORED ? "Password changed." : ""));
    return a.outcome == AE_UF_GONE ? -1 : 0;
}

/** express.e numberOfLinesTest (11299): the countdown, then the question. A transition: full redraw after. */
static int edit_lines(const ae_uf_field *f)
{
    char buf[8];
    ui_input_style st;
    ae_uf_answer a;
    int i;
    for (;;) {
        ansi_clear(&screen.buf);
        ui_screen_flush(&screen);
        for (i = 70; i >= 2; i--) { char line[8]; sprintf(line, " %d", i); ae_put(line, 1); }
        buf[0] = '\0';
        ui_input_style_init(&st);
        st.row = screen.rows; st.left = 1; st.cols = screen.cols;
        if (ui_input(&screen.buf, &keys, &pushback, &st, screen.cols >= 80 ? f->prompt : "Lines (0 = Auto):", buf, 4) < 0) return -1;
        if (ae_uf_set(f->number, buf, &a) == AE_UF_GONE) return -1;
        if (a.outcome != AE_UF_AGAIN) return 1;
    }
}

static char choice_titles[32][48];
static const char *choice_row(void *ctx, int index) { (void)ctx; return choice_titles[index]; }

/** A choice row's pick list, drawn where the main list is; Enter picks, Esc keeps. A transition: full redraw after. */
static int edit_choice(const ae_uf_field *f)
{
    ui_list pick;
    ae_uf_answer a;
    char number[8];
    int count = 0, key;
    while (count < 32 && ae_uf_choice(f->number, count, choice_titles[count], (int)sizeof(choice_titles[0])) > 0) count++;
    if (count == 0) return 1;                 /* express.e 26033/26040/26052: count()>0 */
    pick = list;
    pick.count = count;
    pick.selected = 0; pick.offset = 0; pick.drawn_selected = -1;
    pick.row = choice_row;
    pick.context = 0;
    ansi_clear(&screen.buf);
    ui_masthead_draw(&screen.buf, 1, 1, screen.cols, f->label, "", UI_TOKEN(UI_T_ACCENT), UI_TOKEN(UI_T_GROUND));
    draw_key_bar();
    for (;;) {
        ui_list_draw_changed(&pick, &screen.buf, 0);
        ui_screen_flush(&screen);
        key = ui_key_read(&keys, &pushback);
        if (key < 0) return -1;
        if (key == UI_KEY_UP) ui_list_move(&pick, -1);
        else if (key == UI_KEY_DOWN) ui_list_move(&pick, 1);
        else if (key == UI_KEY_ESC || key == 'q' || key == 'Q') return 1;
        else if (key == UI_KEY_ENTER) {
            sprintf(number, "%d", pick.selected + 1);       /* express.e numbers its lists from 1 */
            if (ae_uf_set(f->number, number, &a) == AE_UF_GONE) return -1;
            return 1;
        }
    }
}

static int cycle(const ae_uf_field *f)
{
    ae_uf_answer a;
    if (ae_uf_set(f->number, "", &a) == AE_UF_GONE) return -1;
    return 0;
}

int main(int argc, char **argv)
{
    ae_session session;
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    int running = 1, full = 1, n, d, jump_pending = -1, resume;
    const char *leave_for = 0;

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(&session, session_storage, (long)sizeof(session_storage), node) != 0) { ae_shutdown(); return 20; }

    switch (ae_uf_open()) {
        case 1: break;
        case AE_UF_SILENT:
            ae_put("This board cannot host the W door: it does not answer its settings command.", 1);
            /* fall through */
        default:                                  /* refused: the board has printed why */
            ae_close(&session);
            ae_shutdown();
            return 0;
    }

    ui_screen_open(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    ae_user_theme(&session, theme_id, (int)sizeof(theme_id));
    theme = ui_theme_by_id(theme_id);
    ansi_set_palette(&screen.buf, theme->rgb, theme->idx, UI_TOKEN_COUNT);

    for (n = 0; n < US_FIELDS; n++) if (ae_uf_get(n, &model.field[n]) < 0) running = 0;
    for (d = 0; d < US_MAX_DOORS && ae_uf_door_at(d, &model.door[d]) == 1; d++) {}
    model.door_count = d;
    us_model_layout(&model, screen.cols);

    keys.next = door_key; keys.pending = door_pending; keys.settle = door_settle;
    keys.idle = 0;                 /* no animation: a still masthead costs the board nothing */
    keys.flush = door_flush; keys.ctx = 0;

    ui_list_init(&list);
    list.top = screen.profile.collapse_chrome ? 2 : 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = screen.rows - list.top - (screen.profile.collapse_chrome ? 4 : 3);
    list.count = model.row_count;
    list.row = row_text;
    list.borders = 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT);
    list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);

    resume = ae_uf_resume_take();
    ui_list_select(&list, (resume >= 0 && us_row_selectable(&model, resume)) ? resume : us_first(&model));

    while (running && ae_carrier(&session)) {
        int key, r;
        const us_row *row;
        if (full) { draw_full(); full = 0; }
        else ui_list_draw_changed(&list, &screen.buf, 0);
        ui_screen_flush(&screen);

        key = ui_key_read(&keys, &pushback);
        if (key < 0) break;
        if (key >= '0' && key <= '9') {
            n = us_jump(&jump_pending, key);
            r = (n >= 0) ? us_row_of_field(&model, n) : -1;
            if (r >= 0) ui_list_select(&list, r);
            continue;
        }
        jump_pending = -1;
        r = list.selected;
        row = &model.row[r];
        switch (key) {
            case UI_KEY_UP:   ui_list_select(&list, us_step(&model, r, -1)); break;
            case UI_KEY_DOWN: ui_list_select(&list, us_step(&model, r, 1)); break;
            case UI_KEY_PGUP: ui_list_select(&list, us_step(&model, r, -ui_list_visible_rows(&list))); break;
            case UI_KEY_PGDN: ui_list_select(&list, us_step(&model, r, ui_list_visible_rows(&list))); break;
            case 'q': case 'Q': case UI_KEY_ESC: running = 0; break;
            case ' ': case UI_KEY_ENTER:
                if (row->kind == US_ROW_DOOR) {
                    if (key == ' ') break;
                    if (ae_uf_resume_arm(r) == 1) { leave_for = model.door[row->ref].command; running = 0; }
                    break;
                }
                if (row->kind != US_ROW_FIELD) break;
                {
                    const ae_uf_field *f = &model.field[row->ref];
                    int res = 0;
                    show_message("");
                    if (f->state != 'E') break;                    /* [DISABLED]: express.e JUMP cant */
                    if (key == ' ' && f->kind != 'Y') break;
                    switch (f->kind) {
                        case 'Y': res = cycle(f); break;
                        case 'T': case 'X': res = edit_text(f, r); break;
                        case 'P': res = edit_password(r); break;
                        case 'L': res = edit_lines(f); break;
                        case 'C': res = edit_choice(f); break;
                    }
                    if (res < 0) { running = 0; break; }
                    if (res > 0) { refresh_field(f->number); full = 1; break; }
                    refresh_field(f->number);
                }
                break;
            default: break;
        }
    }

    ui_screen_close(&screen);
    if (leave_for) ae_return_command(leave_for);
    ae_close(&session);
    ae_shutdown();
    return 0;
}
