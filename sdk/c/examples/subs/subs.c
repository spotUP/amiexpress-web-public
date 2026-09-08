/*
 * SUBS - the public discussion in this conference, in C, on a 68K Amiga.
 *
 * A C*Base sysop's account of what made a C64 board feel alive: the traffic
 * was PUBLIC, it arrived in PLAIN NUMBER ORDER, and replies carried NO
 * QUOTING. On Ami-X the files were the point and messages were nearly always
 * private - "the system itself doesn't incite group discussion". The gap is
 * not capability: AmiExpress has had EALL since forever. What is missing is a
 * place where the public messages are the FIRST thing you see, with ONE key to
 * add to them.
 *
 * That is this door, and its three constraints are deliberate:
 *
 *   PUBLIC BY DEFAULT. The only compose verb here is EALL. Writing a private
 *   message is what E at the prompt is for.
 *   PLAIN NUMBER ORDER. Sorted by message number, ascending, always. No
 *   threading, no score, no "hot", no reordering.
 *   NO QUOTING. A reply is a new public message with the same subject. There
 *   is no quote buffer and nothing to build one from. Do not "improve" this
 *   later without the sysop asking.
 *
 * WHAT IT DOES NOT DO, and why:
 *
 *   It does not WRITE a message. `P` and `R` hand "EALL" back with
 *   ae_return_command and exit; the board then runs its own express.e message
 *   entry, which is 1:1 with the real thing. A second editor in a door would
 *   be a second source of truth for message entry.
 *   It does not READ the message base. The board decodes and filters
 *   (AEW_MSGQUERY, see ae_msgbase.h) - two record layouts are interleaved in
 *   this board's HeaderFiles, and the caller's ACS cannot be enforced from
 *   inside a door.
 *   It does not MOVE the read pointer. Reading here marks nothing read; the
 *   count clears when the caller reads through `R`. One owner for the pointer,
 *   and it pushes callers into the board's real reader.
 *
 * ONE BINARY, TWO REGISTRATIONS. Under SUBS it draws the feed. Under any other
 * name - SUBSCAN - it prints a three-line digest and leaves, which is what a
 * conference bulletin runs with ~XISUBSCAN.
 *
 * Drawn at all three widths the board serves (80-column ANSI, wider terminals,
 * and the 40-column compact tier ui_is_compact_width picks). ASCII tokens only,
 * theme palette throughout, no bold, no emoji.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "aedoor.h"
#include "ae_msgbase.h"
#include "ae_session.h"
#include "ui_ansi.h"
#include "ui_chrome.h"
#include "ui_doc.h"
#include "ui_input.h"
#include "ui_key.h"
#include "ui_list.h"
#include "ui_profile.h"
#include "ui_screen.h"
#include "ui_theme.h"

/* One frame and one session record, both owned here. Nothing allocates. */
static char frame_buffer[16384];
static char session_storage[AE_SESSION_MIN_STORAGE];

/*
 * The feed window this door holds.
 *
 * NOT the plan's 200, and the reason is measured rather than preferred: the
 * XIM string carries 190 bytes, a listing row is about forty, so the board
 * answers roughly four rows per round trip and each trip costs ~45ms of
 * emulation. Two hundred rows is fifty trips and better than two seconds
 * before the caller sees anything. A hundred is about half that, and the door
 * says on screen when the conference is longer than what it holds.
 *
 * A sysop who wants a different trade-off sets FeedWindow in SUBS.cfg, which
 * the admin writes for him (Doors/SUBS/door.settings.json).
 */
#define ROWS_MAX  200
#define ROWS_DEFAULT 100
#define BODY_MAX  8192

static ae_msg_row rows[ROWS_MAX];
static int row_count;
static int feed_window = ROWS_DEFAULT;
static long feed_total;                 /* what the conference holds */
static long feed_unread;
static char conf_name[32];

static char body[BODY_MAX];
static char status_line[80];
static char row_text[256];
static char doc_title[64];

typedef enum { FEED_OK, FEED_EMPTY, FEED_NOHOST, FEED_GONE } feed_state;

static ui_screen screen;
static ui_key_source keys;



