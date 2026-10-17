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
#include "ui_pages.h"
#include "ae_menu.h"
#include "ae_board_screen.h"
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

/* Cover flow (the caller's menu style, ae_menu_style_get effective): one header run per page, the list showing
   only that run. page_first is the model row of the list's index 0; 0 outside cover flow, so there the list
   index IS the model row. */
static int coverflow;
static int page_first;
static ui_pages pages;
static int at(int index) { return index + page_first; }        /* list index to model row */
static int view(int row) { return row - page_first; }          /* model row to list index */

static int door_key(void *ctx) { (void)ctx; return ae_key(); }
static int door_pending(void *ctx) { (void)ctx; return ae_input_pending(); }
static void door_settle(void *ctx) { (void)ctx; ae_delay_ticks(2); }
static void door_flush(void *ctx) { (void)ctx; ui_screen_flush(&screen); }

static const char *row_text(void *ctx, int index) { (void)ctx; return us_row_text(&model, at(index)); }

/* The board's ground, painted under everything. A C64 cell cannot carry a background (the screen is
   black), so there the ground stays the terminal's own. */
static int ground(void) { return screen.profile.cell_backgrounds ? UI_TOKEN(UI_T_GROUND) : -1; }

/** Pen back to primary ink on the ground: what every draw leaves behind. */
static void pen_ink(void) { ansi_color(&screen.buf, UI_TOKEN(UI_T_INK), ground(), 0); }

static void clear_screen(void) { ansi_clear_ground(&screen.buf, UI_TOKEN(UI_T_INK), ground()); }

/* Token map: headings accent, labels ink, values accent-alt (stacked: the value line). */
static int row_style(void *ctx, int index, int *head, int *tail)
{
    (void)ctx;
    index = at(index);
    *head = *tail = UI_TOKEN(UI_T_INK);
    switch (model.row[index].kind) {
        case US_ROW_HEADER: *head = UI_TOKEN(UI_T_ACCENT); return 0;
        case US_ROW_VALUE:  *head = UI_TOKEN(UI_T_ACCENT_ALT); return 0;
        case US_ROW_FIELD: case US_ROW_DOOR: *tail = UI_TOKEN(UI_T_ACCENT_ALT); return us_row_split(&model, index);
        default: return 0;
    }
}

/* ------------------------------------------------------------- masthead rail

   The rail slides while the door waits for a key: the same idle hook SUBS, ACHIEVE and
   THEMEC use (ui_key.h), the same two constants for speed (ui_chrome.h). The tick is
   skipped while the caller TYPES (SUBS' caller_is_typing): the flush would leave the
   terminal cursor in the banner between keystrokes. */
static int rail_tick;
static const char *masthead_title = "USER CONFIGURATION";
static int caller_is_typing;

static void draw_masthead(const char *title)
{
    masthead_title = title;
    ui_masthead_draw_tick(&screen.buf, 1, 1, screen.cols, title,
                          screen.profile.collapse_chrome ? "" : theme->rail,
                          UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), rail_tick);
}

static void door_idle(void *ctx)
{
    (void)ctx;
    if (caller_is_typing || screen.profile.collapse_chrome || !ui_masthead_rail_animates(theme->rail)) {
        ae_delay_ticks(caller_is_typing ? 1 : UI_RAIL_TICK_DELAY);   /* still yield: one thread on a 68K */
        return;
    }
    rail_tick += UI_RAIL_STEP;
    ui_masthead_rail_tick(&screen.buf, 1, 1, screen.cols, masthead_title, theme->rail,
                          UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), rail_tick);
    ui_screen_flush(&screen);
    ae_delay_ticks(UI_RAIL_TICK_DELAY);
}

static int message_row(void) { return screen.rows - 1; }

/** Message rows above the key bar: three where the chrome is collapsed, two otherwise. */
static int message_rows(void) { return screen.profile.collapse_chrome ? 3 : 2; }

/**
 * Clear the message rows, then write `text` wrapped into them (refusals arrive in express.e's words).
 * It wraps at us_message_width and draws from column 1 at that same width, so what was wrapped is
 * what is drawn. Only rows that hold text are ever cleared (doors draw smart).
 */
