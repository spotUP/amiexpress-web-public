/*
 * LIVECHAT68 - the federated chat room, in C, on a 68K Amiga.
 *
 * One chat shared by every board with a key, served by the door server at
 * /chat/v1 (see CHAT-API.md). This door is a plain client: it holds no room
 * state of its own beyond the lines on screen, and everything it shows came
 * back from the server as `|`-separated Latin-1 rows.
 *
 * WHO TALKS. The caller's handle is read from the session at startup and is
 * NEVER typed, so nobody speaks as somebody else.
 *
 * HOW IT STAYS LIVE. There is no thread and no timer on a 68K door. The idle
 * hook of ui_key_read runs while no key is waiting: it sleeps a quarter of a
 * second, and every POLL_STEPS steps asks /events.txt with wait=0. A send is
 * followed by one poll at once, and that poll is the only way the caller's
 * own line reaches the pane, so there is one display path, deduplicated by
 * message id.
 *
 * KEYS. Rooms: Up/Down, Enter joins, D direct messages, W who, R refresh,
 * Q quit. Chat: type and Enter to send, Esc back, PgUp/PgDn scroll,
 * "/?" or F1 help. Commands: /j /n /np /r /t /d /w /l /q.
 *
 * Role colour is a foreground only; the background is always a theme token.
 * ASCII tokens only, no emoji.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "aedoor.h"
#include "ae_chat.h"
#include "ae_host.h"
#include "ae_session.h"
#include "ui_ansi.h"
#include "ui_chrome.h"
#include "ui_input.h"
#include "ui_key.h"
#include "ui_list.h"
#include "ui_screen.h"
#include "ui_theme.h"

/* Where the key file sits; the host test points it at a file of its own. */
#ifndef LIVECHAT_CFG_PATH
#define LIVECHAT_CFG_PATH "PROGDIR:LIVECHAT.cfg"
#endif

static char frame_buffer[16384];
static char session_storage[AE_SESSION_MIN_STORAGE];
static ui_screen screen;
static ui_key_source keys;
static const ui_theme *theme;
static int pushback = -1;

static ae_chat chat;
static char handle[32];

/* Idle steps (1/4 second each) between polls: 12 is three seconds. */
/* Marks a parameter used. vbcc warns on a (void) cast ("statement has no effect"); this does not. */
#define IGNORE(p) do { if ((p) != 0) { } } while (0)

#define POLL_STEPS_DEFAULT 12
static int poll_steps = POLL_STEPS_DEFAULT;
static int idle_count;

typedef enum { VIEW_ROOMS, VIEW_CHAT, VIEW_DMS, VIEW_WHO, VIEW_HELP } view_id;
static view_id view = VIEW_ROOMS;
static view_id help_from = VIEW_ROOMS;

/* ---- the lines on screen ------------------------------------------------ */

#define MSG_MAX 60
#define TEXT_MAX 240
typedef struct {
    long seq;
    int number;
    char id[24];
    char user[24];
    int color;
    int reacts;
    int system;
    char text[TEXT_MAX];
} msg_line;

static msg_line msgs[MSG_MAX];
static int msg_count;
static int msg_number;
static int scroll_back;

static char room_id[48];
static char room_name[48];
static char room_topic[80];
static int room_members;
static char dm_thread[32];
static char dm_peer[24];
static int dm_unread;

static char input[TEXT_MAX];
static int input_len;
static char status[80];

/* ---- list views --------------------------------------------------------- */

#define LIST_MAX 60
#define LABEL_MAX 80
static char list_text[LIST_MAX][LABEL_MAX];
static char list_id[LIST_MAX][48];
static char list_peer[LIST_MAX][24];
static int list_count;
static ui_list list;

static int door_key(void *ctx) { IGNORE(ctx); return ae_key(); }
static int door_pending(void *ctx) { IGNORE(ctx); return ae_input_pending(); }
static void door_settle(void *ctx) { IGNORE(ctx); ae_delay_ticks(1); }
static void door_flush(void *ctx) { IGNORE(ctx); ui_screen_flush(&screen); }