static const ui_theme *theme;
/* ------------------------------------------------------------- masthead rail

   The rail slides. A 68K door has no timers, so the frames come from the idle
   hook while we are waiting for a key (ui_key.h): one row redrawn, about five
   frames a second. Twenty would cost twenty XIM messages a second for
   decoration, which is exactly what the "draw smart" rule is about.

   The current title is remembered so the hook can redraw the row it is on
   without knowing which view put it there. */
static int rail_tick;
static const char *masthead_title = "SUBS";

static void draw_masthead(const char *title)
{
    masthead_title = title;
    ui_masthead_draw_tick(&screen.buf, 1, 1, screen.cols, title,
                          theme->rail, UI_TOKEN(UI_T_BAR_INK),
                          UI_TOKEN(UI_T_BAR), rail_tick);
}
static void door_idle(void *ctx)
{
    (void)ctx;
    rail_tick++;
    ui_masthead_draw_tick(&screen.buf, 1, 1, screen.cols, masthead_title,
                          theme->rail, UI_TOKEN(UI_T_BAR_INK),
                          UI_TOKEN(UI_T_BAR), rail_tick);
    ui_screen_flush(&screen);
    ae_delay_ticks(10);   /* ten ticks is a fifth of a second on PAL */
}

/* The widgets that paint and then block (ui_input, ui_confirm, ui_doc) only
   hold an ansi_buf, which is memory. This is how they get their prompt onto
   the caller's screen before waiting for the answer to it. */
static void door_flush(void *ctx)
{
    (void)ctx;
    ui_screen_flush(&screen);
}

static int pushback = -1;
static int wide;

/* ------------------------------------------------------------------ config */

static void trim(char *s)
{
    unsigned long len = (unsigned long)strlen(s);
    while (len > 0 && (s[len - 1] == '\r' || s[len - 1] == '\n' ||
                       s[len - 1] == ' ' || s[len - 1] == '\t')) {
        s[--len] = '\0';
    }
}

/**
 * `Key=value` lines, `#`/`;` comments, everything else ignored - the same
 * shape ACHIEVE and REQUESTS read, and the same shape the admin writes.
 *
 * A MISSING file is not an error here, unlike REQUESTS: this door needs no
 * secret to work, only the board it is already talking to. It takes the
 * default window and says nothing about it.
 */
static void config_load(const char *path)
{
    FILE *f;
    char line[256];

    f = fopen(path, "r");
    if (f == 0) return;

    while (fgets(line, (int)sizeof line, f) != 0) {
        char *eq;
        char *value;
        trim(line);
        if (line[0] == '#' || line[0] == ';' || line[0] == '\0') continue;
        eq = strchr(line, '=');
        if (eq == 0) continue;
        *eq = '\0';
        value = eq + 1;
        while (*value == ' ' || *value == '\t') value++;

        if (strcmp(line, "FeedWindow") == 0) {
            int n = atoi(value);
            if (n >= 10 && n <= ROWS_MAX) feed_window = n;
        }
    }
    fclose(f);
}

/* ------------------------------------------------------------------- input */

static int door_key(void *ctx) { (void)ctx; return ae_key(); }
static int door_pending(void *ctx) { (void)ctx; return ae_input_pending(); }
static void door_settle(void *ctx) { (void)ctx; ae_delay_ticks(1); }

/* One line of prose in the theme's ink, clipped to the caller's width. */
static void say(int row, const char *text)
{
    ansi_color(&screen.buf, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen.buf, row, 3, text, screen.cols - 3);
}

/* -------------------------------------------------------------------- rows */

/**
 * One listing row, wide or compact.
 *
 * Widths come from the profile, never from a literal: at 80 the subject gets
 * what is left after the fixed columns, at 40 the date and the sender's full
 * name are what go, because the SUBJECT is what a caller chooses a message by.
 */