static void show_message(const char *text, int token)
{
    char lines[4][81];
    int n, i, max = message_rows();
    if (message_lines == 0 && (!text || !text[0])) return;   /* nothing on the glass, nothing to repaint */
    for (i = 0; i < max; i++) ansi_fill(&screen.buf, message_row() - (max - 1) + i, 1, screen.cols, UI_TOKEN(UI_T_INK), ground());
    message_lines = 0;
    if (!text || !text[0]) return;
    n = us_wrap(text, us_message_width(screen.cols), lines, max);
    message_lines = n;
    ansi_color(&screen.buf, token, ground(), 0);
    for (i = 0; i < n; i++) ansi_text(&screen.buf, message_row() - (n - 1) + i, 1, lines[i], us_message_width(screen.cols));
    pen_ink();
}

static void draw_key_bar(const char *primary, const char *last, int jump)
{
    char footer[160], ind[UI_PAGES_INDICATOR_MAX];
    const char *optional[1];
    int n = coverflow ? ui_pages_indicator(&pages, ind, (int)sizeof ind) : 0;
    optional[0] = "0-16: Jump";
    ui_footer_build(footer, sizeof(footer), screen.cols - 1 - (n ? n + 1 : 0), primary, optional,
                    (jump && !screen.profile.collapse_chrome) ? 1 : 0, last);
    if (screen.profile.collapse_chrome) {
        ansi_color(&screen.buf, UI_TOKEN(UI_T_DIM), ground(), 0);
        ansi_text(&screen.buf, screen.rows, 1, footer, screen.cols - 1);
    } else {
        ui_bar_draw(&screen.buf, screen.rows, 1, screen.cols, footer, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
    }
    /* The page indicator, right-aligned where ui_pages_hit looks for it (pages.cols, the last cell left free). */
    if (n) {
        if (screen.profile.collapse_chrome) ansi_color(&screen.buf, UI_TOKEN(UI_T_DIM), ground(), 0);
        else ansi_color(&screen.buf, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), 0);
        ansi_text(&screen.buf, screen.rows, pages.cols - n + 1, ind, n);
    }
}

static void draw_full(void)
{
    clear_screen();
    message_lines = 0;
    draw_masthead("USER CONFIGURATION");
    ui_list_draw(&list, &screen.buf);
    draw_key_bar(coverflow ? "Up/Down: Move  Left/Right: Page  Enter: Change" : "Up/Down: Move  Enter: Change", "Q: Leave", 1);
    /* Leave the pen in the list's ink: the first keypress then opens with a row, not a colour change. */
    pen_ink();
}

/** Re-read one field from the board and repaint its row(s) only. */
static void refresh_field(int n)
{
    int r;
    if (ae_uf_get(n, &model.field[n]) < 0) return;
    r = view(us_row_of_field(&model, n));
    if (r < 0 || r >= list.count || us_row_of_field(&model, n) < 0) return;    /* not on the page shown */
    ui_list_draw_row(&list, &screen.buf, r);
    if (model.stacked) ui_list_draw_row(&list, &screen.buf, r + 1);
}

/* ------------------------------------------------------------- cover flow pages */

/** Make `page` the list's content: its header run, from list index 0. */
static void show_page(int page)
{
    int first = 0, last = model.row_count - 1;
    if (coverflow && us_page_rows(&model, page, &first, &last)) pages.current = page;
    page_first = coverflow ? first : 0;
    list.count = last - first + 1;
    list.offset = 0;
}

static const char *page_title(void *ctx, int page) { (void)ctx; return us_page_title(&model, page); }

static void page_show(void *ctx, int page)
{
    int first, last, r;
    (void)ctx;
    show_page(page);
    us_page_rows(&model, page, &first, &last);
    r = us_step(&model, first, 1);                     /* the first row to select: past the header */
    ui_list_select(&list, view(r >= first && r <= last ? r : first));
}

static void page_fixed(void *ctx, int sliding)
{
    (void)ctx; (void)sliding;
    show_message("", UI_TOKEN(UI_T_INK));        /* a message belongs to the page it was said on */
    draw_key_bar("Up/Down: Move  Left/Right: Page  Enter: Change", "Q: Leave", 1);
    pen_ink();
}

static void page_region(void *ctx) { (void)ctx; ui_list_draw(&list, &screen.buf); pen_ink(); }

static void page_finish(void *ctx, int captured)
{
    (void)ctx;
    if (captured) ae_bs_wipe_end();
    ui_screen_flush(&screen);
}

