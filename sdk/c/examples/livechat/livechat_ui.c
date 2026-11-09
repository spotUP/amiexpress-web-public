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
    "  Ctrl+Q           Quit (with confirmation)",
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

/* One clock for every model, so a fresh model never shares a generation with a cached one. */
static unsigned long lines_clock;
unsigned long lc_chat_rewraps;

void lc_lines_changed(lc_model *m) { m->lines_gen = ++lines_clock; }

void lc_model_init(lc_model *m, int cols, int rows)
{
    memset(m, 0, sizeof *m);
    m->input_anchor = -1;
    lc_lines_changed(m);
    m->cols = cols;
    m->rows = rows;
    m->node = 1;
    m->menu = -1;
    m->timestamps = 1;
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
/* Appends len bytes of s, clipped to the buffer: one bounds check per run instead of one per byte. */
static void sb_run(sb *b, const char *s, int len)
{
    int room = b->cap - 1 - b->n;
    if (room < 0) room = 0;
    if (len > room) len = room;
    memcpy(b->p + b->n, s, (size_t)len);
    b->n += len;
    b->p[b->n] = '\0';
}
static void sb_str(sb *b, const char *s) { sb_run(b, s, (int)strlen(s)); }
static void sb_fg(sb *b, int fg) { sb_ch(b, UI_CELLS_M_FG); sb_ch(b, fg); }

/* "**x**" shows x in bold, the asterisks dropped; an unpaired "**" stays as typed. */
static void sb_markdown(sb *b, const char *s)
{
    int bold = 0;
    while (*s != '\0') {
        const char *run = s;
        while (*s != '\0' && *s != '*') s++;          /* plain text goes in as one run */
        if (s > run) sb_run(b, run, (int)(s - run));
        if (*s == '\0') break;
        if (s[1] == '*' && (bold || strstr(s + 2, "**") != 0)) {
            sb_ch(b, bold ? UI_CELLS_M_PLAIN : UI_CELLS_M_BOLD);
            bold = !bold;
            s += 2;
            continue;
        }
        sb_ch(b, '*');
        s++;
    }
}

const char *const lc_react_names[LC_REACT_KINDS] = { "+1", "-1", "heart", "fire", "laugh", "wow", "sad", "angry" };
static const char *const react_glyphs[LC_REACT_KINDS] = { ":)", ":/", "<3", "*", ":D", ":O", ":(", ">(" };
static const char *const react_words[LC_REACT_KINDS] = { "Thumbs Up", "Thumbs Down", "Heart", "Fire",
                                                          "Laugh", "Wow", "Sad", "Angry" };

const char *lc_react_display(const char *emoji)
{
    int i;
    for (i = 0; i < LC_REACT_KINDS; i++) if (strcmp(lc_react_names[i], emoji) == 0) return react_glyphs[i];
    return emoji;
}

const char *lc_react_label(int i)
{
    static char labels[LC_REACT_KINDS][24];
    if (i < 0 || i >= LC_REACT_KINDS) return "";
    sprintf(labels[i], "%-3s %s", react_glyphs[i], react_words[i]);
    return labels[i];
}

void lc_react_rows(const lc_line *l, int indent, int width, char *out, int cap)
{
    int i, n = 0, col = 0, any = 0;
    char one[24];
    out[0] = '\0';
    if (indent < 0) indent = 0;
    if (width > 0 && indent > width / 2) indent = width / 2;     /* a long nick: keep room for the counts */
    for (i = 0; i < l->nreact; i++) {
        int len, gap, need, cols;
        if (l->react[i].count <= 0) continue;
        sprintf(one, "%.12s %d", lc_react_display(l->react[i].emoji), l->react[i].count);
        len = (int)strlen(one);
        cols = len;
        gap = any && !(width > 0 && col + 2 + cols > width) ? 2 : 0;
        need = gap == 0 ? 1 + indent + len : gap + len;          /* a new row: "\n" and the indent */
        if (n + need + 1 > cap) break;
        if (gap == 0) {
            out[n++] = '\n';
            memset(out + n, ' ', (size_t)indent);
            n += indent;
            col = indent;
        } else {
            out[n++] = ' '; out[n++] = ' ';
            col += 2;
        }
        memcpy(out + n, one, (size_t)len);
        n += len;
        col += cols;
        out[n] = '\0';
        any = 1;
    }
}

void lc_line_marked(const lc_line *l, char *out, int cap, int stamps, int width)
{
    sb b;
    int indent = stamps ? 8 : 0;                     /* "[hh:mm] ": the message text column */
    b.p = out; b.n = 0; b.cap = cap;
    out[0] = '\0';
    if ((l->kind == LC_HISTORY || l->kind == LC_LIVE) && l->quote[0] != '\0') {   /* TS reply-quote: a dim row above */
        sb_fg(&b, LC_DIM); sb_str(&b, "  > "); sb_str(&b, l->quote); sb_ch(&b, '\n'); sb_ch(&b, UI_CELLS_M_BASE);
    }
    switch (l->kind) {
    case LC_SYSTEM:
        sb_fg(&b, LC_DIM); sb_str(&b, "*** "); sb_str(&b, l->text);
        if (strncmp(l->text, "--- ", 4) == 0) sb_ch(&b, UI_CELLS_M_BASE);   /* the TS history marker ends its grey early */
        sb_str(&b, " ***");
        break;
    case LC_NOTE:
        sb_fg(&b, LC_ACCENT); sb_str(&b, l->text);
        break;
    case LC_ACTIVITY_LINE:
        sb_fg(&b, LC_ACTIVITY); sb_ch(&b, '['); sb_str(&b, l->time); sb_str(&b, "] "); sb_str(&b, l->text);
        break;
    case LC_HISTORY:                                  /* [hh:mm] <nick> text */
        if (stamps) { sb_fg(&b, LC_DIM); sb_ch(&b, '['); sb_str(&b, l->time); sb_str(&b, "] "); sb_ch(&b, UI_CELLS_M_BASE); }
        sb_str(&b, "<");
        sb_fg(&b, lc_nick_color(l->nick)); sb_str(&b, l->nick);
        sb_ch(&b, UI_CELLS_M_BASE); sb_str(&b, "> "); sb_markdown(&b, l->text);
        break;
    default:                                          /* [hh:mm] nick: text, nick bold */
        if (stamps) { sb_fg(&b, LC_DIM); sb_ch(&b, '['); sb_str(&b, l->time); sb_str(&b, "] "); sb_ch(&b, UI_CELLS_M_BASE); }
        sb_fg(&b, lc_nick_color(l->nick)); sb_ch(&b, UI_CELLS_M_BOLD); sb_str(&b, l->nick);
        sb_ch(&b, UI_CELLS_M_BASE); sb_str(&b, ": "); sb_markdown(&b, l->text);
        break;
    }
    if ((l->kind == LC_HISTORY || l->kind == LC_LIVE) && l->edited) {   /* TS messageLine's mark */
        sb_ch(&b, UI_CELLS_M_BASE); sb_fg(&b, LC_DIM); sb_str(&b, " (edited)");
    }
    if (l->kind == LC_HISTORY || l->kind == LC_LIVE) {   /* counts on their own rows under it (sysop 2026-11-08) */
        char rows[LC_REACT_MAX * 40];
        indent += (int)strlen(l->nick) + (l->kind == LC_HISTORY ? 3 : 2);   /* "<nick> " or "nick: " */
        lc_react_rows(l, indent, width, rows, (int)sizeof rows);
        if (rows[0] != '\0') { sb_ch(&b, UI_CELLS_M_BASE); sb_fg(&b, LC_ACCENT); sb_str(&b, rows); }
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
    int w = c->cols;
    ui_cells_bar(c, 0, 0, w, MENU_TEXT, LC_BAR_INK, LC_ACCENT, 0);
    if (w < 60) return;
    /* The filler and the masthead at the right; the gap 12 cells in is where the TS bar's scanner sat in the capture. */
    ui_cells_pen(c, LC_ACCENT, LC_ACCENT, 0);
    ui_cells_fill(c, 0, MENU_TEXT_COLS, 1, w - 12 - MENU_TEXT_COLS + 1, '/');
    if (MENU_TEXT_COLS + 12 <= w - 12) ui_cells_put(c, 0, MENU_TEXT_COLS + 12, ' ');   /* the scanner gap in the filler */
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
    case LC_SIDE_USER: {                   /* TS user-status marks: [*] online, [~] away, [-] do not disturb; [!] busy */
        const char *dot = s->status == 'a' ? "[~]" : s->status == 'b' ? "[!]" : s->status == 'd' ? "[-]" : "[*]";
        if (s->note[0] != '\0') sprintf(buf, "%s  \001\360%s\004 %.20s: %.14s", mark, dot, s->label, s->note);
        else sprintf(buf, "%s  \001\360%s\004 %.38s", mark, dot, s->label);
        break;
    }
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
    ui_cells_box(c, top, 0, h, w, m->focus == LC_FOCUS_SIDEBAR ? LC_BORDER_FOCUS : LC_ACCENT, "Sidebar", LC_ACCENT);
    for (i = 0; i < m->nside && i < h - 2; i++)
        draw_side_item(c, &m->side[i], top + 1 + i, w - 2, i == m->side_sel);
}


#define WRAP_MAX 24
static int pickable(const lc_line *l) { return l->number != 0 && l->id[0] != '\0'; }

int lc_pick_index(const lc_model *m)
{
    int i;
    if (m->pick[0] == '\0') return -1;
    for (i = 0; i < m->nlines; i++)
        if (pickable(&m->lines[i]) && strcmp(m->lines[i].id, m->pick) == 0) return i;
    return -1;
}

int lc_pick_start(lc_model *m)
{
    int i;
    for (i = m->nlines - 1; i >= 0; i--)
        if (pickable(&m->lines[i])) {
            strncpy(m->pick, m->lines[i].id, sizeof m->pick - 1);
            m->pick[sizeof m->pick - 1] = '\0';
            return 1;
        }
    m->pick[0] = '\0';
    return 0;
}

void lc_pick_move(lc_model *m, int dir)
{
    int i = lc_pick_index(m);
    if (i < 0) return;
    for (i += dir; i >= 0 && i < m->nlines; i += dir)
        if (pickable(&m->lines[i])) {
            strncpy(m->pick, m->lines[i].id, sizeof m->pick - 1);
            m->pick[sizeof m->pick - 1] = '\0';
            return;
        }
}

void lc_pick_stop(lc_model *m)
{
    m->pick[0] = '\0';
    m->scroll = 0;
}

/* The picked message's rows as the TS selection bar: ground ink on the accent. */
static void tint_row(ui_cells *c, int row, int left, int width)
{
    ui_cell *p = &c->back[row * c->cols + left];
    int k;
    for (k = 0; k < width; k++, p++) {
        p->fg = LC_BAR_INK;
        p->bg = LC_ACCENT;
        p->flags &= (unsigned char)~(UI_CELLS_BG_DEFAULT | UI_CELLS_BOLD);
    }
}

#define CHAT_ROWS_MAX 128
static ui_hit lc_hits;                              /* the last frame's click regions, topmost last */
static int chat_row_line[CHAT_ROWS_MAX];            /* chat body row -> line index, -1 empty */

/* The scrollbar of the last drawn chat pane, for lc_scroll_at (R1a drag). bar_rows 0 = no scrollbar. */
static int bar_body, bar_rows, bar_thumb, bar_span;

static void draw_chat(ui_cells *c, const lc_model *m, int top, int h, int left, int w)
{
    static char marked[LC_TEXT_MAX * 2 + 96];
    static int line_rows[LC_LINES];                 /* pass 1's wrapped row count per line */
    static unsigned long cache_gen;                 /* what line_rows was computed for: the model's lines_gen ... */
    static int cache_n = -1, cache_width, cache_stamps;   /* ... and the inputs that change a wrap */
    int stamps = m->timestamps && !m->compact, used = 0;
    int starts[WRAP_MAX], ends[WRAP_MAX];
    int rows = h - 3, width = w - 4, total = 0, first, at = 0, i, k, n, body;
    int picked = lc_pick_index(m), pick_at = 0;

    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_box(c, top, left, h, w, picked >= 0 ? LC_BORDER_FOCUS : LC_ACCENT, m->pane_label[0] != '\0' ? m->pane_label : "No channel", LC_INK);
    if (c->cols > 40) {                             /* the TS pane drops its label bar at 40 columns */
        ui_cells_bar(c, top + 1, left + 1, w - 5, " Chat", LC_GREY, LC_LABEL_BG, 0);
        ui_cells_bar(c, top + 1, left + w - 4, 3, "", LC_LABEL_TAIL, LC_LABEL_BG, 0);
        body = top + 2;
    } else {
        body = top + 1;
        rows++;
    }
    if (rows < 1 || width < 1) {
        ui_cells_fill(c, body, left + 1, top + h - 1 - body, w - 2, ' ');
        return;
    }
    ui_hit_add(&lc_hits, LC_HIT_CHAT, body, left + 1, rows, w - 2);
    for (k = 0; k < CHAT_ROWS_MAX; k++) chat_row_line[k] = -1;

    if (cache_gen != m->lines_gen || cache_n != m->nlines || cache_width != width || cache_stamps != stamps) {
        for (i = 0; i < m->nlines; i++) {           /* pass 1: only when a line, the width or the stamps changed */
            lc_line_marked(&m->lines[i], marked, (int)sizeof marked, stamps, width);
            line_rows[i] = ui_cells_wrap(marked, width, starts, ends, WRAP_MAX);
        }
        cache_gen = m->lines_gen; cache_n = m->nlines; cache_width = width; cache_stamps = stamps;
        lc_chat_rewraps++;
    }
    for (i = 0; i < m->nlines; i++) {
        if (i == picked) pick_at = total;
        total += line_rows[i];
    }
    if (picked >= 0) first = pick_at + line_rows[picked] / 2 - rows / 2;   /* the picker centres its selection */
    else first = total - m->scroll - rows;          /* the newest rows, filled from the top */
    if (first > total - rows) first = total - rows;
    if (first < 0) first = 0;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    for (i = 0; i < m->nlines && at < first + rows; i++) {
        if (at + line_rows[i] <= first) { at += line_rows[i]; continue; }   /* scrolled off the top: not rebuilt */
        lc_line_marked(&m->lines[i], marked, (int)sizeof marked, stamps, width);
        n = ui_cells_wrap(marked, width, starts, ends, WRAP_MAX);
        for (k = 0; k < n; k++, at++) {
            int r = at - first, cols;
            if (at < first || at >= first + rows) continue;
            if (r < CHAT_ROWS_MAX) chat_row_line[r] = i;
            cols = ui_cells_marked(c, body + r, left + 1, marked, starts[k], ends[k], width);
            ui_cells_fill(c, body + r, left + 1 + cols, 1, w - 2 - cols, ' ');   /* the rest of the row: text rows are not pre-cleared */
            used = r + 1;
            if (i == picked) tint_row(c, body + r, left + 1, width);
        }
    }
    ui_cells_fill(c, body + used, left + 1, rows - used, w - 2, ' ');   /* rows with no line */
    if (total > rows) {                             /* scrollbar: track 66, thumb 195, one column in from the border */
        int thumb = rows * rows / total, pos;
        if (thumb < 1) thumb = 1;
        pos = (first * (rows - thumb)) / (total - rows);
        ui_cells_pen(c, LC_SCROLL_TRACK, LC_SCROLL_TRACK, 0);
        ui_cells_fill(c, body, left + w - 3, pos, 1, ' ');
        ui_cells_fill(c, body + pos + thumb, left + w - 3, rows - pos - thumb, 1, ' ');
        ui_cells_pen(c, LC_SCROLL_THUMB, LC_SCROLL_THUMB, 0);
        ui_cells_fill(c, body + pos, left + w - 3, thumb, 1, ' ');
        ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
        bar_body = body; bar_rows = rows; bar_thumb = thumb; bar_span = total - rows;
        ui_hit_add(&lc_hits, LC_HIT_SCROLLBAR, body, left + w - 3, rows, 1);   /* over the chat rect: last added wins */
    }
}

static void draw_input(ui_cells *c, const lc_model *m, int *cr, int *cc)
{
    int W = c->cols, row = c->rows - 4, iw = (W - 6 >= 24) ? W - 6 : W, room = iw - 3, from;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_fill(c, row + 1, 1, 1, iw - 2, ' ');
    ui_cells_box(c, row, 0, 3, iw, m->focus == LC_FOCUS_INPUT ? LC_BORDER_FOCUS : LC_ACCENT,
                 m->pick[0] != '\0' ? "[PICK MESSAGE: Up/Down, Enter, Esc]" : m->editing ? "[EDITING]" : "Message", LC_INK);
    from = m->input_cur > room ? m->input_cur - room : 0;
    ui_cells_text(c, row + 1, 1, m->input + from, room);
    if (m->input_anchor >= 0 && m->input_anchor != m->input_cur) {   /* the Shift selection, inverse */
        int a = m->input_anchor < m->input_cur ? m->input_anchor : m->input_cur;
        int b = m->input_anchor < m->input_cur ? m->input_cur : m->input_anchor;
        if (a < from) a = from;
        if (b > from + room) b = from + room;
        if (b > a) {
            ui_cells_pen(c, LC_BAR_INK, LC_INK, 0);
            ui_cells_text(c, row + 1, 1 + a - from, m->input + a, b - a);
            ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
        }
    }
    *cr = row + 1;
    *cc = 1 + m->input_cur - from;
    if (iw < W) ui_cells_button(c, row, iw, 6, ":D", LC_GREY, LC_ACTIVITY);
}

/* The one command list: /help <command> and the "/" menu both read it. TS /help <command>: name, aliases, description, usage - the registered text of the commands this door runs. */
const char *const lc_cmd_help[][4] = {
    {"ban", "", "Ban user from channel", "/ban @user [reason]"},
    {"clear", "cls", "Clear chat display", "/clear"},
    {"create", "", "Create a new channel. --private and --invite-only make it members-only.", "/create #name [topic] [--private] [--invite-only] [--motd \"text\"]"},
    {"deletemsg", "delmsg", "Delete a message (your last by default)", "/deletemsg [msg-id]"},
    {"edit", "", "Edit one of your messages (your last by default)", "/edit [msg-id] new text"},
    {"away", "afk", "Set away status", "/away [message]"},
    {"back", "", "Return from away", "/back"},
    {"help", "?,commands", "Show available commands", "/help [command]"},
    {"ignore", "", "Ignore a user (no name: list who you ignore)", "/ignore [user]"},
    {"invite", "", "Invite a user to this invite-only channel (moderator only)", "/invite @user [#room]"},
    {"join", "", "Join a channel", "/join #channel"},
    {"kick", "", "Kick user from channel", "/kick @user [reason]"},
    {"leave", "part", "Leave current channel", "/leave"},
    {"love", "", "React with heart", "/love [msg-id]"},
    {"nick", "", "Show your username", "/nick"},
    {"msg", "dm,pm", "Send a direct message (1:1 or group). /msg @a [@b ...] text", "/msg @user [@user2 ...] message"},
    {"mute", "", "Mute user in channel", "/mute @user [minutes]"},
    {"op", "", "Give or take room operator status (sysop)", "/op @user  |  /op -@user  |  /deop @user"},
    {"quit", "exit,bye,q", "Exit chat", "/quit"},
    {"react", "+1,-1,heart,fire", "Add reaction to message", "/react [emoji] [msg-id]"},
    {"reactions", "", "Show reactions", "/reactions [msg-id]"},
    {"reply", "r", "Reply to a message (the newest by default)", "/reply [msg-id] message"},
    {"rooms", "channels", "List all rooms", "/rooms"},
    {"status", "", "Set custom status", "/status [online|away|busy|dnd] [message]"},
    {"thread", "t", "Reply in thread", "/thread <msg-id> message"},
    {"thumbsup", "like", "React with thumbs up", "/thumbsup [msg-id]"},
    {"topic", "", "Set channel topic", "/topic <new topic>"},
    {"unignore", "", "Stop ignoring a user", "/unignore <user>"},
    {"unban", "", "Unban user from channel", "/unban @user"},
    {"uninvite", "", "Revoke a pending invite", "/uninvite @user [#room]"},
    {"unmute", "", "Unmute user in channel", "/unmute @user"},
    {"unreact", "", "Remove reaction", "/unreact [emoji] [msg-id]"},
    {"whois", "info", "Show user info", "/whois @user"},
    {"who", "users,list", "List users in channel", "/who"},
    {"compact", "", "Toggle compact mode", "/compact"},
    {"timestamps", "time", "Toggle timestamps", "/timestamps"},
    /* The rest of the TS registry (board/Doors/livechat/commands, one file per group). Phase A runs me, delete, events, pin, unpin, pinned, search, motd and customemoji; the others fall to the unknown-command path. */
    {"delete", "", "Delete a channel", "/delete #channel"},
    {"emoji", "", "Open emoji picker or search emojis", "/emoji [search]"},
    {"emojis", "", "List all emojis or emojis in a category", "/emojis [category]"},
    {"customemoji", "", "Add, remove or list the board's custom emoji (sysop adds)", "/customemoji add <name> <display> <ascii> | remove <name> | list"},
    {"events", "", "Manage BBS event display preferences", "/events [on|off|logins|files|doors|messages|announcements]"},
    {"mic", "", "List microphones, or switch to one", "/mic [number]"},
    {"motd", "", "Set channel MOTD (moderator only; --clear to clear; no args = show current)", "/motd [text]  (use /motd --clear to clear)"},
    {"mode", "", "Set channel or user modes (+i/+m/+o/+v/-X). Moderator only.", "/mode <modes> [param]"},
    {"me", "", "Send an action message", "/me does something"},
    {"pin", "", "Pin a message", "/pin <msg-id>"},
    {"unpin", "", "Unpin a message", "/unpin <msg-id>"},
    {"pinned", "pins", "Show pinned messages", "/pinned"},
    {"sounds", "", "Toggle sound notifications", "/sounds [on|off]"},
    {"search", "find", "Search messages", "/search [query]"},
    {"draw", "whiteboard,art", "Open the drawing whiteboard (or join art:<name>)", "/draw [channel]"},
    {"files", "file,share", "Open the file sharing browser", "/files"},
    {"settings", "", "Open the settings", "/settings"},
    {"voice", "vc", "Voice channel commands", "/voice [join <channel> | leave]"},
    {"deafen", "deaf", "Deafen (mute audio output)", "/deafen"},
    {"undeafen", "undeaf", "Undeafen (unmute audio output)", "/undeafen"},
};


const int lc_cmd_help_count = (int)(sizeof lc_cmd_help / sizeof lc_cmd_help[0]);

static int lower(int ch) { return ch >= 'A' && ch <= 'Z' ? ch + 32 : ch; }

static int has_sub(const char *s, const char *term)
{
    int n = (int)strlen(term), i;
    if (n == 0) return 1;
    for (i = 0; s[i] != '\0'; i++) {
        int k = 0;
        while (k < n && s[i + k] != '\0' && lower(s[i + k]) == lower(term[k])) k++;
        if (k == n) return 1;
    }
    return 0;
}

int lc_slash_match(const char *input, int *idx, int max)
{
    const char *term;
    int n = 0, pre[LC_SLASH_MAX], i, j, key, np;
    if (input[0] != '/') return 0;
    term = input + 1;
    np = (int)strlen(term);
    for (i = 0; i < lc_cmd_help_count && n < max && n < LC_SLASH_MAX; i++) {
        const char *name = lc_cmd_help[i][0];
        int p = 1;
        for (j = 0; j < np; j++) if (lower(name[j]) != lower(term[j]) || name[j] == '\0') { p = 0; break; }
        if (!p && !has_sub(lc_cmd_help[i][2], term)) continue;
        /* insertion sort: prefix matches first, then by name */
        key = p;
        for (j = n; j > 0; j--) {
            int o = idx[j - 1], c = strcmp(lc_cmd_help[o][0], name);
            if (pre[j - 1] > key || (pre[j - 1] == key && c < 0)) break;
            idx[j] = idx[j - 1]; pre[j] = pre[j - 1];
        }
        idx[j] = i; pre[j] = key;
        n++;
    }
    return n;
}

void lc_slash_row(char *out, int cap, int cmd, int cols, int *ucol, int *ulen)
{
    const char *name = lc_cmd_help[cmd][0], *desc = lc_cmd_help[cmd][2], *usage = lc_cmd_help[cmd][3];
    *ucol = 0; *ulen = 0;
    if (cap < 1) return;
    if (cols < 80) {
        int room = cols - 4 < 8 ? 8 : cols - 4;
        if (room > cap - 1) room = cap - 1;
        if (desc[0] != '\0') sprintf(out, "/%s %s", name, desc); else sprintf(out, "/%s", name);
        if ((int)strlen(out) > room) out[room] = '\0';
        return;
    }
    {
        int dw = cols - 12 - 20 - 6, ul, len;
        char u[24];
        if (dw < 10) dw = 10;
        ul = (int)strlen(usage);
        if (ul > 20) ul = 20;
        memcpy(u, usage, (size_t)ul);
        u[ul] = '\0';
        len = sprintf(out, "/%-12.12s ", name);
        *ucol = len;
        *ulen = 20;
        len += sprintf(out + len, "%-20s ", u);
        sprintf(out + len, "%.*s", dw < cap - len - 1 ? dw : cap - len - 1, desc);
    }
}

/** TS server.ts ghost completion: the top match, only when its name starts with the whole typed
 *  term (input after "/", case ignored). Returns that command's index, or -1. Tab/Right fill it. */
int lc_slash_ghost(const char *input, const int *idx, int n)
{
    const char *term = input + 1, *name;
    int i = 0;
    if (n <= 0 || input[0] != '/' || term[0] == '\0') return -1;
    name = lc_cmd_help[idx[0]][0];
    while (term[i] != '\0' && name[i] != '\0' && lower(term[i]) == lower(name[i])) i++;
    return term[i] == '\0' ? idx[0] : -1;
}

int lc_slash_exact(const char *input, int cmd)
{
    int i = 0;
    const char *name = lc_cmd_help[cmd][0];
    while (input[0] == ' ') input++;
    if (input[0] != '/') return 0;
    input++;
    while (name[i] != '\0' && lower(input[i]) == lower(name[i])) i++;
    if (name[i] != '\0') return 0;
    input += i;
    while (*input == ' ') input++;
    return *input == '\0';
}

int lc_slash_scroll(int sel, int top, int n)
{
    if (sel < top) top = sel;
    if (sel >= top + LC_SLASH_ROWS) top = sel - LC_SLASH_ROWS + 1;
    if (top > n - LC_SLASH_ROWS) top = n - LC_SLASH_ROWS;
    return top < 0 ? 0 : top;
}

static void draw_slash(ui_cells *c, const lc_model *m)
{
    int idx[LC_SLASH_MAX], n, rows, top, i, W = c->cols, brow = c->rows - 4;
    char row[200];
    if (m->slash_off || m->focus != LC_FOCUS_INPUT || m->modal != LC_MODAL_NONE) return;
    n = lc_slash_match(m->input, idx, LC_SLASH_MAX);
    if (n == 0) return;
    rows = n < LC_SLASH_ROWS ? n : LC_SLASH_ROWS;
    top = lc_slash_scroll(m->slash_sel < n ? m->slash_sel : n - 1, m->slash_top, n);
    if (brow - rows - 2 < 1) return;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_fill(c, brow - rows - 1, 1, rows, W - 2, ' ');
    ui_cells_box(c, brow - rows - 2, 0, rows + 2, W, LC_ACCENT, " Commands ", LC_INK);
    for (i = 0; i < rows; i++) {
        int r = brow - rows - 1 + i, ucol, ulen, sel = top + i == m->slash_sel;
        lc_slash_row(row, sizeof row, idx[top + i], W, &ucol, &ulen);
        ui_cells_pen(c, sel ? LC_ACCENT : LC_INK, UI_CELLS_DEFAULT, 0);
        ui_cells_text(c, r, 1, sel ? "> " : "  ", 2);
        ui_cells_text(c, r, 3, row, W - 4);
        if (ulen > 0) {                                  /* the usage column in the dim colour */
            ui_cells_pen(c, LC_DIM, UI_CELLS_DEFAULT, 0);
            if (ucol < W - 4) ui_cells_text(c, r, 3 + ucol, row + ucol, ulen < W - 4 - ucol ? ulen : W - 4 - ucol);
        }
    }
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
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

/** The text overlay (TS overlays/thread-view.ts): a box titled view_title, view_text scrolled from view_top. */
static void draw_view(ui_cells *c, const lc_model *m)
{
    int top, left, h = c->rows - 2, w = c->cols - 4, i;
    if (w > 76) w = 76;
    ui_cells_pen(c, LC_INK, UI_CELLS_DEFAULT, 0);
    ui_cells_modal(c, h, w, LC_ACCENT, m->view_title, LC_INK, &top, &left);
    for (i = 0; i < h - 2 && m->view_top + i < m->view_n; i++) {
        const char *t = m->view_text[m->view_top + i];
        int head = t[0] == '=';
        ui_cells_pen(c, head ? LC_ACCENT : LC_INK, UI_CELLS_DEFAULT, head);
        ui_cells_text(c, top + 1 + i, left + 2, head ? t + 1 : t, w - 4);
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
    bar_rows = 0;                                   /* no scrollbar until draw_chat draws one */
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
    draw_slash(c, m);
    if (m->ctx.open) {
        ui_popup_draw(c, &m->ctx, LC_ACCENT, LC_INK, LC_ACCENT, LC_ALERT);
        ui_hit_add(&lc_hits, LC_HIT_POPUP, m->ctx.top, m->ctx.left, m->ctx.n + 2, m->ctx.w);
    }
    if (m->help) draw_help(c, m);
    if (m->view) draw_view(c, m);
    if (m->modal != LC_MODAL_NONE) draw_modal(c, m, cursor_row, cursor_col);
}

int lc_scroll_at(int row)
{
    int pos, track;
    if (bar_rows <= 0) return -1;
    track = bar_rows - bar_thumb;
    pos = row - bar_body - bar_thumb / 2;
    if (pos > track) pos = track;
    if (pos < 0) pos = 0;
    return track > 0 ? bar_span - (pos * bar_span + track / 2) / track : 0;   /* draw_chat's pos = first*track/span, inverted */
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