static void set_status(const char *text)
{
    strncpy(status, text, sizeof status - 1);
    status[sizeof status - 1] = '\0';
}

/** What the server's error code means to a caller. */
static void status_for_error(int rc)
{
    if (rc == AE_CHAT_ERR_TRANSPORT) { set_status("Cannot reach the chat server."); return; }
    if (strcmp(chat.error, "muted") == 0) set_status("You are muted in this room.");
    else if (strcmp(chat.error, "banned") == 0) set_status("You are banned from this room.");
    else if (strcmp(chat.error, "not_member") == 0) set_status("Join the room first.");
    else if (strcmp(chat.error, "not_found") == 0) set_status("Not found.");
    else if (strcmp(chat.error, "invite_required") == 0) set_status("That room is private.");
    else if (strcmp(chat.error, "too_long") == 0) set_status("Message too long.");
    else if (strcmp(chat.error, "rate_limited") == 0) set_status("Slow down a moment.");
    else if (strcmp(chat.error, "forbidden") == 0) set_status("Not allowed.");
    else if (strcmp(chat.error, "conflict") == 0) set_status("Already sent.");
    else set_status("The chat server refused that.");
}

/** Text from the wire is Latin-1 for the screen: no control bytes, no ink marker. */
static void clean(char *dst, size_t cap, const char *src)
{
    size_t n = 0;
    for (; *src != '\0' && n + 1 < cap; src++) {
        unsigned char ch = (unsigned char)*src;
        dst[n++] = (ch < 32 || ch == 127) ? ' ' : (char)ch;
    }
    dst[n] = '\0';
}

/* ---- message store ------------------------------------------------------ */

static void msgs_clear(void)
{
    msg_count = 0;
    scroll_back = 0;
}

static msg_line *msg_by_id(const char *id)
{
    int i;
    for (i = 0; i < msg_count; i++) {
        if (msgs[i].id[0] != '\0' && strcmp(msgs[i].id, id) == 0) return &msgs[i];
    }
    return 0;
}

/** Inserts by seq, oldest first; a message id already shown is not shown twice. */
static msg_line *msg_add(long seq, const char *id, const char *user, int color, const char *text, int system)
{
    int at, i;
    msg_line *m;
    if (id[0] != '\0' && msg_by_id(id) != 0) return 0;
    if (msg_count == MSG_MAX) {
        for (i = 1; i < msg_count; i++) msgs[i - 1] = msgs[i];
        msg_count--;
    }
    at = msg_count;
    while (at > 0 && msgs[at - 1].seq > seq) at--;
    for (i = msg_count; i > at; i--) msgs[i] = msgs[i - 1];
    msg_count++;
    m = &msgs[at];
    memset(m, 0, sizeof *m);
    m->seq = seq;
    m->number = ++msg_number;
    m->color = color;
    m->system = system;
    clean(m->id, sizeof m->id, id);
    clean(m->user, sizeof m->user, user);
    clean(m->text, sizeof m->text, text);
    return m;
}

static msg_line *msg_by_number(int number)
{
    int i;
    for (i = 0; i < msg_count; i++) if (msgs[i].number == number) return &msgs[i];
    return 0;
}

static void system_line(const char *text)
{
    msg_add(chat.last_seq, "", "*", 0, text, 1);
}

/** Reads history rows (seq|id|user|at|replyTo|threadId|roleColor|text) into the pane. */
static void take_history(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= AE_CHAT_ROW_FIELDS) {
        msg_add(atol(f[0]), f[1], f[2], atoi(f[6]), f[7], 0);
    }
}