/** Select model row `r`, turning to its page first in cover flow. 1 when the page changed (repaint all). */
static int select_row(int r)
{
    int turned = 0;
    if (r < 0) return 0;
    if (coverflow && us_page_of_row(&model, r) != pages.current) { show_page(us_page_of_row(&model, r)); turned = 1; }
    ui_list_select(&list, view(r));
    return turned;
}

/** us_step that stays on the page shown in cover flow. */
static int step_on_page(int r, int delta)
{
    int s = us_step(&model, r, delta), first, last;
    if (!coverflow || !us_page_rows(&model, pages.current, &first, &last)) return s;
    return (s >= first && s <= last) ? s : r;
}

/** Where the editor sits: its text lands exactly where the row draws the value (us_editor_left, ruling C3). */
static void editor_style(ui_input_style *st, int r, int mask)
{
    ui_input_style_init(st);
    st->row = list.top + ((model.stacked ? r + 1 : r) - page_first - list.offset);   /* follow_extra keeps r+1 in the window */
    st->left = us_editor_left(&model);
    st->cols = screen.cols - st->left - 1;     /* the scroll bar's column stays the list's */
    st->fg = UI_TOKEN(UI_T_SELECTION_INK);
    st->bg = UI_TOKEN(UI_T_SELECTION_BG);
    st->ink = UI_TOKEN(UI_T_SELECTION_INK);
    st->mask = mask;
}

static int is_name_row(int n) { return n == 0 || n == 2 || n == 3; }

