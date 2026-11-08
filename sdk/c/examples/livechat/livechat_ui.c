/* livechat_ui.c - draws the LIVECHAT68 frame from an lc_model (see livechat_ui.h). */
#include <stdio.h>
#include <string.h>

#include "livechat_ui.h"

#define MENU_TEXT " Chat v3.2.0   Tools   View   Help  "
#define MENU_TEXT_COLS 36
#define MASTHEAD "LIVE CHAT"

/* Column of each menu label in MENU_TEXT; the dropdown opens one column left of it. */
static const int menu_col[LC_MENUS] = { 1, 15, 23, 30 };

const char *const lc_menu_label[LC_MENUS] = { "Chat v3.2.0", "Tools", "View", "Help" };
static const char *const menu_chat[] = { "Help (F1)", "Channel List (F2)", "Next Channel (F3)", "Join Channel...", "Leave Channel" };
static const char *const menu_tools[] = { "Emoji (F4)", "Files (F6)", "Pins (F7)", "Search (Ctrl+F)", "Threads" };
static const char *const menu_view[] = { "Settings (Ctrl+S)", "Theme", "Cycle Render Mode (r)", "Fullscreen / Grid", "Toggle Sidebar", "Clear Chat" };
static const char *const menu_help[] = { "About", "Keyboard Shortcuts", "Quit (Ctrl+Q)" };
const int lc_menu_count[LC_MENUS] = { 5, 5, 6, 3 };
const char *const *const lc_menu_items[LC_MENUS] = { menu_chat, menu_tools, menu_view, menu_help };

/* The TS door's help (board/Doors/livechat help content), voice section left out: this door has no voice. */
const char *const lc_help_text[] = {
    "=== LIVECHAT v3.0 - DESKTOP-LEVEL BBS CHAT ===",
    "A full-featured multi-user chat system with neo-blessed UI",
    "",
    "--- KEYBOARD SHORTCUTS ---",
    "Navigation:",
    "  Tab              Next channel",
    "  Shift+Tab        Previous channel",
    "  PageUp           Scroll chat up",
    "  PageDown         Scroll chat down",
    "  Escape           Close dialogs / Return to input",
    "Chat:",
    "  Enter            Send message",
    "  Ctrl+N           New message prompt",
    "  Ctrl+R           Room menu (join room)",
    "  Ctrl+S           Open settings",
    "  F1               Show this help",
    "Window Controls:",
    "  F2               Toggle sidebar visibility",
    "  F3               Switch sidebar tab (Channels/Users)",
    "  F4 / Ctrl+E      Open emoji picker",
    "  F5               Format selected text (colors/effects)",
    "  F6               File sharing browser",
    "  Tab              Cycle focus between panels",
    "  Ctrl+C/Q         Quit (with confirmation)",
    "Text Formatting:",
    "  Shift+Arrow      Select text in input box",
    "  F5               Open format picker (with text selected)",
    "  Right-click      Open format picker (with text selected)",
    "",
    "--- COMMANDS ---",
    "Room Commands:",
    "  /join <room>     Join a channel",
    "  /leave           Leave current channel",
    "  /create <name>   Create new channel",
    "  /topic <text>    Set channel topic",
    "  /rooms           List all rooms",
    "User Commands:",
    "  /who             List online users",
    "  /whois <user>    User information",
    "  /dm <user> <msg> Send direct message",
    "  /ignore <user>   Ignore a user",
    "  /unignore <user> Unignore a user",
    "Status Commands:",
    "  /away [msg]      Set away status",
    "  /back            Return from away",
    "  /status <status> Set status (online/away/busy/dnd)",
    "Other Commands:",
    "  /me <action>     Send action message",
    "  /clear           Clear chat window",
    "  /draw <channel>  Open drawing whiteboard",
    "  /files           Open file sharing browser",
    "  /emoji [search]  Open emoji picker or search",
    "  /events [type]   Manage event notifications",
    "  /react [emoji] <msg-id>, /thread <msg-id> message",
    "  /help            Show this help",
};
const int lc_help_lines = (int)(sizeof lc_help_text / sizeof lc_help_text[0]);

