/*
 * ACHIEVE - the achievements door, in C, on a 68K Amiga.
 *
 * The port of Doors/achieve (SP4 of the achievements plan, backlog 4.12) and
 * the second proof of the C SDK: a door that TALKS TO THE NETWORK, drawn
 * with the same widgets and reading the same server as its TypeScript twin.
 *
 * WHAT IT SHOWS, and why not everything the TypeScript one shows. A 68K door
 * cannot hold a JSON catalogue in a static buffer, which is exactly why the
 * server offers `/catalog.txt` and `/leaderboard.txt`: a header line, then
 * `|`-separated rows, CRLF, Latin-1, append-only. This door reads those two
 * and shows them. The account flow - register, verify, link - stays with the
 * TypeScript door, which has a keyboard, a mail round trip and a board that
 * can hold state between screens; a caller does that once, on the web
 * terminal, and then every door on the board reports for him.
 *
 * WHERE THE SERVER IS. The BBS keeps its own board key encrypted, and a 68K
 * door has no way to ask for it, so this door reads its own `ACHIEVE.cfg`
 * beside the executable - exactly as DoorRepo reads `DoorRepo.cfg`. No file,
 * no door: it says so and leaves, rather than showing an empty scoreboard.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "aedoor.h"
#include "ae_achieve.h"
#include "ae_host.h"
#include "ae_http.h"
#include "ae_session.h"
#include "ui_ansi.h"
#include "ui_chrome.h"
#include "ui_input.h"
#include "ui_key.h"
#include "ui_list.h"
#include "ui_profile.h"
#include "ui_screen.h"
#include "ui_theme.h"

/* One frame and one session record, both owned here: a library that
   allocated would be a library a door cannot budget for. */
static char frame_buffer[16384];
static char session_storage[AE_SESSION_MIN_STORAGE];

/* The largest listing this door will hold. 24 KB is four hundred catalogue
   rows or a thousand scoreboard rows - past what any caller reads in one
   sitting, and small enough to sit in a 68K door's BSS without thinking
   about it. A longer answer is truncated at a row boundary, and the screen
   says so. */
#define LISTING_MAX 24576
#define ROWS_MAX 256
#define FIELDS_MAX 10

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

/** What the caller is looking at. */
typedef enum { VIEW_MENU, VIEW_BOARD, VIEW_GLOBAL, VIEW_CATALOG } view_id;

/* ------------------------------------------------------------------ config */

typedef struct {
    char host[128];
    int port;
    char board_key[192];
    char board_id[64];
    int timeout_secs;
} achieve_config;

static achieve_config config;

static void trim(char *s)
{
    unsigned long len = (unsigned long)strlen(s);
    while (len > 0 && (s[len - 1] == '\r' || s[len - 1] == '\n' ||
                       s[len - 1] == ' ' || s[len - 1] == '\t')) {
        s[--len] = '\0';
    }
}

/** `Key=value` lines, `#` comments, everything else ignored. */
static int config_load(achieve_config *cfg, const char *path)
{
    FILE *f;
    char line[256];

    memset(cfg, 0, sizeof *cfg);
    cfg->port = 80;
    cfg->timeout_secs = 10;

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
        } else if (strcmp(line, "BoardId") == 0) {
            strncpy(cfg->board_id, value, sizeof cfg->board_id - 1);
        } else if (strcmp(line, "Timeout") == 0) {
            int secs = atoi(value);
            if (secs > 0 && secs < 120) cfg->timeout_secs = secs;
        }
    }
    fclose(f);

    /* The board id is the key's own prefix, as the server mints it
       (`<board>.<secret>`), so a sysop who sets only BoardKey still gets a
       board scoreboard. */
    if (cfg->board_id[0] == '\0' && cfg->board_key[0] != '\0') {
        const char *dot = strchr(cfg->board_key, '.');
        if (dot != 0 && dot != cfg->board_key) {
            unsigned long len = (unsigned long)(dot - cfg->board_key);
            if (len >= sizeof cfg->board_id) len = sizeof cfg->board_id - 1;
            memcpy(cfg->board_id, cfg->board_key, len);
            cfg->board_id[len] = '\0';
        }
    }
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

/**
 * GET one of the server's text listings.
 *
 * Returns the HTTP status, or a negative ae_http error. The body is left in
 * `listing` and parsed by split_rows().
 */
