/*
 * TEXTTV - SVT Text-TV client for AmiExpress.
 *
 * A full door, not a digest: an index of the pages that matter, a reader,
 * number entry 100-999, next/prev chaining, a favorites list kept in
 * TEXTTV.cfg, and a share sheet that exits into the board's own post
 * flow (ae_return_command("E") - the SUBS EALL pattern; internalCommandE
 * is interactive-only on a real AmiExpress too, express.e:24860, so there
 * is no quieter honest path on either board).
 *
 * Transport: plain HTTP/1.0 GETs to the board's own /api/texttv proxy
 * through ae_http (no TLS anywhere near a 68K door). api.texttv.nu is
 * HTTPS-only, so the board fetches over TLS and serves the verbatim JSON
 * array over plain HTTP (services/texttv-proxy.service.ts); the door
 * parses, converts UTF-8 to Latin-1, and draws. Host/Port ride in
 * TEXTTV.cfg, defaulting to this board.
 *
 * Classic-Amiga rules, because this binary also runs on a real AmiExpress
 * that has never heard of this board:
 * - No AE_HOST assumed: every extended XIM call is feature-checked and an
 *   empty answer means the classic fallback (80x25, classic theme tokens,
 *   no msgbase extras). An unrecognised launch name draws the real door
 *   (the SUBSCAN lesson: a classic board answers command 605 with nothing).
 * - UTF-8 arrives over the wire (Swedish pages are full of it) and a
 *   classic terminal wants Latin-1: utf8_to_latin1() converts on the
 *   render path, never guessing past a truncation.
 * - one draw per frame, two-row cursor moves (ui_list_draw_changed) -
 *   the "doors draw smart" rule is a hard rule for 68K doors.
 *
 * Layout: single file like subs.c/requests.c. Pure helpers first (host-
 * tested in tests/test_texttv.c), door second.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "aedoor.h"
#include "ae_host.h"
#include "ae_session.h"
#include "ae_http.h"
#include "json_lite.h"
#include "ui_ansi.h"
#include "ui_screen.h"
#include "ui_list.h"
#include "ui_chrome.h"
#include "ui_key.h"
#include "ui_input.h"
#include "ui_theme.h"
#include "ui_profile.h"
#include "ui_doc.h"

/* ------------------------------------------------------------------ config */
#include "texttv_parse.h"

#define TEXTTV_USER_AGENT "amiexpress-web-bbs/1.0 (BBS Text-TV door; https://bbs.uprough.net)"

static void trim(char *s)
{
    unsigned long n = strlen(s);
    while (n > 0 && (s[n - 1] == '\n' || s[n - 1] == '\r' || s[n - 1] == ' ' || s[n - 1] == '\t'))
        s[--n] = '\0';
}

static int config_load(texttv_config *cfg, const char *path)
{
    FILE *f;
    char line[256];

    texttv_config_defaults(cfg);
    f = fopen(path, "r");
    if (f == 0) return 1; /* missing file is defaults, not an error */

    while (fgets(line, (int)sizeof line, f) != 0) {
        char *eq, *value;
        trim(line);
        if (line[0] == '#' || line[0] == ';' || line[0] == '\0') continue;
        eq = strchr(line, '=');
        if (eq == 0) continue;
        *eq = '\0';
        value = eq + 1;
        while (*value == ' ' || *value == '\t') value++;

        if (strcmp(line, "Host") == 0 && value[0] != '\0') {
            strncpy(cfg->host, value, sizeof cfg->host - 1);
            cfg->host[sizeof cfg->host - 1] = '\0';
        } else if (strcmp(line, "Port") == 0) {
            int port = atoi(value);
            if (port > 0 && port < 65536) cfg->port = port;
        } else if (strcmp(line, "Timeout") == 0) {
            int secs = atoi(value);
            if (secs > 0 && secs <= 120) cfg->timeout_secs = secs;
        } else if (strcmp(line, "StartPage") == 0) {
            int page = atoi(value);
            if (page >= 100 && page <= 999) cfg->start_page = page;
        } else if (strcmp(line, "Favorites") == 0) {
            texttv_fav_parse(cfg, value);
        }
    }
    fclose(f);
    return 1;
}

