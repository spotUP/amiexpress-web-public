/*
 * livechat_ui.h - the LIVECHAT68 screen, drawn from a model onto a ui_cells canvas.
 *
 * The layout is a copy of the TS LIVECHAT door (board/Doors/livechat, neo-blessed) as a telnet
 * ANSI caller sees it, measured cell by cell from its captured output (tests/fixtures/
 * lc68-ts-main-*.grid): menu bar, sidebar (gone at 40 columns), bordered chat pane with a label
 * bar, bordered message input with the emoji button, status line, and the dropdown menus, the
 * centred message modal and the help overlay on top.
 *
 * lc_draw paints the whole frame into the canvas' back buffer every time; ui_cells_flush then
 * sends only the cells that changed, so a key costs a handful of cells, never a repaint.
 *
 * Colours are the TS door's xterm-256 numbers, named once here.
 */
#ifndef LIVECHAT_UI_H
#define LIVECHAT_UI_H

#include "ui_cells.h"

#define LC_INK        255   /* text */
#define LC_ACCENT     204   /* borders, menu bar ground, section heads */
#define LC_BORDER_FOCUS 255 /* the focused panel's border: TS PANEL_BORDER_FOCUS = theme ink (ui/theme.ts) */
#define LC_ALERT      196   /* sysop-only destructive menu items (TS alert colour) */
#define LC_DIM        240   /* timestamps, system lines, rooms not joined */
#define LC_ACTIVITY   221   /* activity lines, the emoji button face */
#define LC_BAR_INK    0     /* menu bar labels */
#define LC_GREY       7     /* label bar text, masthead edges, emoji button border */
#define LC_LABEL_BG   4     /* chat pane label bar ground */
#define LC_LABEL_TAIL 3     /* the last three cells of the label bar */

#define LC_LINES     80
#define LC_TEXT_MAX  240

/* LC_NOTE: a line of the door's own in the accent colour, no time (TS addChatMessage(text, false)
   with an accent tag, e.g. "[bob reacted heart]"). */
/* LC_EVENT: a board event (hub "bbs" row), TS handlers/bbs-event.handler.ts formatEvent and the
   legacy "[EVENT] ..." feed line (server.ts updateEventsFeed): "[hh:mm] " in the accent when the line
   has a time, `head` in `tone`, `text` in `body_tone` (0: the pen), then " [NEW PB!]" when `pb`. */
enum { LC_SYSTEM, LC_ACTIVITY_LINE, LC_HISTORY, LC_LIVE, LC_NOTE, LC_EVENT };

/* The TS event tags on this theme (sdk/engines/ui/theme/tokens.ts), as cell colours. A cell colour
   is 1..255, so blessed "black" (T.bar) is xterm 16. */
#define LC_EV_OK         78    /* T.ok #57E389 */
#define LC_EV_BAR        16    /* T.bar 'black' */
#define LC_EV_GREEN      2
#define LC_EV_YELLOW     3
#define LC_EV_RED        1
#define LC_EV_BLUE       4
#define LC_EV_CYAN       6
#define LC_EV_WHITE      7
#define LC_EV_LIGHTGREEN 10

/* A message's reaction counts, one per emoji, in the server's order (first reacted first). The
   TS door keeps the same per-message map (features/reaction-store.ts); this door paints it on its
   own row under the message, "<3 2  :) 1" in the accent colour (lc_react_rows). */
#define LC_REACT_MAX 8
#define LC_VIEW_MAX 40
#define LC_VIEW_COL 100

typedef struct {
    char emoji[12];        /* the server's name: "+1", "heart", ... */
    int count;
    int mine;              /* the caller is one of the count */
} lc_react;

typedef struct {
    int kind;
    long seq;              /* server order; system lines take the last seq seen */
    int number;            /* 1, 2, ... for messages (what /r and /t accept); 0 for others */
    char id[24];           /* server message id, "" for local lines */
    char time[6];          /* "hh:mm" */
    char nick[24];
    char text[LC_TEXT_MAX];
    lc_react react[LC_REACT_MAX];
    int nreact;
    int edited;            /* an edit event replaced the text: " (edited)" after it */
    char quote[96];        /* "parent: snippet" of the message this replies to, "" when none is loaded */
    char head[48];         /* LC_EVENT: "* bob", "[Tetris]", "[EVENT] " */
    int tone, body_tone;   /* LC_EVENT colours */
    int pb;                /* LC_EVENT: a personal best tag */
} lc_line;

