/*
 * SUBS - the messages in this conference, in C, on a 68K Amiga.
 *
 * A C*Base sysop's account of what made a C64 board feel alive: the traffic
 * was PUBLIC, it arrived in PLAIN NUMBER ORDER, and replies carried NO
 * QUOTING. On Ami-X the files were the point and messages were nearly always
 * private - "the system itself doesn't incite group discussion". The gap is
 * not capability: AmiExpress has had EALL since forever. What is missing is a
 * place where the messages are the FIRST thing you see, with ONE key to add to
 * them.
 *
 * WHAT IT LISTS is everything this caller may read, by express.e's own rule -
 * the public traffic, plus private mail he sent or received, plus everything
 * if he is above SysopLevel. It was public-only when the board filtered the
 * feed down to EALL for it; reading the base itself means the filter is the
 * door's, and hiding a caller's own mail from a message reader would be a
 * strange thing to do on purpose.
 *
 * That is this door, and its three constraints are deliberate:
 *
 *   PUBLIC BY DEFAULT WHEN POSTING. The only compose verb here is EALL.
 *   Writing a private message is what E at the prompt is for.
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
 *   entry. Writing is release 2, and it waits until the 110-byte record round
 *   trip is proven - reading a base wrongly shows the wrong name, writing it
 *   wrongly destroys mail.
 *   It does not MOVE the read pointer. Reading here marks nothing read; the
 *   count clears when the caller reads through `R`. One owner for the pointer.
 *
 * IT DOES READ THE MESSAGE BASE ITSELF, off the disk, through ae_msgbase and
 * ae_dos. An earlier version asked the board instead, over AEW_MSGQUERY - a
 * command this port invented and no real AmiExpress answers, which made the
 * door unusable on the machines it is meant for. The two objections to
 * reading the disk were real and are answered rather than avoided: the
 * interleaved record layouts are settled by a sequence pass ported from the
 * board's own classifier, and visibility follows express.e's STATUS BYTE rule
 * (public, or private and yours) rather than pretending to evaluate ACS. See
 * ae_msgbase.h.
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
#include "ui_editor.h"
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
 * This used to be a round-trip budget: the feed arrived over XIM at roughly
 * four rows per message and ~45ms each, so the window was really a stopwatch.
 * Reading the disk removes that entirely - a hundred records is 11KB and one
 * pass - so what is left is a MEMORY budget. Each row is about 110 bytes of
 * this door's own static storage, so two hundred is 22KB against an 8KB stack
 * and whatever the board left; a hundred is the safe half, and the door says
 * on screen when the conference is longer than what it holds.
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
static long feed_unreadable;            /* records no layout could explain */
/*
 * The highest message the caller actually OPENED this visit, or 0.
 *
 * Accumulated rather than flushed per message on purpose. Marking read costs
 * a write plus a read-back - two round trips, and ~198 bytes is one XIM
 * message on 68K - so doing it per Enter would put that on every keystroke
 * that matters. express.e batches for the same reason: readit moves the
 * global per message (express.e:12370) and only saveMsgPointers at a join or
 * logoff touches storage.
 *
 * OPENED, never merely listed: a caller who arrows down the list and quits
 * has read nothing, and must not lose their new flags for looking.
 */
static long marked_upto;
static char conf_name[32];

/*
 * The level at or above which a caller sees other people's private mail.
 *
 * The DOOR does not decide this and must not guess it. A door cannot evaluate
 * the board's ACS tables, so express.e's ACS_SYSOP_READ is not available to
 * it; what is available is the caller's level, and the sysop saying which
 * level counts. 255 is the default because on an unconfigured board nobody
 * reaches it, which fails towards showing too little rather than too much.
 */
#define SYSOP_LEVEL_DEFAULT 255
static int sysop_level = SYSOP_LEVEL_DEFAULT;

static char body[BODY_MAX];
static char status_line[80];
static char row_text[256];
static char doc_title[64];

/*
 * FEED_NOBASE is not FEED_EMPTY, and the distinction is the caller's.
 * "Nobody has posted here yet" invites him to; "this conference has no
 * message base" tells him something is wrong with the board. The old name for
 * this was FEED_NOHOST, from when a classic AmiExpress answering no XIM
 * command was the failure that mattered. The door reads files now, so the
 * failure that matters is a HeaderFile that is not there.
 */