/* Rewrite the whole cfg: Host/Port/Timeout/StartPage preserved, Favorites
 * current. Last writer wins across nodes - the same trade every door-side
 * cfg edit on this board makes, and a favorites list is what it costs. */
/*
 * The caller's favorites, in a file the board does not own.
 *
 * They used to live in TEXTTV.cfg beside Host and Port. That file is
 * manifest-backed (Doors/TEXTTV/door.settings.json names Favorites), so
 * renderAllDoorCfgs rewrites it from the settings at every boot - and every
 * F a caller had pressed went back to the sysop's default list. Two writers,
 * one file. TEXTTV.favs has one writer: this door. The manifest's Favorites
 * is what a board starts with; this is what the callers made of it.
 */
static int favs_save(const texttv_config *cfg, const char *path)
{
    FILE *f;
    int i;
    f = fopen(path, "w");
    if (f == 0) return 0;
    for (i = 0; i < cfg->fav_count; i++)
        fprintf(f, "%s%d", i == 0 ? "" : ",", cfg->favs[i]);
    fprintf(f, "\n");
    fclose(f);
    return 1;
}

/* Replaces the manifest defaults when the file is there; silence when not. */
static void favs_load(texttv_config *cfg, const char *path)
{
    FILE *f;
    char line[256];
    f = fopen(path, "r");
    if (f == 0) return;
    if (fgets(line, (int)sizeof line, f) != 0) {
        cfg->fav_count = 0;
        texttv_fav_parse(cfg, line);
    }
    fclose(f);
}

/* ------------------------------------------------------------------- fetch */

#define BODY_MAX 16384

static char body[BODY_MAX];
static unsigned long body_len;
static int body_truncated;

static int collect(void *ctx, const unsigned char *buf, unsigned long len)
{
    unsigned long room;
    (void)ctx;
    room = (unsigned long)sizeof body - 1 - body_len;
    if (len > room) {
        body_truncated = 1;
        len = room;
    }
    if (len > 0) {
        memcpy(body + body_len, buf, len);
        body_len += len;
        body[body_len] = '\0';
    }
    return 0;
}

/* -------------------------------------------------------------------- door */

static ae_session session;
static char frame_buffer[16384];
static char session_storage[264];
static ui_screen screen;
static ui_key_source keys;
static const ui_theme *theme;
static int pushback = -1;
static int wide;
static char status_line[96];
static texttv_config config;

static int door_key(void *ctx) { (void)ctx; return ae_key(); }
static int door_pending(void *ctx) { (void)ctx; return ae_input_pending(); }
static void door_settle(void *ctx) { (void)ctx; ae_delay_ticks(1); }
static void door_flush(void *ctx) { (void)ctx; ui_screen_flush(&screen); }

/* ------------------------------------------------------------- masthead rail

   The rail slides, the same way it does in SUBS and REQUESTS: a 68K door has
   no timers, so the frames come from the idle hook while we wait for a key
   (ui_key.h) - one row redrawn, about five frames a second.

   This door drew it STILL for a while, to keep idle bytes out of the repaint
   measurements. That was the wrong trade: the board's doors are supposed to
   look like one board, and a dead rail is what the sysop noticed first
   (2026-09-13). The measurement has its own answer - the probe reports idle
   bytes separately from the per-key cost.

   The current title is remembered so the hook can redraw the row it is on
   without knowing which view put it there. */
static int rail_tick;
static const char *masthead_title = "TEXT-TV";

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

static void say(int row, const char *text)
{
    /* Start where the reader starts. At forty columns the reader owns column
       one, so writing from column three left the two characters underneath
       it untouched - the previous screen's title showed through as "10"
       beside the new one (sysop's C64 walk). */
    int left = texttv_reader_frameless(screen.cols) ? 1 : 3;
    ansi_color(&screen.buf, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen.buf, row, left, text, screen.cols - (left - 1));
}

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

/* The index: curated pages first, then the caller's favorites. */
typedef struct { int page; const char *label; } index_entry;

