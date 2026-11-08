/*
 * LIVECHAT68 - the federated chat room, in C, on a 68K Amiga.
 *
 * One chat shared by every board with a key, served by the door server at
 * /chat/v1 (see CHAT-API.md). This door is a plain client: it holds no room
 * state of its own beyond the lines on screen, and everything it shows came
 * back from the server as `|`-separated Latin-1 rows.
 *
 * THE SCREEN is the TS LIVECHAT door's, cell for cell (livechat_ui.c draws it
 * from an lc_model). Every key changes the model, lc_draw paints the whole
 * frame into the canvas' back buffer, and ui_cells_flush sends only the cells
 * that differ from what the terminal already shows. A typed letter costs one
 * or two cells on the wire, never a repaint.
 *
 * WHO TALKS. The caller's handle is read from the session at startup and is
 * NEVER typed, so nobody speaks as somebody else.
 *
 * HOW IT STAYS LIVE. There is no thread and no timer on a 68K door. The idle
 * hook of ui_key_read runs while no key is waiting: it sleeps half a second,
 * and every POLL_STEPS sleeps asks /events.txt with wait=0. Keys and mouse
 * wakes do not reset that count, so moving the mouse never starves the poll. A send is
 * followed by one poll at once, and that poll is the only way the caller's
 * own line reaches the pane, so there is one display path, deduplicated by
 * message id.
 *
 * KEYS (as the TS door): Tab / Shift-Tab cycle input, sidebar and menu bar;
 * Enter sends, joins the sidebar room or opens the DM; F1 help, F2 sidebar,
 * F3 next channel; PgUp/PgDn scroll; Ctrl+Q quits (Ctrl+C is the board break key, K09). Commands are the
 * TS ones (/join /leave /create /rooms /who /msg /reply /react /thread /clear /help
 * /quit) and the old short forms (/j /n /np /l /w /d /r /t /? /q).
 *
 * Menu entries the TS door has but this wire does not (emoji picker, files,
 * pins, search, themes) are drawn and do nothing: no fake data.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "aedoor.h"
#include "ae_board_screen.h"
#include "ae_chat.h"
#include "ae_host.h"
#include "ae_session.h"
#include "ui_ansi.h"
#include "ui_cells.h"
#include "ui_input.h"
#include "ui_key.h"
#include "ui_screen.h"
#include "livechat_ui.h"

/* Where the key file sits; the host test points it at a file of its own. */
#ifndef LIVECHAT_CFG_PATH
#define LIVECHAT_CFG_PATH "PROGDIR:LIVECHAT.cfg"
#endif

/* Marks a parameter used. vbcc warns on a (void) cast ("statement has no effect"); this does not. */
#define IGNORE(p) do { if ((p) != 0) { } } while (0)

static char frame_buffer[16384];
static char session_storage[AE_SESSION_MIN_STORAGE];
static ui_screen screen;
static ui_key_source keys;
static int pushback = -1;
static ui_cells cells;
static lc_model M;

static ae_chat chat;
static char handle[32];

/* The door sleeps IDLE_SLEEP_TICKS (1/50 s) per idle call, so a key waits at most that long before
   the key loop sees it. It used to sleep 25 ticks (half a second) and every key paid for it. The
   network poll cadence is kept in wall time: a "poll step" is POLL_STEP_TICKS (25 ticks, half a
   second), and the door polls every poll_steps of them: 12 steps is six seconds. The door's only
   clock is the ticks it has slept, so idle_ticks counts those. */
#define IDLE_SLEEP_TICKS 2
#define POLL_STEP_TICKS 25
#define POLL_STEPS_DEFAULT 12
static int poll_steps = POLL_STEPS_DEFAULT;
static int poll_step_ticks = POLL_STEP_TICKS;
static int idle_ticks;

static char room_id[48];
static char room_name[48];
static char room_topic[80];
static int room_members;
static char dm_thread[32];
static char dm_peer[24];
static int msg_number;
static int help_shown;          /* times the help overlay opened (the host test reads it) */
static int is_sysop;            /* the caller's level is 255: sysop items in the context menus */
static int user_level;          /* the caller's level: the TS commands' minSecLevel gates */
static int mouse_events;        /* mouse events dispatched (a test sentinel) */
static int bar_drag;            /* left button went down on the chat scrollbar and is still held (R1a) */
static int keep_lines;          /* join_room adds to the pane instead of starting it afresh */

/* The room list from the last rooms.txt, for the sidebar and F3. */
#define ROOMS_MAX 24
static char rooms_id[ROOMS_MAX][48];
static char rooms_name[ROOMS_MAX][40];
static int rooms_count;

enum { PROMPT_JOIN, PROMPT_CREATE };
static int prompt_kind;

static int door_key(void *ctx) { IGNORE(ctx); return ae_key(); }
static int door_pending(void *ctx) { IGNORE(ctx); return ae_input_pending(); }
static void door_settle(void *ctx) { IGNORE(ctx); ae_delay_ticks(1); }
static void door_flush(void *ctx) { IGNORE(ctx); ui_screen_flush(&screen); }
static void drain(void *ctx) { IGNORE(ctx); ui_screen_flush(&screen); }

static void copy(char *dst, size_t cap, const char *src)
{
    strncpy(dst, src, cap - 1);
    dst[cap - 1] = '\0';
}

/** Text from the wire is Latin-1 for the screen: no control bytes, so no canvas marker either. */
static void clean(char *dst, size_t cap, const char *src)
{
    size_t n = 0;
    for (; *src != '\0' && n + 1 < cap; src++) {
        unsigned char ch = (unsigned char)*src;
        dst[n++] = (ch < 32 || ch == 127) ? ' ' : (char)ch;
    }
    dst[n] = '\0';
}

/** "hh:mm" in local time for an epoch the server sent, seconds or milliseconds. */
static void hhmm_of(char *out, const char *epoch)
{
    char digits[12];
    time_t t;
    struct tm *tm;
    size_t n = strlen(epoch);
    if (n > 10) n = 10;                       /* milliseconds: the first ten digits are the seconds */
    memcpy(digits, epoch, n);
    digits[n] = '\0';
    t = (time_t)atol(digits);
    tm = localtime(&t);
    if (n == 0 || tm == 0) { strcpy(out, "--:--"); return; }
    sprintf(out, "%02d:%02d", tm->tm_hour % 24, tm->tm_min % 60);
}

static void hhmm_now(char *out)
{
    time_t t = time(0);
    struct tm *tm = localtime(&t);
    if (tm == 0) { strcpy(out, "--:--"); return; }
    sprintf(out, "%02d:%02d", tm->tm_hour % 24, tm->tm_min % 60);
}

/* ---- the pane's lines --------------------------------------------------- */

static void lines_clear(void)
{
    M.nlines = 0;
    lc_lines_changed(&M);
    M.scroll = 0;
    msg_number = 0;
}

static lc_line *line_by_id(const char *id)
{
    int i;
    for (i = 0; i < M.nlines; i++) {
        if (M.lines[i].id[0] != '\0' && strcmp(M.lines[i].id, id) == 0) return &M.lines[i];
    }
    return 0;
}

static lc_line *line_by_number(int number)
{
    int i;
    for (i = 0; i < M.nlines; i++) if (M.lines[i].number == number && number > 0) return &M.lines[i];
    return 0;
}

/** Takes the message `id` out of the pane (TS removeMessage: no line says so). */
static void line_remove(const char *id)
{
    int i, j = 0;
    for (i = 0; i < M.nlines; i++) {
        if (M.lines[i].id[0] != '\0' && strcmp(M.lines[i].id, id) == 0) continue;
        if (i != j) M.lines[j] = M.lines[i];
        j++;
    }
    M.nlines = j;
    lc_lines_changed(&M);
}

/** The caller's newest message in the pane (TS lastOwnMessageId), or 0. */
static lc_line *own_last(void)
{
    int i;
    for (i = M.nlines - 1; i >= 0; i--) {
        lc_line *l = &M.lines[i];
        if (l->number > 0 && l->id[0] != '\0' && strcmp(l->nick, handle) == 0) return l;
    }
    return 0;
}

/** The newest message in the pane (TS lastRoomMessageId), or 0. */
static lc_line *room_last(void)
{
    int i;
    for (i = M.nlines - 1; i >= 0; i--) {
        if (M.lines[i].number > 0 && M.lines[i].id[0] != '\0') return &M.lines[i];
    }
    return 0;
}

/** "nick: snippet" as TS reply-quote builds it: whitespace collapsed, trimmed, 60 characters kept. */
static void quote_of(const lc_line *p, char *out, int cap)
{
    char snip[61];
    const char *s = p->text;
    int n = 0, gap = 0;
    while (*s == ' ') s++;
    for (; *s != '\0' && n < 60; s++) {
        if (*s == ' ' || *s == '\t') { gap = 1; continue; }
        if (gap && n > 0) { snip[n++] = ' '; if (n == 60) break; }
        gap = 0;
        snip[n++] = *s;
    }
    snip[n] = '\0';
    snprintf(out, (size_t)cap, "%.24s: %s", p->nick, snip);
}

/** Opens a slot at `at`, dropping the oldest line when the pane is full. */
static lc_line *line_slot(int at)
{
    int i;
    lc_lines_changed(&M);                   /* every add and shift of the pane passes here; the caller fills the slot before the next draw */
    if (M.nlines == LC_LINES) {
        for (i = 1; i < M.nlines; i++) M.lines[i - 1] = M.lines[i];
        M.nlines--;
        if (at > 0) at--;
    }
    for (i = M.nlines; i > at; i--) M.lines[i] = M.lines[i - 1];
    M.nlines++;
    memset(&M.lines[at], 0, sizeof M.lines[at]);
    return &M.lines[at];
}

/* ---- ignore and mute: the server stores the ignore list; hiding the lines is this door's job. ---- */
#define HIDE_MAX 24
static char ignored[HIDE_MAX][32];      /* nicks (no @BOARD) the caller ignores: lines and DMs hidden */
static int nignored;
static char muted[HIDE_MAX][32];        /* nicks muted for this run only (TS mute-list): room lines hidden */
static int nmuted;

/** "alice@BOARD" -> "alice". */
static void nick_of(char *out, size_t cap, const char *user)
{
    size_t n = 0;
    if (*user == '@') user++;
    for (; *user != '\0' && *user != '@' && n + 1 < cap; user++) out[n++] = *user;
    out[n] = '\0';
}