static int fetch_text(const char *path_and_query)
{
    char authorization[256];
    const char *headers[1];
    ae_http_target target;
    ae_http_response response;
    int rc;

    listing_len = 0;
    listing[0] = '\0';
    listing_truncated = 0;
    row_count = 0;

    if ((unsigned long)strlen(config.board_key) + 32 >= sizeof authorization) return -1;
    sprintf(authorization, "Authorization: Board %s\r\n", config.board_key);
    headers[0] = authorization;

    memset(&target, 0, sizeof target);
    target.host = config.host;
    target.port = config.port;
    target.timeout_secs = config.timeout_secs;
    target.user_agent = "AmiExpress-ACHIEVE/1.0";

    memset(&response, 0, sizeof response);
    rc = ae_http_request(&target, "GET", path_and_query, 0, 0,
                         headers, 1, &response, collect, 0, 0);
    if (rc != AE_HTTP_OK) return rc;
    return response.status;
}

/**
 * Split the body into rows and fields, in place.
 *
 * The header line (`ACHIEVE|1|<revision>|<count>`) is consumed here: a door
 * shows rows, and the revision is the server's business. A conforming parser
 * IGNORES trailing fields it does not know, which is what makes the format
 * append-only - so this keeps the first FIELDS_MAX and drops the rest rather
 * than refusing a row that grew.
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
            continue;   /* ACHIEVE|1|<revision>|<count> */
        }

        rows[row_count].field[field++] = line;
        while (field < FIELDS_MAX) {
            char *bar = strchr(line, '|');
            if (bar == 0) break;
            *bar = '\0';
            line = bar + 1;
            rows[row_count].field[field++] = line;
        }
        /* A row longer than FIELDS_MAX keeps its extra fields inside the
           last one rather than losing the row. */
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
static view_id current_view = VIEW_MENU;
static int compact_screen;

/**
 * The menu, in the twin's own words.
 *
 * Doors/achieve/app.ts menuItems() writes these, and the two doors are meant
 * to be the same door: the labels are copied deliberately, and the account
 * row says where that flow lives rather than pretending to offer it.
 */
static const char *menu_row(void *context, int index)
{
    int wide = *(const int *)context;

    switch (index) {
        case 0: return wide ? "This board's scoreboard" : "Board scoreboard";
        case 1: return wide ? "The global scoreboard" : "Global scoreboard";
        case 2: return wide ? "The catalog, by family" : "Catalog";
        case 3: return wide ? "Account: on the web terminal" : "Account: web only";
        default: return wide ? "Leave the door" : "Leave";
    }
}

/** `<rank>|<handle>|<points>|<unlocks>` */
static const char *board_row(void *context, int index)
{
    int wide = *(const int *)context;

    if (index >= row_count) return "";
    if (wide) {
        sprintf(row_text, "%3s  %-16s %8s pts  %4s unlocked",
                field_of(index, 0), field_of(index, 1),
                field_of(index, 2), field_of(index, 3));
    } else {
        sprintf(row_text, "%2s %-16s %6s",
                field_of(index, 0), field_of(index, 1), field_of(index, 2));
    }
    return row_text;
}

/** `<id>|<family>|<tier>|<points>|<hidden>|<name>|<description>|...` */
static const char *catalog_row(void *context, int index)
{
    int wide = *(const int *)context;

    if (index >= row_count) return "";
    if (wide) {
        sprintf(row_text, "%-10s %-8s %-28s %4s pts",
                field_of(index, 1), field_of(index, 2),
                field_of(index, 5), field_of(index, 3));
    } else {
        sprintf(row_text, "%-24s %-6s", field_of(index, 5), field_of(index, 2));
    }
    return row_text;
}

/* ------------------------------------------------------------------- input */

static int door_key(void *ctx) { (void)ctx; return ae_key(); }
static int door_pending(void *ctx) { (void)ctx; return ae_input_pending(); }
static void door_settle(void *ctx) { (void)ctx; ae_delay_ticks(1); }

/* -------------------------------------------------------------------- main */

/* One line of prose, in the theme's ink, clipped to the caller's width. */
static void say(ui_screen *screen, const ui_theme *theme, int row, const char *text)
{
    (void)theme;
    ansi_color(&screen->buf, UI_TOKEN(UI_T_INK), UI_TOKEN(UI_T_GROUND), 0);
    ansi_text(&screen->buf, row, 3, text, screen->cols - 3);
}

