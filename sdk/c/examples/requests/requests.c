/*
 * REQUESTS - the global request board, in C, on a 68K Amiga.
 *
 * A caller asks the scene for a RELEASE to be uploaded or a piece of ASCII
 * ART to be made; callers on other boards vote for it, claim it, and mark it
 * done. One list, shared by every board with a key, served by the same door
 * server as ACHIEVE - a sibling surface at /requests/v1, read as the same
 * `|`-separated Latin-1 rows.
 *
 * WHAT IT CANNOT DO, and why. A 68K door cannot learn the caller's email, so
 * a request's author is (this board, the caller's handle) - never a verified
 * global identity. The handle is read from the session at startup and NEVER
 * typed, so nobody posts, claims or withdraws as somebody else.
 *
 * WHERE THE SERVER IS. The BBS keeps its board key encrypted and a 68K door
 * has no way to ask for it, so this door reads its own REQUESTS.cfg beside
 * the executable, exactly as ACHIEVE reads ACHIEVE.cfg. No file, no door: it
 * says so and leaves, rather than showing an empty list that reads as
 * "nobody wants anything".
 *
 * Drawn with the same widgets as ACHIEVE, at all three widths the board
 * serves (80-column ANSI, wider terminals, and the 40-column compact tier
 * ui_is_compact_width picks). ASCII tokens only, theme palette throughout,
 * no bold, no emoji.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "aedoor.h"
#include "requests_bulletin.h"
#include "ae_request.h"
#include "ae_host.h"
#include "ae_session.h"
#include "ui_ansi.h"
#include "ui_chrome.h"
#include "ui_doc.h"
#include "ui_input.h"
#include "ui_key.h"
#include "ui_list.h"
#include "ui_screen.h"
#include "ui_theme.h"

/* One frame and one session record, both owned here. */
static char frame_buffer[16384];
static char session_storage[AE_SESSION_MIN_STORAGE];

/* The largest listing this door holds: 24 KB is well past what any caller
   reads in one sitting, and small enough to sit in a 68K door's BSS. A
   longer answer is truncated at a row boundary and the screen says so. */
#define LISTING_MAX 24576
#define ROWS_MAX 200
#define FIELDS_MAX 12

static char listing[LISTING_MAX];
static unsigned long listing_len;
static int listing_truncated;

/** One parsed row: pointers into `listing`, which stays put while it shows. */
typedef struct {
    const char *field[FIELDS_MAX];
    int fields;
} text_row;

static text_row rows[ROWS_MAX];
static int row_count;

/* The row list.txt hands back:
   0 id | 1 kind | 2 state | 3 votes | 4 board | 5 handle | 6 title
   | 7 claim_handle | 8 created | 9 updated */

typedef enum { VIEW_MENU, VIEW_LIST } view_id;

/* ------------------------------------------------------------------ config */

typedef struct {
    char host[128];
    int port;
    char board_key[192];
    int timeout_secs;
    /* The bulletin this door keeps, and the art it is drawn between. Empty
       `bulletin` turns the whole thing off - a board that does not want a
       requests screen says so by clearing the setting, and then nothing is
       fetched and nothing is written. */
    char bulletin[192];
    char bulletin_header[192];
    char bulletin_tail[192];
} requests_config;

static requests_config config;
static ae_req_config reqcfg;

static void trim(char *s)
{
    unsigned long len = (unsigned long)strlen(s);
    while (len > 0 && (s[len - 1] == '\r' || s[len - 1] == '\n' ||
                       s[len - 1] == ' ' || s[len - 1] == '\t')) {
        s[--len] = '\0';
    }
}

/** `Key=value` lines, `#`/`;` comments, everything else ignored. */
static int config_load(requests_config *cfg, const char *path)
{
    FILE *f;
    char line[256];

    memset(cfg, 0, sizeof *cfg);
    cfg->port = 80;
    cfg->timeout_secs = 10;
    /* The screen the classic Request door used to write, and its own art,
       which moved here with the job. The door's CWD is its own folder. */
    strcpy(cfg->bulletin, "BBS:Bulletins/bull9.txt");
    strcpy(cfg->bulletin_header, "Bulletin_Header.txt");
    strcpy(cfg->bulletin_tail, "Bulletin_Tail.txt");

    f = fopen(path, "r");
    if (f == 0) return 0;

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

        if (strcmp(line, "Host") == 0) {
            strncpy(cfg->host, value, sizeof cfg->host - 1);
        } else if (strcmp(line, "Port") == 0) {
            int port = atoi(value);
            if (port > 0 && port < 65536) cfg->port = port;
        } else if (strcmp(line, "BoardKey") == 0) {
            strncpy(cfg->board_key, value, sizeof cfg->board_key - 1);
        } else if (strcmp(line, "Timeout") == 0) {
            int secs = atoi(value);
            if (secs > 0 && secs < 120) cfg->timeout_secs = secs;
        } else if (strcmp(line, "Bulletin") == 0) {
            strncpy(cfg->bulletin, value, sizeof cfg->bulletin - 1);
            cfg->bulletin[sizeof cfg->bulletin - 1] = '\0';
        } else if (strcmp(line, "BulletinHeader") == 0) {
            strncpy(cfg->bulletin_header, value, sizeof cfg->bulletin_header - 1);
            cfg->bulletin_header[sizeof cfg->bulletin_header - 1] = '\0';
        } else if (strcmp(line, "BulletinTail") == 0) {
            strncpy(cfg->bulletin_tail, value, sizeof cfg->bulletin_tail - 1);
            cfg->bulletin_tail[sizeof cfg->bulletin_tail - 1] = '\0';
        }
    }
    fclose(f);
    return cfg->host[0] != '\0' && cfg->board_key[0] != '\0';
}