static const char *feed_row(void *context, int index)
{
    int is_wide = *(const int *)context;

    if (index < 0 || index >= row_count) return "";

    if (is_wide) {
        int subject_cols = screen.cols - 34;
        if (subject_cols < 10) subject_cols = 10;
        if (subject_cols > 60) subject_cols = 60;
        sprintf(row_text, "%5ld %-12.12s %-*.*s %-8.8s %c",
                rows[index].number, rows[index].from,
                subject_cols, subject_cols, rows[index].subject,
                rows[index].date, rows[index].flag);
    } else {
        /* 40 columns: 4 + 1 + 10 + 1 + 22 + 1 + 1 = 40, and the caret the list
           draws lives in the two cells before it - so the row is built for
           cols - 4 and the widths below add up to that. */
        int subject_cols = screen.cols - 18;
        if (subject_cols < 8) subject_cols = 8;
        sprintf(row_text, "%4ld %-10.10s %-*.*s%c",
                rows[index].number, rows[index].from,
                subject_cols, subject_cols, rows[index].subject,
                rows[index].flag);
    }
    return row_text;
}

/* ------------------------------------------------------------------- feed */

/** Ask the board what this conference holds, and fill the window. */
static feed_state load_feed(void)
{
    ae_msg_stat stat;
    int rc;
    int got;

    row_count = 0;
    feed_total = 0;
    feed_unread = 0;
    conf_name[0] = '\0';

    rc = ae_msg_stat_read(&stat);
    if (rc == AE_MSG_ERR_CARRIER) return FEED_GONE;
    if (rc != AE_MSG_OK) return FEED_NOHOST;

    feed_total = stat.total;
    feed_unread = stat.unread;
    strncpy(conf_name, stat.conf, sizeof conf_name - 1);
    conf_name[sizeof conf_name - 1] = '\0';
    if (stat.total <= 0) return FEED_EMPTY;

    /* The NEWEST window, in ascending number order. A negative first is what
       asks for the tail; message numbers are sparse, so the board is the only
       thing that can work out where it starts. */
    got = ae_msg_list(-1, rows, feed_window);
    if (got == AE_MSG_ERR_CARRIER) return FEED_GONE;
    if (got < 0) return FEED_NOHOST;
    row_count = got;
    return row_count > 0 ? FEED_OK : FEED_EMPTY;
}

/** The status line: what is here, what is new, and where to clear it. */
static void build_status(void)
{
    if (feed_total <= 0) {
        status_line[0] = '\0';
        return;
    }
    if (wide) {
        if (feed_unread > 0) {
            sprintf(status_line, "[INFO] %ld public messages. %ld new for you - press R at the prompt.",
                    feed_total, feed_unread);
        } else {
            sprintf(status_line, "[INFO] %ld public messages, none new for you.", feed_total);
        }
    } else {
        sprintf(status_line, "[INFO] %ld msgs, %ld new", feed_total, feed_unread);
    }
}

/**
 * The column header, built from the SAME widths feed_row() uses so the two
 * cannot drift apart. Three cells of caret room first, which is what
 * ui_list_draw reserves for ">>".
 */
static void draw_header(void)
{
    char head[160];

    if (wide) {
        int subject_cols = screen.cols - 34;
        if (subject_cols < 10) subject_cols = 10;
        if (subject_cols > 60) subject_cols = 60;
        sprintf(head, "   %5s %-12.12s %-*.*s %-8.8s %s",
                "NUM", "FROM", subject_cols, subject_cols, "SUBJECT", "DATE", " ");
    } else {
        int subject_cols = screen.cols - 18;
        if (subject_cols < 8) subject_cols = 8;
        sprintf(head, "   %4s %-10.10s %-*.*s%s",
                "NUM", "FROM", subject_cols, subject_cols, "SUBJECT", " ");
    }
    ansi_color(&screen.buf, UI_TOKEN(UI_T_DIM), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen.buf, 2, 1, head, screen.cols - 1);
}

static void draw_status(void)
{
    if (status_line[0] == '\0') return;
    ansi_color(&screen.buf, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen.buf, screen.rows - 1, 3, status_line, screen.cols - 4);
}

