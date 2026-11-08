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
enum { LC_SYSTEM, LC_ACTIVITY_LINE, LC_HISTORY, LC_LIVE, LC_NOTE };

/* A message's reaction counts, one per emoji, in the server's order (first reacted first). The
   TS door keeps the same per-message map (features/reaction-store.ts); this door paints it on its
   own row under the message, "<3 2  :) 1" in the accent colour (lc_react_rows). */
#define LC_REACT_MAX 8
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
    int scroll;                    /* display rows back from the newest */
    lc_side side[LC_SIDE_MAX];
    int nside;
    int side_sel;
    int sidebar_hidden;            /* F2 */
    char input[LC_INPUT_MAX];
    int input_len;
    int input_cur;                 /* caret column in input, 0..input_len */
    int side_tab;                  /* 0 channels, 1 users (F3, click on the status line) */
    int compact;                   /* /compact: message lines drop their time stamp */
    int timestamps;                /* /timestamps: off drops the stamp as well */
    int focus;
    int menu;                      /* open dropdown 0..3, -1 none */
    int menu_sel;
    int help;                      /* help overlay shown */
    int help_top;
    int modal;
    char modal_title[24];          /* "Error", or the prompt's question */
    char modal_text[96];
    char prompt[48];
    int prompt_len;
    ui_popup ctx;                  /* the right-click menu (TS features/context-menus.ts) */
    int ctx_kind;                  /* LC_CTX_* */
    int ctx_target;                /* side index (user, channel) or line index (chat) */
    char pick[24];                 /* the keyboard picker's message id, "" when not picking (TS message-picker.ts) */
    int editing;                   /* the input holds a recalled history line: Enter edits it (label [EDITING]) */
} lc_model;

enum { LC_CTX_NONE, LC_CTX_USER, LC_CTX_CHAT, LC_CTX_CHANNEL, LC_CTX_REACT };   /* REACT: the chat menu's reaction picker */

/* What a click lands on, from the regions the last lc_draw laid out. */
enum { LC_HIT_NONE, LC_HIT_MENU, LC_HIT_DROPDOWN, LC_HIT_SIDEBAR, LC_HIT_CHAT, LC_HIT_INPUT,
       LC_HIT_STATUS, LC_HIT_POPUP, LC_HIT_YES, LC_HIT_NO, LC_HIT_OK, LC_HIT_MODAL };

#define LC_SCROLL_TRACK 66
#define LC_SCROLL_THUMB 195
#define LC_MENUS 4
extern const char *const lc_menu_label[LC_MENUS];
extern const int lc_menu_count[LC_MENUS];
extern const char *const *const lc_menu_items[LC_MENUS];
extern const char *const lc_help_text[];
extern const int lc_help_lines;

void lc_model_init(lc_model *m, int cols, int rows);
int lc_sidebar_width(const lc_model *m);
int lc_text_rows(const lc_model *m);
int lc_nick_color(const char *nick);
/** The reactions the React picker offers, in its order: the server's names (TS REACTION_EMOJIS). */
#define LC_REACT_KINDS 8
extern const char *const lc_react_names[LC_REACT_KINDS];
/** A reaction's ASCII glyph, at most three columns (sysop 2026-11-08: one short face, not "[+]"):
 *  "+1" ":)", "-1" ":/", heart "<3", fire "*", laugh ":D", wow ":O", sad ":(", angry ">(".
 *  An unknown name is shown as itself. A latin1 / Amiga caller sees these everywhere; a UTF-8
 *  caller sees them in the picker and the "Reactions on" line. */
const char *lc_react_display(const char *emoji);
/** The UTF-8 emoji for reaction i, the TS door's EMOJI_UTF8 bytes: the ui_cells wide-glyph table
 *  (UI_CELLS_M_WIDE id i+1) a UTF-8 caller's canvas registers. */
extern const char *const lc_react_utf8[LC_REACT_KINDS];
/** Emoji mode: on when the board answered AEW_CHARSET "utf-8" (the TS door's unicodeCapable test)
 *  and the door declared UTF-8 output. lc_react_rows then writes known reactions as two-column
 *  emoji; off (the default) it writes the ASCII glyphs. */
void lc_react_emoji(int on);
int lc_react_emoji_on(void);
/** The picker label for reaction i (0..LC_REACT_KINDS-1): its glyph, then its name in words, ":)  Thumbs Up". */
const char *lc_react_label(int i);
/** The reaction row(s) under a message: "\n", `indent` spaces, then "glyph count" items two spaces
 *  apart (in emoji mode a known glyph is UI_CELLS_M_WIDE + id, two columns); an item that would pass `width` columns (<= 0: no limit) starts a further row at the same
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

#endif