/* ----------------------------------------------------------------- fetching */

static int collect(void *ctx, const unsigned char *buf, unsigned long len)
{
    unsigned long room;
    (void)ctx;
    room = (unsigned long)sizeof listing - 1 - listing_len;
    if (len > room) {
        listing_truncated = 1;
        len = room;
    }
    if (len > 0) {
        memcpy(listing + listing_len, buf, len);
        listing_len += len;
        listing[listing_len] = '\0';
    }
    return 0;
}

/* The HTTP status of the last listing fetch, or a negative ae_req error.
   The view needs it to tell "the server said there is nothing" from "the
   server never answered" - two very different sentences to show a caller.
   It lives here because the fetch happens in a helper and the draw happens
   in main: open_list used to compute it and drop it on the floor with
   (void)status, so main's own `status` stayed 0 for the life of the door and
   EVERY empty listing reported itself as unreachable. */
static int last_status;

/** GET a text listing into `listing`. Returns the HTTP status, or a negative
    ae_req error. Parsed by split_rows(). */
static int fetch_text(const char *path_and_query)
{
    listing_len = 0;
    listing[0] = '\0';
    listing_truncated = 0;
    row_count = 0;
    last_status = ae_req_get(&reqcfg, path_and_query, collect, 0);
    return last_status;
}

/* ------------------------------------------------------------ detail render

   The detail endpoint answers in the SAME machine format the listing uses -
   a REQUEST|... header line, one pipe-delimited row, a blank line, then the
   notes. That is right for the wire and wrong for a caller: shown raw it put
   "|1|art|open|0|uprough|sysop|uPt0wN Logo||1788885144|1788885144" on the
   screen (reported from the board 2026-09-08).

   So the door renders it. Parsing here rather than through split_rows() is
   deliberate: the list behind this view still owns rows[] and row_count, and
   re-splitting would leave it pointing at the detail when the caller comes
   back.

   Unknown or missing fields simply do not print a line - the format is
   append-only, so a row from a newer server must degrade, never mangle. */
static char detail_body[LISTING_MAX];

static void append_line(char *out, unsigned long cap, const char *text)
{
    unsigned long used = strlen(out);
    unsigned long len = strlen(text);
    if (used + len + 2 >= cap) return;
    memcpy(out + used, text, len);
    out[used + len] = '\n';
    out[used + len + 1] = '\0';
}

/* Copy one pipe-delimited field; returns the start of the next, or NULL. */
static const char *take_field(const char *p, char *out, unsigned long cap)
{
    unsigned long n = 0;
    if (p == 0) { out[0] = '\0'; return 0; }
    while (*p != '\0' && *p != '|' && *p != '\r' && *p != '\n') {
        if (n + 1 < cap) out[n++] = *p;
        p++;
    }
    out[n] = '\0';
    if (*p == '|') return p + 1;
    return 0;
}

static void format_detail(const char *raw)
{
    char f[10][128];
    char line[256];
    const char *p = raw;
    int i;

    detail_body[0] = '\0';
    if (raw == 0 || raw[0] == '\0') return;

    /* Line 1 is the REQUEST|... header: skip it. */
    while (*p != '\0' && *p != '\n') p++;
    if (*p == '\n') p++;

    for (i = 0; i < 10; i++) f[i][0] = '\0';
    for (i = 0; i < 10 && p != 0; i++) p = take_field(p, f[i], sizeof f[i]);

    if (f[0][0] != '\0') {
        sprintf(line, "#%.10s  %.12s  %.12s", f[0], f[1], f[2]);
        append_line(detail_body, sizeof detail_body, line);
        append_line(detail_body, sizeof detail_body, "");
    }
    if (f[6][0] != '\0') {
        sprintf(line, "Title:   %.60s", f[6]);
        append_line(detail_body, sizeof detail_body, line);
    }
    if (f[5][0] != '\0') {
        if (f[4][0] != '\0') sprintf(line, "From:    %.24s@%.24s", f[5], f[4]);
        else                 sprintf(line, "From:    %.24s", f[5]);
        append_line(detail_body, sizeof detail_body, line);
    }
    if (f[3][0] != '\0') {
        sprintf(line, "Votes:   %.10s", f[3]);
        append_line(detail_body, sizeof detail_body, line);
    }
    sprintf(line, "Claimed: %s", f[7][0] != '\0' ? f[7] : "nobody yet");
    append_line(detail_body, sizeof detail_body, line);

    /* Whatever follows the blank line is the notes, and it is already prose. */
    while (*p != '\0' && *p != '\n') p++;
    if (*p == '\n') p++;
    while (*p == '\r' || *p == '\n') p++;
    if (*p != '\0') {
        append_line(detail_body, sizeof detail_body, "");
        append_line(detail_body, sizeof detail_body, p);
    }
}