/** Applies the rows of an events poll to the pane and the counters. */
static int take_events(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    int changed = 0;
    char line[TEXT_MAX];
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= AE_CHAT_ROW_FIELDS) {
        long seq = atol(f[0]);
        const char *type = f[1], *room = f[2], *user = f[3], *ref = f[4];
        int in_room = view == VIEW_CHAT && dm_thread[0] == '\0' && strcmp(room, room_id) == 0;
        if (strcmp(type, "message") == 0 && in_room) {
            if (msg_add(seq, ref, user, atoi(f[6]), f[7], 0) != 0) changed = 1;
        } else if (strcmp(type, "dm") == 0) {
            char want[40];
            sprintf(want, "dm:%.30s", dm_thread);
            if (view == VIEW_CHAT && dm_thread[0] != '\0' && strcmp(room, want) == 0) {
                if (msg_add(seq, ref, user, atoi(f[6]), f[7], 0) != 0) changed = 1;
            } else if (strcmp(user, handle) != 0) {
                dm_unread++;
                changed = 1;
            }
        } else if (strcmp(type, "react") == 0 && in_room) {
            msg_line *m = msg_by_id(ref);
            if (m != 0) { m->reacts++; changed = 1; }
        } else if ((strcmp(type, "joined") == 0 || strcmp(type, "left") == 0) && in_room) {
            sprintf(line, "%.30s %s", user, type[0] == 'j' ? "joined" : "left");
            msg_add(seq, "", "*", 0, line, 1);
            changed = 1;
        } else if (strcmp(type, "topic") == 0 && in_room) {
            clean(room_topic, sizeof room_topic, f[7]);
            changed = 1;
        } else if (strcmp(type, "kicked") == 0 && strcmp(user, handle) == 0 && in_room) {
            system_line("You were removed from this room.");
            room_id[0] = '\0';
            changed = 1;
        }
    }
    return changed;
}

/* ---- drawing ------------------------------------------------------------ */

static void draw_masthead(const char *title)
{
    ui_masthead_draw_tick(&screen.buf, 1, 1, screen.cols, title, theme->rail,
                          UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), 0);
}

static void say(int row, int token, const char *text)
{
    ansi_color(&screen.buf, UI_TOKEN(token), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen.buf, row, 2, text, screen.cols - 2);
}

static void draw_status(void)
{
    char line[120];
    ansi_color(&screen.buf, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR), 0);
    ansi_fill(&screen.buf, screen.rows - 1, 1, screen.cols, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
    if (view == VIEW_CHAT && dm_thread[0] != '\0') {
        sprintf(line, " DM with %.20s  DM unread %d  %s", dm_peer, dm_unread, status);
    } else if (view == VIEW_CHAT) {
        sprintf(line, " #%.24s  %d here  DM unread %d  %s", room_name, room_members, dm_unread, status);
    } else {
        sprintf(line, " DM unread %d  %s", dm_unread, status);
    }
    ansi_text(&screen.buf, screen.rows - 1, 1, line, screen.cols);
}

static void draw_input(void)
{
    char shown[TEXT_MAX + 4];
    int avail = screen.cols - 4;
    const char *tail = input;
    if (input_len > avail) tail = input + (input_len - avail);
    sprintf(shown, "> %s", tail);
    ansi_color(&screen.buf, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
    ansi_fill(&screen.buf, screen.rows, 1, screen.cols, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND));
    ansi_text(&screen.buf, screen.rows, 1, shown, screen.cols);
}

/** Rows a message needs at this width, header included. */
static int msg_header(const msg_line *m, char *out)
{
    if (m->system) return sprintf(out, "* ");
    return sprintf(out, "%d %s: ", m->number, m->user);
}