static int same_nick(const char *a, const char *b)
{
    for (; *a != '\0' && *b != '\0'; a++, b++) {
        int x = (unsigned char)*a, y = (unsigned char)*b;
        if (x >= 'A' && x <= 'Z') x += 32;
        if (y >= 'A' && y <= 'Z') y += 32;
        if (x != y) return 0;
    }
    return *a == *b;
}

static int hide_find(char list[][32], int n, const char *nick)
{
    int i;
    for (i = 0; i < n; i++) if (same_nick(list[i], nick)) return i;
    return -1;
}

static void hide_add(char list[][32], int *n, const char *nick)
{
    if (hide_find(list, *n, nick) >= 0 || *n == HIDE_MAX) return;
    nick_of(list[*n], 32, nick);
    (*n)++;
}

static void hide_remove(char list[][32], int *n, const char *nick)
{
    int i = hide_find(list, *n, nick);
    if (i < 0) return;
    for (; i + 1 < *n; i++) memcpy(list[i], list[i + 1], 32);
    (*n)--;
}

/** Lines from someone the caller ignores or muted are not shown (never the caller's own). */
static int hidden_nick(const char *nick)
{
    char n[32];
    nick_of(n, sizeof n, nick);
    if (same_nick(n, handle)) return 0;
    return hide_find(ignored, nignored, n) >= 0 || hide_find(muted, nmuted, n) >= 0;
}

/** Reads the server's ignore list (IGNORES rows user|at) into the local one. */
static void load_ignores(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    nignored = 0;
    if (ae_chat_ignores(&chat) != AE_CHAT_OK) return;
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 1) hide_add(ignored, &nignored, f[0]);
}

/** A message, inserted by seq among the messages; one already shown (same id) is not shown twice. */
static lc_line *add_message(int kind, long seq, const char *id, const char *nick, const char *at, const char *text,
                            const char *reply_to)
{
    int pos = M.nlines;
    lc_line *l;
    char quote[sizeof l->quote];
    const lc_line *parent;
    if (id[0] != '\0' && line_by_id(id) != 0) return 0;
    if (hidden_nick(nick)) return 0;
    quote[0] = '\0';                                /* TS draws the quote only when the parent is loaded */
    if (reply_to[0] != '\0' && (parent = line_by_id(reply_to)) != 0) quote_of(parent, quote, (int)sizeof quote);
    while (pos > 0 && (M.lines[pos - 1].kind == LC_HISTORY || M.lines[pos - 1].kind == LC_LIVE)
           && M.lines[pos - 1].seq > seq) pos--;
    l = line_slot(pos);
    l->kind = kind;
    l->seq = seq;
    l->number = ++msg_number;
    clean(l->id, sizeof l->id, id);
    clean(l->nick, sizeof l->nick, nick);
    clean(l->text, sizeof l->text, text);
    hhmm_of(l->time, at);
    copy(l->quote, sizeof l->quote, quote);
    M.scroll = 0;
    return l;
}

/** "*** text ***" in grey, or "[hh:mm] text" in yellow: lines of the door's own, at the bottom. */
static void add_note(int kind, const char *text)
{
    lc_line *l = line_slot(M.nlines);
    l->kind = kind;
    l->seq = chat.last_seq;
    clean(l->text, sizeof l->text, text);
    if (kind == LC_ACTIVITY_LINE) hhmm_now(l->time);
    M.scroll = 0;
}

static void system_line(const char *text) { add_note(LC_SYSTEM, text); }

/* ---- modals ------------------------------------------------------------- */

static void message_modal(const char *title, const char *text)
{
    M.modal = LC_MODAL_MESSAGE;
    copy(M.modal_title, sizeof M.modal_title, title);
    copy(M.modal_text, sizeof M.modal_text, text);
}

/** What the server's error code means to a caller, as the TS door's error modal. */
static void show_error(int rc)
{
    const char *t;
    if (rc == AE_CHAT_ERR_TRANSPORT) t = "Cannot reach the chat server.";
    else if (strcmp(chat.error, "muted") == 0) t = "You are muted in this room.";
    else if (strcmp(chat.error, "banned") == 0) t = "You are banned from this room.";
    else if (strcmp(chat.error, "not_member") == 0) t = "Join the room first.";
    else if (strcmp(chat.error, "not_found") == 0) t = "Not found.";
    else if (strcmp(chat.error, "invite_required") == 0) t = "That room is private.";
    else if (strcmp(chat.error, "too_long") == 0) t = "Message too long.";
    else if (strcmp(chat.error, "rate_limited") == 0) t = "Slow down a moment.";
    else if (strcmp(chat.error, "forbidden") == 0) t = "Not allowed.";
    else if (strcmp(chat.error, "conflict") == 0) t = "Already sent.";
    else t = "The chat server refused that.";
    message_modal("Error", t);
}

static void open_prompt(int kind, const char *question)
{
    prompt_kind = kind;
    M.modal = LC_MODAL_PROMPT;
    copy(M.modal_title, sizeof M.modal_title, question);
    M.prompt[0] = '\0';
    M.prompt_len = 0;
}

static void open_help(void)
{
    M.help = 1;
    M.help_top = 0;
    help_shown++;
}

/* ---- the screen --------------------------------------------------------- */

static void present(void)
{
    int cr = 0, cc = 0;
    int caret = M.focus == LC_FOCUS_INPUT && !M.help && M.menu < 0
                && (M.modal == LC_MODAL_NONE || M.modal == LC_MODAL_PROMPT);
    lc_draw(&cells, &M, &cr, &cc);
    ui_cells_flush(&cells, &screen.buf, drain, 0);
    ui_screen_cursor(&screen, caret);
    if (caret) ansi_goto(&screen.buf, cr + 1, cc + 1);
    ui_screen_flush(&screen);
}

/* ---- the sidebar -------------------------------------------------------- */

static void side_add(int kind, int joined, const char *label, const char *id)
{
    lc_side *s;
    if (M.nside >= LC_SIDE_MAX) return;
    s = &M.side[M.nside++];
    memset(s, 0, sizeof *s);
    s->kind = kind;
    s->joined = joined;
    clean(s->label, sizeof s->label, label);
    clean(s->id, sizeof s->id, id);
}

/** Presence word -> the sidebar's status letter. */
static char status_char(const char *word)
{
    return strcmp(word, "away") == 0 ? 'a' : strcmp(word, "busy") == 0 ? 'b' : strcmp(word, "dnd") == 0 ? 'd' : 0;
}

static void side_add_user(const char *nick, const char *status, const char *text)
{
    lc_side *s;
    side_add(LC_SIDE_USER, 0, nick, nick);
    if (M.nside == 0 || M.side[M.nside - 1].kind != LC_SIDE_USER) return;
    s = &M.side[M.nside - 1];
    s->status = status_char(status);
    clean(s->note, sizeof s->note, text);
}

static int side_selectable(int i)
{
    return i >= 0 && i < M.nside && M.side[i].kind != LC_SIDE_HEAD && M.side[i].kind != LC_SIDE_BLANK;
}

static void load_sidebar(void);

/** F3 and a click on the status line: the sidebar shows the channels or the online users (TS switchSidebarTab). */
static void switch_tab(int users)
{
    M.side_tab = users;
    load_sidebar();
    system_line(users ? "Switched to users view" : "Switched to channels view");
}

/** Rebuilds the sidebar as the TS door has it: channels, the current room's people under it, then DMs. */
static void load_sidebar(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char users[16][24], ustat[16][8], utext[16][28];
    int nusers = 0, i, j, keep = M.side_sel;
    if (room_id[0] != '\0' && ae_chat_who(&chat) == AE_CHAT_OK) {
        while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 2) {     /* user|room|sysop|roleColor|idle */
            if (strcmp(f[1], room_id) == 0 && nusers < 16) {
                clean(ustat[nusers], sizeof ustat[0], f[5]);
                clean(utext[nusers], sizeof utext[0], f[6]);
                clean(users[nusers++], sizeof users[0], f[0]);
            }
        }
    }
    M.nside = 0;
    if (M.side_tab) {                       /* TS users tab: everyone online, not just this room */
        side_add(LC_SIDE_HEAD, 0, "ONLINE USERS", "");
        if (ae_chat_who(&chat) == AE_CHAT_OK) {
            while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 2) {
                char nm[24];
                clean(nm, sizeof nm, f[0]);
                side_add_user(nm, f[5], f[6]);
            }
        }
        M.side_sel = 0;
        return;
    }
    side_add(LC_SIDE_HEAD, 0, "TEXT CHANNELS", "");
    for (i = 0; i < rooms_count; i++) {
        int here = strcmp(rooms_id[i], room_id) == 0;
        side_add(LC_SIDE_ROOM, here, rooms_name[i], rooms_id[i]);
        if (here) for (j = 0; j < nusers; j++) side_add_user(users[j], ustat[j], utext[j]);
    }
    if (ae_chat_dm_list(&chat) == AE_CHAT_OK) {
        int first = 1;
        while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 2) {     /* threadId|peer|lastAt|unread */
            if (first) { side_add(LC_SIDE_BLANK, 0, "", ""); side_add(LC_SIDE_HEAD, 0, "DIRECT MESSAGES", ""); first = 0; }
            side_add(LC_SIDE_DM, 0, f[1], f[0]);
        }
    }
    M.side_sel = keep;
    if (!side_selectable(M.side_sel)) {
        for (i = 0; i < M.nside; i++) if (M.side[i].kind == LC_SIDE_ROOM && M.side[i].joined) M.side_sel = i;
        if (!side_selectable(M.side_sel)) M.side_sel = 1;
    }
}

static int load_rooms(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    int rc = ae_chat_rooms(&chat);
    rooms_count = 0;
    if (rc != AE_CHAT_OK) return rc;
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 5) {     /* id|name|topic|visibility|members|owner */
        if (rooms_count == ROOMS_MAX) continue;
        clean(rooms_id[rooms_count], sizeof rooms_id[0], f[0]);
        clean(rooms_name[rooms_count], sizeof rooms_name[0], f[1]);
        rooms_count++;
    }
    return AE_CHAT_OK;
}

/* ---- events ------------------------------------------------------------- */