typedef enum { FEED_OK, FEED_EMPTY, FEED_NOBASE, FEED_GONE } feed_state;

/* The board session.
 *
 * A file-static like `screen` and `keys` beside it, rather than a local of
 * main(): reading the message base needs to ask the board where that base is
 * and who is calling, and those questions are asked from load_feed() and
 * digest(), which are not main(). This door already keeps its screen and its
 * key source here for the same reason.
 */
static ae_session session;

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

/* A confirm that survives the rail.
 *
 * ui_input_style_init defaults row to 1 - the masthead row - so a confirm
 * passed a NULL style painted itself onto the branding, and the idle hook
 * repainted the rail straight over it about five times a second. The prompt
 * was there; it just lived for a frame ("it draws the prompt in the animated
 * ///// lines so it goes away", reported 2026-09-08).
 *
 * The fix is the ROW, not the animation: the rail owns row 1 and keeps
 * sliding, and a prompt belongs down by the status line where nothing else
 * paints. Theme tokens too, because the default style is white-on-blue and
 * this board is not.
 */
static void confirm_style(ui_input_style *st)
{
    ui_input_style_init(st);
    st->row = screen.rows - 3;
    st->left = 3;
    st->cols = screen.cols - 6;
    st->fg = UI_TOKEN(UI_T_INK);
    st->bg = UI_TOKEN(UI_T_GROUND);
    st->ink = UI_TOKEN(UI_T_ACCENT);
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
        } else if (strcmp(line, "SysopLevel") == 0) {
            int n = atoi(value);
            if (n >= 1 && n <= 255) sysop_level = n;
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
        /* The date is a raw timestamp on disk now - the board used to hand it
           over already rendered - so the door formats it. */
        char when[8];
        int subject_cols = screen.cols - 34;
        if (subject_cols < 10) subject_cols = 10;
        if (subject_cols > 60) subject_cols = 60;
        ae_msg_date_string(rows[index].date, when, (int)sizeof when);
        sprintf(row_text, "%5ld %-12.12s %-*.*s %-8.8s %c",
                rows[index].number, rows[index].from,
                subject_cols, subject_cols, rows[index].subject,
                when, rows[index].flag);
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

/**
 * Find this conference's message base and tell ae_msgbase who is reading it.
 *
 * Two routes to the directory, because a board may answer either. MSGBASE_LOC
 * (604) is the direct question and what ctop.e has always used. BB_CONFLOCAL
 * (127) is the conference directory, and "MsgBase" under it is where
 * express.e puts the default base when no MsgBases.info says otherwise
 * (express.e:2068) - so an older board that answers only the second still
 * works.
 */
/**
 * Who is writing, filled in by open_base.
 *
 * A file static because the POSTER needs it too, and asking the board again at
 * post time would be a second round trip for an answer that cannot have
 * changed inside one session.
 */
static char caller[AE_MSG_NAME_MAX];

static int open_base(void)
{
    char dir[256];
    int level;

    dir[0] = '\0';
    if (ae_msgbase_path(&session, dir, (int)sizeof dir) <= 0 || dir[0] == '\0') {
        char conf_dir[200];
        if (ae_conf_location(&session, conf_dir, (int)sizeof conf_dir) <= 0) return 0;
        if (conf_dir[0] == '\0') return 0;
        sprintf(dir, "%.200s%sMsgBase", conf_dir,
                (conf_dir[strlen(conf_dir) - 1] == '/' ||
                 conf_dir[strlen(conf_dir) - 1] == ':') ? "" : "/");
    }

    caller[0] = '\0';
    ae_user_name(&session, caller, (int)sizeof caller);

    /* A board that will not say the level answers -1, and -1 is not a sysop.
       Failing towards showing less is the only safe direction for a rule that
       decides who reads other people's mail. */
    level = ae_user_level(&session);

    return ae_msg_open(dir, caller, level >= sysop_level,
                       ae_last_scanned(&session)) == AE_MSG_OK;
}

/** Read what this conference holds, and fill the window. */
static feed_state load_feed(void)
{
    ae_msg_stat stat;
    int got;

    row_count = 0;
    feed_total = 0;
    feed_unread = 0;
    feed_unreadable = 0;

    if (!ae_carrier(&session)) return FEED_GONE;
    if (!open_base()) return FEED_NOBASE;

    if (ae_msg_stat_read(&stat) != AE_MSG_OK) return FEED_NOBASE;

    feed_total = stat.total;
    feed_unread = stat.unread;
    feed_unreadable = stat.unreadable;
    if (stat.total <= 0) return FEED_EMPTY;

    /* The NEWEST window, in ascending number order. A negative first asks for
       the tail; message numbers are sparse, so counting back from the end is
       the only way to find where the last hundred start. */
    got = ae_msg_list(-1, rows, feed_window);
    if (got < 0) return FEED_NOBASE;
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
    /* "public messages" was true when the board filtered the feed down to
       EALL. The door reads the base itself now and lists private mail this
       caller is party to as well, so the count is not a count of public
       messages and saying so would be a lie the caller can check.
       "press R at the prompt" is gone for the same kind of reason: R may BE
       this door (Doors/SUBS/R.info.example), and a door advising a caller to
       leave it and run itself is nonsense. */
    if (wide) {
        if (feed_unread > 0) {
            sprintf(status_line, "[INFO] %ld messages here. %ld new for you.",
                    feed_total, feed_unread);
        } else {
            sprintf(status_line, "[INFO] %ld messages here, none new for you.", feed_total);
        }
    } else {
        sprintf(status_line, "[INFO] %ld msgs, %ld new", feed_total, feed_unread);
    }

    /* Records the layout pass could not explain. Never silently swallowed: a
       door that quietly shows fewer messages than the board does is worse
       than one that admits it could not read some. */
    if (feed_unreadable > 0 && wide) {
        char note[48];
        sprintf(note, " %ld unreadable.", feed_unreadable);
        if (strlen(status_line) + strlen(note) < sizeof status_line) {
            strcat(status_line, note);
        }
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

    if (!open_base()) return;
    if (ae_msg_stat_read(&stat) != AE_MSG_OK) return;
    if (stat.total <= 0) return;

    conf_name[0] = '\0';
    ae_conf_name(&session, conf_name, (int)sizeof conf_name);

    sprintf(line, "[INFO] %.30s: %ld messages, %ld new for you.",
            conf_name[0] != '\0' ? conf_name : "This conference",
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
    if (!ae_carrier(&session)) return -1;
    if (len <= 0) {
        strcpy(body, "That message has no body on the board.");
    }

    /* Counted as read even when the body is missing: the caller opened it and
       got everything the board still holds, and leaving it new for ever would
       mean a base whose bodies were lost could never be cleared. */
    if (rows[index].number > marked_upto) marked_upto = rows[index].number;

    if (wide) {
        /* The recipient is read from the message, not assumed to be EALL:
           this door lists private mail the caller is party to as well. */
        char when[8];
        ae_msg_date_string(rows[index].date, when, (int)sizeof when);
        sprintf(doc_title, "#%ld  From %.20s  %.8s  To %.20s",
                rows[index].number, rows[index].from, when, rows[index].to);
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

/**
 * Tell the board how far the caller got, once, on the way out.
 *
 * BOTH pointers move. express.e's reader advances lastMsgReadConf
 * (express.e:12370) and its scan advances lastNewReadConf; this door is both,
 * and its own "N new for you" is counted from the SCAN pointer
 * (ae_msg_open takes ae_last_scanned), so moving only the read pointer would
 * leave the number the caller is trying to clear exactly where it was.
 *
 * A board that does not implement AEW_SETPOINTER answers 0 and nothing here
 * changes - see Documentation/4-Door-Developers/PROPOSED_SETPOINTER.md. That
 * is not an error and nothing is said about it: on a classic AmiExpress this
 * door has always left the pointer alone, and it still works.
 */
static void mark_read_on_the_way_out(void)
{
    if (marked_upto <= 0) return;           /* opened nothing */
    if (!ae_carrier(&session)) return;      /* the line is gone anyway */

    ae_set_last_read(&session, (int)marked_upto);
    ae_set_last_scanned(&session, (int)marked_upto);
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
/**
 * Write a message, here, without leaving the door.
 *
 * This used to hand `EALL` back to the board and exit - which is what the
 * sysop objected to on 2026-09-08 ("the subs door exits when i press P").
 * Now the caller types the subject and the body in the door's own chrome and
 * the door appends the message to the base itself.
 *
 * Returns 1 when something was posted, 0 when it was not, -1 for a lost
 * caller. It no longer returns "the door is finished" for a post: the whole
 * point is that the caller stays.
 */
static int post_flow(const char *question, const char *subject)
{
    static ui_editor_text body;          /* static: ~15KB, too big for a door's stack */
    ui_editor_style es;
    ui_input_style is;
    ae_msg_new msg;
    char subj[64];
    char flat[UI_EDITOR_MAX_LINES * (UI_EDITOR_WIDTH + 1)];
    unsigned long used = 0;
    long now, written;
    int yes, rc, i, attempt;

    {
        ui_input_style st;
        confirm_style(&st);
        yes = ui_confirm(&screen.buf, &keys, &pushback, &st, question, 1);
    }
    if (yes < 0) return -1;
    if (yes == 0) {
        strcpy(status_line, "[INFO] Nothing posted.");
        return 0;
    }

    /* A reply arrives with the original subject, so the caller amends rather
       than retypes - and "Re: " is not added twice to a reply to a reply. */
    subj[0] = '\0';
    if (subject != 0 && subject[0] != '\0') {
        if ((subject[0] == 'R' || subject[0] == 'r') &&
            (subject[1] == 'E' || subject[1] == 'e') && subject[2] == ':') {
            strncat(subj, subject, sizeof subj - 1);
        } else {
            strcpy(subj, "Re: ");
            strncat(subj, subject, sizeof subj - 5);
        }
    }

    ansi_clear(&screen.buf);
    draw_masthead(wide ? "POST TO EVERYONE" : "POST");
    confirm_style(&is);
    is.row = 3;
    rc = ui_input(&screen.buf, &keys, &pushback, &is, "Subject:", subj, (int) sizeof subj);
    if (rc < 0) return -1;
    if (subj[0] == '\0') {
        strcpy(status_line, "[INFO] No subject, nothing posted.");
        return 0;
    }

    ui_editor_style_init(&es);
    es.top = 2;
    es.left = screen.profile.borders ? 2 : 1;
    es.cols = screen.cols - (screen.profile.borders ? 4 : 1);
    es.rows = screen.rows - 2;
    es.fg = UI_TOKEN(UI_T_INK);
    es.bg = UI_TOKEN(UI_T_GROUND);
    es.ink = UI_TOKEN(UI_T_ACCENT);
    es.to = "EALL";
    es.subject = subj;

    ui_editor_text_init(&body);
    rc = ui_editor(&screen.buf, &keys, &pushback, &es, &body);
    if (rc < 0) return -1;
    if (rc == 0 || body.count == 0) {
        strcpy(status_line, "[INFO] Nothing posted.");
        return 0;
    }

    /* One buffer, LF between lines - express.e:10700-10703 stores body lines
       and nothing else. */
    for (i = 0; i < body.count; i++) {
        unsigned long len = (unsigned long) strlen(body.line[i]);
        if (used + len + 1 >= sizeof flat) break;
        memcpy(flat + used, body.line[i], len);
        used += len;
        flat[used++] = '\n';
    }

    /* The BOARD's clock, never time(): AmigaOS's C epoch is not reliably the
       Unix one, and a wrong date is invisible until somebody sorts the list. */
    now = ae_now(&session);

    msg.to = "EALL";
    msg.from = caller;
    msg.subject = subj;
    msg.status = AE_MSG_PUBLIC;
    msg.date = now;

    /* ae_msg_write does disk, not time, so the WAIT for another node's lock
       lives here. express.e's own caller gives up after about five seconds and
       says so (express.e:10744). */
    written = AE_MSG_ERR_LOCKED;
    for (attempt = 0; attempt < 25; attempt++) {
        written = ae_msg_write(&msg, flat, used);
        if (written != AE_MSG_ERR_LOCKED) break;
        ae_delay_ticks(10);              /* a fifth of a second on PAL */
    }

    if (written == AE_MSG_ERR_LOCKED) {
        strcpy(status_line, "[INFO] Another task has the MsgBase locked. Not posted.");
        return 0;
    }
    if (written == AE_MSG_ERR_MIXED) {
        /* The honest message. This base mixes record layouts and appending to
           it could make the board misread its neighbours; say so rather than
           risk it, and the caller can still post through the board's own E. */
        strcpy(status_line, "[INFO] This base needs the board's own editor. Not posted.");
        return 0;
    }
    if (written < 0) {
        strcpy(status_line, "[INFO] The message could not be written.");
        return 0;
    }

    sprintf(status_line, "[INFO] Posted as message %ld.", written);
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

    /* The masthead wants the conference's name, which is the board's to say -
       a message base is headers and bodies and does not know what it is
       called. "" is fine; the masthead falls back to "SUBS". */
    conf_name[0] = '\0';
    ae_conf_name(&session, conf_name, (int)sizeof conf_name);

    /* The feed is a round trip per four rows, so say what is happening rather
       than leaving a black screen for a second. */
    ansi_clear(&screen.buf);
    draw_masthead("SUBS");
    say(3, wide ? "Reading the messages in this conference..." : "Reading the messages...");
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

            if (state == FEED_NOBASE) {
                /* Not an error the caller caused, and not the same sentence
                   as an empty conference: this one says the board has no
                   message base here at all, which is a thing to tell a sysop
                   about rather than an invitation to post. */
                say(3, wide ? "This conference has no message base on the board."
                            : "No message base here.");
                say(5, "Press Q to leave.");
            } else if (state == FEED_EMPTY || row_count == 0) {
                say(3, wide ? "Nothing here you can read yet. Press P and be first."
                            : "Nothing posted yet.");
                say(5, wide ? "Press P to post, Q to leave." : "P post, Q leave.");
            } else {
                draw_header();
                ui_list_draw(&list, &screen.buf);
                if (feed_total > (long)row_count) {
                    char note[80];
                    /* NOT "older messages are at the R prompt", which this
                       said until 2026-09-08 and which is wrong twice over:
                       inside this door R is Reply, and on a board that
                       installs R.info the R prompt IS this door. It was the
                       same stale advice the status line carried, in a second
                       place nobody looked. The window is a setting, so the
                       sentence names the setting. */
                    sprintf(note, wide
                            ? "Showing the latest %d of %ld. FeedWindow in the door settings holds more."
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
            /* A post no longer ends the door. It used to hand EALL back and
               exit, which is the behaviour being removed; the caller now stays
               in the list, and a successful post means the list has one more
               message in it. */
            if (rc == 1) {
                /* build_status() recomputes the line from the counts, which
                   would throw away "Posted as message N" - the one thing the
                   caller is waiting to read. Reload, then put it back. */
                char posted[sizeof status_line];
                strncpy(posted, status_line, sizeof posted - 1);
                posted[sizeof posted - 1] = '\0';
                state = load_feed();
                build_status();
                strcpy(status_line, posted);
                list.count = row_count;
                ui_list_select(&list, row_count > 0 ? row_count - 1 : 0);
            }
            full = 1;
            continue;
        }

        if ((key == 'r' || key == 'R') && row_count > 0) {
            int rc = post_flow(wide ? "Reply to everyone in this conference?" : "Reply to everyone?",
                               rows[list.selected].subject);
            if (rc < 0) break;
            /* A post no longer ends the door. It used to hand EALL back and
               exit, which is the behaviour being removed; the caller now stays
               in the list, and a successful post means the list has one more
               message in it. */
            if (rc == 1) {
                /* build_status() recomputes the line from the counts, which
                   would throw away "Posted as message N" - the one thing the
                   caller is waiting to read. Reload, then put it back. */
                char posted[sizeof status_line];
                strncpy(posted, status_line, sizeof posted - 1);
                posted[sizeof posted - 1] = '\0';
                state = load_feed();
                build_status();
                strcpy(status_line, posted);
                list.count = row_count;
                ui_list_select(&list, row_count > 0 ? row_count - 1 : 0);
            }
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
    mark_read_on_the_way_out();
    ae_close(&session);
    ae_shutdown();
    return 0;
}