int main(int argc, char **argv)
{
    ae_session session;
    ui_screen screen;
    ui_list list;
    ui_key_source keys;
    const ui_theme *theme;
    char theme_id[32];
    char query[256];
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    int wide;
    int pushback = -1;
    int running = 1;
    int status = 0;
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

    keys.next = door_key;
    keys.pending = door_pending;
    keys.settle = door_settle;
    keys.idle = 0;
    keys.flush = 0;
    keys.ctx = 0;

    if (!config_load(&config, "ACHIEVE.cfg")) {
        ansi_clear(&screen.buf);
        ui_masthead_draw(&screen.buf, 1, 1, screen.cols, "ACHIEVEMENTS",
                         theme->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
        say(&screen, theme, 3, "This door has no ACHIEVE.cfg beside it.");
        say(&screen, theme, 4, "A sysop sets Host= and BoardKey= there.");
        say(&screen, theme, 6, "Press any key.");
        ui_screen_flush(&screen);
        ui_key_read(&keys, &pushback);
        ui_screen_close(&screen);
        ae_shutdown();
        return 0;
    }

    ui_list_init(&list);
    list.top = 3;
    list.left = 1;
    list.width = screen.cols - 1;
    list.height = wide ? 16 : 14;
    list.count = 5;
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
            ansi_clear(&screen.buf);
            ui_masthead_draw(&screen.buf, 1, 1, screen.cols,
                             current_view == VIEW_MENU ? "ACHIEVEMENTS"
                             : current_view == VIEW_CATALOG ? "THE CATALOG"
                             : current_view == VIEW_GLOBAL ? "GLOBAL SCOREBOARD"
                             : "BOARD SCOREBOARD",
                             theme->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
            if (current_view != VIEW_MENU && row_count == 0) {
                say(&screen, theme, 3,
                    status > 0 ? "The server answered, and had nothing to show."
                               : "The server could not be reached.");
                say(&screen, theme, 5, "Press Q to go back.");
            } else {
                ui_list_draw(&list, &screen.buf);
                if (listing_truncated) {
                    say(&screen, theme, list.top + list.height + 1,
                        wide ? "The listing is longer than this door can hold."
                             : "Listing truncated.");
                }
            }
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

        if (current_view != VIEW_MENU) {
            if (key == 'q' || key == 'Q' || key == UI_KEY_ESC ||
                key == '\r' || key == UI_KEY_ENTER) {
                current_view = VIEW_MENU;
                list.count = 5;
                list.row = menu_row;
                list.height = wide ? 16 : 14;
                ui_list_select(&list, 0);
                full = 1;
            }
            continue;
        }

        if (key == 'q' || key == 'Q' || key == UI_KEY_ESC) break;
        /* ui_key_read answers UI_KEY_ENTER for the Return key; a raw CR
           arrives from a caller whose terminal sends one. Both choose. */
        if (key != '\r' && key != ' ' && key != UI_KEY_ENTER) continue;

        switch (list.selected) {
            case 0:
            case 1: {
                const char *scope_prefix = list.selected == 0 ? "board:" : "";
                sprintf(query,
                        "/achievements/v1/leaderboard.txt?scope=%s%s&period=all&limit=%d",
                        scope_prefix,
                        list.selected == 0 ? config.board_id : "global",
                        ROWS_MAX);
                status = fetch_text(query);
                split_rows();
                current_view = list.selected == 0 ? VIEW_BOARD : VIEW_GLOBAL;
                list.row = board_row;
                list.count = row_count;
                list.height = (wide ? 20 : 18);
                ui_list_select(&list, 0);
                full = 1;
                break;
            }
            case 2:
                status = fetch_text("/achievements/v1/catalog.txt");
                split_rows();
                current_view = VIEW_CATALOG;
                list.row = catalog_row;
                list.count = row_count;
                list.height = (wide ? 20 : 18);
                ui_list_select(&list, 0);
                full = 1;
                break;
            case 3:
                ansi_clear(&screen.buf);
                ui_masthead_draw(&screen.buf, 1, 1, screen.cols, "ACHIEVEMENTS",
                                 theme->rail, UI_TOKEN(UI_T_BAR_INK), UI_TOKEN(UI_T_BAR));
                say(&screen, theme, 3,
                    wide ? "Linking your account needs the web terminal:"
                         : "Linking needs the web terminal:");
                say(&screen, theme, 4, "run ACHIEVE there, then Account.");
                say(&screen, theme, 6, "Press any key.");
                ui_screen_flush(&screen);
                ui_key_read(&keys, &pushback);
                full = 1;
                break;
            default:
                running = 0;
                break;
        }
    }

    ansi_clear(&screen.buf);
    ui_screen_flush(&screen);
    ui_screen_close(&screen);
    ae_shutdown();
    return 0;
}