enum { LC_SIDE_HEAD, LC_SIDE_ROOM, LC_SIDE_USER, LC_SIDE_DM, LC_SIDE_BLANK };

#define LC_SIDE_MAX 48
typedef struct {
    int kind;
    int joined;            /* rooms: the caller is in it */
    char label[40];
    char id[48];           /* room id, DM thread id, or user handle */
    char status;           /* users: 0 online, 'a' away, 'b' busy, 'd' do not disturb */
    char note[28];         /* users: the status text (the away message) */
} lc_side;

enum { LC_FOCUS_INPUT, LC_FOCUS_SIDEBAR, LC_FOCUS_MENU };
enum { LC_MODAL_NONE, LC_MODAL_MESSAGE, LC_MODAL_QUIT, LC_MODAL_PROMPT };

#define LC_INPUT_MAX 256
typedef struct {
    int cols, rows;
    char handle[32];
    int node;
    char room[48];                 /* the room name the status line shows, "" when in none */
    char pane_label[96];           /* chat box label: "general - General chat" */
    lc_line lines[LC_LINES];
    int nlines;
    unsigned long lines_gen;       /* lc_lines_changed: draw_chat reuses its wrapped row counts while this holds still */
    int scroll;                    /* display rows back from the newest */
    lc_side side[LC_SIDE_MAX];
    int nside;
    int side_sel;
    int sidebar_hidden;            /* F2 */
    char input[LC_INPUT_MAX];
    int input_len;
    int input_cur;                 /* caret column in input, 0..input_len */
    int input_anchor;              /* Shift-selection's fixed end, -1 = none (K19) */
    int side_tab;                  /* 0 channels, 1 users (F3, click on the status line) */
    int compact;                   /* /compact: message lines drop their time stamp */
    int timestamps;                /* /timestamps: off drops the stamp as well */
    int focus;
    int menu;                      /* open dropdown 0..3, -1 none */
    int menu_sel;
    int help;                      /* help overlay shown */
    int help_top;
    int view;                      /* text overlay shown (the thread view) */
    int view_top;
    int view_n;                    /* lines held in view_text */
    char view_title[32];
    char view_text[LC_VIEW_MAX][LC_VIEW_COL];   /* a line starting '=' draws as a heading, like the help text */
    int modal;
    char modal_title[24];          /* "Error", or the prompt's question */
    char modal_text[96];
    char prompt[48];
    int prompt_len;
    ui_popup ctx;                  /* the right-click menu (TS features/context-menus.ts) */
    int ctx_kind;                  /* LC_CTX_* */
    int ctx_target;                /* side index (user, channel) or line index (chat) */
    char pick[24];                 /* the keyboard picker's message id, "" when not picking (TS message-picker.ts) */
    int slash_sel, slash_top;      /* the "/" menu: selected match, first visible match */
    int slash_off;                 /* Esc hid the menu until the next typed character */
    int editing;                   /* the input holds a recalled history line: Enter edits it (label [EDITING]) */
    /* The format picker (TS ui/format-picker.ts on the SDK CategoryPicker): shown over the input while
       a selection is held still, or on F5. fmt_a..fmt_b is the selection it was opened for. */
    int fmt;                       /* shown */
    int fmt_cat, fmt_item, fmt_item_top;
    int fmt_pane;                  /* LC_FMT_PANE_*: which list has the keys */
    int fmt_a, fmt_b;
    int fmt_kind;                  /* LC_PICK_*: the same CategoryPicker serves the format and the emoji picker */
    const unsigned long *rgb;      /* the caller's theme tokens, 0xRRGGBB in ui_token order (the picker's colours) */
} lc_model;