/* The footer, built so its suffix survives at any width. */
static void draw_footer(const char *const *optional, int n, const char *suffix)
{
    char footer[160];
    ui_footer_build(footer, sizeof footer, screen.cols - 1, "", optional, n, suffix);
    if (screen.profile.collapse_chrome) {
        ansi_color(&screen.buf, UI_TOKEN(UI_T_DIM), -1, 0);
        ansi_text(&screen.buf, screen.rows, 1, footer, screen.cols - 1);
    } else {
        ui_bar_draw(&screen.buf, screen.rows, 1, screen.cols, footer,
                    UI_TOKEN(UI_T_DIM), UI_TOKEN(UI_T_BAR));
    }
}

/* ------------------------------------------------------------- digest mode */

/**
 * Three lines, no frame, no key wait - what a conference bulletin runs.
 *
 * Nothing at all when the conference has no public messages: a bulletin that
 * says "0" at every join is worse than one that says nothing. And nothing when
 * the board cannot answer, which is the case on a classic AmiExpress - a
 * silent no-op is the only acceptable behaviour for something that runs on
 * every single join.
 */
static void digest(void)
{
    ae_msg_stat stat;
    ae_msg_row latest;
    char line[200];
    int got;

    if (ae_msg_stat_read(&stat) != AE_MSG_OK) return;
    if (stat.total <= 0) return;

    sprintf(line, "[INFO] %.30s: %ld public messages, %ld new for you.",
            stat.conf[0] != '\0' ? stat.conf : "This conference",
            stat.total, stat.unread);
    ae_put(line, 1);

    got = ae_msg_list(-1, &latest, 1);
    if (got == 1) {
        sprintf(line, "       Latest: %.20s - \"%.40s\"", latest.from, latest.subject);
        ae_put(line, 1);
    }

    ae_put("       Type SUBS to join in, or R to read your new mail.", 1);
}

/* --------------------------------------------------------------- one message */

/** Read one message: a header block, then the body in the pager. */
static int read_message(int index)
{
    ui_doc_style ds;
    long len;
    int rc;

    if (index < 0 || index >= row_count) return 0;

    len = ae_msg_body(rows[index].number, body, sizeof body);
    if (len == AE_MSG_ERR_CARRIER) return -1;
    if (len <= 0) {
        strcpy(body, "That message has no body the board will show.");
    }

    if (wide) {
        sprintf(doc_title, "#%ld  From %.20s  %.8s  To EALL",
                rows[index].number, rows[index].from, rows[index].date);
    } else {
        sprintf(doc_title, "#%ld %.14s", rows[index].number, rows[index].from);
    }

    ui_doc_style_init(&ds);
    ds.top = 3;
    ds.left = screen.profile.borders ? 3 : 1;
    ds.width = screen.cols - (screen.profile.borders ? 6 : 2);
    ds.height = screen.rows - 5;
    ds.fg = UI_TOKEN(UI_T_INK);
    ds.bg = UI_TOKEN(UI_T_GROUND);
    ds.ink = UI_TOKEN(UI_T_ACCENT);

    rc = ui_doc(&screen.buf, &keys, &pushback, &ds, doc_title, body);
    ui_screen_flush(&screen);
    return rc;
}

/* ------------------------------------------------------------------ posting */

/**
 * Hand "EALL" back to the board and leave.
 *
 * The door never writes a message: RETURNCOMMAND asks the BBS to run its own
 * express.e entry once this door has exited, which is the only order that
 * works - two doors cannot share a node. Public by default falls out for free,
 * because EALL *is* the public verb.
 *
 * `subject` is printed first and NOT prefilled. EALL is dispatched with a
 * literal argument (command.handler.ts:4920-4921), so there is no parameter
 * slot to put a "Re:" through, and adding one would change the signature of
 * the board's own message entry - a core behaviour change for a convenience.
 * Deferred on purpose; the caller retypes it.
 *
 * Returns 1 when the door should exit, 0 when the caller said no, -1 when the
 * caller went away.
 */