static void side_user(const char *user, int add)
{
    int i, j;
    for (i = 0; i < M.nside; i++) {
        if (M.side[i].kind == LC_SIDE_USER && strcmp(M.side[i].id, user) == 0) {
            if (add) return;
            for (j = i + 1; j < M.nside; j++) M.side[j - 1] = M.side[j];
            M.nside--;
            if (M.side_sel >= M.nside) M.side_sel = M.nside - 1;
            return;
        }
    }
    if (!add) return;
    for (i = 0; i < M.nside; i++) {
        if (M.side[i].kind == LC_SIDE_ROOM && M.side[i].joined && M.nside < LC_SIDE_MAX) {
            for (j = M.nside; j > i + 1; j--) M.side[j] = M.side[j - 1];
            M.nside++;
            memset(&M.side[i + 1], 0, sizeof M.side[i + 1]);
            M.side[i + 1].kind = LC_SIDE_USER;
            clean(M.side[i + 1].label, sizeof M.side[i + 1].label, user);
            clean(M.side[i + 1].id, sizeof M.side[i + 1].id, user);
            return;
        }
    }
}

/** Replaces a message's reaction counts with the server's (reactions.txt rows emoji|count|mine): the
 *  TS door gets the full counts with every chat:reaction and keeps them per message the same way. */
static char reactions_loaded[24];      /* the id load_reactions last read: react_on skips a second read */

static void load_reactions(const char *id)
{
    char *f[AE_CHAT_ROW_FIELDS];
    lc_line *l = line_by_id(id);
    if (l == 0 || ae_chat_reactions(&chat, id) != AE_CHAT_OK) return;
    clean(reactions_loaded, sizeof reactions_loaded, id);
    lc_lines_changed(&M);
    l->nreact = 0;
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 3) {
        lc_react *r;
        if (atoi(f[1]) <= 0 || l->nreact == LC_REACT_MAX) continue;
        r = &l->react[l->nreact++];
        clean(r->emoji, sizeof r->emoji, f[0]);
        r->count = atoi(f[1]);
        r->mine = atoi(f[2]) != 0;
    }
}

/** A presence event: `text` is "status!statusText" on the wire (CHAT-API.md). The status word never holds a
    '!', so the first one splits it; a '!' in the note stays a '!'. */
static void side_presence(const char *user, const char *text)
{
    char nick[32], status[8], note[28];
    const char *bar = strchr(text, '!');
    size_t n = bar != 0 ? (size_t)(bar - text) : strlen(text);
    int i;
    if (n >= sizeof status) n = sizeof status - 1;
    memcpy(status, text, n);
    status[n] = '\0';
    clean(note, sizeof note, bar != 0 ? bar + 1 : "");
    nick_of(nick, sizeof nick, user);
    for (i = 0; i < M.nside; i++) {
        char id[32];
        if (M.side[i].kind != LC_SIDE_USER) continue;
        nick_of(id, sizeof id, M.side[i].id);
        if (!same_nick(id, nick)) continue;
        M.side[i].status = status_char(status);
        copy(M.side[i].note, sizeof M.side[i].note, note);
    }
}

/** Applies the rows of an events poll (seq|type|room|user|ref|at|color|text). */
static void take_events(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char line[LC_TEXT_MAX];
    char reacted[8][24];       /* messages whose counts changed; fetched after the rows, which share the reply buffer */
    int nreacted = 0, i;
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= AE_CHAT_ROW_MIN) {
        long seq = atol(f[0]);
        const char *type = f[1], *room = f[2], *user = f[3], *ref = f[4];
        int in_room = dm_thread[0] == '\0' && room_id[0] != '\0' && strcmp(room, room_id) == 0;
        if (strcmp(type, "message") == 0 && in_room) {
            add_message(LC_LIVE, seq, ref, user, f[5], f[7], f[8]);
        } else if (strcmp(type, "dm") == 0) {
            char want[40];
            sprintf(want, "dm:%.30s", dm_thread);
            if (dm_thread[0] != '\0' && strcmp(room, want) == 0) {
                add_message(LC_LIVE, seq, ref, user, f[5], f[7], "");
            } else if (strcmp(user, handle) != 0 && !hidden_nick(user)) {
                sprintf(line, "New direct message from %.24s", user);
                system_line(line);
            }
        } else if ((strcmp(type, "react") == 0 || strcmp(type, "unreact") == 0) && in_room) {
            /* TS chat-socket-handlers chat:reaction: an accent chat line and an activity line */
            sprintf(line, "[%.24s %s %.12s]", user, type[0] == 'u' ? "removed" : "reacted", f[7]);
            add_note(LC_NOTE, line);
            sprintf(line, "%.24s: %.12s", user, f[7]);
            add_note(LC_ACTIVITY_LINE, line);
            for (i = 0; i < nreacted && strcmp(reacted[i], ref) != 0; i++) {}
            if (i == nreacted && nreacted < 8 && line_by_id(ref) != 0) clean(reacted[nreacted++], sizeof reacted[0], ref);
        } else if ((strcmp(type, "joined") == 0 || strcmp(type, "left") == 0) && in_room) {
            int joined = type[0] == 'j';
            sprintf(line, "%.24s %s the room", user, joined ? "joined" : "left");
            system_line(line);
            sprintf(line, "%.24s %s", user, joined ? "joined" : "left");
            add_note(LC_ACTIVITY_LINE, line);
            if (strcmp(user, handle) != 0) side_user(user, joined);
        } else if (strcmp(type, "presence") == 0) {
            side_presence(user, f[7]);          /* TS chat:presence: the dot and the text change in the user list */
        } else if (strcmp(type, "edit") == 0) {
            lc_line *l = line_by_id(ref);       /* TS chat:edited: the rows of that id now read the new text */
            if (l != 0) { clean(l->text, sizeof l->text, f[7]); l->edited = 1; lc_lines_changed(&M); }
        } else if (strcmp(type, "delete") == 0) {
            line_remove(ref);                   /* TS chat:deleted: gone, nothing printed */
        } else if (strcmp(type, "topic") == 0 && in_room) {
            clean(room_topic, sizeof room_topic, f[7]);
            sprintf(M.pane_label, "%.40s - %.50s", room_name, room_topic);
            sprintf(line, "%.24s set the topic: %.200s", user[0] != '\0' ? user : "Someone", room_topic);
            system_line(line);
        } else if ((strcmp(type, "op") == 0 || strcmp(type, "deop") == 0) && in_room) {
            sprintf(line, "%.24s is %s a room operator", user[0] != '\0' ? user : "Someone", type[0] == 'd' ? "no longer" : "now");
            system_line(line);
        } else if ((strcmp(type, "kicked") == 0 || strcmp(type, "banned") == 0) && strcmp(user, handle) == 0 && in_room) {
            /* TS chat:kicked / chat:banned reach only the target; the server's kick is per room, so leave the room */
            sprintf(line, "You have been %s%s%.120s", type[0] == 'k' ? "kicked" : "banned", f[7][0] != '\0' ? ": " : "", f[7]);
            system_line(line);
            system_line("Disconnecting...");
            room_id[0] = '\0';
            M.room[0] = '\0';
        } else if (strcmp(type, "muted") == 0 && strcmp(user, handle) == 0 && in_room) {
            system_line("You have been muted");
        }
    }
    for (i = 0; i < nreacted; i++) load_reactions(reacted[i]);
}

static void do_poll(void)
{
    if (ae_chat_poll(&chat, 0) == AE_CHAT_OK) take_events();
}

/** Reacts and shows the result. The server keeps one row per user, emoji and message and sends a
 *  react event only when it added one, so a repeat comes back OK with no event; the counts are read
 *  back here when the poll did not already read them, else nothing on screen moves. */
static int react_on(const char *msg_id, const char *emoji)
{
    char id[24];
    int count = 0, rc;
    clean(id, sizeof id, msg_id);            /* the poll may move M.lines under the caller's row */
    rc = ae_chat_react(&chat, id, emoji, &count);
    if (rc != AE_CHAT_OK) return rc;
    reactions_loaded[0] = '\0';
    do_poll();
    if (strcmp(reactions_loaded, id) != 0) load_reactions(id);
    return AE_CHAT_OK;
}

/* ---- rooms and DMs ------------------------------------------------------ */

/** Reads history rows (seq|id|user|at|replyTo|threadId|roleColor|text), after a "--- n earlier ---" marker. */
static void take_history(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char note[48];
    int marker = M.nlines, n = 0;
    system_line("--- 0 earlier messages ---");
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= AE_CHAT_ROW_MIN) {
        if (add_message(LC_HISTORY, atol(f[0]), f[1], f[2], f[3], f[7], f[4]) != 0) n++;
    }
    if (n == 0) {                                  /* nothing earlier: no marker */
        int i;
        for (i = marker + 1; i < M.nlines; i++) M.lines[i - 1] = M.lines[i];
        M.nlines--;
        lc_lines_changed(&M);
        return;
    }
    sprintf(note, "--- %d earlier message%s ---", n, n == 1 ? "" : "s");
    copy(M.lines[marker].text, sizeof M.lines[marker].text, note);
    lc_lines_changed(&M);
}

/** Joins a room by id and shows it; the room left is the one before, once the new join worked. */
static int join_room(const char *id)
{
    char name[48], topic[80], line[128], old[48];
    int members = 0, rc;
    copy(old, sizeof old, room_id);
    rc = ae_chat_join(&chat, id, name, sizeof name, topic, sizeof topic, &members);
    if (rc != AE_CHAT_OK) { show_error(rc); return rc; }
    if (old[0] != '\0' && strcmp(old, id) != 0) ae_chat_leave(&chat, old);
    clean(room_id, sizeof room_id, id);
    clean(room_name, sizeof room_name, name);
    clean(room_topic, sizeof room_topic, topic);
    room_members = members;
    dm_thread[0] = '\0';
    copy(M.room, sizeof M.room, room_name);
    if (room_topic[0] != '\0') sprintf(M.pane_label, "%.40s - %.50s", room_name, room_topic);
    else copy(M.pane_label, sizeof M.pane_label, room_name);
    if (!keep_lines) lines_clear();
    sprintf(line, "Joined #%.40s (%d users)", room_name, room_members);
    system_line(line);
    sprintf(line, "Joined #%.40s", room_name);
    add_note(LC_ACTIVITY_LINE, line);
    if (ae_chat_history(&chat, room_id, 0, 30) == AE_CHAT_OK) take_history();
    load_sidebar();
    return AE_CHAT_OK;
}

static void leave_room(void)
{
    char line[80];
    if (room_id[0] == '\0') { system_line("You are not in a channel."); return; }
    ae_chat_leave(&chat, room_id);
    sprintf(line, "Left #%.40s", room_name);
    room_id[0] = '\0';
    M.room[0] = '\0';
    M.pane_label[0] = '\0';
    lines_clear();
    system_line(line);
    load_sidebar();
}