void lc_model_init(lc_model *m, int cols, int rows)
{
    memset(m, 0, sizeof *m);
    m->cols = cols;
    m->rows = rows;
    m->node = 1;
    m->menu = -1;
}

int lc_sidebar_width(const lc_model *m)
{
    int w;
    if (m->sidebar_hidden || m->cols <= 40) return 0;
    w = m->cols - 24;
    if (w > 21) w = 21;
    return w < 8 ? 0 : w;
}

/* Menu bar, three input rows and the status line leave the boxes rows - 5; borders and label bar take 3. */
int lc_text_rows(const lc_model *m)
{
    int n = m->rows - 5 - 3;
    return n < 1 ? 1 : n;
}

int lc_nick_color(const char *nick)
{
    unsigned sum = 0;
    for (; *nick != '\0'; nick++) sum += (unsigned char)*nick;
    return (int)(sum % 6) + 1;
}

typedef struct { char *p; int n, cap; } sb;

static void sb_ch(sb *b, int ch) { if (b->n + 1 < b->cap) b->p[b->n++] = (char)ch; b->p[b->n] = '\0'; }
static void sb_str(sb *b, const char *s) { while (*s != '\0') sb_ch(b, (unsigned char)*s++); }
static void sb_fg(sb *b, int fg) { sb_ch(b, UI_CELLS_M_FG); sb_ch(b, fg); }

/* "**x**" shows x in bold, the asterisks dropped; an unpaired "**" stays as typed. */
static void sb_markdown(sb *b, const char *s)
{
    int bold = 0;
    while (*s != '\0') {
        if (s[0] == '*' && s[1] == '*' && (bold || strstr(s + 2, "**") != 0)) {
            sb_ch(b, bold ? UI_CELLS_M_PLAIN : UI_CELLS_M_BOLD);
            bold = !bold;
            s += 2;
            continue;
        }
        sb_ch(b, (unsigned char)*s++);
    }
}

void lc_line_marked(const lc_line *l, char *out, int cap)
{
    sb b;
    b.p = out; b.n = 0; b.cap = cap;
    out[0] = '\0';
    switch (l->kind) {
    case LC_SYSTEM:
        sb_fg(&b, LC_DIM); sb_str(&b, "*** "); sb_str(&b, l->text);
        if (strncmp(l->text, "--- ", 4) == 0) sb_ch(&b, UI_CELLS_M_BASE);   /* the TS history marker ends its grey early */
        sb_str(&b, " ***");
        break;
    case LC_ACTIVITY_LINE:
        sb_fg(&b, LC_ACTIVITY); sb_ch(&b, '['); sb_str(&b, l->time); sb_str(&b, "] "); sb_str(&b, l->text);
        break;
    case LC_HISTORY:                                  /* [hh:mm] <nick> text */
        sb_fg(&b, LC_DIM); sb_ch(&b, '['); sb_str(&b, l->time); sb_ch(&b, ']');
        sb_ch(&b, UI_CELLS_M_BASE); sb_str(&b, " <");
        sb_fg(&b, lc_nick_color(l->nick)); sb_str(&b, l->nick);
        sb_ch(&b, UI_CELLS_M_BASE); sb_str(&b, "> "); sb_markdown(&b, l->text);
        break;
    default:                                          /* [hh:mm] nick: text, nick bold */
        sb_fg(&b, LC_DIM); sb_ch(&b, '['); sb_str(&b, l->time); sb_ch(&b, ']');
        sb_ch(&b, UI_CELLS_M_BASE); sb_ch(&b, ' ');
        sb_fg(&b, lc_nick_color(l->nick)); sb_ch(&b, UI_CELLS_M_BOLD); sb_str(&b, l->nick);
        sb_ch(&b, UI_CELLS_M_BASE); sb_str(&b, ": "); sb_markdown(&b, l->text);
        break;
    }
}