/* ---- the format picker ---- */
#define LC_FMT_CATS 3
#define LC_FMT_H    10             /* format-picker.ts: height 10 */
enum { LC_FMT_PANE_CAT, LC_FMT_PANE_ITEM };
/* The emoji picker (TS ui/emoji-picker.ts): the same CategoryPicker, so the same model fields, keys, mouse and hits. */
enum { LC_PICK_FORMAT, LC_PICK_EMOJI };
#define LC_EMOJI_CATS 4
#define LC_EMOJI_H    14           /* emoji-picker.ts: height 14 */
const char *lc_emoji_cat_name(int cat);
int lc_emoji_count(int cat);        /* Special also lists the board's custom emoji (TS allEmojis) */
const char *lc_emoji_code(int cat, int item);   /* ":smile:" */
const char *lc_emoji_text(int cat, int item);   /* ":-)" */
/** emoji-picker.ts emojiLabel(e, width): the art padded to 16 columns then the code, clipped to `width`. */
int lc_emoji_label(char *out, int cap, int cat, int item, int width);
void lc_emoji_open(lc_model *m);
/** The shown picker's category count / item count / name / row count, whichever kind it is. */
int lc_pick_cats(const lc_model *m);
int lc_pick_rows(const lc_model *m);
const char *lc_fmt_cat_name(int cat);
int lc_fmt_count(int cat);
const char *lc_fmt_name(int cat, int item);
/** The selected text wrapped as format-picker.ts FORMATS[cat][item].wrap does, colours from `rgb`
 *  (the theme tokens, as T.* are in TS). Returns the length, or -1 when it does not fit `cap`. */
int lc_fmt_wrap(char *out, int cap, int cat, int item, const char *text, int len, const unsigned long *rgb);
/** Open the picker for the selection a..b of the input (CategoryPicker.display at the TS
 *  getSelectionPosition: x = input left + 1 + selection start, y = input top + 1). */
void lc_fmt_open(lc_model *m, int a, int b);
/** Move the focused list's selection by `delta` (category moves reload the items at row 0). */
void lc_fmt_move(lc_model *m, int delta);

enum { LC_CTX_NONE, LC_CTX_USER, LC_CTX_CHAT, LC_CTX_CHANNEL, LC_CTX_REACT };   /* REACT: the chat menu's reaction picker */

/* What a click lands on, from the regions the last lc_draw laid out. */
enum { LC_HIT_NONE, LC_HIT_MENU, LC_HIT_DROPDOWN, LC_HIT_SIDEBAR, LC_HIT_CHAT, LC_HIT_INPUT,
       LC_HIT_STATUS, LC_HIT_POPUP, LC_HIT_YES, LC_HIT_NO, LC_HIT_OK, LC_HIT_MODAL, LC_HIT_SCROLLBAR,
       LC_HIT_FMT, LC_HIT_FMT_CAT, LC_HIT_FMT_ITEM, LC_HIT_FMT_CLOSE };

#define LC_SCROLL_TRACK 66
#define LC_SCROLL_THUMB 195
#define LC_MENUS 4
extern const char *const lc_menu_label[LC_MENUS];
extern const int lc_menu_count[LC_MENUS];
extern const char *const *const lc_menu_items[LC_MENUS];
extern const char *const lc_help_text[];
extern const int lc_help_lines;

/* ---- The "/" command menu (TS ui/command-palette.ts). The list is lc_cmd_help, the table /help reads. ---- */
extern const char *const lc_cmd_help[][4];     /* name, aliases, description, usage */
extern const int lc_cmd_help_count;
#define LC_SLASH_MAX   64                      /* matches kept (more than the table holds) */
#define LC_SLASH_ROWS  8                       /* visible rows */
/** Fills idx[] with the commands matching `input` (must start with "/"; term = the rest): name starts
 *  with the term or the description contains it, case-insensitive; name-prefix matches first, then
 *  alphabetical. Returns the count, 0 when input does not start with "/". */
int lc_slash_match(const char *input, int *idx, int max);
/** One row's text for a `cols`-wide screen. At 80+ columns "/" name(12) " " usage(20) " " description,
 *  ucol and ulen get the usage's byte range (dim); narrower "/name description" cut to cols-4 (ulen 0). */