static void open_dm(const char *thread, const char *peer)
{
    char line[64];
    clean(dm_thread, sizeof dm_thread, thread);
    clean(dm_peer, sizeof dm_peer, peer);
    sprintf(M.pane_label, "@%.30s - Direct message", dm_peer);
    lines_clear();
    sprintf(line, "Direct messages with %.24s", dm_peer);
    system_line(line);
    if (ae_chat_dm_history(&chat, dm_thread, 0, 30) == AE_CHAT_OK) take_history();
}

static void next_channel(void)
{
    int i;
    if (rooms_count == 0) return;
    for (i = 0; i < rooms_count; i++) if (strcmp(rooms_id[i], room_id) == 0) break;
    join_room(rooms_id[(i + 1) % rooms_count]);
}

/** Makes a room and walks into it. The server joins by id, so the id comes from the create reply. */
static void new_room(const char *name, const char *visibility)
{
    char id[sizeof room_id], line[80];
    int rc = ae_chat_room_create(&chat, name, "", visibility, id, (int)sizeof id);
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    load_rooms();
    if (join_room(id) == AE_CHAT_OK) {
        sprintf(line, "Created #%.40s", room_name);
        system_line(line);
    }
}

static void list_rooms(void)
{
    char line[96];
    int i, rc = load_rooms();
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    sprintf(line, "Found %d room%s", rooms_count, rooms_count == 1 ? "" : "s");
    system_line(line);
    for (i = 0; i < rooms_count; i++) {
        sprintf(line, "#%.30s (%.40s)", rooms_name[i], rooms_id[i]);
        system_line(line);
    }
    load_sidebar();
}

static void list_who(void)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char line[128];
    int rc = ae_chat_who(&chat), n = 0;
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    system_line("Who is on");
    while (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) >= 5) {
        sprintf(line, "%.24s in #%.24s%s, idle %ds", f[0], f[1], atoi(f[2]) ? " (sysop)" : "", atoi(f[4]));
        system_line(line);
        n++;
    }
    if (n == 0) system_line("Nobody is on");
}

/* ---- commands ----------------------------------------------------------- */

/** Returns the rest of `text` after one word, or "". */
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

static int is_cmd(const char *cmd, const char *a, const char *b)
{
    return strcmp(cmd, a) == 0 || (b != 0 && strcmp(cmd, b) == 0);
}

static void join_typed(const char *text)
{
    char a[48];
    arg_word(text, a, sizeof a);
    if (a[0] == '#') memmove(a, a + 1, strlen(a));
    if (a[0] == '\0') { system_line("Usage: /join room"); return; }
    join_room(a);
}

/* ---- B2: message edit/delete, topic, moderation, invites, reactions (TS commands/) ---- */

static int digits(const char *s)
{
    if (*s == '\0') return 0;
    for (; *s != '\0'; s++) if (*s < '0' || *s > '9') return 0;
    return 1;
}

/** TS commands return `Usage: ...` as an error: the door prints `Error: <text>`. */
static void usage(const char *text)
{
    char t[120];
    sprintf(t, "Error: Usage: %.100s", text);
    system_line(t);
}

/** TS minSecLevel: below it the command answers `Permission denied. Need level N`. */
static int need_level(int level)
{
    char t[64];
    if (user_level >= level) return 1;
    sprintf(t, "Error: Permission denied. Need level %d", level);
    system_line(t);
    return 0;
}

/** `@name` / `name` as the server names a user: handle@BOARD, our own board when none is given.
 *  `shown` (may be NULL) gets the name without the `@` prefix, as the TS lines print it. */
static void target_user(const char *arg, char *out, size_t cap, char *shown, size_t shown_cap)
{
    const char *suffix = strchr(chat.user, '@');
    if (*arg == '@') arg++;
    if (shown != 0) copy(shown, shown_cap, arg);
    if (strchr(arg, '@') != 0 || suffix == 0) copy(out, cap, arg);
    else { copy(out, cap, arg); if (strlen(out) + strlen(suffix) < cap) strcat(out, suffix); }
}

/* ---- presence, whois, ignore (TS commands/user.ts, commands/ui.ts, whois-render.ts, profile-overlay.ts) ---- */

/** One PROFILE row: user|nick|board|status|statusText|firstSeen|lastSeen|idleSeconds|online|sharedRooms. */
typedef struct {
    char nick[32], board[24], status[10], text[64], last[8], rooms[96];
    int idle, online;
} profile_info;

/** Reads a user's profile. AE_CHAT_OK, or the error (not_found: the server never saw the user). */
static int profile_fetch(const char *user, profile_info *p)
{
    char *f[AE_CHAT_ROW_FIELDS];
    char full[64];
    int rc;
    target_user(user, full, sizeof full, 0, 0);
    rc = ae_chat_profile(&chat, full);
    if (rc != AE_CHAT_OK) return rc;
    if (ae_chat_next_row(&chat, f, AE_CHAT_ROW_FIELDS) < 9) return AE_CHAT_ERR_ARGS;
    clean(p->nick, sizeof p->nick, f[1]);
    clean(p->board, sizeof p->board, f[2]);
    clean(p->status, sizeof p->status, f[3]);
    clean(p->text, sizeof p->text, f[4]);
    hhmm_of(p->last, f[6]);
    p->idle = atoi(f[7]);
    p->online = atoi(f[8]);
    clean(p->rooms, sizeof p->rooms, f[9]);
    return AE_CHAT_OK;
}

/** Room ids of a profile's sharedRooms (comma separated) as the names this door knows them by. */
static void room_names_of(const char *ids, char *out, size_t cap)
{
    char one[48];
    size_t n = 0;
    out[0] = '\0';
    while (*ids != '\0') {
        size_t k = 0;
        int i;
        const char *name;
        while (*ids != '\0' && *ids != ',' && k + 1 < sizeof one) one[k++] = *ids++;
        one[k] = '\0';
        if (*ids == ',') ids++;
        name = one;
        for (i = 0; i < rooms_count; i++) if (strcmp(rooms_id[i], one) == 0) name = rooms_name[i];
        if (n + strlen(name) + 3 >= cap) break;
        if (n > 0) { out[n++] = ','; out[n++] = ' '; }
        strcpy(out + n, name);
        n += strlen(name);
    }
}

/** /whois and the Whois menu entry: the profile as pane lines. */
static void whois_typed(const char *arg)
{
    profile_info p;
    char line[160], rooms[96], who[32];
    int rc;
    nick_of(who, sizeof who, arg);
    if (who[0] == '\0') { usage("/whois @user"); return; }
    rc = profile_fetch(arg, &p);
    if (rc != AE_CHAT_OK) {
        if (rc == AE_CHAT_ERR_TRANSPORT) { show_error(rc); return; }
        sprintf(line, "User %.30s is not online.", who);       /* TS formatWhois, nobody found */
        system_line(line);
        return;
    }
    sprintf(line, "%.30s - %.20s%s%.60s", p.nick, p.status, p.text[0] != '\0' ? ": " : "", p.text);
    system_line(line);
    sprintf(line, "Board %.20s, %s, last seen %.5s, idle %ds", p.board, p.online ? "online" : "offline", p.last, p.idle);
    system_line(line);
    room_names_of(p.rooms, rooms, sizeof rooms);
    if (rooms[0] != '\0') { sprintf(line, "Shared rooms: %.100s", rooms); system_line(line); }
}

/** The profile overlay (TS overlays/profile-overlay.ts): a box titled with the name. */
static void profile_overlay(const char *arg)
{
    profile_info p;
    char text[96], who[32];
    int rc;
    nick_of(who, sizeof who, arg);
    rc = profile_fetch(arg, &p);
    if (rc != AE_CHAT_OK) {
        sprintf(text, "User %.40s not found.", who);               /* TS showProfile, nobody found */
        message_modal("Profile", text);
        return;
    }
    sprintf(text, "%.16s%s%.30s, %s, idle %ds", p.status, p.text[0] != '\0' ? ": " : "", p.text,
            p.online ? "online" : "offline", p.idle);
    message_modal(p.nick, text);
}

static void away_typed(const char *rest)
{
    char line[160];
    const char *msg = *rest != '\0' ? rest : "Away";
    int rc = ae_chat_presence(&chat, "away", msg);
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    sprintf(line, "You are now away: %.100s", msg);
    system_line(line);
    do_poll();
}

static void back_typed(void)
{
    int rc = ae_chat_presence_clear(&chat);
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    system_line("You are now online");
    do_poll();
}

static void status_typed(const char *rest)
{
    char word[12], line[160];
    const char *text;
    int rc;
    arg_word(rest, word, sizeof word);
    if (word[0] == '\0') strcpy(word, "online");
    if (strcmp(word, "online") != 0 && strcmp(word, "away") != 0 && strcmp(word, "busy") != 0 && strcmp(word, "dnd") != 0) {
        usage("/status [online|away|busy|dnd] [message]");
        return;
    }
    text = after_word(rest);
    rc = ae_chat_presence(&chat, word, text);
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    sprintf(line, "Status set to %s%s%.100s", word, *text != '\0' ? ": " : "", text);
    system_line(line);
    do_poll();
}

/** Ignore (on) or lift an ignore (off) for `arg`; the lines say what the TS door says. */
static void ignore_set(const char *arg, int on)
{
    char full[64], nick[32], line[128];
    int rc;
    nick_of(nick, sizeof nick, arg);
    if (on && hide_find(ignored, nignored, nick) >= 0) { sprintf(line, "Already ignoring %.30s.", nick); system_line(line); return; }
    if (!on && hide_find(ignored, nignored, nick) < 0) { sprintf(line, "You are not ignoring %.30s.", nick); system_line(line); return; }
    target_user(arg, full, sizeof full, 0, 0);
    rc = ae_chat_ignore(&chat, full, on);
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    if (on) {
        hide_remove(muted, &nmuted, nick);                      /* the level is set, replacing a mute */
        hide_add(ignored, &nignored, nick);
        sprintf(line, "Ignoring %.30s - their messages and DMs are hidden.", nick);
    } else {
        hide_remove(ignored, &nignored, nick);
        sprintf(line, "%.30s is no longer hidden.", nick);
    }
    system_line(line);
}