static void centre(ui_cells *c, int row, int left, int width, const char *text)
{
    int len = (int)strlen(text), at = (width - len) / 2;
    if (at < 0) at = 0;
    ui_cells_text(c, row, left + at, text, width);
}

static void draw_menubar(ui_cells *c)
{
    int w = c->cols, k;
    ui_cells_bar(c, 0, 0, w, MENU_TEXT, LC_BAR_INK, LC_ACCENT, 0);
    if (w < 60) return;
    /* The filler and the masthead at the right; the gap 12 cells in is where the TS bar's scanner sat in the capture. */
    ui_cells_pen(c, LC_ACCENT, LC_ACCENT, 0);
    for (k = MENU_TEXT_COLS; k <= w - 12; k++) ui_cells_put(c, 0, k, k == MENU_TEXT_COLS + 12 ? ' ' : '/');
    ui_cells_pen(c, LC_GREY, LC_ACCENT, 0);
    ui_cells_put(c, 0, w - 11, ' ');
    ui_cells_put(c, 0, w - 1, ' ');
    ui_cells_pen(c, LC_INK, LC_ACCENT, 0);
    ui_cells_text(c, 0, w - 10, MASTHEAD, 9);
}

static void draw_side_item(ui_cells *c, const lc_side *s, int row, int width, int selected)
{
    char buf[128];
    const char *mark = selected ? "> " : "  ";
    switch (s->kind) {
    case LC_SIDE_HEAD: sprintf(buf, "  \001\314\002%.38s", s->label); break;
    case LC_SIDE_ROOM:
        if (s->joined) sprintf(buf, "%sv # %.38s", mark, s->label);
        else sprintf(buf, "%s\001\360> # %.38s", mark, s->label);
        break;
    case LC_SIDE_USER: sprintf(buf, "%s  \001\360[*]\004 %.38s", mark, s->label); break;
    case LC_SIDE_DM: sprintf(buf, "%s@ %.38s", mark, s->label); break;
    default: return;
    }
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_marked(c, row, 1, buf, 0, (int)sizeof buf, width);
}

static void draw_sidebar(ui_cells *c, const lc_model *m, int top, int h, int w)
{
    int i;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_fill(c, top + 1, 1, h - 2, w - 2, ' ');
    ui_cells_box(c, top, 0, h, w, LC_ACCENT, "Sidebar", LC_ACCENT);
    for (i = 0; i < m->nside && i < h - 2; i++)
        draw_side_item(c, &m->side[i], top + 1 + i, w - 2, i == m->side_sel);
}


#define WRAP_MAX 24
#define CHAT_ROWS_MAX 128
static ui_hit lc_hits;                              /* the last frame's click regions, topmost last */
static int chat_row_line[CHAT_ROWS_MAX];            /* chat body row -> line index, -1 empty */