void lc_slash_row(char *out, int cap, int cmd, int cols, int *ucol, int *ulen);
/** 1 when `input` is exactly "/name" for command `cmd` (Enter then runs it instead of filling). */
int lc_slash_exact(const char *input, int cmd);
/** Top match when its name starts with the typed term (TS ghost completion), else -1. */
int lc_slash_ghost(const char *input, const int *idx, int n);
/** The new first-visible match that keeps `sel` inside LC_SLASH_ROWS of `n` matches. */
int lc_slash_scroll(int sel, int top, int n);

void lc_model_init(lc_model *m, int cols, int rows);
/** Call after ANY change to m->lines or m->nlines (add, remove, edit, reaction): draw_chat caches each
 *  line's wrapped row count against m->lines_gen and would otherwise draw stale rows. */
void lc_lines_changed(lc_model *m);
/** How many times draw_chat re-wrapped every line (pass 1); the cache test counts it. */
extern unsigned long lc_chat_rewraps;
int lc_sidebar_width(const lc_model *m);
int lc_text_rows(const lc_model *m);
int lc_nick_color(const char *nick);
/* Incoming-message formatting state: the caller's handle (its @mentions are highlighted) and the hub's custom emoji names. */
#define LC_CUSTOM_EMOJI_MAX 64
#define LC_CUSTOM_EMOJI_LEN 24
#define LC_CUSTOM_EMOJI_TEXT 33   /* the hub's emojiMaxBytes (32) and the NUL */
void lc_set_self(const char *handle);
void lc_custom_emoji_clear(void);
void lc_custom_emoji_add(const char *name, const char *ascii);
/** 1 when `code` (":smile:") is one of the built-in emoji (TS EMOJIS). */
int lc_emoji_builtin(const char *code);
/** The reactions the React picker offers, in its order: the server's names (TS REACTION_EMOJIS). */
#define LC_REACT_KINDS 8
extern const char *const lc_react_names[LC_REACT_KINDS];
/** A reaction's ASCII glyph, at most three columns (sysop 2026-11-08: one short face, not "[+]"):
 *  "+1" ":)", "-1" ":/", heart "<3", fire "*", laugh ":D", wow ":O", sad ":(", angry ">(".
 *  An unknown name is shown as itself. Every caller sees these text faces, never emoji. */
const char *lc_react_display(const char *emoji);
/** The picker label for reaction i (0..LC_REACT_KINDS-1): its glyph, then its name in words, ":)  Thumbs Up". */
const char *lc_react_label(int i);
/** The reaction row(s) under a message: "\n", `indent` spaces, then "glyph count" items two spaces
 *  apart; an item that would pass `width` columns (<= 0: no limit) starts a further row at the same
 *  indent. "" when the line has no counts. */
void lc_react_rows(const lc_line *l, int indent, int width, char *out, int cap);
/** The line as marked text (ui_cells markers) in the TS formats; a message's reactions follow on
 *  their own rows (lc_react_rows) indented to the message text, wrapped to `width` (<= 0: no limit). */
void lc_line_marked(const lc_line *l, char *out, int cap, int stamps, int width);
/** The keyboard message picker (TS message-picker.ts). Start selects the newest message and returns 0
 *  when there is none; move steps one message (dir -1 older, +1 newer) and stays put at either end;
 *  index is the picked line or -1; stop clears the pick and scrolls back to the newest. */
int lc_pick_start(lc_model *m);
void lc_pick_move(lc_model *m, int dir);
int lc_pick_index(const lc_model *m);
void lc_pick_stop(lc_model *m);
/** Paints the whole frame into c's back buffer; `cursor_row`/`cursor_col` get where the caret goes. */
void lc_draw(ui_cells *c, const lc_model *m, int *cursor_row, int *cursor_col);
/** The region under 0-based row/col in the last drawn frame (LC_HIT_*). *index: the menu (MENU), the
 *  item (DROPDOWN), the side item (SIDEBAR), the line index or -1 for an empty row (CHAT), the column (STATUS). */
int lc_hit(int row, int col, int *index);
/** The chat scroll offset (lc_model.scroll) that puts the scrollbar thumb's middle on 0-based screen
 *  `row` in the last drawn frame, clamped to the track; -1 when the frame drew no scrollbar. */
int lc_scroll_at(int row);

#endif