static void draw_msg_rows(const msg_line *m, int first_row, int nrows, int width)
{
    char head[64], full[TEXT_MAX + 80], reacts[16], chunk[160];
    int hl, total, k;
    hl = msg_header(m, head);
    reacts[0] = '\0';
    if (m->reacts > 0) sprintf(reacts, " [+%d]", m->reacts);
    sprintf(full, "%s%s%s", head, m->text, reacts);
    total = (int)strlen(full);
    for (k = 0; k < nrows; k++) {
        int start = k * width, len = total - start, hpart, col = 1;
        if (len > width) len = width;
        if (len < 0) len = 0;
        memcpy(chunk, full + start, (size_t)len);
        chunk[len] = '\0';
        hpart = hl - start;
        if (hpart < 0) hpart = 0;
        if (hpart > len) hpart = len;
        if (hpart > 0) {
            char hbuf[160];
            int fg = m->system ? UI_TOKEN(UI_T_DIM) : (m->color > 0 && m->color < 16 ? m->color : UI_TOKEN(UI_T_ACCENT));
            memcpy(hbuf, chunk, (size_t)hpart);
            hbuf[hpart] = '\0';
            ansi_color(&screen.buf, fg, UI_TOKEN(UI_T_GROUND), 0);
            ansi_text(&screen.buf, first_row + k, col, hbuf, hpart);
            col += hpart;
        }
        if (len > hpart) {
            ansi_color(&screen.buf, m->system ? UI_TOKEN(UI_T_DIM) : UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
            ansi_text(&screen.buf, first_row + k, col, chunk + hpart, len - hpart);
        }
    }
}

static void draw_chat(void)
{
    int pane_top = 3, pane_bottom = screen.rows - 2;
    int row, i, width = screen.cols - 1, r;
    char title[96];
    ansi_clear(&screen.buf);
    if (dm_thread[0] != '\0') sprintf(title, "LIVECHAT - DM with %.30s", dm_peer);
    else sprintf(title, "LIVECHAT - #%.30s", room_name);
    draw_masthead(title);
    if (dm_thread[0] == '\0' && room_topic[0] != '\0') say(2, UI_T_DIM, room_topic);
    row = pane_bottom;
    for (i = msg_count - 1 - scroll_back; i >= 0 && row >= pane_top; i--) {
        char head[64];
        int hl = msg_header(&msgs[i], head);
        int total = hl + (int)strlen(msgs[i].text) + (msgs[i].reacts > 0 ? 8 : 0);
        int nrows = (total + width - 1) / width;
        if (nrows < 1) nrows = 1;
        r = row - nrows + 1;
        if (r < pane_top) break;
        draw_msg_rows(&msgs[i], r, nrows, width);
        row = r - 1;
    }
    draw_status();
    draw_input();
}

static const char *list_row(void *ctx, int i) { IGNORE(ctx); return list_text[i]; }

static void list_setup(void)
{
    ui_list_init(&list);
    list.top = 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = screen.rows - 5;
    list.count = list_count;
    list.row = list_row;
    list.context = 0;
    list.borders = 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT);
    list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);
}

static void draw_list_view(const char *title, const char *hint)
{
    ansi_clear(&screen.buf);
    draw_masthead(title);
    if (list_count == 0) say(3, UI_T_DIM, view == VIEW_ROOMS ? "No rooms yet. Press N to make one." : "Nothing here yet.");
    else ui_list_draw(&list, &screen.buf);
    say(screen.rows - 2, UI_T_DIM, hint);
    draw_status();
}

static void draw_help(void)
{
    ansi_clear(&screen.buf);
    draw_masthead("LIVECHAT - HELP");
    say(3, UI_T_INK, "Type a line and press Enter to say it.");
    say(4, UI_T_INK, "/j room      join a room by its id");
    say(5, UI_T_INK, "/n name      make a public room");
    say(6, UI_T_INK, "/np name     make a private room");
    say(7, UI_T_INK, "/r n emoji   react to message n");
    say(8, UI_T_INK, "/t n text    reply in a thread to message n");
    say(9, UI_T_INK, "/d user text send a direct message");
    say(10, UI_T_INK, "/w           who is on");
    say(11, UI_T_INK, "/l           back to the room list");
    say(12, UI_T_INK, "/q           leave the door");
    say(13, UI_T_INK, "PgUp and PgDn scroll. Esc goes back.");
    say(15, UI_T_DIM, "Press any key.");
    draw_status();
}