static const index_entry index_table[] = {
    { 100, "News - latest" },
    { 101, "News - domestic" },
    { 104, "News - foreign" },
    { 300, "Sport - latest" },
    { 330, "Sport - results" },
    { 376, "Sport - goals" },
    { 400, "Weather" },
    { 600, "TV listings" },
    { 700, "Index" },
};
#define INDEX_COUNT ((int)(sizeof index_table / sizeof index_table[0]))

static char row_text[96];

static const char *index_row(void *context, int index)
{
    int favbase = *(const int *)context;
    (void)favbase;
    if (index < 0) return "";
    if (index < INDEX_COUNT) {
        sprintf(row_text, "%d  %s", index_table[index].page, index_table[index].label);
        return row_text;
    }
    index -= INDEX_COUNT;
    if (index < config.fav_count) {
        sprintf(row_text, "%d  favorite", config.favs[index]);
        return row_text;
    }
    return "";
}

static int index_count(void)
{
    return INDEX_COUNT + config.fav_count;
}

static int index_page_at(int index)
{
    if (index < 0) return 0;
    if (index < INDEX_COUNT) return index_table[index].page;
    index -= INDEX_COUNT;
    if (index < config.fav_count) return config.favs[index];
    return 0;
}

/* One fetched page: number, title, latin1 body, neighbour links. */
static int page_num;
static char page_title[128];
static char page_body[8192];
static char page_next[8];
static char page_prev[8];

/* Fetch page into the statics. Returns HTTP status, -100 and below for
 * transport failure (the ae_http code negated and shifted, so the layer
 * survives: -101 is AE_HTTP_ERR_CONNECT and so on), -1 for "not on air"
 * (valid answer, no such page). show_page turns each into its own
 * sentence - one "did not answer" for every layer cost a whole evening
 * of guessing on live (2026-09-10: the request left, the backend stayed
 * silent, and the status line could not say which). */
static int last_fetch_err;

/* What the page in front of the caller points at, and which one the cursor
   is on. An article page has none and the reader behaves as it always did. */
static texttv_link page_links[TEXTTV_MAX_LINKS];
static int page_link_count;
static int page_link_cur = -1;

static int fetch_page(int page)
{
    ae_http_target target;
    ae_http_response resp;
    char path[128];
    char plain[8192];
    int rc;
    int attempts;

    page_num = 0;
    page_title[0] = '\0';
    page_body[0] = '\0';
    page_next[0] = '\0';
    page_prev[0] = '\0';
    status_line[0] = '\0';
    last_fetch_err = 0;

    if (texttv_page_path(page, path, sizeof path) != 0) return 0;

    memset(&target, 0, sizeof target);
    target.host = config.host;
    target.port = config.port;
    target.timeout_secs = config.timeout_secs;
    target.user_agent = TEXTTV_USER_AGENT;

    body_len = 0;
    body[0] = '\0';
    body_truncated = 0;
    memset(&resp, 0, sizeof resp);
    /* Live 2026-09-10: the reply sometimes never arrives even though the
       request left (transient - a full 2 KB reply got through minutes
       earlier on the same path). One attempt would report the glitch as
       the truth; three attempts 15 s apart still fail fast enough to be
       honest, and the last error is the one reported. */
    for (rc = AE_HTTP_ERR_READ, attempts = 0; attempts < 3; attempts++) {
        body_len = 0;
        body[0] = '\0';
        body_truncated = 0;
        memset(&resp, 0, sizeof resp);
        rc = ae_http_get(&target, path, &resp, collect, 0);
        if (rc == AE_HTTP_OK) break;
        last_fetch_err = -100 + rc;
    }
    if (rc != AE_HTTP_OK) return last_fetch_err;
    if (resp.status != 200) return resp.status;

    if (texttv_pick_body(body, plain, sizeof plain) != 0) return -1;
    utf8_to_latin1(plain, page_body, sizeof page_body);
    /* The proxy's rows carry real SGR escapes, and ansi_text turns every
       byte below 32 into a space - so the colour printed as `[0;37;44m`
       across the row. Translated to the SDK's pen markers, which cost the
       row no columns. A plain body has no escapes and passes through. */
    {
        static char inked[sizeof page_body];
        if (texttv_ansi_to_ink(page_body, inked, sizeof inked) > 0)
            memcpy(page_body, inked, strlen(inked) + 1);
    }
    /* Latin-1, like the body. A raw UTF-8 title painted `fÃ¶r` in the
       frame while the body two rows below read `för`. */
    if (texttv_title(body, page_title, sizeof page_title) != 0)
        sprintf(page_title, "Text-TV %d", page);
    /* The headlines this page offers, so the reader can put a cursor on one
       instead of the caller reading a number off the screen and typing it. */
    page_link_count = texttv_links_parse(body, page_links, TEXTTV_MAX_LINKS);
    page_link_cur = page_link_count > 0 ? 0 : -1;
    if (json_extract_string(body, "next_page", page_next, sizeof page_next) != 0)
        page_next[0] = '\0';
    if (json_extract_string(body, "prev_page", page_prev, sizeof page_prev) != 0)
        page_prev[0] = '\0';
    page_num = page;
    return 200;
}