static void ignore_typed(const char *rest)
{
    char a[40], line[400];
    int i;
    arg_word(rest, a, sizeof a);
    if (a[0] != '\0') { ignore_set(a, 1); return; }
    load_ignores();
    if (nignored == 0) { system_line("You are not ignoring anyone."); return; }
    strcpy(line, "Ignoring: ");
    for (i = 0; i < nignored && strlen(line) + 34 < sizeof line; i++) {
        if (i > 0) strcat(line, ", ");
        strcat(line, ignored[i]);
    }
    system_line(line);
}

static void unignore_typed(const char *rest)
{
    char a[40];
    arg_word(rest, a, sizeof a);
    if (a[0] == '\0') { usage("/unignore <user>"); return; }
    ignore_set(a, 0);
}

/** The Mute User / Unmute User menu entry: hides the room lines for this run (TS core/mute-list.ts). */
static void mute_toggle(const char *nick)
{
    char line[96];
    if (hide_find(muted, nmuted, nick) >= 0) {
        hide_remove(muted, &nmuted, nick);
        sprintf(line, "%.30s is no longer hidden.", nick);
    } else {
        hide_add(muted, &nmuted, nick);
        sprintf(line, "Muted %.30s - their room messages are hidden.", nick);
    }
    system_line(line);
}

/** The message a typed number names (the pane's numbers, as /react), or a line saying there is none. */
static lc_line *typed_message(const char *a)
{
    lc_line *l = line_by_number(atoi(a));
    if (l == 0 || l->id[0] == '\0') { system_line("No such message number."); return 0; }
    return l;
}

/** After a call that answers with an event: poll it in, or say why the server refused. */
static void then_poll(int rc)
{
    if (rc == AE_CHAT_OK) do_poll(); else show_error(rc);
}

static ui_hist hist;            /* sent lines: Up / Down recall (TS features/input-history.ts) */

/** A line to the room (TS sendRoomLine): history keeps it under its clientId, renamed to the server's
 *  id once the send reply carries it (TS room:message:ack -> inputHistory.rekey). */
static void send_room_line(const char *text, const char *reply_to)
{
    int rc = ae_chat_send(&chat, room_id, text, reply_to, 0);
    if (chat.client_id[0] != '\0') {
        ui_hist_add_id(&hist, chat.client_id, text);
        if (chat.sent_id[0] != '\0') ui_hist_rekey(&hist, chat.client_id, chat.sent_id);
    }
    if (rc == AE_CHAT_OK) do_poll(); else show_error(rc);
}

static void edit_typed(const char *rest)
{
    char a[16];
    const char *text = rest;
    lc_line *l;
    arg_word(rest, a, sizeof a);
    if (*rest == '\0') { usage("/edit [msg-id] new text"); return; }
    if (digits(a) && *after_word(rest) != '\0') {          /* TS: an id only with two or more words */
        if ((l = typed_message(a)) == 0) return;
        text = after_word(rest);
    } else if ((l = own_last()) == 0) {
        system_line("No message to edit: name one with its id, or send a line first.");
        return;
    }
    then_poll(ae_chat_edit(&chat, l->id, text));
}

/** /reply [msg-id] text (alias r), /thread msg-id text (alias t): TS sends both as a reply line. */
static void reply_typed(const char *rest, int thread)
{
    char a[16];
    const char *text = rest;
    lc_line *l;
    arg_word(rest, a, sizeof a);
    if (thread && (a[0] == '\0' || *after_word(rest) == '\0')) { usage("/thread <msg-id> message"); return; }
    if (*rest == '\0') { usage("/reply [msg-id] message"); return; }
    if (digits(a) && *after_word(rest) != '\0') {          /* TS: an id only with two or more words */
        if ((l = typed_message(a)) == 0) return;
        text = after_word(rest);
    } else if (thread) { usage("/thread <msg-id> message"); return; }
    else if ((l = room_last()) == 0) {
        system_line("No message to reply to: name one with its id.");
        return;
    }
    if (room_id[0] == '\0') { system_line("Join a room first."); return; }
    send_room_line(text, l->id);
}

static void delete_typed(const char *rest)
{
    char a[16];
    lc_line *l;
    arg_word(rest, a, sizeof a);
    if (a[0] != '\0' && !digits(a)) { usage("/deletemsg [msg-id]"); return; }
    if (a[0] != '\0') { if ((l = typed_message(a)) == 0) return; }
    else if ((l = own_last()) == 0) {
        system_line("No message to delete: name one with its id, or send a line first.");
        return;
    }
    then_poll(ae_chat_delete(&chat, l->id));
}

/** /kick /ban /mute /unmute /unban /op /deop: TS mod-kick.ts and mod-ban.ts. */
static void moderate_typed(const char *cmd, const char *rest)
{
    char a[48], user[64], shown[48], line[96];
    const char *action = cmd, *use, *reason = "";
    int level, minutes = 0, rc;
    if (strcmp(cmd, "kick") == 0) { level = 80; use = "/kick @user [reason]"; }
    else if (strcmp(cmd, "mute") == 0) { level = 80; use = "/mute @user [minutes]"; }
    else if (strcmp(cmd, "unmute") == 0) { level = 80; use = "/unmute @user"; }
    else if (strcmp(cmd, "ban") == 0) { level = 100; use = "/ban @user [reason]"; }
    else if (strcmp(cmd, "unban") == 0) { level = 100; use = "/unban @user"; }
    else { level = 255; use = "/op @user  |  /op -@user  |  /deop @user"; }
    if (!need_level(level)) return;
    arg_word(rest, a, sizeof a);
    if (level == 255 && a[0] == '-') { action = "deop"; memmove(a, a + 1, strlen(a)); }
    if (a[0] == '\0' || strcmp(a, "@") == 0) { usage(use); return; }
    target_user(a, user, sizeof user, shown, sizeof shown);
    rest = after_word(rest);
    if (strcmp(cmd, "kick") == 0 || strcmp(cmd, "ban") == 0) reason = *rest != '\0' ? rest : "No reason given";
    if (strcmp(cmd, "mute") == 0) minutes = *rest != '\0' ? atoi(rest) : 5;
    rc = ae_chat_moderate(&chat, room_id, action, user, reason, minutes);
    if (rc == AE_CHAT_ERR_STATUS && strcmp(chat.error, "not_found") == 0) {
        sprintf(line, "User %.40s not found", shown);
        system_line(line);
    } else then_poll(rc);
}

/** /invite /uninvite @user [#room]: TS mode.ts; a #room is a room name, else the current room. */
static void invite_typed(int add, const char *rest)
{
    char a[48], r[48], user[64], shown[48], line[96];
    const char *room = room_id;
    int i, rc;
    arg_word(rest, a, sizeof a);
    if (a[0] == '\0') { usage(add ? "/invite @user [#room]" : "/uninvite @user [#room]"); return; }
    arg_word(after_word(rest), r, sizeof r);
    if (r[0] == '#') memmove(r, r + 1, strlen(r));
    for (i = 0; r[0] != '\0' && i < rooms_count; i++)
        if (strcmp(rooms_name[i], r) == 0 || strcmp(rooms_id[i], r) == 0) { room = rooms_id[i]; break; }
    target_user(a, user, sizeof user, shown, sizeof shown);
    rc = ae_chat_invite(&chat, room, user, add);
    if (rc == AE_CHAT_OK) {
        if (add) sprintf(line, "Invited %.40s to the room", shown); else sprintf(line, "Revoked invite for %.40s", shown);
        system_line(line);
    } else if (rc == AE_CHAT_ERR_STATUS && strcmp(chat.error, "not_found") == 0) {
        sprintf(line, "User %.40s not found", shown);
        system_line(line);
    } else show_error(rc);
}

/** /reactions n: TS 'chat:reactions:list' -> `Reactions on N: [disp n] ...` or `No reactions on N`. */
static void reactions_typed(const char *rest)
{
    char a[16], line[LC_TEXT_MAX];
    char *f[3];
    lc_line *l;
    int rc, any = 0;
    arg_word(rest, a, sizeof a);
    if (a[0] == '\0') { usage("/reactions <msg-id>"); return; }
    if ((l = typed_message(a)) == 0) return;
    rc = ae_chat_reactions(&chat, l->id);
    if (rc != AE_CHAT_OK) { show_error(rc); return; }
    sprintf(line, "Reactions on %.12s:", a);
    while (ae_chat_next_row(&chat, f, 3) > 0) {       /* no chat call inside: the rows live in the reply buffer */
        if (atoi(f[1]) <= 0 || strlen(line) + 32 >= sizeof line) continue;
        sprintf(line + strlen(line), " [%.12s %d]", lc_react_display(f[0]), atoi(f[1]));
        any = 1;
    }
    if (!any) sprintf(line, "No reactions on %.12s", a);
    system_line(line);
}

/** /unreact [emoji] <n>, /thumbsup /like /love <n>. */
static void react_typed(const char *cmd, const char *rest)
{
    char a[24], b[16];
    lc_line *l;
    int count = 0, rc;
    arg_word(rest, a, sizeof a);
    if (strcmp(cmd, "unreact") == 0) {
        arg_word(after_word(rest), b, sizeof b);
        if (b[0] == '\0') { usage("/unreact [emoji] <msg-id>"); return; }
        if ((l = typed_message(b)) == 0) return;
        then_poll(ae_chat_unreact(&chat, l->id, a[0] != '\0' ? a : "+1", &count));
        return;
    }
    if (a[0] == '\0') { usage(strcmp(cmd, "love") == 0 ? "/love <msg-id>" : "/thumbsup <msg-id>"); return; }
    if ((l = typed_message(a)) == 0) return;
    rc = react_on(l->id, strcmp(cmd, "love") == 0 ? "heart" : "+1");
    if (rc != AE_CHAT_OK) show_error(rc);
}

/* TS /help <command>: name, aliases, description, usage - the registered text of the commands this door runs. */
static const char *const cmd_help[][4] = {
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
};


/** /help <command>: "/name - description" then the usage, or "Unknown: x". */
static void help_for(const char *want)
{
    unsigned i;
    char line[160], al[40];
    const char *p;
    for (i = 0; i < sizeof cmd_help / sizeof cmd_help[0]; i++) {
        int hit = strcmp(cmd_help[i][0], want) == 0;
        for (p = cmd_help[i][1]; !hit && *p != '\0'; ) {
            int n = 0;
            while (*p != '\0' && *p != ',' && n < (int)sizeof al - 1) al[n++] = *p++;
            al[n] = '\0';
            if (*p == ',') p++;
            hit = strcmp(al, want) == 0;
        }
        if (!hit) continue;
        sprintf(line, "/%s - %.100s", cmd_help[i][0], cmd_help[i][2]);
        system_line(line);
        system_line(cmd_help[i][3]);
        return;
    }
    sprintf(line, "Unknown: %.60s", want);
    system_line(line);
}