/** Fetch one detail page into `listing` for ui_doc; leaves it whole. */
static int fetch_detail(long id)
{
    char path[64];
    listing_len = 0;
    listing[0] = '\0';
    listing_truncated = 0;
    sprintf(path, AE_REQ_BASE "/requests/%ld.txt", id);
    return ae_req_get(&reqcfg, path, collect, 0);
}

/**
 * Split the body into rows and fields, in place. The header line
 * (REQUEST|1|<revision>|<count>) is consumed; a conforming parser keeps the
 * first FIELDS_MAX fields and IGNORES the rest, which is what makes the
 * format append-only client-side.
 */
static void split_rows(void)
{
    char *p = listing;
    int first_line = 1;

    row_count = 0;
    while (*p != '\0' && row_count < ROWS_MAX) {
        char *line = p;
        char *end = strchr(p, '\n');
        int field = 0;

        if (end != 0) {
            *end = '\0';
            p = end + 1;
        } else {
            p = line + strlen(line);
        }
        if (end != 0 && end > line && end[-1] == '\r') end[-1] = '\0';
        if (line[0] == '\0') continue;

        if (first_line) {
            first_line = 0;
            continue;   /* REQUEST|1|<revision>|<count> */
        }

        rows[row_count].field[field++] = line;
        while (field < FIELDS_MAX) {
            char *bar = strchr(line, '|');
            if (bar == 0) break;
            *bar = '\0';
            line = bar + 1;
            rows[row_count].field[field++] = line;
        }
        rows[row_count].fields = field;
        row_count++;
    }
}

static const char *field_of(int row, int index)
{
    if (row < 0 || row >= row_count) return "";
    if (index < 0 || index >= rows[row].fields) return "";
    return rows[row].field[index] != 0 ? rows[row].field[index] : "";
}

/* ------------------------------------------------------------------- rows */

static char row_text[256];
static int compact_screen;

/* A vote or an action bumps ONE row's shown value; the override lets a single
   row repaint with the new count without refetching the whole listing. */
static int override_row = -1;
static char override_votes[8];
static char override_state[6];

static const char *kind3(const char *k)
{
    if (strcmp(k, "release") == 0) return "REL";
    if (strcmp(k, "art") == 0) return "ART";
    return "?";
}

static const char *state4(const char *s)
{
    if (strcmp(s, "open") == 0) return "OPEN";
    if (strcmp(s, "claimed") == 0) return "CLMD";
    if (strcmp(s, "done") == 0) return "DONE";
    if (strcmp(s, "withdrawn") == 0) return "WDRN";
    return "????";
}

static const char *votes_of(int index)
{
    if (index == override_row && override_votes[0] != '\0') return override_votes;
    return field_of(index, 3);
}

static const char *state_of(int index)
{
    if (index == override_row && override_state[0] != '\0') return override_state;
    return field_of(index, 2);
}

/** The six-item menu. */
static const char *menu_row(void *context, int index)
{
    int wide = *(const int *)context;
    switch (index) {
        case 0: return wide ? "All open requests" : "Open requests";
        case 1: return wide ? "Releases wanted"   : "Releases";
        case 2: return wide ? "ASCII art wanted"  : "Art";
        case 3: return wide ? "Post a request"    : "Post";
        case 4: return wide ? "Mine and claimed"  : "Mine";
        default: return wide ? "Leave the door"   : "Leave";
    }
}

/** One listing row, wide or compact. */
static const char *request_row(void *context, int index)
{
    int wide = *(const int *)context;
    if (index >= row_count) return "";
    if (wide) {
        sprintf(row_text, "%4s %-3s  %-34.34s %3s+  %-10.10s %-4s",
                field_of(index, 0), kind3(field_of(index, 1)),
                field_of(index, 6), votes_of(index),
                field_of(index, 5), state4(state_of(index)));
    } else {
        sprintf(row_text, "%-3s %-24.24s %2s+",
                kind3(field_of(index, 1)), field_of(index, 6), votes_of(index));
    }
    return row_text;
}