/* ae_http codes are negative (0 ok, -1 args ... -11 header abort);
 * last_fetch_err carries -100 + code, so -101 is ERR_ARGS and so on. */
static void explain_fetch_err(char *out, unsigned long cap)
{
    int code = last_fetch_err + 100;
    const char *what;
    (void)cap;
    switch (code) {
    case -2: what = "no route to the board proxy"; break;
    case -3: what = "request never left"; break;
    case -4: what = "board went silent mid-reply"; break;
    case -5:
    case -6: what = "proxy answered garbage"; break;
    case -7: what = "proxy speaks chunked"; break;
    case -8: what = "proxy cut the reply short"; break;
    case -9: what = "door dropped the reply"; break;
    case -10:
    case -11: what = "request too long"; break;
    default: what = "board proxy unreachable"; break;
    }
    sprintf(out, "[ERROR] Text-TV: %s (%d).", what, code);
}

static void show_page(int page)
{
    int rc = fetch_page(page);
    if (rc == 0) {
        strcpy(status_line, "[ERROR] Text-TV did not answer. Try again.");
        return;
    }
    if (rc <= -100) {
        explain_fetch_err(status_line, sizeof status_line);
        return;
    }
    if (rc == -1) {
        sprintf(status_line, "[INFO] Page %d is not on air.", page);
        return;
    }
    if (rc != 200) {
        sprintf(status_line, "[ERROR] Text-TV proxy answered %d.", rc);
        return;
    }
    strcpy(status_line, "");
}

/* After the reader: one key decides what happens to the page just read. */
#define ACT_NONE 0
#define ACT_NEXT 1
#define ACT_PREV 2
#define ACT_FAV 3
#define ACT_SHARE 4
#define ACT_INDEX 5
#define ACT_QUIT 6
#define ACT_NUMBER 7

static int page_actions(void)
{
    static const char *const hints_all[5] = { "N Next", "P Previous", "F Favorite", "S Share", "Q Quit" };
    static const char *const hints_edge[4] = { "F Favorite", "S Share", "I Index", "Q Quit" };
    char line[96];
    int key;

    ansi_clear(&screen.buf);
    draw_masthead("TEXT-TV");
    texttv_page_line(line, sizeof line, page_num, page_title);
    say(3, line);
    say(5, wide ? "N next page, P previous, F favorite, S share it,"
                : "N next, P previous,");
    say(6, wide ? "I back to the index, or a number for any page 100-999."
                : "F favorite, S share, I index, Q quit.");
    /* The reader's own footer says "<> PAGE", but a caller who has already
       left it should not have to go back in to find that out. */
    say(7, wide ? "While reading, LEFT and RIGHT flip pages and H goes back to 100."
                : "Reading: left/right flip, H = page 100.");
    draw_status();
    if (page_next[0] != '\0' || page_prev[0] != '\0')
        draw_footer(hints_all, 5, "Q=Quit");
    else
        draw_footer(hints_edge, 4, "Q=Quit");
    ui_screen_flush(&screen);

    key = ui_key_read(&keys, &pushback);
    if (key < 0) return ACT_QUIT;
    if (key == 'n' || key == 'N') return ACT_NEXT;
    if (key == 'p' || key == 'P') return ACT_PREV;
    if (key == 'f' || key == 'F') return ACT_FAV;
    if (key == 's' || key == 'S') return ACT_SHARE;
    if (key == 'i' || key == 'I' || key == UI_KEY_ESC) return ACT_INDEX;
    if (key == 'q' || key == 'Q') return ACT_QUIT;
    if ((key >= '0' && key <= '9')) return ACT_NUMBER;
    return ACT_NONE;
}