/** Runs one "/..." line. Returns 1 when the door should end. */
static int run_command(const char *line)
{
    char cmd[12], a[48];
    const char *rest = after_word(line + 1);
    int rc, n;
    arg_word(line + 1, cmd, sizeof cmd);
    if (is_cmd(cmd, "q", "quit") || is_cmd(cmd, "exit", "bye")) return 1;
    if (is_cmd(cmd, "?", "h") || is_cmd(cmd, "help", "commands")) {
        arg_word(rest, a, sizeof a);
        if (a[0] != '\0') help_for(a[0] == '/' ? a + 1 : a); else open_help();
        return 0;
    }
    if (strcmp(cmd, "compact") == 0) { M.compact = !M.compact; system_line(M.compact ? "Compact mode on" : "Compact mode off"); return 0; }
    if (is_cmd(cmd, "timestamps", "time")) { M.timestamps = !M.timestamps; system_line(M.timestamps ? "Timestamps on" : "Timestamps off"); return 0; }
    if (is_cmd(cmd, "l", "rooms") || strcmp(cmd, "list") == 0) { list_rooms(); return 0; }
    if (is_cmd(cmd, "w", "who")) { list_who(); return 0; }
    if (is_cmd(cmd, "j", "join")) { join_typed(rest); return 0; }
    if (is_cmd(cmd, "leave", "part")) { leave_room(); return 0; }
    if (is_cmd(cmd, "clear", "cls")) { lines_clear(); return 0; }
    if (is_cmd(cmd, "n", "np") || strcmp(cmd, "create") == 0) {
        if (*rest == '\0') { open_prompt(PROMPT_CREATE, "New room name"); return 0; }
        new_room(rest, cmd[1] == 'p' ? "private" : "public");    /* the whole rest: a name may have spaces */
        return 0;
    }
    if (is_cmd(cmd, "r", "reply")) { reply_typed(rest, 0); return 0; }
    if (is_cmd(cmd, "t", "thread")) { reply_typed(rest, 1); return 0; }
    if (strcmp(cmd, "react") == 0) {
        lc_line *l;
        arg_word(rest, a, sizeof a);
        n = atoi(a);
        l = line_by_number(n);
        rest = after_word(rest);
        if (l == 0 || l->id[0] == '\0') { system_line("No such message number."); return 0; }
        if (*rest == '\0') { system_line("Usage: /react n emoji"); return 0; }
        rc = react_on(l->id, rest);
        if (rc != AE_CHAT_OK) show_error(rc);
        return 0;
    }
    if (is_cmd(cmd, "d", "dm") || strcmp(cmd, "msg") == 0) {
        char tid[32];
        arg_word(rest, a, sizeof a);
        rest = after_word(rest);
        if (a[0] == '\0' || *rest == '\0') { system_line("Usage: /msg user text"); return 0; }
        rc = ae_chat_dm(&chat, a, rest, tid, sizeof tid);
        if (rc == AE_CHAT_OK) {
            if (dm_thread[0] != '\0' && strcmp(a, dm_peer) == 0) do_poll();
            else { char note[64]; sprintf(note, "Direct message sent to %.24s", a); system_line(note); }
        } else show_error(rc);
        return 0;
    }
    if (is_cmd(cmd, "whois", "info")) { whois_typed(rest); return 0; }
    if (is_cmd(cmd, "away", "afk")) { away_typed(rest); return 0; }
    if (strcmp(cmd, "back") == 0) { back_typed(); return 0; }
    if (strcmp(cmd, "status") == 0) { status_typed(rest); return 0; }
    if (strcmp(cmd, "nick") == 0) { char t[64]; sprintf(t, "Your username: %.40s", handle); system_line(t); return 0; }
    if (strcmp(cmd, "ignore") == 0) { ignore_typed(rest); return 0; }
    if (strcmp(cmd, "unignore") == 0) { unignore_typed(rest); return 0; }
    if (strcmp(cmd, "edit") == 0) { edit_typed(rest); return 0; }
    if (is_cmd(cmd, "deletemsg", "delmsg")) { delete_typed(rest); return 0; }
    if (strcmp(cmd, "topic") == 0) {
        if (*rest == '\0') { usage("/topic <new topic>"); return 0; }
        then_poll(ae_chat_topic(&chat, room_id, rest));
        return 0;
    }
    if (is_cmd(cmd, "kick", "ban") || is_cmd(cmd, "mute", "unmute") || is_cmd(cmd, "unban", "op")
        || strcmp(cmd, "deop") == 0) { moderate_typed(cmd, rest); return 0; }
    if (is_cmd(cmd, "invite", "uninvite")) { invite_typed(cmd[0] == 'i', rest); return 0; }
    if (strcmp(cmd, "reactions") == 0) { reactions_typed(rest); return 0; }
    if (is_cmd(cmd, "unreact", "love") || is_cmd(cmd, "thumbsup", "like")) { react_typed(cmd, rest); return 0; }
    system_line("Unknown command. Type /help for help.");
    return 0;
}

/** Enter in the input box. Returns 1 when the door should end. */
static int submit(void)
{
    int rc, ended = 0;
    char edit_id[UI_HIST_ID];
    if (M.input_len == 0) return 0;
    copy(edit_id, sizeof edit_id, ui_hist_editing(&hist) ? ui_hist_editing(&hist) : "");
    ui_hist_reset(&hist);                       /* TS: getEditingId, then inputHistory.reset() */
    M.editing = 0;
    if (M.input[0] == '/') {
        ended = run_command(M.input);
    } else if (edit_id[0] != '\0') {
        then_poll(ae_chat_edit(&chat, edit_id, M.input));
    } else if (dm_thread[0] != '\0') {
        char tid[32];
        rc = ae_chat_dm(&chat, dm_peer, M.input, tid, sizeof tid);
        if (rc == AE_CHAT_OK) do_poll(); else show_error(rc);
    } else if (room_id[0] != '\0') {
        send_room_line(M.input, 0);
    } else {
        system_line("Join a channel first: /join room");
    }
    M.input[0] = '\0';
    M.input_len = 0;
    M.input_cur = 0;
    M.input_anchor = -1;
    return ended;
}

/* One idle step: sleep a moment, and say whether a network poll is due. Split from door_idle so the
   sleep length and the poll cadence can be tested without a screen. */
static int idle_step(void)
{
    ae_delay_ticks(IDLE_SLEEP_TICKS);
    idle_ticks += IDLE_SLEEP_TICKS;
    if (idle_ticks < poll_steps * poll_step_ticks) return 0;
    idle_ticks = 0;
    return 1;
}

static void door_idle(void *ctx)
{
    IGNORE(ctx);
    if (idle_step()) {
        do_poll();
        present();
    }
}

/* ---- keys --------------------------------------------------------------- */

static int is_enter(int key) { return key == UI_KEY_ENTER || key == '\r' || key == '\n'; }
static int is_text(int key) { return (key >= 32 && key < 127) || (key >= 160 && key < 256); }

static void set_focus(int focus)
{
    if (focus == LC_FOCUS_SIDEBAR && lc_sidebar_width(&M) == 0) focus = LC_FOCUS_MENU;
    M.focus = focus;
    if (focus == LC_FOCUS_MENU) { if (M.menu < 0) { M.menu = 0; M.menu_sel = 0; } }
    else M.menu = -1;
}

static void cycle_focus(int step)
{
    int f = M.focus;
    do { f = (f + step + 3) % 3; } while (f == LC_FOCUS_SIDEBAR && lc_sidebar_width(&M) == 0);
    set_focus(f);
}

/** An item whose wire this board does not have yet: say so instead of doing nothing. */
static void not_yet(const char *item)
{
    char text[96];
    sprintf(text, "%.40s is not yet available here.", item);
    message_modal("Not available", text);
}

/* ---- Context menus: labels and order of the TS door's features/context-menus.ts. ---- */
static const char *ctx_items[UI_POPUP_MAX];

static void ctx_open(int kind, int target, int row, int col)
{
    int n = 0;
    unsigned long alert = 0;
    if (kind == LC_CTX_USER) {
        static const char *const u[] = { "View Profile", "Send Message", "Whois", "---", "Mention", "Add Note",
                                         "View History", "---", "Mute User", "Ignore", "Block" };
        char who[32];
        for (n = 0; n < 11; n++) ctx_items[n] = u[n];
        nick_of(who, sizeof who, M.side[target].label);          /* TS muteMenuLabels: the entries say the current state */
        if (hide_find(muted, nmuted, who) >= 0) ctx_items[8] = "Unmute User";
        if (hide_find(ignored, nignored, who) >= 0) ctx_items[9] = "Unignore";
        if (is_sysop) { ctx_items[n++] = "---"; alert = 3UL << n; ctx_items[n++] = "Kick User"; ctx_items[n++] = "Ban User"; }
    } else if (kind == LC_CTX_CHAT) {
        static const char *const c[] = { "Reply", "Quote", "React", "---", "Copy Text", "Pin Message", "---",
                                         "Mark Unread", "Edit", "Delete" };
        for (n = 0; n < 10; n++) ctx_items[n] = c[n];
    } else if (kind == LC_CTX_REACT) {          /* sysop 2026-11-08: React picks one of the eight, not +1 */
        for (n = 0; n < LC_REACT_KINDS; n++) ctx_items[n] = lc_react_label(n);
    } else {
        static const char *const r[] = { "Join", "Leave", "Info", "Expand/Collapse", "---", "Pin Channel" };
        for (n = 0; n < 6; n++) ctx_items[n] = r[n];
        if (is_sysop) { ctx_items[n++] = "---"; ctx_items[n++] = "Clear History"; ctx_items[n++] = "Archive";
                        alert = 1UL << n; ctx_items[n++] = "Delete Channel"; }
    }
    M.ctx_kind = kind;
    M.ctx_target = target;
    M.menu = -1;
    ui_popup_open(&M.ctx, ctx_items, n, alert, row, col, M.rows, M.cols);
}

static void input_set(const char *text)
{
    copy(M.input, sizeof M.input, text);
    M.input_len = (int)strlen(M.input);
    M.input_cur = M.input_len;
    M.input_anchor = -1;
    set_focus(LC_FOCUS_INPUT);
}