static int edit_text(const ae_uf_field *f, int r)
{
    char buf[104];
    ui_input_style st;
    ae_uf_answer a;
    int got;
    int cap = f->maxlen + 1 > (int)sizeof(buf) ? (int)sizeof(buf) : f->maxlen + 1;
    strncpy(buf, f->value, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';
    show_message(f->prompt, UI_TOKEN(UI_T_DIM));            /* express.e's own question, while the editor is open */
    for (;;) {
        editor_style(&st, r, 0);
        caller_is_typing = 1;
        got = ui_input(&screen.buf, &keys, &pushback, &st, "", buf, cap);
        caller_is_typing = 0;
        if (got < 0) return -1;
        if (is_name_row(f->number) && buf[0]) {
            /* WEB_: express.e 25914/25947/25969 prints this between its checks; the board answers once, so it is shown before the SET. */
            show_message("Checking for duplicate name...", UI_TOKEN(UI_T_DIM));
            ui_screen_flush(&screen);
        }
        if (ae_uf_set(f->number, buf, &a) == AE_UF_GONE) return -1;
        if (a.outcome == AE_UF_REFUSED) {
            show_message(a.text, UI_TOKEN(UI_T_ALERT));
            if (a.retry) continue;
            return 0;
        }
        if (a.outcome == AE_UF_AGAIN) continue;
        /* express.e 25928/25957/25978 prints "Ok!" after a stored name. */
        if (a.outcome == AE_UF_STORED && is_name_row(f->number)) show_message("Ok!", UI_TOKEN(UI_T_OK));
        else show_message("", UI_TOKEN(UI_T_INK));
        return 0;
    }
}

/** express.e 26004-26010: getPass2 twice; an empty entry in either is the silent cant. */
static int edit_password(int r)
{
    char first[52], second[52];
    ui_input_style st;
    ae_uf_answer a;
    int got;
    first[0] = second[0] = '\0';
    editor_style(&st, r, '*');
    show_message("Enter New Password: ", UI_TOKEN(UI_T_DIM));   /* the two entries must be told apart at 40 */
    /* The board's keystroke traces withhold what is typed while this is on; every way out below turns it off. */
    ae_uf_secret(1);
    caller_is_typing = 1;
    got = ui_input(&screen.buf, &keys, &pushback, &st, "", first, 51);
    caller_is_typing = 0;
    if (got < 0) { ae_uf_secret(0); memset(first, 0, sizeof(first)); return -1; }
    if (got == 0) { ae_uf_secret(0); show_message("", UI_TOKEN(UI_T_INK)); return 0; }
    show_message("Reenter New Password: ", UI_TOKEN(UI_T_DIM));
    caller_is_typing = 1;
    got = ui_input(&screen.buf, &keys, &pushback, &st, "", second, 51);
    caller_is_typing = 0;
    if (got < 0) { ae_uf_secret(0); memset(first, 0, sizeof(first)); memset(second, 0, sizeof(second)); return -1; }
    ae_uf_secret(0);
    if (got == 0) { memset(first, 0, sizeof(first)); show_message("", UI_TOKEN(UI_T_INK)); return 0; }
    ae_uf_password(first, second, &a);
    memset(first, 0, sizeof(first));
    memset(second, 0, sizeof(second));
    /* express.e 26024-26026 prints nothing on success. */
    show_message(a.outcome == AE_UF_REFUSED ? a.text : "", UI_TOKEN(UI_T_ALERT));
    return a.outcome == AE_UF_GONE ? -1 : 0;
}

static ae_session *door_session;

/**
 * express.e numberOfLinesTest (11299-11318): " n" and a line break for 70 down to 2, then
 * "\b\n" and the question - ONE write, so the prompt is the line after the countdown wherever
 * the terminal ends, and the top number is the screen's. The answer is read inline (ae_get) at
 * the cursor, with no absolute row. A transition: full redraw after.
 */
static char countdown[512];

static int edit_lines(const ae_uf_field *f)
{
    char buf[8];
    ae_uf_answer a;
    int i, at;
    for (;;) {
        clear_screen();
        ui_screen_flush(&screen);
        at = 0;
        for (i = 70; i >= 2; i--) at += sprintf(countdown + at, " %d\r\n", i);
        strcpy(countdown + at, "\r\n");
        at += 2;
        /* WEB_: express.e 11307's 69-character question does not fit 40 columns; the short form asks the same thing. */
        strcpy(countdown + at, screen.cols >= 80 ? f->prompt : "Lines (0 = Auto): ");
        ae_put(countdown, 0);
        buf[0] = '\0';
        ae_get(buf, 4);
        if (!ae_carrier(door_session)) return -1;
        if (ae_uf_set(f->number, buf, &a) == AE_UF_GONE) return -1;
        if (a.outcome != AE_UF_AGAIN) return 1;
    }
}

static char choice_titles[32][48];
static const char *choice_row(void *ctx, int index) { (void)ctx; return choice_titles[index]; }

/**
 * A choice row's pick list, drawn where the main list is, opened on the current value;
 * Enter picks, Esc keeps it. A transition: full redraw after.
 * WEB_: express.e 11319-11389 prints a numbered list and asks "Choose ... :"; the door shows
 * a list the caller moves in instead. The board still receives express.e's number (from 1).
 */
static int edit_choice(const ae_uf_field *f)
{
    ui_list pick;
    ae_uf_answer a;
    char number[8];
    int count = 0, key, current = 0, i;
    while (count < 32 && ae_uf_choice(f->number, count, choice_titles[count], (int)sizeof(choice_titles[0])) > 0) count++;
    if (count == 0) return 1;                 /* express.e 26033/26040/26052: count()>0 */
    for (i = 0; i < count; i++) if (strcmp(choice_titles[i], f->value) == 0) current = i;
    pick = list;
    pick.count = count;
    pick.offset = 0; pick.drawn_selected = -1;
    pick.page_follow = 0; pick.follow_extra = 0;
    pick.row = choice_row;
    pick.style = 0;
    pick.context = 0;
    ui_list_select(&pick, current);
    clear_screen();
    message_lines = 0;
    draw_masthead(f->label);
    draw_key_bar("Up/Down: Move  Enter: Pick", "Esc: Keep", 0);
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
    char stored[AE_MENU_STYLE_CAP], effective[AE_MENU_STYLE_CAP];
    ae_session session;
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    int running = 1, full = 1, n, d, jump_pending = -1, resume, slide = 1;
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

    door_session = &session;
    ui_screen_open(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    ae_user_theme(&session, theme_id, (int)sizeof(theme_id));
    theme = ui_theme_by_id(theme_id);
    ansi_set_palette(&screen.buf, theme->rgb, theme->idx, UI_TOKEN_COUNT);

    for (n = 0; n < US_FIELDS; n++) if (ae_uf_get(n, &model.field[n]) < 0) running = 0;
    for (d = 0; d < US_MAX_DOORS && ae_uf_door_at(d, &model.door[d]) == 1; d++) {}
    model.door_count = d;
    us_model_layout(&model, screen.cols);

    keys.next = door_key; keys.pending = door_pending; keys.settle = door_settle;
    keys.idle = door_idle;
    keys.flush = door_flush; keys.ctx = 0;

    ui_list_init(&list);
    list.top = screen.profile.collapse_chrome ? 2 : 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = screen.rows - list.top - (screen.profile.collapse_chrome ? 4 : 3);
    list.count = model.row_count;
    list.row = row_text;
    list.borders = 0;
    list.page_follow = 1;                 /* one box per page, not one per row past the edge */
    list.follow_extra = model.stacked ? 1 : 0;   /* the value line stays in the window with its label */
    list.caret = ">>";
    list.caret_bar = 1;                   /* the selected row is one bar, caret included */
    list.style = row_style;
    list.ground = ground();
    list.chrome = UI_TOKEN(UI_T_CHROME);
    list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);

    /* Cover flow only when the caller's menu style says so and there is more than one page; else today's list. */
    coverflow = ae_menu_style_query(stored, effective, &slide) == 1 && strcmp(effective, "coverflow") == 0 && us_page_count(&model) > 1;
    if (coverflow) {
        ui_pages_init(&pages, us_page_count(&model), 0, 0);
        pages.slide = slide;                          /* the sysop's setting; the board answers 0 at 40 columns and PETSCII */
        pages.cols = screen.cols - 1;
        pages.top = list.top;
        pages.height = list.height;
        pages.status_row = screen.rows;
        pages.title = page_title;
        pages.show = page_show;
        pages.draw_fixed = page_fixed;
        pages.draw_region = page_region;
        pages.finish = page_finish;
        ae_bs_mouse(1);
    }

    resume = ae_uf_resume_take();
    show_page(0);
    select_row((resume >= 0 && us_row_selectable(&model, resume)) ? resume : us_first(&model));

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
            if (select_row(r)) full = 1;
            continue;
        }
        jump_pending = -1;
        r = at(list.selected);
        row = &model.row[r];
        if (coverflow && key == UI_KEY_MOUSE) {
            ae_mouse_event evs[8];
            int i, hit, got = ae_bs_mouse_drain(evs, 8);
            if (got < 0) break;
            for (i = 0; i < got; i++) {
                if (evs[i].kind == 'U') ui_pages_turn(&pages, -1);
                else if (evs[i].kind == 'D') ui_pages_turn(&pages, 1);
                else if (evs[i].kind == 'P' && (hit = ui_pages_hit(&pages, evs[i].row, evs[i].col)) != 0) ui_pages_turn(&pages, hit);
            }
            continue;
        }
        if (coverflow && (n = ui_pages_step(&pages, key, 0, 1)) != 0) { ui_pages_turn(&pages, n); continue; }
        switch (key) {
            case UI_KEY_UP:   ui_list_select(&list, view(step_on_page(r, -1))); break;
            case UI_KEY_DOWN: ui_list_select(&list, view(step_on_page(r, 1))); break;
            case UI_KEY_PGUP: ui_list_select(&list, view(us_step(&model, r, -ui_list_visible_rows(&list)))); break;
            case UI_KEY_PGDN: ui_list_select(&list, view(us_step(&model, r, ui_list_visible_rows(&list)))); break;
            case 'q': case 'Q': case UI_KEY_ESC: running = 0; break;
            case ' ': case UI_KEY_ENTER:
                if (row->kind == US_ROW_DOOR) {
                    if (key == ' ') break;
                    {
                           int armed = ae_uf_resume_arm(r);
                           if (armed == 1) { leave_for = model.door[row->ref].command; running = 0; }
                           else if (armed < 0) running = 0;
                           else show_message("That setting cannot be opened right now.", UI_TOKEN(UI_T_WARN));
                       }
                    break;
                }
                if (row->kind != US_ROW_FIELD) break;
                {
                    const ae_uf_field *f = &model.field[row->ref];
                    int res = 0;
                    show_message("", UI_TOKEN(UI_T_INK));
                    if (f->state != 'E') break;                    /* [DISABLED]: express.e JUMP cant */
                    if (key == ' ' && f->kind != 'Y') break;
                    switch (f->kind) {
                        case 'Y': res = cycle(f); break;
                        case 'T': res = edit_text(f, r); break;
                           case 'X':
                               /* WEB_: express.e 11391-11425 lists the language libraries; this board has none, and
                                  its own text for that case is: */
                               show_message("Languages list unavailable", UI_TOKEN(UI_T_WARN));
                               break;
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

    if (coverflow) ae_bs_mouse(0);
    ui_screen_close(&screen);
    if (leave_for) ae_return_command(leave_for);
    ae_close(&session);
    ae_shutdown();
    return 0;
}