/*
 * Read the page, and follow it.
 *
 * An index page carries the page number of each headline as a link, so the
 * reader puts a cursor on the headlines and RETURN opens the one under it.
 * Q on an article goes BACK to the index it was opened from - which is what a
 * teletext reader does - and Q on the index leaves the door. An article page
 * has no links, and then this is exactly the reader it was before.
 */
#define TEXTTV_BACK_DEPTH 8
#define TEXTTV_HOME_PAGE 100

static void read_page(void)
{
    int back[TEXTTV_BACK_DEPTH];
    int depth = 0;

    for (;;) {
        ui_doc_style style;
        char title[160];
        int lines[TEXTTV_MAX_LINKS];
        int pick_count;
        int i;
        int cur;
        int rc;

        ui_doc_style_init(&style);
        style.top = 3;
        texttv_reader_box(screen.cols, screen.rows, &style.left, &style.width, &style.height);
        style.frameless = texttv_reader_frameless(screen.cols);
        style.page_keys = 1;        /* LEFT/RIGHT flip the teletext page */
        style.fg = UI_TOKEN(UI_T_INK);
        style.bg = UI_TOKEN(UI_T_GROUND);
        style.ink = UI_TOKEN(UI_T_ACCENT);
        /* A page the caller can walk says so in its own frame where there is
           room; at forty the title is the title alone, because the page's own
           first row already carries the number and the number was costing the
           last word of the headline. */
        texttv_reader_title(title, sizeof title, screen.cols, page_num,
                            page_title, page_link_count >= 2);
        ansi_clear(&screen.buf);
        draw_masthead("TEXT-TV");
        ui_screen_flush(&screen);

        /* A page is an INDEX when it offers several destinations. One link
           on a page of prose is an article pointing at its continuation -
           the caller is reading, so the arrows must scroll, not hunt. Page
           131 has exactly one ("Mer om Ukrainakriget på nästa sida") and the
           cursor had no business being there. */
        pick_count = page_link_count >= 2 ? page_link_count : 0;
        for (i = 0; i < pick_count; i++) lines[i] = page_links[i].label_row;
        cur = pick_count > 0 ? page_link_cur : -1;
        rc = ui_doc_pick(&screen.buf, &keys, &pushback, &style, title, page_body,
                         lines, pick_count, &cur);
        page_link_cur = cur;

        if (rc < 0) return;                     /* the caller went away */

        if (rc == 1 && cur >= 0 && cur < pick_count) {
            int target = page_links[cur].page;
            int from = page_num;
            show_page(target);
            if (page_num == target) {
                if (depth < TEXTTV_BACK_DEPTH) back[depth++] = from;
                continue;
            }
            /* It did not open - status_line says why; stay where we are. */
            continue;
        }

        /* LEFT and RIGHT are the teletext page keys, on an index page and
           on an article alike: they move SIDEWAYS through the numbering,
           so they leave the back-stack alone - Q still returns to the page
           this one was opened from. At an edge there is nowhere to go and
           the reader simply stays. */
        /* H goes home, and home is page 100 - the teletext main index, the
           page every set starts on. It is a JUMP, not a step, so the walk
           that led here is over: Q from page 100 leaves the reader instead
           of retracing six pages the caller has finished with. */
        if (rc == UI_DOC_HOME) {
            if (page_num == TEXTTV_HOME_PAGE) { depth = 0; continue; }
            show_page(TEXTTV_HOME_PAGE);
            if (page_num == 0) return;
            depth = 0;
            continue;
        }

        if (rc == UI_DOC_PREV || rc == UI_DOC_NEXT) {
            int target = texttv_valid_page(rc == UI_DOC_PREV ? page_prev : page_next);
            if (target == 0) continue;          /* an edge: stay put */
            show_page(target);
            /* It did not open: status_line says why, and only the action
               screen draws that - so leave the reader and let it. */
            if (page_num == 0) return;
            continue;
        }

        if (depth > 0) {
            show_page(back[--depth]);
            continue;
        }
        return;
    }
}