static void draw_chat(ui_cells *c, const lc_model *m, int top, int h, int left, int w)
{
    static char marked[LC_TEXT_MAX * 2 + 96];
    int starts[WRAP_MAX], ends[WRAP_MAX];
    int rows = h - 3, width = w - 4, total = 0, first, at = 0, i, k, n, body;

    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_fill(c, top + 1, left + 1, h - 2, w - 2, ' ');
    ui_cells_box(c, top, left, h, w, LC_ACCENT, m->pane_label[0] != '\0' ? m->pane_label : "No channel", LC_INK);
    if (c->cols > 40) {                             /* the TS pane drops its label bar at 40 columns */
        ui_cells_bar(c, top + 1, left + 1, w - 5, " Chat", LC_GREY, LC_LABEL_BG, 0);
        ui_cells_bar(c, top + 1, left + w - 4, 3, "", LC_LABEL_TAIL, LC_LABEL_BG, 0);
        body = top + 2;
    } else {
        body = top + 1;
        rows++;
    }
    if (rows < 1 || width < 1) return;
    ui_hit_add(&lc_hits, LC_HIT_CHAT, body, left + 1, rows, w - 2);
    for (k = 0; k < CHAT_ROWS_MAX; k++) chat_row_line[k] = -1;

    for (i = 0; i < m->nlines; i++) {
        lc_line_marked(&m->lines[i], marked, (int)sizeof marked);
        total += ui_cells_wrap(marked, width, starts, ends, WRAP_MAX);
    }
    first = total - m->scroll - rows;               /* the newest rows, filled from the top */
    if (first < 0) first = 0;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    for (i = 0; i < m->nlines && at < first + rows; i++) {
        lc_line_marked(&m->lines[i], marked, (int)sizeof marked);
        n = ui_cells_wrap(marked, width, starts, ends, WRAP_MAX);
        for (k = 0; k < n; k++, at++) {
            if (at < first || at >= first + rows) continue;
            if (at - first < CHAT_ROWS_MAX) chat_row_line[at - first] = i;
            ui_cells_marked(c, body + at - first, left + 1, marked, starts[k], ends[k], width);
        }
    }
    if (total > rows) {                             /* scrollbar: track 66, thumb 195, one column in from the border */
        int thumb = rows * rows / total, pos;
        if (thumb < 1) thumb = 1;
        pos = (first * (rows - thumb)) / (total - rows);
        for (k = 0; k < rows; k++) {
            int col = (k >= pos && k < pos + thumb) ? LC_SCROLL_THUMB : LC_SCROLL_TRACK;
            ui_cells_pen(c, col, col, 0);
            ui_cells_put(c, body + k, left + w - 3, ' ');
        }
        ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    }
}

static void draw_input(ui_cells *c, const lc_model *m, int *cr, int *cc)
{
    int W = c->cols, row = c->rows - 4, iw = (W - 6 >= 24) ? W - 6 : W, room = iw - 3, from;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_fill(c, row + 1, 1, 1, iw - 2, ' ');
    ui_cells_box(c, row, 0, 3, iw, LC_ACCENT, "Message", LC_INK);
    from = m->input_len > room ? m->input_len - room : 0;
    ui_cells_text(c, row + 1, 1, m->input + from, room);
    *cr = row + 1;
    *cc = 1 + m->input_len - from;
    if (iw < W) ui_cells_button(c, row, iw, 6, ":D", LC_GREY, LC_ACTIVITY);
}

static void draw_help(ui_cells *c, const lc_model *m)
{
    int top, left, h = c->rows - 2, w = c->cols - 4, i;
    if (w > 76) w = 76;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_modal(c, h, w, LC_ACCENT, "Help", LC_INK, &top, &left);
    for (i = 0; i < h - 2 && m->help_top + i < lc_help_lines; i++) {
        const char *t = lc_help_text[m->help_top + i];
        int head = t[0] == '=' || t[0] == '-';
        ui_cells_pen(c, head ? LC_ACCENT : LC_INK, UI_CELLS_DEFAULT, head);
        ui_cells_text(c, top + 1 + i, left + 2, t, w - 4);
    }
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
}

static void draw_modal(ui_cells *c, const lc_model *m, int *cr, int *cc)
{
    int top, left, w = 50;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    if (m->modal == LC_MODAL_PROMPT) {
        ui_cells_modal(c, 7, w, LC_ACCENT, "Message", LC_INK, &top, &left);
        if (w > c->cols) w = c->cols;
        centre(c, top + 2, left + 1, w - 2, m->modal_title);
        ui_cells_text(c, top + 4, left + 3, "> ", 2);
        ui_cells_text(c, top + 4, left + 5, m->prompt, w - 8);
        *cr = top + 4;
        *cc = left + 5 + m->prompt_len;
        return;
    }
    ui_cells_modal(c, 12, w, LC_ACCENT, "Message", LC_INK, &top, &left);
    if (w > c->cols) w = c->cols;
    centre(c, top + 3, left + 1, w - 2, m->modal_title);
    centre(c, top + 5, left + 1, w - 2, m->modal_text);
    if (m->modal == LC_MODAL_QUIT) {
        ui_cells_button(c, top + 7, left + 12, 9, "[ Yes ]", LC_ACCENT, LC_INK);
        ui_cells_button(c, top + 7, left + 29, 8, "[ No ]", LC_ACCENT, LC_INK);
        ui_hit_add(&lc_hits, LC_HIT_MODAL, top, left, 12, w);
        ui_hit_add(&lc_hits, LC_HIT_YES, top + 7, left + 12, 3, 9);
        ui_hit_add(&lc_hits, LC_HIT_NO, top + 7, left + 29, 3, 8);
    } else {
        ui_cells_button(c, top + 7, left + (w - 10) / 2, 10, "[ OK ]", LC_ACCENT, LC_INK);
        ui_hit_add(&lc_hits, LC_HIT_MODAL, top, left, 12, w);
        ui_hit_add(&lc_hits, LC_HIT_OK, top + 7, left + (w - 10) / 2, 3, 10);
    }
}