/* ------------------------------------------------------------------- input */

static int door_key(void *ctx) { (void)ctx; return ae_key(); }
static int door_pending(void *ctx) { (void)ctx; return ae_input_pending(); }
static void door_settle(void *ctx) { (void)ctx; ae_delay_ticks(1); }

/* One line of prose in the theme's ink, clipped to the caller's width. */
static void say(ui_screen *screen, int row, const char *text)
{
    ansi_color(&screen->buf, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen->buf, row, 3, text, screen->cols - 3);
}

/* -------------------------------------------------------------------- door */

static ui_screen screen;
static ui_key_source keys;
static const ui_theme *theme;
static int pushback = -1;
static int wide;
static char handle[32];
static char status_line[80];
static char list_title[24];
static int list_is_mine;

/* ------------------------------------------------------------- masthead rail

   The rail slides. A 68K door has no timers, so the frames come from the idle
   hook while we are waiting for a key (ui_key.h): one row redrawn, about five
   frames a second. Twenty would cost twenty XIM messages a second for
   decoration, which is exactly what the "draw smart" rule is about.

   The current title is remembered so the hook can redraw the row it is on
   without knowing which view put it there. */
static int rail_tick;
static const char *masthead_title = "GLOBAL REQUESTS";

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
    /* Nothing to animate without a rail: the tick would repaint the
       identical row five times a second and the title flickers under it
       (ui_chrome.h, ui_masthead_rail_animates). Still yield - the poll loop
       spins hot on a 68K otherwise. */
    if (!ui_masthead_rail_animates(theme->rail)) { ae_delay_ticks(UI_RAIL_TICK_DELAY); return; }
    rail_tick += UI_RAIL_STEP;
    /* The RAIL, not the row: the title does not move, and repainting it five
       times a second is what the caller sees as it blinking. */
    ui_masthead_rail_tick(&screen.buf, 1, 1, screen.cols, masthead_title,
                          theme->rail, UI_TOKEN(UI_T_BAR_INK),
                          UI_TOKEN(UI_T_BAR), rail_tick);
    ui_screen_flush(&screen);
    ae_delay_ticks(UI_RAIL_TICK_DELAY);
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

static char list_query[256];

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

static void draw_status(void)
{
    if (status_line[0] == '\0') return;
    ansi_color(&screen.buf, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen.buf, screen.rows - 1, 3, status_line, screen.cols - 4);
}

/* Map a server refusal code to a plain sentence, the way Doors/achieve does. */
/* -------------------------------------------------------------- bulletin

   `Bulletins/bull9.txt` is the board's requests screen. The classic 68K
   `Request v2.1` door wrote it from its own art plus one line per request,
   and on this board that door is wired to no command any more - REQ launches
   THIS one - so the screen froze on 2026-09-10 and nothing would ever
   refresh it again.

   The rendering, and the row budget that keeps it off the
   `(Pause)...More(y/n/ns)?` prompt, live in requests_bulletin.c where a host
   test can assert the bytes. What is here is the three things that need a
   door: the art off the disk, one listing off the server, and the write.

   A read-only visit writes nothing. A visit that CHANGED something rewrites
   the screen, and so does a visit that finds no screen at all - that is what
   puts it back the first time a board runs this version. */

static int bulletin_dirty;

static char bulletin_header_art[4096];
static char bulletin_tail_art[2048];
static char bulletin_text[16384];
static requests_bulletin_row bulletin_rows[REQUESTS_BULLETIN_ROW_BUDGET];

/** The whole file into `buf`, NUL-terminated. 0 if it will not fit or open. */
static int slurp(const char *path, char *buf, unsigned long cap)
{
    FILE *f = fopen(path, "rb");
    unsigned long n;

    if (f == 0) return 0;
    n = (unsigned long)fread(buf, 1, cap - 1, f);
    /* A file that exactly filled the buffer was probably cut in half, and
       half a header draws a torn screen. */
    if (n >= cap - 1) { fclose(f); return 0; }
    buf[n] = '\0';
    fclose(f);
    return n > 0;
}

/**
 * Is the bulletin on disk already the one this door would keep?
 *
 * Three ways it is not: it is missing, this visit changed a request, or what
 * is there does not fit the screen. The third is the one that matters on a
 * board upgrading to this version - the classic door left a 26-row screen
 * behind, and without this check it would sit there paginating until some
 * caller happened to post.
 */
static char bulletin_block[4096];

/**
 * Has the header or tail art changed since this bulletin was written?
 *
 * The sysop drew new art for the door and the bulletin kept the old
 * (2026-09-15: "i uploaded a header and footer for the request door now but
 * its not used in the bulletin"). It was working as built: a rewrite was
 * judged by whether a REQUEST had changed, and art is not a request, so a
 * bulletin that still fitted its row budget was left exactly as it was.
 *
 * The art is not copied in verbatim - lines are padded to the bulletin's
 * columns and the tail closes with a reset - so this renders each block the
 * way the writer does and compares it against the file's own start and end.
 * Exact, and it costs no request to the server.
 */