/* Share sheet: the subject the board's own editor wants, the page head,
 * and the honest instruction. Then the door leaves into E, the SUBS
 * EALL pattern - the editor is interactive on a real AmiExpress too. */
static int share_page(void)
{
    static char sheet[4096];
    ui_doc_style style;
    ui_input_style cstyle;
    int answer;
    int n;

    n = sprintf(sheet, "Share Text-TV page %d with the conference.\n\nSubject:\n  Text-TV %d: %.100s\n\n",
                page_num, page_num, page_title);
    if (n > 0 && n < (int)sizeof sheet) {
        unsigned long used = strlen(sheet);
        unsigned long room = sizeof sheet - used - 1;
        unsigned long i;
        for (i = 0; i < room && page_body[i] != '\0' && i < 900; i++)
            sheet[used++] = page_body[i];
        sheet[used] = '\0';
    }

    ui_doc_style_init(&style);
    style.top = 3;
    style.left = 2;
    style.height = screen.rows - 9;
    style.width = screen.cols - 3;
    style.fg = UI_TOKEN(UI_T_INK);
    style.bg = UI_TOKEN(UI_T_GROUND);
    style.ink = UI_TOKEN(UI_T_ACCENT);
    ansi_clear(&screen.buf);
    draw_masthead("SHARE THIS PAGE");
    ui_screen_flush(&screen);
    if (ui_doc(&screen.buf, &keys, &pushback, &style, "SHARE", sheet) < 0)
        return 0;

    confirm_style(&cstyle);
    ansi_clear(&screen.buf);
    draw_masthead("SHARE THIS PAGE");
    say(3, "Open the board editor with that subject now?");
    ui_screen_flush(&screen);
    answer = ui_confirm(&screen.buf, &keys, &pushback, &cstyle,
                        "Post it?", 1);
    if (answer != 1) return 0;

    ui_screen_close(&screen);
    ae_close(&session);
    ae_return_command("E");
    ae_shutdown();
    return 1; /* not reached on Amiga; the native twin returns through here */
}

static void number_entry(void)
{
    ui_input_style st;
    char buf[8];
    int page;
    ui_input_style_init(&st);
    st.row = screen.rows - 3;
    st.left = 3;
    st.cols = 10;
    st.fg = UI_TOKEN(UI_T_INK);
    st.bg = UI_TOKEN(UI_T_GROUND);
    st.ink = UI_TOKEN(UI_T_ACCENT);
    buf[0] = '\0';
    ansi_clear(&screen.buf);
    draw_masthead("TEXT-TV");
    say(3, "Page number, 100 to 999:");
    ui_screen_flush(&screen);
    if (ui_input(&screen.buf, &keys, &pushback, &st, "Page:", buf, (int)sizeof buf) <= 0)
        return;
    page = texttv_valid_page(buf);
    if (page == 0) {
        strcpy(status_line, "[INFO] Pages run 100 to 999.");
        return;
    }
    show_page(page);
    if (page_num != 0) read_page();
}