static void redraw(void)
{
    switch (view) {
    case VIEW_ROOMS: draw_list_view("LIVECHAT - ROOMS", "Enter join  N new room  D messages  W who  R refresh  ? help  Q quit"); break;
    case VIEW_DMS: draw_list_view("LIVECHAT - DIRECT MESSAGES", "Enter open  Esc back"); break;
    case VIEW_WHO: draw_list_view("LIVECHAT - WHO IS ON", "Esc back"); break;
    case VIEW_HELP: draw_help(); break;
    case VIEW_CHAT: draw_chat(); break;
    }
    ui_screen_cursor(&screen, view == VIEW_CHAT);
    ui_screen_flush(&screen);
}

/* ---- loading the list views --------------------------------------------- */

static void list_add(const char *text, const char *id, const char *peer)
{
    if (list_count >= LIST_MAX) return;
    clean(list_text[list_count], LABEL_MAX, text);
    clean(list_id[list_count], sizeof list_id[0], id);
    clean(list_peer[list_count], sizeof list_peer[0], peer);
    list_count++;
}

static int load_rooms(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char line[LABEL_MAX + 40];
    int rc = ae_chat_rooms(&chat);
    list_count = 0;
    if (rc != AE_CHAT_OK) { status_for_error(rc); return rc; }
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 5) {
        /* id|name|topic|visibility|members|owner */
        sprintf(line, "#%-16.16s %3d  %-7.7s %.30s", f[1], atoi(f[4]), f[3], f[2]);
        list_add(line, f[0], "");
    }
    list_setup();
    return AE_CHAT_OK;
}

static int load_dms(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char line[LABEL_MAX + 40];
    int rc = ae_chat_dm_list(&chat);
    list_count = 0;
    if (rc != AE_CHAT_OK) { status_for_error(rc); return rc; }
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 4) {
        /* threadId|peer|lastAt|unread */
        sprintf(line, "%-20.20s unread %d", f[1], atoi(f[3]));
        list_add(line, f[0], f[1]);
    }
    list_setup();
    return AE_CHAT_OK;
}

static int load_who(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char line[LABEL_MAX + 40];
    int rc = ae_chat_who(&chat);
    list_count = 0;
    if (rc != AE_CHAT_OK) { status_for_error(rc); return rc; }
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 5) {
        /* user|room|sysop|roleColor|idleSeconds */
        sprintf(line, "%-20.20s in #%-14.14s idle %ds%s", f[0], f[1], atoi(f[4]), atoi(f[2]) ? "  sysop" : "");
        list_add(line, f[0], f[0]);
    }
    list_setup();
    return AE_CHAT_OK;
}

/* ---- actions ------------------------------------------------------------ */

static void do_poll(void)
{
    if (ae_chat_poll(&chat, 0) == AE_CHAT_OK) {
        if (take_events() && view == VIEW_CHAT) redraw();
        else if (view != VIEW_CHAT) { draw_status(); ui_screen_flush(&screen); }
    }
}

static void enter_room(const char *id)
{
    int rc;
    msgs_clear();
    dm_thread[0] = '\0';
    rc = ae_chat_join(&chat, id, room_name, sizeof room_name, room_topic, sizeof room_topic, &room_members);
    if (rc != AE_CHAT_OK) { status_for_error(rc); return; }
    clean(room_id, sizeof room_id, id);
    clean(room_name, sizeof room_name, room_name);
    clean(room_topic, sizeof room_topic, room_topic);
    if (ae_chat_history(&chat, room_id, 0, 30) == AE_CHAT_OK) take_history();
    set_status("");
    view = VIEW_CHAT;
}

static void open_dm(const char *thread, const char *peer)
{
    msgs_clear();
    clean(dm_thread, sizeof dm_thread, thread);
    clean(dm_peer, sizeof dm_peer, peer);
    if (ae_chat_dm_history(&chat, dm_thread, 0, 30) == AE_CHAT_OK) take_history();
    set_status("");
    view = VIEW_CHAT;
}

static void to_rooms(void)
{
    if (room_id[0] != '\0') ae_chat_leave(&chat, room_id);
    room_id[0] = '\0';
    dm_thread[0] = '\0';
    msgs_clear();
    load_rooms();
    view = VIEW_ROOMS;
}