static void ctx_run(const char *it)
{
    char buf[LC_INPUT_MAX];
    if (M.ctx_kind == LC_CTX_USER) {
        const char *nick = M.side[M.ctx_target].label;
        if (strcmp(it, "Send Message") == 0) { sprintf(buf, "/msg %.30s ", nick); input_set(buf); }
        else if (strcmp(it, "Mention") == 0) { sprintf(buf, "@%.30s %.200s", nick, M.input); input_set(buf); }
        else if (strcmp(it, "View History") == 0) {
            int i, found = 0;
            for (i = M.nlines - 1; i >= 0 && found < 15; i--) {
                if (M.lines[i].number == 0 || strcmp(M.lines[i].nick, nick) != 0) continue;
                sprintf(buf, "%.24s: %.180s", nick, M.lines[i].text);
                system_line(buf);
                found++;
            }
            if (!found) { sprintf(buf, "No recent messages from %.30s.", nick); system_line(buf); }
        } else if (strcmp(it, "Kick User") == 0 || strcmp(it, "Ban User") == 0) {
            char user[64];
            int kick = it[0] == 'K', rc;
            if (!is_sysop) { system_line("Sysop only."); return; }
            target_user(nick, user, sizeof user, 0, 0);          /* TS: no prompt, no reason */
            rc = ae_chat_moderate(&chat, room_id, kick ? "kick" : "ban", user, "", 0);
            if (rc != AE_CHAT_OK) { show_error(rc); return; }
            sprintf(buf, "%s requested for %.30s", kick ? "Kick" : "Ban", nick);
            system_line(buf);
        } else if (strcmp(it, "View Profile") == 0) profile_overlay(nick);
        else if (strcmp(it, "Whois") == 0) whois_typed(nick);
        else if (strcmp(it, "Mute User") == 0 || strcmp(it, "Unmute User") == 0) mute_toggle(nick);
        else if (strcmp(it, "Ignore") == 0) ignore_set(nick, 1);
        else if (strcmp(it, "Unignore") == 0) ignore_set(nick, 0);
        else not_yet(it);                /* Add Note (no doorserver note route), Block (B5) */
    } else if (M.ctx_kind == LC_CTX_CHAT) {
        const lc_line *l = M.ctx_target >= 0 && M.ctx_target < M.nlines ? &M.lines[M.ctx_target] : 0;
        if (!l || l->number == 0) { system_line("Right-click on a message first."); return; }
        if (strcmp(it, "React") == 0) ctx_open(LC_CTX_REACT, M.ctx_target, M.ctx.top, M.ctx.left);   /* the picker, where the menu was */
        else if (strcmp(it, "Reply") == 0) { sprintf(buf, "/reply %d ", l->number); input_set(buf); }
        else if (strcmp(it, "Quote") == 0) {                          /* TS quoteInputText */
            char q[sizeof l->quote];
            quote_of(l, q, (int)sizeof q);
            sprintf(buf, "> %s ", q);
            input_set(buf);
        }
        else if (strcmp(it, "Edit") == 0) { sprintf(buf, "/edit %d ", l->number); input_set(buf); }
        else if (strcmp(it, "Delete") == 0) then_poll(ae_chat_delete(&chat, l->id));    /* TS: no confirm */
        else not_yet(it);                /* Copy Text (OSC 52), Pin, Mark Unread */
    } else if (M.ctx_kind == LC_CTX_REACT) {
        const lc_line *l = M.ctx_target >= 0 && M.ctx_target < M.nlines ? &M.lines[M.ctx_target] : 0;
        int i;
        for (i = 0; i < LC_REACT_KINDS && strcmp(it, lc_react_label(i)) != 0; i++) {}
        if (!l || l->number == 0 || i == LC_REACT_KINDS) return;
        if (react_on(l->id, lc_react_names[i]) == AE_CHAT_OK) system_line("Reaction sent.");   /* TS context-menus.ts */
        else system_line("The reaction did not go through.");
    } else {
        lc_side *r = &M.side[M.ctx_target];
        if (strcmp(it, "Join") == 0) join_room(r->id);
        else if (strcmp(it, "Leave") == 0) { if (strcmp(r->id, room_id) == 0) leave_room(); else system_line("You are not in that channel."); }
        else if (strcmp(it, "Info") == 0) { sprintf(buf, "Channel: %.40s", r->label); system_line(buf); }
        else not_yet(it);                /* Expand/Collapse, Pin, Clear History, Archive, Delete Channel */
    }
}

static void side_move(int step);
static void side_pick(void);
static int menu_pick(int menu, int item);

/** The mouse wake byte: drain the board's queue and act on each event as TS handlers/mouse-handling.ts. */
static int handle_mouse(void)
{
    ae_mouse_event evs[16];
    int n = ae_bs_mouse_drain(evs, 16), i;
    for (i = 0; i < n; i++) {
        ae_mouse_event *e = &evs[i];
        int row = e->row - 1, col = e->col - 1, idx, hit;
        mouse_events++;
        if (e->kind == 'U' || e->kind == 'D') {
            int up = e->kind == 'U';
            if (lc_hit(row, col, &idx) == LC_HIT_SIDEBAR) side_move(up ? -2 : 2);
            else { M.scroll += up ? 3 : -3; if (M.scroll < 0) M.scroll = 0; if (M.scroll > LC_LINES * 4) M.scroll = LC_LINES * 4; }
            continue;
        }
        if (bar_drag) {                         /* the thumb follows the pointer until the button comes up */
            if (e->kind == 'R') bar_drag = 0;
            else if (e->kind == 'M' && e->button != AE_MOUSE_NONE) { int sc = lc_scroll_at(row); if (sc >= 0) M.scroll = sc; }
            else if (e->kind == 'M') bar_drag = 0;   /* a hover with no button: the release was lost */
            if (e->kind != 'P') continue;
            bar_drag = 0;
        }
        if (e->kind != 'P') continue;          /* act on the press; releases and other motion carry nothing here */
        hit = lc_hit(row, col, &idx);
        if (M.ctx.open) {
            int pick = ui_popup_click(&M.ctx, row, col);
            if (pick >= 0) ctx_run(M.ctx.items[pick]);
            if (pick != UI_POPUP_CLOSE || hit == LC_HIT_POPUP) continue;
        }
        if (M.modal == LC_MODAL_QUIT) {
            if (hit == LC_HIT_YES) return 1;
            if (hit == LC_HIT_NO) M.modal = LC_MODAL_NONE;
            continue;
        }
        if (M.modal == LC_MODAL_MESSAGE) { if (hit == LC_HIT_OK || hit != LC_HIT_MODAL) M.modal = LC_MODAL_NONE; continue; }
        if (M.modal != LC_MODAL_NONE || M.help) continue;
        if (hit == LC_HIT_MENU && idx >= 0) { M.menu = idx; M.menu_sel = 0; M.focus = LC_FOCUS_MENU; continue; }
        if (hit == LC_HIT_DROPDOWN && M.menu >= 0 && idx >= 0 && idx < lc_menu_count[M.menu]) {
            int menu = M.menu;
            M.menu = -1;
            if (menu_pick(menu, idx)) return 1;
            continue;
        }
        if (M.focus == LC_FOCUS_MENU) set_focus(LC_FOCUS_INPUT);
        if (hit == LC_HIT_STATUS) { M.sidebar_hidden = 0; switch_tab(idx >= 7); continue; }   /* TS mouse-handling: x < 7 channels, else users */
        if (hit == LC_HIT_INPUT) { set_focus(LC_FOCUS_INPUT); continue; }
        if (hit == LC_HIT_SCROLLBAR) {          /* press jumps the thumb under the pointer; held, it drags */
            int sc = lc_scroll_at(row);
            if (sc >= 0) M.scroll = sc;
            bar_drag = e->button == AE_MOUSE_LEFT;
            continue;
        }
        if (hit == LC_HIT_CHAT) { ctx_open(LC_CTX_CHAT, idx, row, col); continue; }
        if (hit == LC_HIT_SIDEBAR && side_selectable(idx)) {
            lc_side *s = &M.side[idx];
            M.side_sel = idx;
            if (s->kind == LC_SIDE_USER && strcmp(s->label, M.handle) != 0) ctx_open(LC_CTX_USER, idx, row, col);
            else if (s->kind == LC_SIDE_ROOM) ctx_open(LC_CTX_CHANNEL, idx, row, col);
            else if (e->button == AE_MOUSE_LEFT) side_pick();
        }
    }
    return 0;
}

/** A menu entry. Returns 1 when the door should end. */
static int menu_pick(int menu, int item)
{
    const char *it = lc_menu_items[menu][item];
    set_focus(LC_FOCUS_INPUT);
    if (strncmp(it, "Help (", 6) == 0 || strcmp(it, "Keyboard Shortcuts") == 0) open_help();
    else if (strncmp(it, "Channel List", 12) == 0 || strcmp(it, "Toggle Sidebar") == 0) M.sidebar_hidden = !M.sidebar_hidden;
    else if (strncmp(it, "Next Channel", 12) == 0) next_channel();
    else if (strcmp(it, "Join Channel...") == 0) open_prompt(PROMPT_JOIN, "Channel to join");
    else if (strcmp(it, "Leave Channel") == 0) leave_room();
    else if (strcmp(it, "Clear Chat") == 0) lines_clear();
    else if (strcmp(it, "About") == 0) message_modal("LIVECHAT68", "Federated chat for AmiExpress boards");
    else if (strncmp(it, "Quit", 4) == 0) M.modal = LC_MODAL_QUIT;
    else not_yet(it);                       /* Emoji, Files, Pins, Search, Threads, Settings, Theme, Render, Grid */
    return 0;
}

static void side_move(int step)
{
    int i = M.side_sel + step;
    while (i >= 0 && i < M.nside && !side_selectable(i)) i += step;
    if (side_selectable(i)) M.side_sel = i;
}

static void side_pick(void)
{
    lc_side *s;
    if (!side_selectable(M.side_sel)) return;
    s = &M.side[M.side_sel];
    if (s->kind == LC_SIDE_ROOM) { if (!s->joined || dm_thread[0] != '\0') join_room(s->id); }
    else if (s->kind == LC_SIDE_DM) { open_dm(s->id, s->label); set_focus(LC_FOCUS_INPUT); }
    else if (s->kind == LC_SIDE_USER) {
        sprintf(M.input, "/msg %.30s ", s->label);
        M.input_len = (int)strlen(M.input);
        M.input_cur = M.input_len;
        M.input_anchor = -1;
        set_focus(LC_FOCUS_INPUT);
    }
}