void lc_draw(ui_cells *c, const lc_model *m, int *cursor_row, int *cursor_col)
{
    int W = c->cols, H = c->rows, sw = lc_sidebar_width(m), h = H - 5;
    char status[160];
    int k;

    ui_hit_reset(&lc_hits);
    draw_menubar(c);
    for (k = 0; k < LC_MENUS; k++)
        ui_hit_add(&lc_hits, LC_HIT_MENU, 0, menu_col[k], 1, (int)strlen(lc_menu_label[k]));
    ui_hit_add(&lc_hits, LC_HIT_STATUS, H - 1, 0, 1, W);
    ui_hit_add(&lc_hits, LC_HIT_INPUT, H - 4, 0, 3, W);
    if (sw > 0) {
        draw_sidebar(c, m, 1, h, sw);
        ui_hit_add(&lc_hits, LC_HIT_SIDEBAR, 2, 1, h - 2, sw - 2);
    }
    draw_chat(c, m, 1, h, sw, W - sw);
    draw_input(c, m, cursor_row, cursor_col);
    sprintf(status, "@%.30s | Node %d | #%.40s | [L] [*] | F1:Help F4:Emoji", m->handle, m->node, m->room);
    ui_cells_bar(c, H - 1, 0, W, status, LC_INK, UI_CELLS_DEFAULT, 0);

    if (m->menu >= 0 && m->menu < LC_MENUS) {
        ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
        int mw = ui_cells_menu(c, 1, menu_col[m->menu] - 1, lc_menu_items[m->menu], lc_menu_count[m->menu],
                               m->menu_sel, LC_ACCENT, LC_INK, LC_ACCENT);
        ui_hit_add(&lc_hits, LC_HIT_DROPDOWN, 2, menu_col[m->menu], lc_menu_count[m->menu], mw - 2);
    }
    if (m->ctx.open) {
        ui_popup_draw(c, &m->ctx, LC_ACCENT, LC_INK, LC_ACCENT, LC_ALERT);
        ui_hit_add(&lc_hits, LC_HIT_POPUP, m->ctx.top, m->ctx.left, m->ctx.n + 2, m->ctx.w);
    }
    if (m->help) draw_help(c, m);
    if (m->modal != LC_MODAL_NONE) draw_modal(c, m, cursor_row, cursor_col);
}

int lc_hit(int row, int col, int *index)
{
    int dr = 0, dc = 0, id = ui_hit_at(&lc_hits, row, col, &dr, &dc), k;
    *index = -1;
    switch (id) {
    case LC_HIT_MENU:
        for (k = 0; k < LC_MENUS; k++)
            if (col >= menu_col[k] && col < menu_col[k] + (int)strlen(lc_menu_label[k])) *index = k;
        break;
    case LC_HIT_DROPDOWN: case LC_HIT_SIDEBAR: *index = dr; break;
    case LC_HIT_CHAT: *index = dr < CHAT_ROWS_MAX ? chat_row_line[dr] : -1; break;
    case LC_HIT_STATUS: *index = col; break;
    case -1: return LC_HIT_NONE;
    default: break;
    }
    return id;
}