/** Returns the rest of `text` after one word, or "" . */
static const char *after_word(const char *text)
{
    while (*text != '\0' && *text != ' ') text++;
    while (*text == ' ') text++;
    return text;
}

static void arg_word(const char *text, char *out, size_t cap)
{
    size_t n = 0;
    while (*text == ' ') text++;
    while (*text != '\0' && *text != ' ' && n + 1 < cap) out[n++] = *text++;
    out[n] = '\0';
}

/** Makes a room and walks into it. The server joins by id, so the id comes from the create reply;
 *  joining by the typed name found no room (the bug the rooms-view N key exposed). */
static void new_room(const char *name, const char *visibility)
{
    char id[sizeof room_id];
    int rc = ae_chat_room_create(&chat, name, "", visibility, id, (int)sizeof id);
    if (rc != AE_CHAT_OK) { status_for_error(rc); return; }
    if (room_id[0] != '\0') ae_chat_leave(&chat, room_id);
    enter_room(id);
}

/** Runs one "/..." line. Returns 1 when the door should end. */
static int run_command(const char *line)
{
    char cmd[8], a[48];
    const char *rest = after_word(line + 1);
    int rc, n;
    arg_word(line + 1, cmd, sizeof cmd);
    if (strcmp(cmd, "q") == 0) return 1;
    if (strcmp(cmd, "?") == 0 || strcmp(cmd, "h") == 0) { help_from = view; view = VIEW_HELP; return 0; }
    if (strcmp(cmd, "l") == 0) { to_rooms(); return 0; }
    if (strcmp(cmd, "w") == 0) { if (load_who() == AE_CHAT_OK) view = VIEW_WHO; return 0; }
    if (strcmp(cmd, "j") == 0) {
        arg_word(rest, a, sizeof a);
        if (a[0] == '#') memmove(a, a + 1, strlen(a));
        if (a[0] == '\0') { set_status("Usage: /j room"); return 0; }
        if (room_id[0] != '\0') ae_chat_leave(&chat, room_id);
        enter_room(a);
        return 0;
    }
    if (strcmp(cmd, "n") == 0 || strcmp(cmd, "np") == 0) {
        if (*rest == '\0') { set_status("Usage: /n name"); return 0; }
        new_room(rest, cmd[1] == 'p' ? "private" : "public");    /* the whole rest: a name may have spaces */
        return 0;
    }
    if (strcmp(cmd, "r") == 0 || strcmp(cmd, "t") == 0) {
        msg_line *m;
        arg_word(rest, a, sizeof a);
        n = atoi(a);
        m = msg_by_number(n);
        rest = after_word(rest);
        if (m == 0 || m->system || m->id[0] == '\0') { set_status("No such message number."); return 0; }
        if (*rest == '\0') { set_status(cmd[0] == 'r' ? "Usage: /r n emoji" : "Usage: /t n text"); return 0; }
        if (cmd[0] == 'r') {
            int count = 0;
            rc = ae_chat_react(&chat, m->id, rest, &count);
            if (rc == AE_CHAT_OK) { set_status("Reacted."); } else status_for_error(rc);
        } else {
            rc = ae_chat_thread(&chat, m->id, rest);
            if (rc == AE_CHAT_OK) set_status("Thread reply sent."); else status_for_error(rc);
        }
        return 0;
    }
    if (strcmp(cmd, "d") == 0) {
        char tid[32];
        arg_word(rest, a, sizeof a);
        rest = after_word(rest);
        if (a[0] == '\0' || *rest == '\0') { set_status("Usage: /d user text"); return 0; }
        rc = ae_chat_dm(&chat, a, rest, tid, sizeof tid);
        if (rc == AE_CHAT_OK) {
            if (dm_thread[0] != '\0' && strcmp(a, dm_peer) == 0) do_poll();
            set_status("Direct message sent.");
        } else status_for_error(rc);
        return 0;
    }
    set_status("Unknown command. Type /? for help.");
    return 0;
}