static int post_flow(const char *question, const char *subject)
{
    int yes;

    yes = ui_confirm(&screen.buf, &keys, &pushback, 0, question, 1);
    if (yes < 0) return -1;
    if (yes == 0) {
        strcpy(status_line, "[INFO] Nothing posted.");
        return 0;
    }

    if (subject != 0 && subject[0] != '\0') {
        char line[160];
        ansi_clear(&screen.buf);
        draw_masthead("POST TO EVERYONE");
        say(3, "You are replying to:");
        sprintf(line, "  \"%.60s\"", subject);
        say(4, line);
        say(6, wide ? "There is no quoting here, and no prefilled subject."
                    : "No quoting, no prefilled subject.");
        say(7, wide ? "Type that subject again at the prompt the board gives you."
                    : "Retype the subject at the prompt.");
        ui_screen_flush(&screen);
    }

    ae_return_command("EALL");
    return 1;
}

/* --------------------------------------------------------------------- door */

/**
 * Is this the digest registration?
 *
 * Case-insensitive without <ctype.h>: a BBSCMD name is ASCII by definition
 * (Commands/BBSCmd/<NAME>.info), and tolower() drags a locale table into a
 * door that has no use for one.
 */
static int name_is_subscan(const char *name)
{
    static const char wanted[] = "SUBSCAN";
    int i;

    if (name == 0) return 0;
    for (i = 0; wanted[i] != '\0'; i++) {
        char c = name[i];
        if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
        if (c != wanted[i]) return 0;
    }
    return name[i] == '\0';
}