static int bulletin_art_changed(void)
{
    unsigned long n = requests_bulletin_render_header(bulletin_block,
                                                      sizeof bulletin_block,
                                                      bulletin_header_art);
    if (n == 0) return 0;                      /* cannot tell; leave it be */
    if (strncmp(bulletin_text, bulletin_block, n) != 0) return 1;

    n = requests_bulletin_render_tail(bulletin_block, sizeof bulletin_block,
                                      bulletin_tail_art);
    if (n == 0) return 0;
    {
        unsigned long have = (unsigned long)strlen(bulletin_text);
        if (have < n) return 1;
        return strncmp(bulletin_text + (have - n), bulletin_block, n) != 0;
    }
}

static int bulletin_needs_rewrite(void)
{
    FILE *f;
    unsigned long n;

    if (bulletin_dirty) return 1;

    f = fopen(config.bulletin, "rb");
    if (f == 0) return 1;                      /* missing */
    n = (unsigned long)fread(bulletin_text, 1, sizeof bulletin_text - 1, f);
    fclose(f);
    if (n >= sizeof bulletin_text - 1) return 1;   /* far too big to be ours */
    bulletin_text[n] = '\0';
    if (!requests_bulletin_fits(bulletin_text, REQUESTS_BULLETIN_ROW_BUDGET))
        return 1;
    return bulletin_art_changed();
}

/**
 * Rewrite the bulletin from the server's open list.
 *
 * Silent throughout: a caller leaving the door is not the person who can fix
 * a missing header file or a server that stopped answering, and yesterday's
 * screen is a better answer than an error on the way out. Any failure leaves
 * the file exactly as it was.
 */
static void bulletin_write(void)
{
    int capacity, i, count;
    unsigned long len;
    FILE *f;

    if (config.bulletin[0] == '\0') return;

    /* The art is read BEFORE the decision, because the decision now asks
       whether the art still matches what is in the file. Both were already
       required for a write, so nothing is read that was not read before. */
    if (!slurp(config.bulletin_header, bulletin_header_art,
               sizeof bulletin_header_art)) return;
    if (!slurp(config.bulletin_tail, bulletin_tail_art,
               sizeof bulletin_tail_art)) return;

    if (!bulletin_needs_rewrite()) return;

    if (fetch_text(AE_REQ_BASE "/list.txt?scope=global&state=open") != 200)
        return;
    split_rows();

    capacity = requests_bulletin_capacity(bulletin_header_art,
                                          bulletin_tail_art,
                                          REQUESTS_BULLETIN_ROW_BUDGET);
    /*
     * ART THAT LEAVES NO ROOM IS NOT A HEADER, AND THIS BULLETIN IS NOT ART.
     *
     * Measured 2026-09-15, the day the sysop drew a new one: his header was
     * 23 rows of a 23-row budget, so capacity came out at zero and the next
     * write would have replaced a bulletin listing eleven rows of requests
     * with a screen listing none. Silently, and only because the art had
     * changed - which is the very thing this door had just learned to notice.
     *
     * Yesterday's bulletin is a better answer than a beautiful blank one, so
     * the write is abandoned and the file left exactly as it was. A door
     * cannot tell a sysop anything at this point - it runs at logoff - but
     * the studio shows the row count beside the art, which is where the
     * answer is visible.
     */
    if (capacity < 1) return;
    count = row_count < capacity ? row_count : capacity;
    if (count > REQUESTS_BULLETIN_ROW_BUDGET) count = REQUESTS_BULLETIN_ROW_BUDGET;
    for (i = 0; i < count; i++) {
        bulletin_rows[i].handle = field_of(i, 5);
        bulletin_rows[i].title = field_of(i, 6);
    }

    len = requests_bulletin_render(bulletin_text, sizeof bulletin_text,
                                   bulletin_header_art, bulletin_tail_art,
                                   bulletin_rows, count,
                                   REQUESTS_BULLETIN_ROW_BUDGET);
    if (len == 0) return;

    f = fopen(config.bulletin, "wb");
    if (f == 0) return;
    fwrite(bulletin_text, 1, len, f);
    fclose(f);
}