/** Enter in the chat view. Returns 1 when the door should end. */
static int submit(void)
{
    int rc, ended = 0;
    if (input_len == 0) return 0;
    if (input[0] == '/') {
        ended = run_command(input);
    } else if (dm_thread[0] != '\0') {
        char tid[32];
        rc = ae_chat_dm(&chat, dm_peer, input, tid, sizeof tid);
        if (rc == AE_CHAT_OK) { set_status(""); do_poll(); } else status_for_error(rc);
    } else if (room_id[0] != '\0') {
        rc = ae_chat_send(&chat, room_id, input, 0, 0);
        if (rc == AE_CHAT_OK) { set_status(""); do_poll(); } else status_for_error(rc);
    }
    input[0] = '\0';
    input_len = 0;
    return ended;
}

static void door_idle(void *ctx)
{
    IGNORE(ctx);
    ae_delay_ticks(25);
    if (++idle_count >= poll_steps) {
        idle_count = 0;
        do_poll();
    }
}

/* ---- keys --------------------------------------------------------------- */

/** N in the rooms view: the only way to make a room when the list is empty (/n lives in the chat
 *  view's input line). Returns -1 when the caller went away mid-prompt. */
static int prompt_new_room(void)
{
    char name[48];
    ui_input_style st;
    int got;
    ui_input_style_init(&st);
    st.row = screen.rows - 3;                                /* above the hint row, never on the masthead */
    st.left = 2;
    st.cols = screen.cols - 4;
    st.fg = UI_TOKEN(UI_T_INK);
    st.bg = UI_TOKEN(UI_T_GROUND);
    st.ink = UI_TOKEN(UI_T_ACCENT);
    name[0] = '\0';
    got = ui_input(&screen.buf, &keys, &pushback, &st, "New public room: ", name, (int)sizeof name);
    if (got < 0) return -1;
    if (got > 0) new_room(name, "public");
    return 0;
}


static int key_list(int key, int *ended)
{
    int moved = 1;
    switch (key) {
    case UI_KEY_UP: ui_list_move(&list, -1); break;
    case UI_KEY_DOWN: ui_list_move(&list, 1); break;
    case UI_KEY_PGUP: ui_list_move(&list, -(list.height - 1)); break;
    case UI_KEY_PGDN: ui_list_move(&list, list.height - 1); break;
    case UI_KEY_HOME: ui_list_select(&list, 0); break;
    case UI_KEY_END: ui_list_select(&list, list_count - 1); break;
    default: moved = 0; break;
    }
    if (moved) return 1;
    if (key == UI_KEY_F1 || key == '?') { help_from = view; view = VIEW_HELP; return 1; }
    if (view == VIEW_ROOMS) {
        if (key == 'q' || key == 'Q') { *ended = 1; return 1; }
        if (key == 'r' || key == 'R') { load_rooms(); return 1; }
        if (key == 'n' || key == 'N') { if (prompt_new_room() < 0) *ended = 1; return 1; }
        if (key == 'd' || key == 'D') { if (load_dms() == AE_CHAT_OK) view = VIEW_DMS; return 1; }
        if (key == 'w' || key == 'W') { if (load_who() == AE_CHAT_OK) view = VIEW_WHO; return 1; }
        if (key == UI_KEY_ENTER || key == '\r' || key == '\n') {
            if (list_count > 0) enter_room(list_id[list.selected]);
            return 1;
        }
        if (key == UI_KEY_ESC) { *ended = 1; return 1; }
    } else if (view == VIEW_DMS) {
        if (key == UI_KEY_ENTER || key == '\r' || key == '\n') {
            if (list_count > 0) { dm_unread = 0; open_dm(list_id[list.selected], list_peer[list.selected]); }
            return 1;
        }
        if (key == UI_KEY_ESC || key == 'q' || key == 'Q') { load_rooms(); view = VIEW_ROOMS; return 1; }
    } else if (view == VIEW_WHO) {
        if (key == UI_KEY_ESC || key == 'q' || key == 'Q') { load_rooms(); view = VIEW_ROOMS; return 1; }
    }
    return 0;
}