int main(int argc, char **argv)
{
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    int running = 1;
    int full = 1;
    int view = 0; /* 0 index, 1 page actions */
    char theme_id[32];
    ui_list list;
    static const char *const index_hints[3] = { "Enter Read", "N Number", "Q Quit" };

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(&session, session_storage, (long)sizeof(session_storage), node) != 0) {
        ae_shutdown();
        return 20;
    }

    /* Cursor keys, or the BBS eats every one of them before this door sees
       it (express.e:7514-7528). Restored on every exit path. */
    ae_raw_arrows(1);

    /* No config, no problem: config_load leaves the defaults standing. The
       sysop's file is read first, then the callers' own favorites on top. */
    config_load(&config, "TEXTTV.cfg");
    favs_load(&config, "TEXTTV.favs");

    ui_screen_open(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    wide = !ui_is_compact_width(screen.cols);

    /* Classic fallback: a board that answers the theme field with nothing
       is a real AmiExpress (or a harness), and classic is the answer. */
    theme_id[0] = '\0';
    ae_user_theme(&session, theme_id, (int)sizeof(theme_id));
    if (theme_id[0] == '\0')
        strcpy(theme_id, "classic");
    theme = ui_theme_by_id(theme_id);
    ansi_set_palette(&screen.buf, theme->rgb, theme->idx, UI_TOKEN_COUNT);

    keys.next = door_key;
    keys.pending = door_pending;
    keys.settle = door_settle;
    keys.idle = door_idle;
    keys.flush = door_flush;
    keys.ctx = 0;

    ui_list_init(&list);
    list.top = 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = screen.rows - 6;
    list.count = index_count();
    list.row = index_row;
    list.context = 0;
    list.borders = wide ? 1 : 0;
    list.caret = ">>";
    list.chrome = UI_TOKEN(UI_T_ACCENT);
    list.ink = UI_TOKEN(UI_T_INK);
    list.selected_fg = UI_TOKEN(UI_T_SELECTION_INK);
    list.selected_bg = UI_TOKEN(UI_T_SELECTION_BG);

    /* Start where the cfg says, already reading. */
    if (config.start_page >= 100 && config.start_page <= 999) {
        show_page(config.start_page);
        if (page_num != 0) {
            read_page();
            view = 1;
            full = 1;
        }
    }

    while (running) {
        int key;
        int action;

        if (full) {
            if (view == 0) {
                list.count = index_count();
                ansi_clear(&screen.buf);
                draw_masthead("TEXT-TV INDEX");
                ui_list_draw(&list, &screen.buf);
                draw_status();
                draw_footer(index_hints, 3, "Q=Quit");
                ui_screen_flush(&screen);
            }
            full = 0;
        }

        if (view == 0) {
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
            if (key == UI_KEY_ENTER || key == '\r') {
                int page = index_page_at(list.selected);
                if (page == 0) continue;
                show_page(page);
                if (page_num == 0) { full = 1; continue; }
                read_page();
                view = 1;
                full = 1;
                continue;
            }
            if (key == 'n' || key == 'N') {
                number_entry();
                if (page_num != 0 && status_line[0] == '\0') {
                    view = 1;
                }
                full = 1;
                continue;
            }
            if (key == 'q' || key == 'Q' || key == UI_KEY_ESC) break;
            continue;
        }

        /* Page actions view. */
        action = page_actions();
        if (action == ACT_QUIT) break;
        if (action == ACT_INDEX) { view = 0; full = 1; continue; }
        if (action == ACT_NUMBER) {
            number_entry();
            if (page_num != 0 && status_line[0] == '\0') {
                /* number_entry already read it; stay on actions. */
            } else {
                view = 0;
            }
            full = 1;
            continue;
        }
        if (action == ACT_NEXT) {
            int next = texttv_valid_page(page_next);
            if (next == 0) {
                strcpy(status_line, "[INFO] No next page from here.");
                full = 1;
                continue;
            }
            show_page(next);
            if (page_num != 0) read_page();
            full = 1;
            continue;
        }
        if (action == ACT_PREV) {
            int prev = texttv_valid_page(page_prev);
            if (prev == 0) {
                strcpy(status_line, "[INFO] No previous page from here.");
                full = 1;
                continue;
            }
            show_page(prev);
            if (page_num != 0) read_page();
            full = 1;
            continue;
        }
        if (action == ACT_FAV) {
            int added = texttv_fav_toggle(&config, page_num);
            if (added < 0) {
                strcpy(status_line, "[INFO] Favorites list is full (32).");
            } else {
                sprintf(status_line, "[OK] Page %d %s favorites.", page_num,
                        added ? "added to" : "removed from");
                favs_save(&config, "TEXTTV.favs");
            }
            full = 1;
            continue;
        }
        if (action == ACT_SHARE) {
            if (share_page()) return 0; /* left into the board editor */
            view = 0;
            full = 1;
            continue;
        }
        full = 1;
    }

    ui_screen_close(&screen);
    ae_close(&session);
    ae_shutdown();
    return 0;
}