static void explain(const ae_req_result *r, const char *ok)
{
    if (r->status == 200) {
        /* The ONE place this door learns that a write landed - posting,
           voting, claiming, releasing, marking done and withdrawing all come
           through here. So this is where the bulletin is marked stale, and a
           caller who only reads the list costs the board no HTTP call and no
           file write at all. */
        bulletin_dirty = 1;
        strncpy(status_line, ok, sizeof status_line - 1);
        status_line[sizeof status_line - 1] = '\0';
        return;
    }
    if (strcmp(r->error, "already_claimed") == 0)
        strcpy(status_line, "[ERROR] Someone already claimed it.");
    else if (strcmp(r->error, "not_yours") == 0)
        strcpy(status_line, "[ERROR] That is not yours to change.");
    else if (strcmp(r->error, "wrong_state") == 0)
        strcpy(status_line, "[ERROR] That request is closed.");
    else if (strcmp(r->error, "board_suspended") == 0)
        strcpy(status_line, "[ERROR] This board is suspended.");
    else if (strcmp(r->error, "rate_limited") == 0)
        strcpy(status_line, "[ERROR] Too fast - try again shortly.");
    else if (r->status < 0)
        strcpy(status_line, "[ERROR] The server could not be reached.");
    else
        strcpy(status_line, "[ERROR] The server refused that.");
}

/* A blocking modal choose over `n` labels; returns the index, -1 for a lost
   caller, -2 for ESC/Q cancel. Two choices are a list, not a prompt. */
static const char *const *choose_labels;
static const char *choose_row(void *context, int index)
{
    (void)context;
    if (index < 0) return "";
    return choose_labels[index];
}

static int modal_choose(const char *title, const char *const *labels, int n)
{
    ui_list list;
    int result = -2;

    choose_labels = labels;
    ui_list_init(&list);
    list.top = 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = n + 1;
    list.count = n;
    list.row = choose_row;
    list.context = &wide;
    list.borders = 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT);
    list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);

    ansi_clear(&screen.buf);
    draw_masthead(title);
    ui_list_draw(&list, &screen.buf);
    say(&screen, list.top + n + 2, "Up/Down choose, Enter picks, Q cancels.");
    ui_screen_flush(&screen);

    for (;;) {
        int key = ui_key_read(&keys, &pushback);
        if (key < 0) { result = -1; break; }
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
        if (key == 'q' || key == 'Q' || key == UI_KEY_ESC) { result = -2; break; }
        if (key == '\r' || key == ' ' || key == UI_KEY_ENTER) { result = list.selected; break; }
    }
    return result;
}

/* Post a request: kind (a two-row list), title, notes, confirm. Returns -1 if
   the caller went away (end the door), 0 otherwise. */
static int post_flow(void)
{
    static const char *const kinds[2] = { "A release to be uploaded", "ASCII art to be made" };
    ui_input_style style;
    char title[80];
    char notes[224];
    ae_req_result result;
    int choice;
    int r;

    choice = modal_choose("POST A REQUEST", kinds, 2);
    if (choice == -1) return -1;
    if (choice < 0) return 0;

    ansi_clear(&screen.buf);
    draw_masthead("POST A REQUEST");
    say(&screen, 3, choice == 0 ? "A release wanted. What is it?" : "ASCII art wanted. What for?");
    ui_screen_flush(&screen);

    ui_input_style_init(&style);
    style.row = 5;
    style.left = 3;
    style.cols = screen.cols - 6;
    style.fg = UI_TOKEN(UI_T_INK);
    style.bg = UI_TOKEN(UI_T_GROUND);
    style.ink = UI_TOKEN(UI_T_ACCENT);

    title[0] = '\0';
    r = ui_input(&screen.buf, &keys, &pushback, &style, "Title:", title, 60);
    if (r < 0) return -1;
    if (r == 0) { strcpy(status_line, "[INFO] Post cancelled."); return 0; }

    notes[0] = '\0';
    style.row = 7;
    r = ui_input(&screen.buf, &keys, &pushback, &style, "Notes (optional):", notes, 200);
    if (r < 0) return -1;

    {
        int yes = ui_confirm(&screen.buf, &keys, &pushback, &style, "Post this request?", 1);
        if (yes < 0) return -1;
        if (yes == 0) { strcpy(status_line, "[INFO] Post cancelled."); return 0; }
    }

    r = ae_req_post(&reqcfg, choice == 0 ? AE_REQ_KIND_RELEASE : AE_REQ_KIND_ART,
                    title, notes, handle, &result);
    if (r == AE_REQ_ERR_TRANSPORT)
        strcpy(status_line, "[ERROR] The server could not be reached.");
    else if (result.status == 200)
        sprintf(status_line, "[OK] Posted request #%ld.", result.id);
    else
        explain(&result, "");
    return 0;
}

/* Refetch the active listing and repaint the list box in place (content
   changed, no ansi_clear) after a write. */
static void refresh_list(ui_list *list)
{
    int status = fetch_text(list_query);
    override_row = -1;
    override_votes[0] = '\0';
    override_state[0] = '\0';
    if (status == 200) split_rows();
    list->count = row_count;
    if (list->selected >= row_count) ui_list_select(list, row_count > 0 ? row_count - 1 : 0);
    ui_list_draw_changed(list, &screen.buf, 1);
}