/** One key. Returns 1 when the door should end. */
static int handle_key(int key)
{
    if (key == UI_KEY_MOUSE) return handle_mouse();
    if (M.ctx.open) {
        int pick = ui_popup_key(&M.ctx, key);
        if (pick >= 0) ctx_run(M.ctx.items[pick]);
        return 0;
    }
    if (M.help) {
        if (key == UI_KEY_DOWN && M.help_top < lc_help_lines - 1) M.help_top++;
        else if (key == UI_KEY_UP && M.help_top > 0) M.help_top--;
        else if (key == UI_KEY_PGDN) { M.help_top += 10; if (M.help_top > lc_help_lines - 1) M.help_top = lc_help_lines - 1; }
        else if (key == UI_KEY_PGUP) { M.help_top -= 10; if (M.help_top < 0) M.help_top = 0; }
        else M.help = 0;
        return 0;
    }
    if (M.modal == LC_MODAL_MESSAGE) { M.modal = LC_MODAL_NONE; return 0; }
    if (M.modal == LC_MODAL_QUIT) {
        if (key == 'y' || key == 'Y' || is_enter(key)) return 1;
        if (key == 'n' || key == 'N' || key == UI_KEY_ESC) M.modal = LC_MODAL_NONE;
        return 0;
    }
    if (M.modal == LC_MODAL_PROMPT) {
        if (key == UI_KEY_ESC) { M.modal = LC_MODAL_NONE; return 0; }
        if (is_enter(key)) {
            char text[sizeof M.prompt];
            copy(text, sizeof text, M.prompt);
            M.modal = LC_MODAL_NONE;
            if (text[0] == '\0') return 0;
            if (prompt_kind == PROMPT_JOIN) join_typed(text); else new_room(text, "public");
            return 0;
        }
        if ((key == 8 || key == 127) && M.prompt_len > 0) { M.prompt[--M.prompt_len] = '\0'; return 0; }
        if (is_text(key) && M.prompt_len + 1 < (int)sizeof M.prompt) { M.prompt[M.prompt_len++] = (char)key; M.prompt[M.prompt_len] = '\0'; }
        return 0;
    }
    if (key == 17) { M.modal = LC_MODAL_QUIT; return 0; }
    if (key == UI_KEY_F1) { open_help(); return 0; }
    if (key == UI_KEY_F2) { M.sidebar_hidden = !M.sidebar_hidden; if (M.focus == LC_FOCUS_SIDEBAR) set_focus(LC_FOCUS_INPUT); return 0; }
    if (key == UI_KEY_F3) { switch_tab(!M.side_tab); return 0; }
    if (key == UI_KEY_F4) return 0;                          /* the emoji picker has no wire here */
    if (key == 9) { cycle_focus(1); return 0; }
    if (key == UI_KEY_BACKTAB) { cycle_focus(-1); return 0; }
    if (key == UI_KEY_PGUP) { M.scroll += 10; if (M.scroll > LC_LINES * 4) M.scroll = LC_LINES * 4; return 0; }
    if (key == UI_KEY_PGDN) { M.scroll -= 10; if (M.scroll < 0) M.scroll = 0; return 0; }

    if (M.pick[0] != '\0') {                  /* the keyboard picker owns Up/Down/Enter/Esc (TS server.ts) */
        if (key == UI_KEY_UP) { lc_pick_move(&M, -1); return 0; }
        if (key == UI_KEY_DOWN) { lc_pick_move(&M, 1); return 0; }
        if (key == UI_KEY_ESC) { lc_pick_stop(&M); return 0; }
        if (is_enter(key)) {                    /* confirm: the chat menu a click on the message opens */
            int idx = lc_pick_index(&M);
            lc_pick_stop(&M);
            if (idx >= 0) ctx_open(LC_CTX_CHAT, idx, 3, lc_sidebar_width(&M) + 2);
            return 0;
        }
        if (is_text(key)) lc_pick_stop(&M);    /* a typed character cancels the pick and is still typed */
    }
    if (M.focus == LC_FOCUS_MENU) {
        if (key == UI_KEY_LEFT) { M.menu = (M.menu + LC_MENUS - 1) % LC_MENUS; M.menu_sel = 0; }
        else if (key == UI_KEY_RIGHT) { M.menu = (M.menu + 1) % LC_MENUS; M.menu_sel = 0; }
        else if (key == UI_KEY_DOWN) M.menu_sel = (M.menu_sel + 1) % lc_menu_count[M.menu];
        else if (key == UI_KEY_UP) M.menu_sel = (M.menu_sel + lc_menu_count[M.menu] - 1) % lc_menu_count[M.menu];
        else if (is_enter(key)) return menu_pick(M.menu, M.menu_sel);
        else if (key == UI_KEY_ESC) set_focus(LC_FOCUS_INPUT);
        return 0;
    }
    if (M.focus == LC_FOCUS_SIDEBAR) {
        if (key == UI_KEY_UP) side_move(-1);
        else if (key == UI_KEY_DOWN) side_move(1);
        else if (key == UI_KEY_HOME) { M.side_sel = 0; side_move(1); }
        else if (key == UI_KEY_END) { M.side_sel = M.nside - 1; if (!side_selectable(M.side_sel)) side_move(-1); }
        else if (is_enter(key)) side_pick();
        else if (key == UI_KEY_ESC) set_focus(LC_FOCUS_INPUT);
        return 0;
    }
    if (is_enter(key)) return submit();
    if (key == UI_KEY_ESC) {
        if (M.input_anchor >= 0) { M.input_anchor = -1; return 0; }   /* Esc drops a selection first */
        if (dm_thread[0] != '\0' && room_id[0] != '\0') join_room(room_id);   /* out of the DM, back to the room */
        return 0;
    }
    {
        int cap = LC_INPUT_MAX < AE_CHAT_TEXT_MAX + 1 ? LC_INPUT_MAX : AE_CHAT_TEXT_MAX + 1;
        if (!ui_line_sel_key(M.input, cap, &M.input_len, &M.input_cur, &M.input_anchor, key, &hist, 0)
            && key == UI_KEY_UP && M.input_len == 0)
            lc_pick_start(&M);                  /* Up on an empty input picks a message (TS start({kind:'menu'})) */
        M.editing = ui_hist_editing(&hist) != 0;
    }
    return 0;
}

/** A modal before the chat runs (no config, no server): shown, one key, gone. */
static void early_message(const char *title, const char *text)
{
    message_modal(title, text);
    present();
    ui_key_read(&keys, &pushback);
}

static void finish(void)
{
    ui_cells_close(&cells);
    ui_screen_close(&screen);
    ae_shutdown();
}

int main(int argc, char **argv)
{
    ae_session session;
    ae_chat_config cfg;
    char line[96];
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    int ended = 0;

    /* A fresh run starts with nothing joined (a host test calls main more than once). */
    idle_ticks = 0; pushback = -1; msg_number = 0; help_shown = 0; rooms_count = 0; keep_lines = 0;
    room_id[0] = '\0'; room_name[0] = '\0'; room_topic[0] = '\0'; dm_thread[0] = '\0'; dm_peer[0] = '\0';
    nignored = 0; nmuted = 0;

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(&session, session_storage, (long)sizeof(session_storage), node) != 0) {
        ae_shutdown();
        return 20;
    }
    ui_screen_open_responsive(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    ae_user_name(&session, handle, (int)sizeof(handle));
    if (handle[0] == '\0') strcpy(handle, "Anon");
    if (ui_cells_open(&cells, screen.cols, screen.rows) != 0) {
        ui_screen_close(&screen);
        ae_shutdown();
        return 20;
    }
    {   /* A UTF-8 caller gets emoji reactions (the TS door's unicodeCapable test, via AEW_CHARSET);
           everyone else, and a classic board, the ASCII faces. */
        char charset[16];
        ae_wire_charset(&session, charset, (int)sizeof charset);
        lc_react_emoji(strcmp(charset, "utf-8") == 0 && ae_set_output_charset(&session, "utf-8"));
        if (lc_react_emoji_on()) ui_cells_wide_table(&cells, lc_react_utf8, LC_REACT_KINDS);
    }
    lc_model_init(&M, screen.cols, screen.rows);
    copy(M.handle, sizeof M.handle, handle);
    M.node = node;

    keys.next = door_key;
    keys.pending = door_pending;
    keys.settle = door_settle;
    keys.idle = 0;                                           /* no polling before there is a chat */
    keys.flush = door_flush;
    keys.ctx = 0;

    ansi_clear(&screen.buf);
    ui_cells_invalidate(&cells);

    if (!ae_chat_config_load(&cfg, LIVECHAT_CFG_PATH)) {
        early_message("Setup", "This door has no LIVECHAT.cfg.");
        finish();
        return 0;
    }
    if (ae_chat_open(&chat, &cfg, handle, (is_sysop = (user_level = ae_user_level(&session)) >= 255)) != AE_CHAT_OK) {
        early_message("Error", "The chat server did not answer.");
        finish();
        return 0;
    }
    keys.idle = door_idle;
    ae_bs_mouse(1);                                     /* "MOUSE ON B": clicks with their button, as menudoor */

    load_ignores();                                     /* the server keeps the list; hiding the lines is ours */
    /* As the TS door: list the rooms and walk into the first. */
    if (load_rooms() == AE_CHAT_OK) {
        sprintf(line, "Found %d room%s", rooms_count, rooms_count == 1 ? "" : "s");
        system_line(line);
        if (rooms_count > 0) {
            sprintf(line, "Auto-joining #%.40s...", rooms_name[0]);
            system_line(line);
            keep_lines = 1;                              /* the TS door keeps these two lines above the join */
            join_room(rooms_id[0]);
            keep_lines = 0;
        } else {
            system_line("No rooms yet. Type /create name to make one.");
            load_sidebar();
        }
    } else {
        system_line("Could not list the rooms.");
    }
    present();

    while (!ended) {
        int key = ui_key_read(&keys, &pushback);
        if (key < 0) break;
        /* idle_ticks is NOT reset here: it counts the idle hook's sleeps, the door's only clock. The
           board's any-motion mouse mode sends a wake byte on every hover move, and a reset per key
           kept the event poll from ever running while the mouse moved (sysop test 2026-11-08). */
        ended = handle_key(key);
        if (!ended) present();
    }

    ae_bs_mouse(0);
    if (room_id[0] != '\0') ae_chat_leave(&chat, room_id);
    ae_chat_close(&chat);
    finish();
    return 0;
}