static int key_chat(int key, int *ended)
{
    if (key == UI_KEY_F1) { help_from = view; view = VIEW_HELP; return 1; }
    if (key == UI_KEY_ESC) { to_rooms(); return 1; }
    if (key == UI_KEY_PGUP) { if (scroll_back < msg_count - 1) scroll_back += 5; if (scroll_back > msg_count - 1) scroll_back = msg_count - 1; return 1; }
    if (key == UI_KEY_PGDN) { scroll_back -= 5; if (scroll_back < 0) scroll_back = 0; return 1; }
    if (key == UI_KEY_ENTER || key == '\r' || key == '\n') {
        if (submit()) *ended = 1;
        return 1;
    }
    if ((key == 8 || key == 127) && input_len > 0) { input[--input_len] = '\0'; return 1; }
    if (((key >= 32 && key < 127) || (key >= 160 && key < 256)) && input_len + 1 < (int)sizeof input && input_len < AE_CHAT_TEXT_MAX) {
        input[input_len++] = (char)key;
        input[input_len] = '\0';
        return 1;
    }
    return 0;
}

static void message_screen(const char *l1, const char *l2)
{
    ansi_clear(&screen.buf);
    draw_masthead("LIVECHAT");
    say(3, UI_T_INK, l1);
    say(4, UI_T_INK, l2);
    say(6, UI_T_DIM, "Press any key.");
    ui_screen_flush(&screen);
    ui_key_read(&keys, &pushback);
}

int main(int argc, char **argv)
{
    ae_session session;
    ae_chat_config cfg;
    char theme_id[32];
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    int ended = 0;

    /* A fresh run starts in the room list with nothing joined (a host test calls main more than once). */
    view = VIEW_ROOMS; help_from = VIEW_ROOMS; idle_count = 0; pushback = -1;
    msg_count = 0; msg_number = 0; scroll_back = 0;
    room_id[0] = '\0'; dm_thread[0] = '\0'; input_len = 0; input[0] = '\0'; status[0] = '\0';
    list_count = 0;

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(&session, session_storage, (long)sizeof(session_storage), node) != 0) {
        ae_shutdown();
        return 20;
    }
    ui_screen_open(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    ae_user_theme(&session, theme_id, (int)sizeof(theme_id));
    theme = ui_theme_by_id(theme_id);
    ansi_set_palette(&screen.buf, theme->rgb, theme->idx, UI_TOKEN_COUNT);
    ae_user_name(&session, handle, (int)sizeof(handle));
    if (handle[0] == '\0') strcpy(handle, "Anon");

    keys.next = door_key;
    keys.pending = door_pending;
    keys.settle = door_settle;
    keys.idle = door_idle;
    keys.flush = door_flush;
    keys.ctx = 0;

    if (!ae_chat_config_load(&cfg, LIVECHAT_CFG_PATH)) {
        message_screen("This door has no LIVECHAT.cfg beside it.", "A sysop sets Host= and BoardKey= there.");
        ui_screen_close(&screen);
        ae_shutdown();
        return 0;
    }
    if (ae_chat_open(&chat, &cfg, handle, ae_user_level(&session) >= 255) != AE_CHAT_OK) {
        message_screen("The chat server did not answer.", "Try again in a moment.");
        ui_screen_close(&screen);
        ae_shutdown();
        return 0;
    }

    load_rooms();
    list_setup();
    redraw();
    while (!ended) {
        int key = ui_key_read(&keys, &pushback);
        int handled;
        if (key < 0) break;
        if (view == VIEW_HELP) { view = help_from; redraw(); continue; }
        handled = (view == VIEW_CHAT) ? key_chat(key, &ended) : key_list(key, &ended);
        if (handled) {
            idle_count = 0;
            if (!ended) redraw();
        }
    }

    if (room_id[0] != '\0') ae_chat_leave(&chat, room_id);
    ae_chat_close(&chat);
    ui_screen_close(&screen);
    ae_shutdown();
    return 0;
}