/* Enter the list view for one filter. */
static void open_list(ui_list *list, const char *title, const char *query, int is_mine)
{
    int status;
    strncpy(list_title, title, sizeof list_title - 1);
    list_title[sizeof list_title - 1] = '\0';
    strncpy(list_query, query, sizeof list_query - 1);
    list_query[sizeof list_query - 1] = '\0';
    list_is_mine = is_mine;
    status = fetch_text(query);
    if (status == 200) split_rows();
    override_row = -1;
    override_votes[0] = '\0';
    override_state[0] = '\0';
    list->count = row_count;
    list->row = request_row;
    list->height = screen.rows - 6;
    ui_list_select(list, 0);
    status_line[0] = '\0';
}

int main(int argc, char **argv)
{
    ae_session session;
    ui_list list;
    char theme_id[32];
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    view_id current_view = VIEW_MENU;
    int running = 1;
    int full = 1;

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(&session, session_storage, (long)sizeof(session_storage), node) != 0) {
        ae_shutdown();
        return 20;
    }

    ui_screen_open(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    wide = !ui_is_compact_width(screen.cols);
    compact_screen = !wide;

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

    if (!config_load(&config, "REQUESTS.cfg")) {
        ansi_clear(&screen.buf);
        draw_masthead("GLOBAL REQUESTS");
        say(&screen, 3, "This door has no REQUESTS.cfg beside it.");
        say(&screen, 4, "A sysop sets Host= and BoardKey= there.");
        say(&screen, 6, "Press any key.");
        ui_screen_flush(&screen);
        ui_key_read(&keys, &pushback);
        ui_screen_close(&screen);
        ae_shutdown();
        return 0;
    }

    memset(&reqcfg, 0, sizeof reqcfg);
    reqcfg.host = config.host;
    reqcfg.port = config.port;
    reqcfg.board_key = config.board_key;
    reqcfg.timeout_secs = config.timeout_secs;
    reqcfg.user_agent = "AmiExpress-REQUESTS/1.0";

    ui_list_init(&list);
    list.top = 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = screen.rows - 6;
    list.count = 6;
    list.row = menu_row;
    list.context = &wide;
    list.borders = 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT);
    list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);

    while (running) {
        int key;

        if (full) {
            static const char *const menu_hints[2] = { "Up/Down Choose", "Enter Open" };
            static const char *const list_hints[4] = { "Enter Detail", "+ Vote", "C Claim", "R Refresh" };
            static const char *const mine_hints[4] = { "Enter Detail", "D Done", "X Withdraw", "R Refresh" };

            ansi_clear(&screen.buf);
            draw_masthead(current_view == VIEW_MENU ? "GLOBAL REQUESTS" : list_title);

            if (current_view != VIEW_MENU && row_count == 0) {
                say(&screen, 3, last_status > 0
                        ? "The server answered, and had nothing to show."
                        : "The server could not be reached.");
                say(&screen, 5, "Press Q to go back.");
            } else {
                ui_list_draw(&list, &screen.buf);
                if (listing_truncated) {
                    say(&screen, list.top + list.height,
                        wide ? "The listing is longer than this door can hold."
                             : "Listing truncated.");
                }
            }

            draw_status();
            if (current_view == VIEW_MENU)
                draw_footer(menu_hints, 2, "Q=Leave");
            else if (list_is_mine)
                draw_footer(mine_hints, 4, "Q=Back");
            else
                draw_footer(list_hints, 4, "Q=Back");

            ui_screen_flush(&screen);
            full = 0;
        }

        key = ui_key_read(&keys, &pushback);
        if (key < 0) break;

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

        if (current_view == VIEW_LIST) {
            long id = row_count > 0 ? atol(field_of(list.selected, 0)) : 0;

            if (key == 'q' || key == 'Q' || key == UI_KEY_ESC) {
                current_view = VIEW_MENU;
                list.count = 6;
                list.row = menu_row;
                list.height = screen.rows - 6;
                ui_list_select(&list, 0);
                status_line[0] = '\0';
                full = 1;
                continue;
            }
            if (key == 'r' || key == 'R') {
                open_list(&list, list_title, list_query, list_is_mine);
                full = 1;
                continue;
            }
            if ((key == '\r' || key == UI_KEY_ENTER) && id > 0) {
                int rc = fetch_detail(id);
                int dr;
                ui_doc_style ds;
                ui_doc_style_init(&ds);
                ds.top = 3; ds.left = 3;
                ds.width = screen.cols - 6;
                ds.height = screen.rows - 5;
                ds.fg = UI_TOKEN(UI_T_INK);
                ds.bg = UI_TOKEN(UI_T_GROUND);
                ds.ink = UI_TOKEN(UI_T_ACCENT);
                /* The doc owns the whole screen: without this the list's
                   frame and footer stayed underneath it, so the caller saw
                   two boxes and two footers at once. */
                ansi_clear(&screen.buf);
                draw_masthead(list_title);
                if (rc == 200) format_detail(listing);
                dr = ui_doc(&screen.buf, &keys, &pushback, &ds, list_title,
                            rc == 200 ? detail_body
                                      : "The server could not be reached.");
                ui_screen_flush(&screen);
                if (dr < 0) break;
                full = 1;
                continue;
            }
            if (id > 0 && !list_is_mine && (key == '+' || key == 'v' || key == 'V')) {
                ae_req_result result;
                int rc = ae_req_action(&reqcfg, id, "vote", handle, 0, &result);
                if (rc == AE_REQ_ERR_TRANSPORT) {
                    strcpy(status_line, "[ERROR] The server could not be reached.");
                } else if (result.status == 200) {
                    override_row = list.selected;
                    sprintf(override_votes, "%d", result.votes);
                    sprintf(status_line, "[OK] #%ld now has %d.", id, result.votes);
                } else {
                    explain(&result, "");
                }
                ui_list_draw_changed(&list, &screen.buf, 1);
                draw_status();
                ui_screen_flush(&screen);
                continue;
            }
            if (id > 0 && !list_is_mine && (key == 'c' || key == 'C')) {
                ui_input_style st;
                int yes;
                confirm_style(&st);
                yes = ui_confirm(&screen.buf, &keys, &pushback, &st, "Claim this request?", 1);
                if (yes < 0) break;
                full = 1;
                if (yes) {
                    ae_req_result result;
                    int rc = ae_req_action(&reqcfg, id, "claim", handle, 0, &result);
                    if (rc == AE_REQ_ERR_TRANSPORT)
                        strcpy(status_line, "[ERROR] The server could not be reached.");
                    else if (result.status == 200)
                        sprintf(status_line, "[OK] You claimed #%ld.", id);
                    else
                        explain(&result, "");
                }
                continue;
            }
            if (id > 0 && list_is_mine && (key == 'd' || key == 'D')) {
                ae_req_result result;
                int rc = ae_req_action(&reqcfg, id, "done", handle, 0, &result);
                if (rc == AE_REQ_ERR_TRANSPORT)
                    strcpy(status_line, "[ERROR] The server could not be reached.");
                else if (result.status == 200)
                    sprintf(status_line, "[OK] Marked #%ld done.", id);
                else
                    explain(&result, "");
                refresh_list(&list);
                draw_status();
                ui_screen_flush(&screen);
                continue;
            }
            if (id > 0 && list_is_mine && (key == 'x' || key == 'X')) {
                ui_input_style st;
                int yes;
                confirm_style(&st);
                yes = ui_confirm(&screen.buf, &keys, &pushback, &st, "Withdraw this request?", 0);
                if (yes < 0) break;
                full = 1;
                if (yes) {
                    ae_req_result result;
                    int rc = ae_req_action(&reqcfg, id, "withdraw", handle, 0, &result);
                    if (rc == AE_REQ_ERR_TRANSPORT)
                        strcpy(status_line, "[ERROR] The server could not be reached.");
                    else if (result.status == 200)
                        sprintf(status_line, "[OK] Withdrew #%ld.", id);
                    else
                        explain(&result, "");
                }
                continue;
            }
            continue;
        }

        /* VIEW_MENU */
        if (key == 'q' || key == 'Q' || key == UI_KEY_ESC) break;
        if (key != '\r' && key != ' ' && key != UI_KEY_ENTER) continue;

        switch (list.selected) {
            case 0:
                open_list(&list, "OPEN REQUESTS", AE_REQ_BASE "/list.txt?scope=global&state=open", 0);
                current_view = VIEW_LIST; full = 1;
                break;
            case 1:
                open_list(&list, "RELEASES WANTED", AE_REQ_BASE "/list.txt?scope=global&kind=release&state=open", 0);
                current_view = VIEW_LIST; full = 1;
                break;
            case 2:
                open_list(&list, "ART WANTED", AE_REQ_BASE "/list.txt?scope=global&kind=art&state=open", 0);
                current_view = VIEW_LIST; full = 1;
                break;
            case 3:
                if (post_flow() < 0) running = 0;
                full = 1;
                break;
            case 4: {
                char q[256];
                char esc[64];
                ae_req_url_escape(handle, esc, sizeof esc);
                sprintf(q, AE_REQ_BASE "/list.txt?scope=mine&state=any&handle=%s", esc);
                open_list(&list, "MINE AND CLAIMED", q, 1);
                current_view = VIEW_LIST; full = 1;
                break;
            }
            default:
                running = 0;
                break;
        }
    }

    /* Before the screen goes, while the socket library is still open. */
    bulletin_write();

    ansi_clear(&screen.buf);
    ui_screen_flush(&screen);
    ui_screen_close(&screen);
    ae_shutdown();
    return 0;
}