int main(int argc, char **argv)
{
    ae_session session;
    ui_list list;
    char theme_id[32];
    char launched_as[32];
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    feed_state state;
    int running = 1;
    int full = 1;

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(&session, session_storage, (long)sizeof(session_storage), node) != 0) {
        ae_shutdown();
        return 20;
    }

    /* Cursor keys, or the BBS eats every one of them before this door sees it
       (express.e:7514-7528). Restored on every exit path by the transport. */
    ae_raw_arrows(1);

    launched_as[0] = '\0';
    ae_menu_command(&session, launched_as, (int)sizeof launched_as);

    /*
     * DIGEST MODE, before the screen is ever opened: this runs at conference
     * join, inside a bulletin, and must not clear anything or wait for a key.
     *
     * The quiet mode is opted INTO by name, and only by the exact name
     * SUBSCAN. The plan had it the other way round - "anything that is not
     * SUBS" - and that is wrong twice over: a board that does not answer
     * command 605 at all (a classic AmiExpress) would then only ever get the
     * three-line digest, and so would every harness that launches a binary
     * under its own name. dev/scripts/door-probe/repaint-cost.ts passes
     * doorCommand 'PROBE', which is how this was found: the door printed three
     * lines and exited before a single keypress could be measured.
     *
     * So an unrecognised name draws the real door. A sysop who wants the
     * digest asks for it by registering SUBSCAN, which is what Phase 4's
     * ~XISUBSCAN token runs.
     */
    if (name_is_subscan(launched_as)) {
        digest();
        ae_close(&session);
        ae_shutdown();
        return 0;
    }

    ui_screen_open(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    wide = !ui_is_compact_width(screen.cols);

    ae_user_theme(&session, theme_id, (int)sizeof(theme_id));
    theme = ui_theme_by_id(theme_id);
    ansi_set_palette(&screen.buf, theme->rgb, theme->idx, UI_TOKEN_COUNT);

    keys.next = door_key;
    keys.pending = door_pending;
    keys.settle = door_settle;
    keys.idle = door_idle;
    keys.flush = door_flush;
    keys.ctx = 0;

    config_load("SUBS.cfg");

    /* The feed is a round trip per four rows, so say what is happening rather
       than leaving a black screen for a second. */
    ansi_clear(&screen.buf);
    draw_masthead("SUBS");
    say(3, wide ? "Reading the public messages in this conference..." : "Reading the messages...");
    ui_screen_flush(&screen);

    state = load_feed();
    build_status();

    ui_list_init(&list);
    list.top = 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = screen.rows - 6;
    list.count = row_count;
    list.row = feed_row;
    list.context = &wide;
    list.borders = 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT);
    list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);
    /* Open on the NEWEST message, which is where a discussion is. */
    ui_list_select(&list, row_count > 0 ? row_count - 1 : 0);

    while (running) {
        int key;

        if (full) {
            static const char *const hints[4] = {
                "Up/Down Move", "Enter Read", "P Post", "R Reply"
            };
            static const char *const narrow_hints[3] = {
                "Up/Dn Move", "Ret Read", "P Post"
            };

            ansi_clear(&screen.buf);
            draw_masthead(conf_name[0] != '\0' && wide ? conf_name : "SUBS");

            if (state == FEED_NOHOST) {
                /* Not an error, and not the same sentence as an empty
                   conference: this is what a classic AmiExpress gives. */
                say(3, wide ? "This board does not answer the message feed."
                            : "No message feed here.");
                say(5, "Press Q to leave.");
            } else if (state == FEED_EMPTY || row_count == 0) {
                say(3, wide ? "Nobody has posted here yet. Press P and be first."
                            : "Nothing posted yet.");
                say(5, wide ? "Press P to post, Q to leave." : "P post, Q leave.");
            } else {
                draw_header();
                ui_list_draw(&list, &screen.buf);
                if (feed_total > (long)row_count) {
                    char note[80];
                    sprintf(note, wide
                            ? "Showing the latest %d of %ld. Older messages are at the R prompt."
                            : "Latest %d of %ld.",
                            row_count, feed_total);
                    say(list.top + list.height, note);
                }
            }

            draw_status();
            if (screen.profile.collapse_chrome) draw_footer(narrow_hints, 3, "Q=Leave");
            else draw_footer(hints, 4, "Q=Leave");

            ui_screen_flush(&screen);
            full = 0;
        }

        key = ui_key_read(&keys, &pushback);
        if (key < 0) break;                 /* the carrier is gone */

        if (key == UI_KEY_UP || key == 'k') {
            ui_list_move(&list, -1);
            ui_list_draw_changed(&list, &screen.buf, 0);
            ui_screen_flush(&screen);
            continue;
        }
        if (key == UI_KEY_DOWN || key == 'j') {
            ui_list_move(&list, 1);
            ui_list_draw_changed(&list, &screen.buf, 0);
            ui_screen_flush(&screen);
            continue;
        }
        if (key == UI_KEY_PGUP) {
            ui_list_move(&list, -ui_list_visible_rows(&list));
            ui_list_draw_changed(&list, &screen.buf, 0);
            ui_screen_flush(&screen);
            continue;
        }
        if (key == UI_KEY_PGDN) {
            ui_list_move(&list, ui_list_visible_rows(&list));
            ui_list_draw_changed(&list, &screen.buf, 0);
            ui_screen_flush(&screen);
            continue;
        }

        if (key == 'q' || key == 'Q' || key == UI_KEY_ESC) break;

        if (key == '~' || key == UI_KEY_HOME) {
            state = load_feed();
            build_status();
            list.count = row_count;
            ui_list_select(&list, row_count > 0 ? row_count - 1 : 0);
            full = 1;
            continue;
        }

        if ((key == '\r' || key == ' ' || key == UI_KEY_ENTER) && row_count > 0) {
            if (read_message(list.selected) < 0) break;
            full = 1;
            continue;
        }

        if (key == 'p' || key == 'P') {
            int rc = post_flow(wide ? "Post to everyone in this conference?" : "Post to everyone?", 0);
            if (rc < 0) break;
            if (rc == 1) { running = 0; continue; }
            full = 1;
            continue;
        }

        if ((key == 'r' || key == 'R') && row_count > 0) {
            int rc = post_flow(wide ? "Reply to everyone in this conference?" : "Reply to everyone?",
                               rows[list.selected].subject);
            if (rc < 0) break;
            if (rc == 1) { running = 0; continue; }
            full = 1;
            continue;
        }
    }

    /* ONE clear on the way out, not two: ui_screen_close already resets,
       clears, shows the cursor and flushes (ui_screen.c:69-81). An extra
       ansi_clear before it costs a second full-screen erase on the wire and
       leaves a capture with two teardown clears, which is enough to make a
       screen model read as empty. */
    ui_screen_close(&screen);
    ae_close(&session);
    ae_shutdown();
    return 0;
}
