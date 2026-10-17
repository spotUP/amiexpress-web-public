/* test_menudoor_model.c - the shell's pure decisions (type-ahead, digits, layout) and ONE reachability test:
   menudoor_run driven end to end against a stand-in board, scripted keys on stdin, the screen captured from stdout. */
#include "../include/menudoor.h"
#include "../src/menudoor_model.h"
#include "../include/ae_transport_native.h"
#include "../include/ae_session.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "../include/aedoor.h"

/* The AEDoor field round trip has no host backend: a stand-in board that answers no session field, so the
   door sees the 80x25 defaults and the board's own screen answers (AEW_SCREEN) decide the rest. */
static const char *invoked_name = "";
static const char *theme_name = "";                           /* what AEW_THEME answers: "" is a board with no themes */
int ae_field_read(int field, char *out, int cap)
{
    const char *text = field == 10100 ? theme_name : invoked_name;     /* 10100 AE_FIELD_THEME; 605 AE_FIELD_MENU_COMMAND */
    int n = (field == 605 || field == 10100) ? (int)strlen(text) : 0;
    if (n > cap - 1) n = cap - 1;
    if (cap > 0) { memcpy(out, text, (size_t)n); out[n] = '\0'; }
    return n;
}
int ae_field_write(int field, const char *value) { (void)field; (void)value; return 0; }
int ae_query_bit(int acs) { (void)acs; return 1; }

static ae_menu menu;

static void entry(int i, int section, const char *key, const char *label)
{
    memset(&menu.entries[i], 0, sizeof menu.entries[i]);
    strcpy(menu.entries[i].key, key);
    strcpy(menu.entries[i].label, label);
    menu.entry_section[i] = section;
    if (i + 1 > menu.entry_count) menu.entry_count = i + 1;
}

static void logo(const char *position, int rows, int cols, int after)
{
    ae_menu_logo *l = &menu.logos[menu.logo_count++];
    strcpy(l->position, position); l->rows = rows; l->cols = cols; l->after_section = after;
}

static void reset(void) { memset(&menu, 0, sizeof menu); menu.section_count = 1; }

static void the_palette_ranks_key_then_label_then_description_and_keeps_catalogue_order_in_ties(void)
{
    int order[8], n;
    reset();
    entry(0, 0, "MA", "Mail Area");                      /* key prefix of "m", label prefix of "ma" */
    entry(1, 0, "R", "Read Mail");                       /* label substring of "mail" */
    entry(2, 0, "MAIL", "Inbox");                        /* exact key of "mail" */
    entry(3, 0, "E", "Enter Message");
    strcpy(menu.entries[3].description, "Write MAIL to someone");  /* description substring only */
    entry(4, 0, "G", "Goodbye");

    n = md_palette_rank(&menu, "mail", order, 8);
    assert(n == 4);
    assert(order[0] == 2);                               /* exact key */
    assert(order[1] == 0);                               /* label prefix "Mail Area" */
    assert(order[2] == 1);                               /* label substring */
    assert(order[3] == 3);                               /* description substring, any case */

    n = md_palette_rank(&menu, "M", order, 8);           /* two key prefixes: catalogue order between them */
    assert(n >= 2 && order[0] == 0 && order[1] == 2);

    n = md_palette_rank(&menu, "", order, 8);            /* empty: everything, catalogue order */
    assert(n == 5 && order[0] == 0 && order[4] == 4);
    assert(md_palette_rank(&menu, "zzz", order, 8) == 0);
    assert(md_palette_rank(&menu, "", order, 2) == 2);   /* never past cap */
}

static void type_ahead_prefers_the_exact_key_and_ignores_case(void)
{
    reset();
    entry(0, 0, "FR", "File Requests"); entry(1, 0, "F", "File Listings"); entry(2, 0, "Q", "Quiet");
    assert(md_typeahead(&menu, "F") == 1);                       /* F over FR, though FR comes first */
    assert(md_typeahead(&menu, "FR") == 0);
    assert(md_typeahead(&menu, "q") == 2);
    assert(md_typeahead(&menu, "f") == 1);
    assert(md_typeahead(&menu, "Z") == -1 && md_typeahead(&menu, "") == -1 && md_typeahead(&menu, 0) == -1);
    reset();
    entry(0, 0, "FR", "File Requests"); entry(1, 0, "FX", "Fax");
    assert(md_typeahead(&menu, "F") == 0);                       /* no exact key: the first that starts with it */
    printf("  [OK] type-ahead prefers the exact key and ignores case\n");
}

static void digits_act_at_once_only_when_nothing_else_could_follow(void)
{
    reset();
    entry(0, 0, "3", "Three"); entry(1, 0, "30", "Thirty"); entry(2, 0, "4", "Four");
    assert(md_digits_act(&menu, "3") == -1);                     /* 30 exists: wait */
    assert(md_digits_act(&menu, "30") == 1);
    assert(md_digits_act(&menu, "4") == 2);
    assert(md_digits_act(&menu, "5") == -1 && md_digits_act(&menu, "3x") == -1 && md_digits_act(&menu, "") == -1);
    reset();
    entry(0, 0, "3", "Three"); entry(1, 0, "4", "Four");
    assert(md_digits_act(&menu, "3") == 0);
    reset();
    entry(0, 0, "3", "Three"); entry(1, 0, "3", "Three again");
    assert(md_digits_act(&menu, "3") == -1);                     /* ambiguous: Enter decides */
    printf("  [OK] a number acts at once only when nothing else could follow it\n");
}

static void layout_puts_things_where_the_screen_has_room(void)
{
    md_layout_out o;
    reset();
    logo("header", 3, 40, 0);
    md_layout(&menu, 80, 25, &o);
    assert(o.header_rows == 3 && o.header_top == 1 && o.divider_row == 5 && o.rail_row == 5 && o.grid_top == 7 && o.masthead_row == 0);   /* logo 1-3, divider 4: no title row */
    assert(o.status_row == 24 && o.prompt_row == 25 && o.grid_height == 15 && o.grid_width == 80);   /* logo 1-3, blank, divider, blank, grid 7-21, blank 22 */

    reset();
    logo("side", 10, 30, 0);
    md_layout(&menu, 40, 25, &o);
    assert(o.side_cols == 0 && o.grid_width == 40);                          /* no side logo at 40 columns */
    md_layout(&menu, 80, 25, &o);
    assert(o.side_cols == 0 && o.grid_width == 80);                          /* nor at 80 */
    md_layout(&menu, 132, 40, &o);
    assert(o.side_cols == 30 && o.grid_width == 132 - 32 && o.side_left == 132 - 30 + 1 && o.side_top == o.grid_top);

    reset();
    logo("header", 17, 40, 0);                                               /* grid would be 25-21-3 = 1 < MD_MIN_GRID_ROWS */
    md_layout(&menu, 80, 25, &o);
    assert(o.header_rows == 0 && o.grid_top == 2 && o.divider_row == 0 && o.rail_row == 1 && o.masthead_row == 1);   /* no logo: the title row, the rail on row 1 */

    reset();
    logo("header", 11, 78, 0);                                               /* sysop 2026-10-15: the list adapts to the logo size */
    md_layout(&menu, 80, 25, &o);
    assert(o.header_rows == 11 && o.grid_top == 15 && o.grid_height == 7 && o.divider_row == 13);
    reset();
    logo("header", 13, 78, 0);                                               /* leaves 5 = MD_MIN_GRID_ROWS: kept */
    md_layout(&menu, 80, 25, &o);
    assert(o.header_rows == 13 && o.grid_height == MD_MIN_GRID_ROWS);
    reset();
    logo("header", 12, 78, 0);                                               /* sysop 2026-10-15: the 12-row Bulletins logo on the 24-row web terminal stays */
    md_layout(&menu, 80, 24, &o);
    assert(o.header_rows == 12 && o.grid_top == 16 && o.grid_height == 5 && o.status_row == 23);
    reset();
    logo("header", 14, 78, 0);                                               /* 4 < MD_MIN_GRID_ROWS: dropped */
    md_layout(&menu, 80, 25, &o);
    assert(o.header_rows == 0 && o.grid_top == 2);

    reset();
    logo("header", 8, 40, 0); logo("footer", 8, 40, 0);                      /* both allowed alone, never both: grid >= 6 */
    md_layout(&menu, 80, 25, &o);
    assert(o.grid_height >= MD_MIN_GRID_ROWS);
    assert(o.footer_rows == 0 && o.header_rows == 8);                        /* the footer gave way first */
    reset();
    logo("header", 3, 120, 0);                                               /* wider than the screen */
    md_layout(&menu, 80, 25, &o);
    assert(o.header_rows == 0);

    reset();
    logo("between", 2, 80, 1);
    md_layout(&menu, 80, 25, &o);
    assert(o.band_height == 2 && o.band_after_section == 1);
    md_layout(&menu, 40, 25, &o);
    assert(o.band_height == 0 && o.band_after_section == -1);                /* 80 wide does not fit 40 */
    printf("  [OK] layout puts logos, grid, status and prompt where the screen has room\n");
}

/* ------------------------------------------------------------ the shell, driven */

#define CAT_PATH "build/test_menudoor_main.cat"
static const char *CATALOGUE =
    "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP BBS [1:Main] Menu: \nO scroll\nW X\tV\tH\nR 0\n"
    "L header\t3\t80\t0\n"
    "S Messages\n"
    "E R\tRead Mail\tRead your mail\t\t\n"
    "E E\tEnter Message\tWrite a message\t\t\n"
    "E MS\tMail Scan\tScan for new mail\t\t\n"
    "S Files\n"
    "E F\tFile Listings\tNot for you\t\tG\n"
    "E D\tDownload\tDownload a file\t\t\n"
    ".\n";

static const char *CATALOGUE_SHORT_PROMPT =
    "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO pages\nW -\t-\t-\nR 0\nS Messages\n"
    "E R\tRead Mail\tRead your mail\t\t\nE E\tEnter Message\tWrite a message\t\t\n.\n";

static char catalogue_text[2048];
static void write_catalogue(const char *text)
{
    FILE *f = fopen(CAT_PATH, "wb");
    assert(f); fputs(text, f); fclose(f);
    if (text != catalogue_text) { strncpy(catalogue_text, text, sizeof catalogue_text - 1); catalogue_text[sizeof catalogue_text - 1] = '\0'; }
}

/* What the board does on STYLE <mode>: the next OPEN carries the stored style on its O line. */
static void restyle_catalogue(const char *mode)
{
    char out[2048], *o = strstr(catalogue_text, "\nO "), *end;
    if (!o || strcmp(mode, "default") == 0 || strcmp(mode, "classic") == 0) return;
    end = strchr(o + 1, '\n');
    sprintf(out, "%.*s\nO %s%s", (int)(o - catalogue_text), catalogue_text, mode, end);
    strcpy(catalogue_text, out);
    write_catalogue(catalogue_text);
}

static char requests[4096];
static int mouse_queue, silent_board;
static const char *size_reply = "80\t25";
static const char *mouse_reply = "M\t1\t8";
static int activations, typed_calls;
static char typed_line[80];
static int activated_entry = -1;

static int answer(const char *text, char *out, int cap)
{
    int n = (int)strlen(text);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, text, (size_t)n);
    out[n] = '\0';
    return n;
}

/* What the real board's replay does to the terminal: the last frame of a wipe ends with SGR 0 and SHOW CURSOR
   (wipe-playback.ts). A logo is plain art; `logo_shows_cursor` lets a test prove the door re-asserts after one too. */
static int logo_shows_cursor;
static int board_holds_cells;                                  /* answers SAVE and RESTORE: the board keeps the cells under an overlay */
static int board(void *ctx, int field, const char *request, char *out, int cap)
{
    (void)ctx;
    out[0] = '\0';
    if (field == AE_FIELD_SCREEN) {
        strcat(requests, request); strcat(requests, "|");
        if (strcmp(request, "WIPE END") == 0) ae_put("\033[0m\033[?25h", 0);
        if (strcmp(request, "SIZE") == 0) return answer(size_reply, out, cap);
        if (strncmp(request, "WIPE", 4) == 0 || strncmp(request, "MOUSE O", 7) == 0) return answer("OK", out, cap);
        if (board_holds_cells && (strncmp(request, "SAVE ", 5) == 0 || strcmp(request, "RESTORE") == 0)) return answer("OK", out, cap);
        if (strcmp(request, "MOUSE?") == 0 && mouse_queue > 0) { mouse_queue--; return answer(mouse_reply, out, cap); }
        return 0;
    }
    if (field == AE_FIELD_THEME) return answer(theme_name, out, cap);
    if (field != AE_FIELD_MENU) return 0;
    strcat(requests, request); strcat(requests, "|");
    if (silent_board) return 0;
    if (strcmp(request, "STYLE?") == 0) return answer("default\tpages", out, cap);
    if (strncmp(request, "STYLE ", 6) == 0) { restyle_catalogue(request + 6); return answer("OK\tpages", out, cap); }
    if (strncmp(request, "STYLE+ ", 7) == 0) {                   /* the board's one cycle: classic, scroll, cover flow */
        const char *shown = request + 7;
        const char *next = strcmp(shown, "scroll") == 0 ? "coverflow" : strcmp(shown, "coverflow") == 0 ? "classic" : "scroll";
        char ok[24];
        restyle_catalogue(next);
        sprintf(ok, "OK\t%s", next);
        return answer(ok, out, cap);
    }
    if (strncmp(request, "OPEN ", 5) == 0) return answer("OK\t" CAT_PATH, out, cap);
    if (strncmp(request, "LOGO ", 5) == 0) { if (logo_shows_cursor) ae_put("\033[0m\033[?25h", 0); return answer("OK\t3", out, cap); }
    if (strncmp(request, "ROW ", 4) == 0 || strncmp(request, "RUN ", 4) == 0) return answer("OK", out, cap);
    return 0;
}

static menudoor_result on_activate(struct menudoor *d, int entry_index)
{
    const ae_menu_entry *e = menudoor_entry(d, entry_index);
    activations++;
    activated_entry = entry_index;
    assert(e);
    ae_menu_run(e->key);
    return MENUDOOR_LEAVE;
}

static menudoor_result on_typed(struct menudoor *d, const char *line)
{
    (void)d;
    typed_calls++;
    strcpy(typed_line, line);
    return MENUDOOR_LEAVE;
}

static const menudoor_spec SPEC = { "MAIN", "MAIN MENU", "BULLS", "Arrows Move  Enter Run  Esc Prompt", "Enter Run  Esc Prompt",
                                    0, on_activate, on_typed, 0 };

static char screen_text[65536];

/* One door run: `keys` on stdin, everything the door wrote captured. Returns the door's exit code. */
static int (*door)(void);
static int run_menu(void) { return menudoor_run(&SPEC, 1); }
static int run_settings(void) { return menudoor_settings_run(1); }
static int run_main(void) { return menudoor_main(&SPEC, "MENUSETTINGS", 1); }
static const menudoor_spec PALETTE_SPEC = { "MAIN", "MAIN MENU", "BULLS", "Arrows Move  Enter Run  Esc Prompt", "Enter Run  Esc Prompt",
                                            0, on_activate, on_typed, "PALETTE" };
static int run_palette(void) { return menudoor_main(&PALETTE_SPEC, "MENUSETTINGS", 1); }

static int drive(const char *keys, size_t key_len)
{
    FILE *f;
    int saved = dup(1), rc;
    size_t got;

    f = fopen("build/test_menudoor_keys.bin", "wb"); assert(f); fwrite(keys, 1, key_len, f); fclose(f);
    requests[0] = '\0'; activations = 0; typed_calls = 0; activated_entry = -1; typed_line[0] = '\0';
    fflush(stdout);
    assert(freopen("build/test_menudoor_screen.bin", "wb", stdout));
    assert(freopen("build/test_menudoor_keys.bin", "rb", stdin));
    rc = door();
    fflush(stdout);
    dup2(saved, 1); close(saved);
    clearerr(stdout);
    f = fopen("build/test_menudoor_screen.bin", "rb"); assert(f);
    got = fread(screen_text, 1, sizeof screen_text - 1, f);
    screen_text[got] = '\0';
    fclose(f);
    return rc;
}

#define DRIVE(s) drive(s, sizeof(s) - 1)

static void a_picked_entry_runs_through_the_whole_shell(void)
{
    write_catalogue(CATALOGUE);
    mouse_queue = 0; silent_board = 0;

    /* Right, Right, Enter: the third entry, MS. */
    assert(DRIVE("\x1b[C\x1b[C\r") == 0);
    assert(strstr(requests, "OPEN MAIN|") == requests);                      /* the very first thing asked */
    assert(strstr(requests, "WIPE IN X|") && strstr(requests, "LOGO header 1 1 3 80|"));
    assert(strstr(requests, "MOUSE ON|"));
    assert(activations == 1 && activated_entry == 2);                        /* the sentinel: the callback RAN */
    assert(strstr(requests, "RUN MS|"));
    assert(strstr(requests, "ROW 2|"));                                      /* on leave */
    assert(strstr(requests, "WIPE OUT V|") && strstr(requests, "MOUSE OFF|"));
    assert(!strstr(screen_text, "MAIN MENU") && strstr(screen_text, "Read Mail") && strstr(screen_text, "Scan for new mail"));   /* the logo replaces the title */
    assert(!strstr(screen_text, "BBS [1:Main] Menu: "));                       /* nothing typed: the hint, not the prompt */
    assert(strstr(screen_text, MENUDOOR_HINT_WIDE));
    assert(strstr(screen_text, "Arrows Move  Enter Run  Esc/q Prompt"));       /* the key bar at 80 columns */
    printf("  [OK] a picked entry runs through the whole shell: open, wipe in, logo, mouse, run, row, wipe out\n");
}

static void a_greyed_entry_cannot_be_chosen_and_a_typed_line_goes_to_the_door(void)
{
    mouse_queue = 0; silent_board = 0;
    /* Down: the first entry of Files, which is greyed. Enter says so. Then type "ms" and Enter. */
    assert(DRIVE("\x1b[B\rms\r") == 0);
    assert(strstr(screen_text, "You cannot choose that."));
    assert(activations == 0);
    assert(typed_calls == 1 && strcmp(typed_line, "ms") == 0);
    assert(strstr(requests, "ROW 2|"));                                      /* type-ahead moved the selection to MS */
    printf("  [OK] a greyed entry cannot be chosen; a typed line goes to the door, type-ahead selects\n");
}

static void hovering_moves_the_real_selection_and_esc_leaves(void)
{
    mouse_queue = 1; silent_board = 0;
    /* Down (entry 3, greyed), the wake byte (a hover at row 6 column 1 = entry 0: no title row above the logo), Esc. */
    assert(DRIVE("\x1b[B\x1e\x1b") == 0);
    assert(activations == 0 && typed_calls == 0);
    assert(strstr(requests, "MOUSE?|"));
    assert(strstr(requests, "ROW 0|"));
    printf("  [OK] a hover moves the real selection; Esc on an empty line leaves\n");
}

static void a_click_selects_and_runs_the_entry_under_it(void)
{
    mouse_queue = 1; silent_board = 0; mouse_reply = "P\t1\t8";
    assert(DRIVE("\x1e") == 0);
    mouse_reply = "M\t1\t8";
    assert(activations == 1 && activated_entry == 0 && strstr(requests, "RUN R|"));
    printf("  [OK] a click selects and runs the entry under it\n");
}

static void forty_columns_get_the_caret_the_short_key_bar_and_one_column(void)
{
    mouse_queue = 0; silent_board = 0; size_reply = "40\t25";
    assert(DRIVE("\x1b") == 0);
    assert(strstr(screen_text, MENUDOOR_HINT_NARROW) && !strstr(screen_text, MENUDOOR_HINT_WIDE));   /* the short hint at 40 */
    assert(strlen(MENUDOOR_HINT_NARROW) <= 39);
    write_catalogue(CATALOGUE_SHORT_PROMPT);
    assert(DRIVE("\x1b") == 0);
    write_catalogue(CATALOGUE);
    size_reply = "80\t25";
    assert(strstr(screen_text, ">>"));                                      /* the caret marks the selection */
    assert(strstr(screen_text, "Enter Run  Esc/q Prompt") && !strstr(screen_text, "Arrows Move"));
    printf("  [OK] 40 columns get the caret and the short key bar\n");
}

static void a_click_on_a_greyed_entry_still_clears_the_typed_line_on_screen(void)
{
    char *last_typed, *after;
    write_catalogue(CATALOGUE);
    mouse_queue = 1; silent_board = 0; mouse_reply = "P\t1\t10";         /* the greyed File Listings */
    assert(DRIVE("x\x1e\x1b") == 0);
    mouse_reply = "M\t1\t8";
    assert(activations == 0 && strstr(screen_text, "You cannot choose that."));
    last_typed = strstr(screen_text, "Menu: x");
    assert(last_typed);
    after = strstr(last_typed + 1, MENUDOOR_HINT_WIDE);                    /* the row went back to the hint, without the x */
    assert(after && after < strstr(screen_text, "You cannot choose that."));   /* before the notice */
    printf("  [OK] a click clears the typed line on screen as well as in the model\n");
}

static void typing_stops_at_what_the_caller_can_see(void)
{
    char keys[64];
    memset(keys, 'a', 40); keys[40] = '\r'; keys[41] = '\0';
    write_catalogue(CATALOGUE_SHORT_PROMPT);
    mouse_queue = 0; silent_board = 0; size_reply = "40\t25";
    assert(drive(keys, 41) == 0);
    assert(typed_calls == 1 && strlen(typed_line) == 40 - 1 - strlen("Go: "));   /* 35, not 40 */
    size_reply = "80\t25";
    write_catalogue(CATALOGUE);
    printf("  [OK] typing stops at the columns the caller can see\n");
}

static void no_screen_draws_outside_its_box_however_short(void)
{
    static const char *sizes[] = { "80\t6", "40\t5", "40\t3", "80\t1" };
    int i;
    write_catalogue(CATALOGUE);
    for (i = 0; i < 4; i++) {
        int rows = atoi(strchr(sizes[i], '\t') + 1), cols = atoi(sizes[i]);
        const char *p;
        size_reply = sizes[i]; mouse_queue = 0;
        assert(DRIVE("\x1b") == 0);
        for (p = screen_text; (p = strstr(p, "\x1b[")) != 0; p += 2) {
            int r = 0, c = 0, n = 0;
            if (sscanf(p + 2, "%d;%d%n", &r, &c, &n) == 2 && p[2 + n] == 'H') {   /* a cursor position */
                if (!(r >= 1 && r <= rows && c >= 1 && c <= cols)) fprintf(stderr, "%s: row %d col %d\n", sizes[i], r, c);
                assert(r >= 1 && r <= rows && c >= 1 && c <= cols);
            }
        }
    }
    size_reply = "80\t25";
    printf("  [OK] no screen draws outside its box however short\n");
}

static void the_settings_screen_asks_without_opening_a_catalogue(void)
{
    mouse_queue = 0; silent_board = 0;
    door = run_settings;
    assert(DRIVE("\x1b[A\r\x1b") == 0);
    door = run_menu;
    assert(strstr(requests, "STYLE?|"));
    assert(!strstr(requests, "OPEN"));
    assert(strstr(requests, "STYLE coverflow|"));                         /* Up from Board default is Cover flow */
    assert(strstr(screen_text, "MENU STYLE") && strstr(screen_text, "Board default (pages)"));
    assert(strstr(screen_text, "Classic screen") && strstr(screen_text, "Grid scroll") && strstr(screen_text, "Cover flow"));
    assert(!strstr(screen_text, "Grid pages"));                           /* Pages was retired (sysop 2026-10-17) */
    printf("  [OK] the settings screen asks STYLE? without opening a catalogue\n");
}

static void a_silent_board_runs_the_fallback_and_draws_nothing(void)
{
    mouse_queue = 0; silent_board = 1;
    assert(DRIVE("") == 0);
    assert(strstr(screen_text, "[ae_return_command] BULLS"));
    assert(!strstr(screen_text, "\x1b[2J"));
    silent_board = 0;
    printf("  [OK] a silent board runs the fallback command and draws nothing\n");
}

/* Cover flow (the board's O line) with the slide on: one section per page, one entry each, so Right is at the edge. */
static const char *CATALOGUE_FLOW =
    "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO coverflow\nF 1\nW -\t-\t-\nR 0\n"
    "S Messages\nE R\tRead Mail\tRead your mail\t\t\n"
    "S Files\nE D\tDownload\tDownload a file\t\t\n"
    "S System\nE G\tGoodbye\tLog off\t\t\n"
    ".\n";

/* Two entries in the first section: Right moves within the grid before it turns the page. */
static const char *CATALOGUE_FLOW_WIDE =
    "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO coverflow\nF 1\nW -\t-\t-\nR 0\n"
    "S Messages\nE R\tRead Mail\tRead your mail\t\t\nE E\tEnter Message\tWrite a message\t\t\n"
    "S Files\nE D\tDownload\tDownload a file\t\t\n"
    ".\n";

static int count_of(const char *haystack, const char *needle);

/* R1: through menudoor_main, Right on a one-column page turns to page 2 with one slide, and the board keeps its row. */
static void cover_flow_turns_a_page_with_right_and_one_slide(void)
{
    write_catalogue(CATALOGUE_FLOW);
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("\x1b[Cq") == 0);
    assert(strstr(requests, "OPEN MAIN|") == requests && !strstr(requests + 1, "OPEN "));
    assert(count_of(requests, "WIPE IN P ") == 1 && strstr(strstr(requests, "WIPE IN P "), " F|"));
    assert(strstr(screen_text, "< 2/3 Files >"));
    assert(strstr(screen_text, "Download"));
    assert(strstr(requests, "ROW 1|"));                                    /* a catalogue row, not a page row */
    /* The position bar on the row above the status bar (colour off here: '#' thumb on a '-' track): a third of 80
       columns, at the left edge on page 1, moved to the middle on page 2. */
    assert(strstr(screen_text, "\x1b[23;1H##########################\x1b[23;27H-"));
    assert(strstr(screen_text, "\x1b[23;28H##########################"));
    assert(DRIVE("\x1b[C\x1b[Dq") == 0);                                  /* Left turns back: the thumb follows */
    {
        const char *back = strstr(screen_text, "< 2/3 Files >");
        assert(back && (back = strstr(back, "< 1/3 Messages >")) != NULL);
        assert(strstr(back, "\x1b[23;1H##########################"));     /* back at the left edge */
    }
    write_catalogue(CATALOGUE);
    printf("  [OK] cover flow: Right turns to page 2/3 with one slide and leaves on the catalogue row\n");
    printf("  [OK] cover flow: the position bar's thumb follows the page, Right and Left\n");
}

/* Tab on an empty line (sysop 2026-10-17): Classic, Scroll, Cover flow, Classic (Pages was retired). The door names the style it
   shows (STYLE+) and the board owns the order; Classic leaves the door so the board draws its own menu screen. */
static void tab_cycles_the_menu_style(void)
{
    const char *at;
    write_catalogue(CATALOGUE_FLOW);
    restyle_catalogue("scroll");
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("\t\t") == 0);                                         /* the second Tab leaves: no q needed */
    at = strstr(requests, "STYLE+ scroll|OPEN MAIN|");
    assert(at && strstr(at, "STYLE+ coverflow|"));
    assert(count_of(requests, "OPEN MAIN|") == 2);                         /* classic opens nothing: the door is gone */
    assert(count_of(requests, "STYLE+ ") == 2);
    assert(!strstr(requests, "STYLE "));                                   /* the door never names a style to store */
    assert(!strstr(requests, "pages") && !strstr(screen_text, "Pages"));   /* the cycle has no Pages */
    at = strstr(screen_text, "< 1/3 Messages >");
    assert(at && strstr(at, "Menu style: Cover flow") != NULL);            /* cover flow's first page, then its notice */
    assert(!strstr(screen_text, "Menu style: Classic"));                   /* the board names Classic, below its screen */
    restyle_catalogue("scroll");                                          /* typed text: Tab keeps the type-ahead match */
    assert(DRIVE("r\t\x1bq") == 0);
    assert(!strstr(requests, "STYLE"));
    write_catalogue(CATALOGUE);
    printf("  [OK] Tab on an empty line asks the board for the next style; Classic leaves the door\n");
}

/* The board's one-off line (N): the prompt's Tab from Classic opens the door, which names the style once. */
static void catalogue_notice_is_said_on_open(void)
{
    char text[2048], *r;
    strcpy(text, CATALOGUE);
    r = strstr(text, "\nR 0\n"); assert(r);
    memmove(r + 5 + 21, r + 5, strlen(r + 5) + 1);
    memcpy(r + 5, "N Menu style: Scroll\n", 21);
    write_catalogue(text);
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("q") == 0);
    assert(strstr(screen_text, "Menu style: Scroll"));
    write_catalogue(CATALOGUE);
    assert(DRIVE("q") == 0);
    assert(!strstr(screen_text, "Menu style:"));
    printf("  [OK] the catalogue's N line is said once as the door opens\n");
}

/* Cover flow is one column (sysop 2026-10-17): Down moves within the page, Right turns it from any row. */
static void cover_flow_is_one_column_and_pages_wrap(void)
{
    write_catalogue(CATALOGUE_FLOW_WIDE);
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("\x1b[Bq") == 0);                                         /* within the column: no turn */
    assert(!strstr(requests, "WIPE IN P ") && strstr(requests, "ROW 1|"));
    assert(DRIVE("\x1b[B\x1b[Cq") == 0);                                   /* Right on the second row turns at once */
    assert(count_of(requests, "WIPE IN P ") == 1 && strstr(screen_text, "< 2/2 Files >"));
    write_catalogue(CATALOGUE_FLOW);
    assert(DRIVE("\x1b[5~q") == 0);                                        /* PageUp from page 1 wraps to the last */
    assert(strstr(screen_text, "< 3/3 System >") && strstr(strstr(requests, "WIPE IN P "), " B|"));
    assert(DRIVE("\x1b[6~\x1b[6~\x1b[6~q") == 0);                           /* three PageDowns come back to page 1 */
    assert(count_of(requests, "WIPE IN P ") == 3 && strstr(requests, "ROW 0|"));
    write_catalogue(CATALOGUE);
    printf("  [OK] cover flow is one column: Down moves, Right turns from any row, PageUp and PageDown wrap\n");
}

/* C7 budgets: a page turn repaints the status row and the grid region once. */
static void a_page_turn_paints_the_region_once(void)
{
    size_t open_only, turn;
    write_catalogue(CATALOGUE_FLOW);
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("q") == 0);
    open_only = strlen(screen_text);
    assert(DRIVE("\x1b[Cq") == 0);
    turn = strlen(screen_text) - open_only;
    assert(turn > 0 && turn <= 2360);
    printf("  [OK] a page turn at 80x25 paints the region once (%zu bytes)\n", turn);
    size_reply = "40\t25";
    assert(DRIVE("q") == 0);
    open_only = strlen(screen_text);
    assert(DRIVE("\x1b[Cq") == 0);
    turn = strlen(screen_text) - open_only;
    assert(turn > 0 && turn < 1300);                                     /* measured 1256 with the position bar */
    assert(!strstr(requests, "WIPE IN P ") && strstr(screen_text, "< 2/3 Files >"));   /* no slide at 40 columns */
    size_reply = "80\t25";
    write_catalogue(CATALOGUE);
    printf("  [OK] a page turn at 40x25 asks for no slide and paints %zu bytes\n", turn);
}

static void cover_flow_without_the_slide_or_with_one_section(void)
{
    char cat[1024];
    strcpy(cat, CATALOGUE_FLOW);
    strstr(cat, "F 1")[2] = '0';
    write_catalogue(cat);
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("\x1b[Cq") == 0);
    assert(strstr(screen_text, "< 2/3 Files >") && !strstr(requests, "WIPE IN P "));
    write_catalogue("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO coverflow\nF 1\nW -\t-\t-\nR 0\n"
                    "S Messages\nE R\tRead Mail\tRead your mail\t\t\nE E\tEnter Message\tWrite a message\t\t\n.\n");
    assert(DRIVE("\x1b[C\x1b[Cq") == 0);                                   /* one section: it scrolls, no pages */
    assert(!strstr(requests, "WIPE IN P ") && !strstr(screen_text, "1/1"));
    write_catalogue(CATALOGUE);
    printf("  [OK] cover flow with the slide off asks for no wipe; one section falls back to scroll\n");
}

static const char *CATALOGUE_WITH_LIST =
    "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO scroll\nW -\t-\t-\nR 0\nS Messages\n"
    "E R\tRead Mail\tRead your mail\t\tL\nE E\tEnter Message\tWrite a message\t\t\n.\n";

static void the_key_bar_says_what_escape_does_at_each_depth(void)
{
    const char *top, *child;
    write_catalogue(CATALOGUE_WITH_LIST);
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("\r\x1bz\r") == 0);              /* Enter opens the list, Esc goes back up, a typed line leaves */
    top = strstr(screen_text, "Esc/q Prompt");
    child = strstr(screen_text, "Esc Back");
    assert(top && child && top < child);            /* the top level leaves to the prompt; the list says Back */
    assert(strstr(child + 1, "Esc/q Prompt"));         /* and the parent's bar is drawn again after Esc */
    assert(strstr(MENUDOOR_CHILD_KEYBAR_NARROW, "Esc Back"));
    write_catalogue(CATALOGUE);
    printf("  [OK] the key bar says Esc leaves at the top and goes back in a list\n");
}

static void a_one_row_terminal_puts_the_settings_status_on_row_one(void)
{
    const char *p;
    mouse_queue = 0; silent_board = 0; size_reply = "80\t1";
    door = run_settings;
    assert(DRIVE("\x1b") == 0);
    door = run_menu;
    size_reply = "80\t25";
    for (p = screen_text; (p = strstr(p, "\x1b[")) != 0; p += 2) {
        int r = 0, c = 0, n = 0;
        if (sscanf(p + 2, "%d;%d%n", &r, &c, &n) == 2 && p[2 + n] == 'H') assert(r >= 1);
    }
    printf("  [OK] a one-row terminal never gets a cursor at row 0 on the settings screen\n");
}

static void one_binary_runs_the_settings_under_its_second_name_and_the_menu_otherwise(void)
{
    write_catalogue(CATALOGUE);
    mouse_queue = 0; silent_board = 0;
    door = run_main;

    invoked_name = "MENUSETTINGS";
    assert(DRIVE("\x1b") == 0);
    assert(strstr(requests, "STYLE?|") && !strstr(requests, "OPEN"));
    assert(strstr(screen_text, "MENU STYLE"));

    invoked_name = "MENU";
    assert(DRIVE("\x1b") == 0);
    assert(strstr(requests, "OPEN MAIN|") && !strstr(screen_text, "MENU STYLE"));

    invoked_name = "";                                /* a board that does not say: the menu, never the settings */
    assert(DRIVE("\x1b") == 0);
    assert(strstr(requests, "OPEN MAIN|") && !strstr(screen_text, "MENU STYLE"));

    door = run_menu;
    printf("  [OK] one binary: settings under its second name, the menu under any other\n");
}

static const char *CATALOGUE_WITH_Q =
    "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO scroll\nW -\t-\t-\nR 0\nS Messages\n"
    "E R\tRead Mail\tRead your mail\t\t\nE Q\tQuiet Node\tQuiet this node\t\t\n.\n";

static void q_on_an_empty_line_leaves_only_when_no_entry_starts_with_q(void)
{
    /* No Q entry: q is the leave key. The keys after it are never read, so nothing is typed. */
    write_catalogue(CATALOGUE);
    mouse_queue = 0; silent_board = 0;
    assert(DRIVE("qR\r") == 0);
    assert(typed_calls == 0 && activations == 0 && !strstr(requests, "RUN"));
    assert(DRIVE("QR\r") == 0 && typed_calls == 0);
    assert(strstr(screen_text, "Esc/q Prompt"));                      /* and the bar says so */

    /* q after another character is plain text. */
    assert(DRIVE("mq\r") == 0);
    assert(typed_calls == 1 && strcmp(typed_line, "mq") == 0);

    /* A Q entry exists: q is a command character, Esc is the only leave, the bar says Esc only. */
    write_catalogue(CATALOGUE_WITH_Q);
    assert(DRIVE("q\r") == 0);
    assert(typed_calls == 1 && strcmp(typed_line, "q") == 0);
    assert(strstr(screen_text, "Esc Prompt") && !strstr(screen_text, "Esc/q"));
    size_reply = "40\t25";
    write_catalogue("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO pages\nW -\t-\t-\nR 0\nS Messages\n"
                    "E Q\tQuiet Node\tQuiet this node\t\t\n.\n");
    assert(DRIVE("\x1b") == 0);
    assert(strstr(screen_text, "Esc Prompt") && !strstr(screen_text, "Esc/q"));
    write_catalogue(CATALOGUE_SHORT_PROMPT);
    assert(DRIVE("\x1b") == 0);
    assert(strstr(screen_text, "Esc/q Prompt"));                      /* the narrow bar too */
    size_reply = "80\t25";
    printf("  [OK] q leaves from an empty line only when no entry starts with q, and the bar agrees\n");
}

static void the_settings_bar_names_q_because_q_leaves(void)
{
    mouse_queue = 0; silent_board = 0;
    door = run_settings;
    assert(DRIVE("q") == 0);                                          /* q ends the screen: the run returns */
    assert(strstr(screen_text, "Esc/q Back"));
    door = run_menu;
    printf("  [OK] the settings bar names q, which leaves\n");
}

/* ------------------------------------------------------- what the screen costs */

/* A board-sized catalogue: three sections, fourteen entries, descriptions. No wipes: the board plays those. */
static char big_catalogue[4096];
static int big_long_label;                                     /* 1: one entry has a 26-character label and a 10-character right column: the grid is one column wide at 80 */
static const char *big_wipes = "-\t-\t-";                         /* the catalogue's W line: open, leave, page */
static const char *big_prompt = "AmiExpress Web BBS [1:Demoscene] Menu (99 mins. left): ";
static int big_header_rows, big_header_cols;                   /* >0: the catalogue carries a header logo of that size */
static int big_row;                                            /* the catalogue's last-selected row ("R n"): where a fresh frame highlights */
static void write_big_catalogue(const char *pages)
{
    static const char *const SECTION[3] = { "Messages", "Files", "Community" };
    static const char *const LABEL[14] = { "Read Mail", "Enter Message", "Mail Scan", "Online Messages", "Zoom Mail",
        "File Listings", "Download", "Upload", "Who is Online", "Live Chat", "Bulletins", "Door Games", "Statistics", "Goodbye" };
    static const char *const KEY[14] = { "R", "E", "MS", "OLM", "ZOOM", "F", "D", "U", "WHO", "LIVECHAT", "B", "DOORS", "STATS", "G" };
    char line[160];
    int i;
    sprintf(big_catalogue, "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP %s\nO ", big_prompt);
    strcat(big_catalogue, pages);
    sprintf(line, "\nW %s\nR %d\n", big_wipes, big_row);
    strcat(big_catalogue, line);
    if (big_header_rows > 0) { sprintf(line, "L header\t%d\t%d\t0\n", big_header_rows, big_header_cols); strcat(big_catalogue, line); }
    for (i = 0; i < 14; i++) {
        const char *label = (big_long_label && i == 13) ? "Goodbye and leave for good" : LABEL[i];
        if (i == 0 || i == 5 || i == 9) { sprintf(line, "S %s\n", SECTION[i == 0 ? 0 : i == 5 ? 1 : 2]); strcat(big_catalogue, line); }
        sprintf(line, "E %s\t%s\tDescription of %s for the caller\t%s\t\n", KEY[i], label, LABEL[i], (big_long_label && i == 13) ? "0123456789" : "");
        strcat(big_catalogue, line);
    }
    strcat(big_catalogue, ".\n");
    write_catalogue(big_catalogue);
}

/* Bytes the door writes for a script of keys, and what ONE more key adds: the run's constant part cancels. */
static long wrote(const char *keys) { assert(drive(keys, strlen(keys)) == 0); return (long)strlen(screen_text); }
static long key_cost(const char *before, const char *key, const char *after)
{
    char a[96], b[96];
    sprintf(a, "%s%s", before, after);
    sprintf(b, "%s%s%s", before, key, after);
    return wrote(b) - wrote(a);
}

static int count_of(const char *haystack, const char *needle)
{
    int n = 0;
    const char *p = haystack;
    while ((p = strstr(p, needle)) != 0) { n++; p += strlen(needle); }
    return n;
}

static void the_first_frame_sends_nothing_twice(void)
{
    long frame80, frame40;
    mouse_queue = 0; silent_board = 0; theme_name = "";
    size_reply = "80\t25"; write_big_catalogue("scroll");
    frame80 = wrote("\x1b");
    assert(count_of(screen_text, "\033[2J") == 2);           /* the frame's clear and the door's closing clear: not a second one per frame */
    assert(frame80 < 2082);                                   /* measured 1892 (was 4673: every row blank-then-written, every bar filled-then-written; 2100 before the tails were erased) */
    size_reply = "40\t25"; write_big_catalogue("pages");
    frame40 = wrote("\x1b");
    assert(count_of(screen_text, "\033[2J") == 2);
    assert(frame40 < 1850);                                   /* was 3597 */
    size_reply = "80\t25";
    printf("  [OK] the first frame sends nothing twice: %ld bytes at 80 columns, %ld at 40\n", frame80, frame40);
}

/* Every cursor address in `text` lies on rows top..last and columns left..right; a bare home (row 1) counts too. */
static int addresses_inside(const char *text, int top, int last, int left, int right)
{
    const char *p = text;
    int row, col, used;
    while ((p = strstr(p, "\033[")) != 0) {
        p += 2;
        if (*p == 'H') return top <= 1 && left <= 1;
        if (sscanf(p, "%d;%d%n", &row, &col, &used) == 2 && p[used] == 'H') {
            if (row < top || row > last || col < left || col > right) return 0;
        }
    }
    return 1;
}

/* Plan K3-K5: the search palette is a box over the board's screen. The board keeps the cells under it (SAVE before the
   first paint), the paint stays inside the box and within its byte budget, and Esc gives the cells back (RESTORE)
   instead of clearing the screen. A board that does not hold the cells gets the old closing clear. */
static void the_palette_is_an_overlay_the_board_gives_back(void)
{
    long paint80, paint40;
    mouse_queue = 0; silent_board = 0; theme_name = ""; board_holds_cells = 1;
    door = run_palette; invoked_name = "PALETTE";

    size_reply = "80\t25"; write_big_catalogue("scroll");
    paint80 = wrote("\x1b");
    assert(strstr(requests, "SAVE 5 11 16 60|"));            /* 60x16 centred at 80x25 */
    assert(strstr(requests, "RESTORE|"));
    assert(strstr(requests, "SAVE") < strstr(requests, "RESTORE"));
    assert(!strstr(screen_text, "\033[2J"));                 /* no clear: not on entry, not on Esc */
    assert(!strstr(screen_text, "\033[K"));                  /* no erase to the end of a row: it would cut through the board's screen */
    assert(addresses_inside(screen_text, 5, 20, 11, 70));
    assert(strstr(screen_text, "Search") && strstr(screen_text, "Type to search the menu") && strstr(screen_text, "14 of 14"));
    assert(strstr(screen_text, "Description of Read Mail"));
    assert(!strstr(screen_text, "SEARCH"));                   /* no masthead title */
    assert(strstr(screen_text, "Messages") && strstr(screen_text, "Messages") < strstr(screen_text, "Read Mail"));   /* entries under their section */
    assert(paint80 <= 2048);                                  /* plan K5; measured 1979 with section headers */

    size_reply = "40\t25"; write_big_catalogue("scroll");
    paint40 = wrote("\x1b");
    assert(strstr(requests, "SAVE 6 2 14 38|") && strstr(requests, "RESTORE|"));
    assert(!strstr(screen_text, "\033[2J") && !strstr(screen_text, "\033[K"));
    assert(addresses_inside(screen_text, 6, 19, 2, 39));
    /* Plan K5's 900 bytes at 40x25 is the PETSCII wire, where each 24-bit pen becomes one colour byte; it is measured
       through the board's transducer in mainmenu-screens.test.ts. This pins the door's ANSI side (measured 1382). */
    assert(paint40 <= 1400);

    size_reply = "80\t25";
    assert(wrote("mail\x15\x1b") > 0);                      /* typed, filtered, cleared (Ctrl-U), then Esc leaves */
    assert(count_of(requests, "RESTORE|") == 1 && !strstr(screen_text, "\033[2J"));
    assert(addresses_inside(screen_text, 5, 20, 11, 70) && !strstr(screen_text, "\033[K"));     /* the filter repaints stay in the box */

    {   /* Left/Right in the palette turn a page like PageUp/PageDown, never one row like Up/Down */
        static char right[65536], pgdn[65536], down[65536], back[65536], pgup[65536];
        wrote("\x1b[C\x1b"); strcpy(right, screen_text);
        wrote("\x1b[6~\x1b"); strcpy(pgdn, screen_text);
        wrote("\x1b[B\x1b"); strcpy(down, screen_text);
        wrote("\x1b[C\x1b[D\x1b"); strcpy(back, screen_text);
        wrote("\x1b[6~\x1b[5~\x1b"); strcpy(pgup, screen_text);
        assert(strcmp(right, pgdn) == 0 && strcmp(right, down) != 0 && strcmp(back, pgup) == 0);
    }

    wrote("live\x1b");
    {   /* A flush sends changed cells only, in row order: the field row, then the grid below it. After "l" every entry
           still matches, LIVECHAT best (its key starts with L): its section leads, the others follow in catalogue order. */
        static char plain[65536], grid[65536];
        const char *s, *from, *to;
        char *o = plain;
        for (s = screen_text; *s; s++) {                      /* colours off: the prompt and the typed text differ in ink */
            if (*s == '\033' && s[1] == '[' && strchr(s + 2, 'm') && strspn(s + 2, "0123456789;") == (size_t)(strchr(s + 2, 'm') - (s + 2))) { s = strchr(s + 2, 'm'); continue; }
            *o++ = *s;
        }
        *o = 0;
        from = strstr(plain, "Search: l"); to = from ? strstr(from, "Search: li") : 0;
        assert(from && to);
        memcpy(grid, from, (size_t)(to - from)); grid[to - from] = 0;
        assert(strstr(grid, "Community") && strstr(grid, "Messages") && strstr(grid, "Files"));
        assert(strstr(grid, "Community") < strstr(grid, "Live Chat") && strstr(grid, "Live Chat") < strstr(grid, "Messages"));
        assert(strstr(grid, "Messages") < strstr(grid, "Files"));
    }

    board_holds_cells = 0;                                    /* a board that keeps nothing: the door closes with a clear */
    assert(wrote("\x1b") > 0);
    assert(strstr(screen_text, "\033[2J"));

    door = run_menu; invoked_name = "";
    printf("  [OK] the palette is an overlay the board gives back: first paint %ld bytes at 80 columns, %ld at 40\n", paint80, paint40);
}

static void a_key_repaints_two_cells_and_the_description_only(void)
{
    long down80, up80, down40;
    mouse_queue = 0; silent_board = 0; theme_name = "";
    size_reply = "80\t25"; write_big_catalogue("scroll");
    down80 = key_cost("", "\x1b[B", "\x1b");
    up80 = key_cost("\x1b[B", "\x1b[A", "\x1b");
    assert(down80 > 0 && down80 <= 256);                      /* was 406 */
    assert(up80 > 0 && up80 <= 256);
    assert(strstr(screen_text, "Description of Read Mail for the caller"));     /* the status row followed the selection back */
    size_reply = "40\t25"; write_big_catalogue("pages");
    down40 = key_cost("", "\x1b[B", "\x1b");
    assert(down40 > 0 && down40 <= 230);                      /* was 311 */
    size_reply = "80\t25";
    printf("  [OK] a key repaints two cells and the description: down %ld, up %ld bytes at 80 columns, down %ld at 40\n", down80, up80, down40);
}

static void nothing_is_sent_when_nothing_changed(void)
{
    char downs[64];
    int i;
    mouse_queue = 0; silent_board = 0; theme_name = "";
    size_reply = "80\t25"; write_big_catalogue("scroll");
    assert(key_cost("", "\x1b[A", "\x1b") == 0);               /* Up on the first entry */
    for (i = 0; i < 13; i++) memcpy(downs + i * 3, "\x1b[B", 3);
    downs[39] = '\0';
    assert(key_cost(downs, "\x1b[B", "\x1b") == 0);            /* Down on the last */
    assert(key_cost("", "\x1b[D", "\x1b") == 0);               /* Left in a one-column grid */
    printf("  [OK] a key that moves nothing sends nothing\n");
}

/* The bytes a real board delivers for Page Down / Page Up / Home / End (it converts them like the
 * arrows) must turn the page exactly as the escape sequences do: the page keys were dead on the
 * live board because the board dropped them. */
static void the_boards_page_bytes_turn_the_page(void)
{
    long esc, board;
    mouse_queue = 0; silent_board = 0; theme_name = "";
    size_reply = "80\t25"; write_big_catalogue("scroll");
    esc = key_cost("", "\x1b[6~", "\x1b");
    board = key_cost("", "\x19", "\x1b");
    assert(esc > 0);
    assert(board == esc);
    esc = key_cost("\x1b[6~", "\x1b[5~", "\x1b");
    board = key_cost("\x19", "\x1f", "\x1b");
    assert(esc > 0 && board == esc);
    esc = key_cost("", "\x1b[F", "\x1b");
    board = key_cost("", "\x1d", "\x1b");
    assert(esc > 0 && board == esc);
    esc = key_cost("\x1b[F", "\x1b[H", "\x1b");
    board = key_cost("\x1d", "\x1c", "\x1b");
    assert(esc > 0 && board == esc);
    printf("  [OK] the board's page bytes turn the page like the escape sequences\n");
}

static void a_typed_character_costs_the_character_not_the_row(void)
{
    long second;
    mouse_queue = 0; silent_board = 0; theme_name = "";
    size_reply = "80\t25"; write_big_catalogue("scroll");
    second = key_cost("x", "y", "\x1b");                       /* no entry starts with x or xy: the highlight stays */
    assert(second > 0 && second <= 30);                        /* was a 200-byte row */
    printf("  [OK] a second typed character costs %ld bytes, not the row\n", second);
}

/* The last write to the prompt row, before the door's closing clear. */
static const char *last_prompt_row(void)
{
    const char *close = 0, *q = screen_text, *row = 0;
    while ((q = strstr(q, "\033[0m\033[2J\033[H")) != 0) { close = q; q++; }
    static char cut[1024];
    size_t n;
    for (q = screen_text; (q = strstr(q, "\033[25;1H")) != 0; q++) if (!close || q < close) row = q;
    if (!row) return 0;
    n = close ? (size_t)(close - row) : strlen(row);           /* up to the door's closing clear, which shows the cursor again */
    if (n >= sizeof cut) n = sizeof cut - 1;
    memcpy(cut, row, n); cut[n] = '\0';
    return cut;
}

static void the_idle_tick_touches_the_masthead_rail_only(void)
{
    const char *tick = 0, *q;
    char one[512];
    mouse_queue = 0; silent_board = 0; size_reply = "80\t25";
    write_big_catalogue("scroll");
    theme_name = "uprough-neon";                               /* a theme with a rail */
    wrote("\x1b[B");                                           /* the script ends, the door idles once, the line drops */
    for (q = screen_text; (q = strstr(q, "\0337")) != 0; q++) tick = q;
    assert(tick);                                              /* the sentinel: the idle hook RAN */
    {
        const char *end = strstr(tick, "\0338");
        size_t n;
        assert(end);
        n = (size_t)(end + 2 - tick);
        assert(n < 120 && n < sizeof one);                     /* the rail run, a few dozen bytes: it was never the grid */
        memcpy(one, tick, n); one[n] = '\0';
        for (q = one; (q = strstr(q, "\033[")) != 0; q += 2) {
            int r = 0, c = 0;
            if (sscanf(q + 2, "%d;%d", &r, &c) == 2) assert(r == 1);          /* every cursor move is on the masthead row */
        }
        assert(!strstr(one, "Read Mail") && !strstr(one, "Description"));
    }
    size_reply = "40\t25";                                     /* no effects at 40 columns: no tick at all */
    write_big_catalogue("pages");
    wrote("\x1b[B");
    assert(!strstr(screen_text, "\0337"));
    size_reply = "80\t25"; theme_name = "";
    /* Every theme has a rail since classic was removed (sysop, 2026-10-17),
       and "" now resolves to the default, Uprough Neon - so even a board
       with no themes animates. */
    printf("  [OK] the idle tick touches the masthead rail only, and not at all at 40 columns\n");
}

static void the_prompt_row_is_a_hint_until_something_is_typed(void)
{
    const char *row;
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    write_catalogue(CATALOGUE);

    /* Navigation: the hint, the key bar, no prompt, cursor hidden and not shown again after the row. */
    wrote("\x1b[B");
    row = last_prompt_row();
    assert(row && strstr(row, MENUDOOR_HINT_WIDE) && strstr(row, "Esc/q Prompt"));
    assert(!strstr(row, "BBS [1:Main] Menu: "));
    {   /* the board's wipe replay shows the cursor behind the door; the LAST word on it is the door's hide */
        const char *q, *last_hide = 0, *last_show = 0;
        for (q = row; (q = strstr(q, "\033[?25")) != 0; q += 2) { if (q[5] == 'l') last_hide = q; else last_show = q; }
        assert(last_hide && (!last_show || last_show < last_hide));
    }

    /* Typing: the first printable character makes the row the prompt, with the typed text, the typing bar, the cursor. */
    wrote("m");
    row = last_prompt_row();
    assert(row && strstr(row, "BBS [1:Main] Menu: m") && !strstr(row, MENUDOOR_HINT_WIDE));
    assert(strstr(row, "Enter Run  Tab Show  Esc Clear") && !strstr(row, "Esc/q"));      /* the bar is true for THIS mode: q is text now */
    assert(strstr(row, "\033[?25h"));
    printf("  [OK] the prompt row is a hint with a hidden cursor until a character is typed, then the prompt with the cursor\n");
}

static void esc_clears_the_line_and_only_an_empty_line_leaves(void)
{
    const char *row;
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    write_catalogue(CATALOGUE);

    assert(DRIVE("m\x1b") == 0);                               /* type-ahead moved to MS; Esc clears the line */
    assert(!strstr(requests, "ROW"));                          /* the door did NOT leave (ROW is asked on leaving only) */
    row = last_prompt_row();
    assert(row && strstr(row, MENUDOOR_HINT_WIDE) && strstr(row, "\033[?25l") && !strstr(row, "Menu: m"));

    assert(DRIVE("m\x08\x1b") == 0);                           /* the line is empty again (two Esc bytes in one script read as one key): Esc leaves */
    assert(strstr(requests, "ROW 2|"));                        /* with the type-ahead's highlight kept */

    assert(DRIVE("ms\x1b\r") == 0);                            /* Esc dropped the text; Enter now runs the highlighted entry */
    assert(typed_calls == 0 && activations == 1 && activated_entry == 2);

    assert(DRIVE("ms\r") == 0);                                /* Enter with text runs the text */
    assert(typed_calls == 1 && strcmp(typed_line, "ms") == 0 && activations == 0);

    printf("  [OK] Esc clears the typed line and returns to navigation; only Esc on an empty line leaves\n");
}

static void backspacing_to_an_empty_line_returns_to_the_hint(void)
{
    const char *row;
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    write_catalogue(CATALOGUE);
    wrote("m\x08");
    row = last_prompt_row();
    assert(row && strstr(row, MENUDOOR_HINT_WIDE) && strstr(row, "\033[?25l"));
    printf("  [OK] backspacing the last character returns the row to the hint\n");
}

static void the_row_text_fits_forty_columns_in_both_states(void)
{
    const char *row;
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "40\t25";
    write_catalogue(CATALOGUE_SHORT_PROMPT);
    wrote("\x1b[B");
    row = last_prompt_row();
    assert(row && strstr(row, MENUDOOR_HINT_NARROW) && strstr(row, "Enter Run  Esc/q Prompt"));
    assert(strlen(MENUDOOR_HINT_NARROW) + 2 + strlen("Enter Run  Esc/q Prompt") <= 39);     /* hint and bar share 39 columns */
    wrote("r");
    row = last_prompt_row();
    assert(row && strstr(row, "Go: r") && strstr(row, "Esc Clear") && strstr(row, "\033[?25h"));
    size_reply = "80\t25";
    printf("  [OK] the row text fits 39 columns in both states at 40 columns\n");
}


/* ------------------------------------------- a small terminal, to read what the bytes LEAVE on the glass */

#define TM_ROWS 25
#define TM_COLS 132
/* The attributes a cell was painted with: what two screens must agree on to look the same. */
typedef struct { long fg, bg; int bold, rev; } tm_pen;
static char tm_cell[TM_ROWS + 1][TM_COLS + 2];
static tm_pen tm_att[TM_ROWS + 1][TM_COLS + 1];
static tm_pen tm_cur, tm_saved_pen;
static int tm_row, tm_col, tm_saved_row, tm_saved_col, tm_addresses, tm_erases;
static int tm_cursor = 1;                                      /* ESC[?25h / ESC[?25l: a terminal starts with its cursor shown */

static void tm_clear(void)
{
    int r, c;
    for (r = 0; r <= TM_ROWS; r++) {
        memset(tm_cell[r], ' ', TM_COLS); tm_cell[r][TM_COLS] = '\0';
        for (c = 0; c <= TM_COLS; c++) tm_att[r][c] = tm_cur;     /* a clear erases in the colours in force */
    }
    tm_row = 1; tm_col = 1; tm_addresses = 0;
}

/* SGR: only what the door uses - reset, bold, reverse, default fg/bg, 16/256/true colours. */
static void tm_sgr(const int *p, int n)
{
    int i;
    if (n == 0) { memset(&tm_cur, 0, sizeof tm_cur); return; }
    for (i = 0; i < n; i++) {
        int v = p[i];
        if (v == 0) memset(&tm_cur, 0, sizeof tm_cur);
        else if (v == 1) tm_cur.bold = 1;
        else if (v == 22) tm_cur.bold = 0;
        else if (v == 7) tm_cur.rev = 1;
        else if (v == 27) tm_cur.rev = 0;
        else if (v == 39) tm_cur.fg = 0;
        else if (v == 49) tm_cur.bg = 0;
        else if ((v == 38 || v == 48) && i + 4 < n && p[i + 1] == 2) {
            long rgb = 0x1000000L | ((long)p[i + 2] << 16) | ((long)p[i + 3] << 8) | p[i + 4];
            if (v == 38) tm_cur.fg = rgb; else tm_cur.bg = rgb;
            i += 4;
        } else if ((v == 38 || v == 48) && i + 2 < n && p[i + 1] == 5) {
            if (v == 38) tm_cur.fg = 0x2000000L + p[i + 2]; else tm_cur.bg = 0x2000000L + p[i + 2];
            i += 2;
        } else if ((v >= 30 && v <= 37) || (v >= 90 && v <= 97)) tm_cur.fg = 0x3000000L + v;
        else if ((v >= 40 && v <= 47) || (v >= 100 && v <= 107)) tm_cur.bg = 0x3000000L + v;
    }
}

/* Plays bytes [from, to) of `text`: cursor addressing, save/restore, clear, erase-to-end-of-line, colours, printable characters. */
static void tm_play(const char *text, const char *to)
{
    const char *p = text;
    while (p < to) {
        if (*p == '\033' && p[1] == '7') { tm_saved_row = tm_row; tm_saved_col = tm_col; tm_saved_pen = tm_cur; p += 2; }
        else if (*p == '\033' && p[1] == '8') { tm_row = tm_saved_row; tm_col = tm_saved_col; tm_cur = tm_saved_pen; p += 2; }
        else if (*p == '\033' && p[1] == '[') {
            const char *q = p + 2;
            int args[16], n = 0, have = 0, priv = 0;
            if (*q == '?') { priv = 1; q++; }
            args[0] = 0;
            while ((*q >= '0' && *q <= '9') || *q == ';') {
                if (*q == ';') { if (n < 15) n++; args[n] = 0; have = 1; }
                else { args[n] = args[n] * 10 + (*q - '0'); have = 1; }
                q++;
            }
            n = have ? n + 1 : 0;
            if (priv && (*q == 'h' || *q == 'l') && n > 0 && args[0] == 25) tm_cursor = *q == 'h';
            if (!priv && *q == 'H') { tm_row = n > 0 && args[0] ? args[0] : 1; tm_col = n > 1 && args[1] ? args[1] : 1; tm_addresses++; }
            else if (!priv && *q == 'J' && n > 0 && args[0] == 2) { int r = tm_row, c = tm_col, a = tm_addresses; tm_clear(); tm_row = r; tm_col = c; tm_addresses = a; }
            else if (!priv && *q == 'K' && (n == 0 || args[0] == 0)) {                /* EL: cursor to the end of the row, in the CURRENT colours */
                int c;
                tm_erases++;
                for (c = tm_col; c <= TM_COLS; c++) if (tm_row >= 1 && tm_row <= TM_ROWS) { tm_cell[tm_row][c - 1] = ' '; tm_att[tm_row][c - 1] = tm_cur; tm_att[tm_row][c - 1].fg = 0; }
            }
            else if (!priv && *q == 'm') tm_sgr(args, n);
            p = *q ? q + 1 : q;
        } else {
            if ((unsigned char)*p >= 32 && tm_row >= 1 && tm_row <= TM_ROWS && tm_col >= 1 && tm_col <= TM_COLS) {
                tm_cell[tm_row][tm_col - 1] = *p;
                tm_att[tm_row][tm_col - 1] = tm_cur;
            }
            tm_col++; p++;
        }
    }
}

/* The door's closing clear (and the cursor it shows again) is not part of the picture a caller was looking at. */
static const char *closing_clear(void)
{
    const char *close = 0, *q = screen_text;
    while ((q = strstr(q, "\033[0m\033[2J\033[H")) != 0) { close = q; q++; }
    return close ? close : screen_text + strlen(screen_text);
}

static void tm_after(const char *keys)
{
    wrote(keys);
    memset(&tm_cur, 0, sizeof tm_cur);
    tm_clear();
    tm_cursor = 1;
    tm_erases = 0;
    tm_play(screen_text, closing_clear());
}

/* The masthead rail animates on idle ticks under every theme the board offers (the default Uprough Neon included),
   and the tick lands between keys. It is chrome on a timer, not what the key cost: each tick is one
   save-cursor ... restore-cursor run, so those runs are cut before a key's bytes are measured. */
static void drop_rail_ticks(char *text)
{
    char *open_mark;
    while ((open_mark = strstr(text, "\0337")) != 0) {
        char *close_mark = strstr(open_mark + 2, "\0338");
        if (!close_mark) break;
        memmove(open_mark, close_mark + 2, strlen(close_mark + 2) + 1);
    }
}

/* What ONE key adds to the stream: the bytes between the common start and the common end of the two runs. */
static char delta_text[4096];
static void key_bytes(const char *before, const char *key, const char *after)
{
    static char a[65536];
    char ka[96], kb[96];
    size_t i = 0, la, lb;
    sprintf(ka, "%s%s", before, after);
    sprintf(kb, "%s%s%s", before, key, after);
    wrote(ka); strcpy(a, screen_text); la = strlen(a);
    wrote(kb); lb = strlen(screen_text);
    while (i < la && a[i] == screen_text[i]) i++;
    assert(lb >= la && lb - la < sizeof delta_text);
    memcpy(delta_text, screen_text + i, lb - la); delta_text[lb - la] = '\0';
    drop_rail_ticks(delta_text);
}

static int addresses_in(const char *bytes)
{
    int n = 0;
    const char *p = bytes;
    while ((p = strstr(p, "\033[")) != 0) {
        const char *q = p + 2;
        while ((*q >= '0' && *q <= '9') || *q == ';') q++;
        if (*q == 'H' && q > p + 2) n++;
        p += 2;
    }
    return n;
}

static const char *CATALOGUE_DESCRIPTIONS =
    "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO scroll\nW -\t-\t-\nR 0\nS Messages\n"
    "E R\tRead\tA very long description of the first entry, which is long\t\t\n"
    "E E\tEnter\tShort\t\t\n"
    "E M\tMail\tShort\t\t\n"
    ".\n";

static void an_identical_description_is_not_sent_again(void)
{
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    write_catalogue(CATALOGUE_DESCRIPTIONS);
    key_bytes("\x1b[C", "\x1b[C", "\x1b");                      /* Enter -> Mail: both say "Short" */
    assert(addresses_in(delta_text) == 2);                     /* the two cells, and NOT the status row */
    assert(!strstr(delta_text, "\033[24;"));
    printf("  [OK] an identical description is not sent again\n");
}

static void a_shorter_description_leaves_no_tail_of_the_longer_one(void)
{
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    write_catalogue(CATALOGUE_DESCRIPTIONS);
    tm_after("\x1b[C");                                         /* long -> Short */
    assert(strncmp(&tm_cell[24][0], " Short", 6) == 0);
    assert(strspn(&tm_cell[24][6], " ") >= (size_t)(80 - 6));  /* nothing of the long text remains, on 80 columns */
    tm_after("\x1b[C\x1b[D");                                   /* and back to the long one, then it is all there */
    assert(strncmp(&tm_cell[24][0], " A very long description of the first entry, which is long", 58) == 0);
    tm_after("\x1b[C\x1b[D\x1b[C");
    assert(strncmp(&tm_cell[24][0], " Short", 6) == 0 && strspn(&tm_cell[24][6], " ") >= (size_t)(80 - 6));
    printf("  [OK] a shorter description leaves no tail of the longer one on the glass\n");
}

static void backspacing_leaves_no_stale_character_on_the_prompt_row(void)
{
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    write_catalogue(CATALOGUE_SHORT_PROMPT);
    tm_after("xy\x08");
    assert(strncmp(&tm_cell[25][0], "Go: x", 5) == 0);
    assert(tm_cell[25][5] == ' ' && tm_cell[25][6] == ' ');      /* the y is gone, not painted over */
    printf("  [OK] backspace leaves no stale character on the prompt row\n");
}

static void a_cell_is_one_cursor_move_and_one_run(void)
{
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    write_big_catalogue("scroll");
    key_bytes("", "\x1b[B", "\x1b");
    assert(addresses_in(delta_text) == 3);                     /* the old cell, the new cell, the status row: one move each */
    printf("  [OK] a changed cell is one cursor move and one run\n");
}

static void every_idle_tick_stays_on_the_masthead_row(void)
{
    static const char *const SCRIPTS[3] = { "\x1b[B", "\x1b[B\x1b[B", "x" };
    int i, ticks = 0;
    mouse_queue = 0; silent_board = 0; size_reply = "80\t25"; theme_name = "uprough-neon";
    write_big_catalogue("scroll");
    for (i = 0; i < 3; i++) {
        const char *p, *stop;
        wrote(SCRIPTS[i]);
        stop = closing_clear();
        for (p = screen_text; (p = strstr(p, "\0337")) != 0 && p < stop; p++) {
            const char *end = strstr(p, "\0338"), *q;
            assert(end && end < stop);
            for (q = p; q < end; q++) {
                int r = 0, c = 0, n = 0;
                if (q[0] == '\033' && q[1] == '[' && sscanf(q + 2, "%d;%d%n", &r, &c, &n) == 2 && q[2 + n] == 'H') assert(r == 1);
            }
            ticks++;
        }
    }
    assert(ticks >= 3);                                          /* the sentinel: three ticks ran, each checked */
    theme_name = "";
    printf("  [OK] every idle tick (%d of them, one per script) addresses the masthead row only\n", ticks);
}

static void a_long_board_prompt_is_clipped_once_for_drawing_parking_and_room(void)
{
    char prompt100[101], cat[512], keys[32];
    const char *row;
    int i;
    for (i = 0; i < 100; i++) prompt100[i] = 'p';
    prompt100[100] = '\0';
    sprintf(cat, "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP %s\nO scroll\nW -\t-\t-\nR 0\nS Messages\nE R\tRead\tRead\t\t\n.\n", prompt100);
    write_catalogue(cat);
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    wrote("a");
    row = last_prompt_row();
    assert(row && strstr(row, "\033[25;74H"));                   /* 72 shown + 1 typed: the cursor is after the 'a' the caller sees */
    memset(keys, 'a', 20); keys[20] = '\r'; keys[21] = '\0';
    assert(drive(keys, 21) == 0);
    assert(typed_calls == 1 && strlen(typed_line) == 79 - 72);   /* seven columns are left after the clipped prompt */
    write_catalogue(CATALOGUE);
    printf("  [OK] a 100-character board prompt is clipped once: drawing, cursor and typing room agree\n");
}

/* ---- plan M15 follow-ups: the cell tail is ERASED, and the screen is the same screen -------------------------- */

/* Runs of 20 or more spaces: what a blank tail looks like on the wire. */
static int long_space_runs(const char *s)
{
    int n = 0, run = 0;
    for (;; s++) {
        if (*s == ' ') run++;
        else { if (run >= 20) n++; run = 0; if (!*s) break; }
    }
    return n;
}

static void a_cell_tail_is_erased_to_the_end_of_the_line_not_written_as_spaces(void)
{
    mouse_queue = 0; silent_board = 0; theme_name = ""; big_row = 0; big_long_label = 1;
    size_reply = "80\t25"; write_big_catalogue("scroll");
    key_bytes("", "\x1b[B", "\x1b");
    assert(strstr(delta_text, "\033[K"));                      /* the sentinel: the erase ran */
    assert(long_space_runs(delta_text) <= 1);                  /* the selection bar is painted whole; the cell it left is not: a 55-space tail twice per key is what this replaced */
    size_reply = "40\t25"; write_big_catalogue("pages");      /* a C64 cannot erase in a colour: it keeps the spaces it always sent */
    key_bytes("", "\x1b[B", "\x1b");
    assert(!strstr(delta_text, "\033[K"));
    size_reply = "80\t25"; big_long_label = 0;
    printf("  [OK] a cell's tail is erased to the end of the line at 80 columns, and still spaces at 40\n");
}

/* The whole screen as a caller sees it: glyph and the attributes that show (a blank shows its background and reverse only). */
typedef struct { char ch[TM_ROWS + 1][TM_COLS + 2]; tm_pen att[TM_ROWS + 1][TM_COLS + 1]; } tm_shot;
static tm_shot shot_a, shot_b;
static void tm_snap(tm_shot *to, int cols)
{
    int r, c;
    memset(to, 0, sizeof *to);
    for (r = 1; r <= TM_ROWS; r++) for (c = 0; c < cols; c++) {
        to->ch[r][c] = tm_cell[r][c];
        to->att[r][c] = tm_att[r][c];
        if (tm_cell[r][c] == ' ') { to->att[r][c].fg = 0; to->att[r][c].bold = 0; if (!to->att[r][c].rev) to->att[r][c].fg = 0; }
    }
}
/* Row 1 is the masthead, whose rail animates on every idle tick: every theme
   has a rail since classic was removed (2026-10-17), so it is never the same
   frame twice and is not what these comparisons are about. */
static int tm_first_difference(int cols)
{
    int r, c;
    for (r = 2; r <= TM_ROWS; r++) for (c = 0; c < cols; c++)
        if (shot_a.ch[r][c] != shot_b.ch[r][c] || memcmp(&shot_a.att[r][c], &shot_b.att[r][c], sizeof(tm_pen)) != 0) return r * 1000 + c + 1;
    return 0;
}

/* `keys` on a catalogue that starts on row 0 must leave exactly the screen a fresh frame shows for the entry the keys land on. */
static void same_screen_as_a_fresh_frame(const char *pages, const char *size, int rows, const char *keys, int lands_on)
{
    int cols = strcmp(size, "40\t25") == 0 ? 40 : 80, diff;
    char size_text[16];
    sprintf(size_text, "%d\t%d", cols, rows);
    size_reply = size_text; big_row = 0; write_big_catalogue(pages);
    tm_after(keys); tm_snap(&shot_a, cols);
    big_row = lands_on; write_big_catalogue(pages);
    tm_after("\x1b"); tm_snap(&shot_b, cols);
    big_row = 0;
    diff = tm_first_difference(cols);
    if (diff) printf("  screens differ at row %d col %d after keys of length %d (%dx%d)\n", diff / 1000, diff % 1000, (int)strlen(keys), cols, rows);
    assert(diff == 0);
    size_reply = "80\t25";
}

static void a_moved_selection_leaves_the_screen_a_fresh_frame_would_show(void)
{
    const char *R, *L;
    char to_the_first_scroll[64], mix[64];   /* to_the_first_scroll: the keys that scroll the short screen once (its name is old) */
    int one_column, i;
    mouse_queue = 0; silent_board = 0; theme_name = "";
    for (one_column = 0; one_column < 2; one_column++) {          /* a grid of several columns (the last cell of a line erases) and of one (the whole row does) */
        big_long_label = one_column;
        /* In a one-column Scroll list Left/Right page (sysop 2026-10-17): one entry is Down/Up there. */
        R = one_column ? "\x1b[B" : "\x1b[C"; L = one_column ? "\x1b[A" : "\x1b[D";
        to_the_first_scroll[0] = '\0'; for (i = 0; i < 6; i++) strcat(to_the_first_scroll, R);
        strcpy(mix, R); strcat(mix, R); strcat(mix, R); strcat(mix, L);
        same_screen_as_a_fresh_frame("scroll", "80\t25", 25, R, 1);
        same_screen_as_a_fresh_frame("scroll", "80\t25", 25, mix, 2);
        if (one_column) same_screen_as_a_fresh_frame("scroll", "80\t25", 25, "\x1b[B\x1b[B\x1b[A", 1);   /* Down walks a row: one entry in a one-column grid */
        same_screen_as_a_fresh_frame("scroll", "80\t12", 12, to_the_first_scroll, 6);
        if (one_column) assert(strstr(shot_a.ch[2], "Read Mail") && strstr(shot_a.ch[9], "Download"));   /* the sentinel: the window scrolled ONE row (the Messages header left), Download sits on the last row */              /* a short screen scrolls ONCE: the window moves, and lands where a fresh frame puts it */
    }
    big_long_label = 0;
    same_screen_as_a_fresh_frame("pages", "40\t25", 25, "\x1b[B\x1b[B\x1b[A", 1);
    printf("  [OK] a moved selection leaves the same screen a fresh frame shows (glyphs and colours), at 80 columns in one and several columns, scrolled, and at 40\n");
}

/* ---- plan M15 follow-up 5: a typed character costs the character, a jump costs only the cells (or window) it changes ---- */

/* True when every cursor address in `bytes` is on row `a` or row `b`. */
static int addresses_only_on(const char *bytes, int a, int b)
{
    const char *p = bytes;
    while ((p = strstr(p, "\033[")) != 0) {
        int r = 0, c = 0, n = 0;
        if (sscanf(p + 2, "%d;%d%n", &r, &c, &n) == 2 && p[2 + n] == 'H' && r != a && r != b) return 0;
        p += 2;
    }
    return 1;
}
static int has(const char *haystack, const char *needle) { return strstr(haystack, needle) != 0; }
/* a measured cost against its bound; the number is printed when it is over, so a bound is never guessed */
#define AT_MOST(what, got, bound) do { if ((got) > (bound)) printf("  %s: %ld bytes, bound %d\n", what, (long)(got), (bound)); assert((got) <= (bound)); } while (0)

/* Typing "wh" then "o": WHO is on the first window of the one-column grid; "d" jumps to Download, which is past a 12-row window. */
static void typing_costs_the_character_and_a_jump_costs_what_it_changes(void)
{
    long same_match, first_on_window, jump_scrolls, back_to_hint, one_more, bar_goes;
    mouse_queue = 0; silent_board = 0; theme_name = ""; big_long_label = 1; big_row = 0;
    size_reply = "80\t25"; write_big_catalogue("scroll");

    key_bytes("", "w", "\x1b");                                  /* first character: prompt row + old cell + new cell + status */
    first_on_window = (long)strlen(delta_text);
    assert(!has(delta_text, "\033[2J"));
    AT_MOST("first character", first_on_window, 625);

    key_bytes("w", "h", "\x1b");                                  /* WHO still: the highlight did not move */
    same_match = (long)strlen(delta_text);
    assert(addresses_in(delta_text) <= 2);                       /* the typed text, then the cursor parked - no cell, no status */
    assert(!has(delta_text, "\033[24;") && !has(delta_text, "\033[?25"));
    AT_MOST("same match", same_match, 20);

    back_to_hint = key_cost("w", "\x08", "");                    /* back to an empty line: the hint row, the highlight stays */
    AT_MOST("back to the hint", back_to_hint, 165);

    size_reply = "80\t12"; write_big_catalogue("scroll");        /* a short window: Download is off it */
    key_bytes("", "d", "");                                        /* off the window: named in the status row, nothing scrolls */
    assert(addresses_only_on(delta_text, 11, 12));
    key_bytes("d", "\t", "");                                       /* Tab: the one window rewrite */
    jump_scrolls = (long)strlen(delta_text);
    assert(!has(delta_text, "\033[2J"));                         /* no clear between: the window is written over itself */
    assert(!has(delta_text, "\033[?25l\033[?25h"));
    AT_MOST("Tab past the window", jump_scrolls, 1160);

    size_reply = "80\t25"; write_big_catalogue("scroll");
    key_bytes("wh", "o", "\x1b");
    one_more = (long)strlen(delta_text);
    key_bytes("who", "x", "\x1b");                               /* the 4th character: the typing key bar has no room left and goes */
    bar_goes = (long)strlen(delta_text);
    assert(has(delta_text, "\033[K"));                           /* the typed text and an erase over the bar, not the row again */
    AT_MOST("the key bar going away", bar_goes, 26);
    tm_after("whox");
    assert(strncmp(&tm_cell[25][strlen(big_prompt)], "whox", 4) == 0 && !strstr(tm_cell[25], "Esc Clear"));
    AT_MOST("a further character", one_more, 24);

    size_reply = "80\t25";
    big_long_label = 0;
    printf("  [OK] typing at 80 columns: first character %ld, same match %ld, back to the hint %ld, Tab past the window %ld bytes\n",
           first_on_window, same_match, back_to_hint, jump_scrolls);

    /* 40 columns: the same rules on the C64's grid (pages, caret, no erase). */
    size_reply = "40\t25"; big_prompt = "Go: "; write_big_catalogue("pages");   /* a 40-column row cannot hold the board's long prompt AND typing */
    key_bytes("", "w", "\x1b");
    first_on_window = (long)strlen(delta_text);
    assert(!has(delta_text, "\033[K"));
    AT_MOST("first character at 40", first_on_window, 475);
    key_bytes("w", "h", "\x1b");
    AT_MOST("same match at 40", (long)strlen(delta_text), 18);
    key_bytes("", "g", "\x1b");                                  /* the last entry: on a later page of the 40-column pages */
    assert(!has(delta_text, "\033[2J"));
    AT_MOST("a match on another page at 40", (long)strlen(delta_text), 475);
    size_reply = "80\t25"; big_prompt = "AmiExpress Web BBS [1:Demoscene] Menu (99 mins. left): ";
}

/* ---- plan M15 follow-up 2: the door plays the BOARD's wipes at every width (the board zeroes them when the sysop turns
        "Play wipes for 40-column callers" off); only the masthead rail is a 40-column exception ------------------- */

static void the_door_plays_the_catalogues_wipes_at_forty_columns_as_at_eighty(void)
{
    int width;
    mouse_queue = 0; silent_board = 0; theme_name = "";
    for (width = 40; width <= 80; width += 40) {
        char size[16];
        sprintf(size, "%d\t25", width);
        size_reply = size;
        write_catalogue(CATALOGUE);                              /* W X V H: wipe in X, out V, page H */
        assert(DRIVE("\x1b") == 0);
        assert(has(requests, "WIPE IN X|") && has(requests, "WIPE END|"));            /* the opening wipe begins and ends around the frame */
        assert(has(requests, "WIPE OUT V|"));                                          /* and the leaving wipe */
        assert(count_of(requests, "WIPE END|") == 2);
        big_wipes = "-\t-\t-";
        write_catalogue("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO scroll\nW -\t-\t-\nR 0\nS Messages\nE R\tRead Mail\tRead your mail\t\t\n.\n");
        assert(DRIVE("\x1b") == 0);
        assert(!has(requests, "WIPE"));                                                /* a board with no wipes (the 40-column switch off zeroes them) plays none */
    }
    size_reply = "80\t25";
    printf("  [OK] the board's wipes play at 40 columns as at 80 (open, leave), and none when the board has none\n");
}

/* ---- plan M15 follow-up (sysop ruling): type-ahead never scrolls or repaints the window. The highlight follows a match
        that is on the window; a match below it is named in the status row, and Tab is what shows it. ------------- */

static void type_ahead_to_an_entry_below_the_window_names_it_in_the_status_row_and_repaints_no_grid(void)
{
    int width;
    for (width = 80; width >= 40; width -= 40) {
        char size[16];
        long first, tab;
        mouse_queue = 0; silent_board = 0; theme_name = "";
        sprintf(size, "%d\t12", width);
        size_reply = size;
        big_long_label = width == 80; big_prompt = "Go: ";
        write_big_catalogue("scroll");                                      /* 40 was pages until Pages was retired */
        /* 12 rows: grid rows 2..9, status row 11, prompt row 12; Download (80) / Goodbye (40) is below the window */
        key_bytes("", width == 80 ? "d" : "g", "");
        first = (long)strlen(delta_text);
        assert(addresses_only_on(delta_text, 11, 12));                      /* no cursor address in a grid row: the grid is not repainted */
        assert(!has(delta_text, "\033[2J"));
        AT_MOST("first letter of an off-window entry", first, width == 80 ? 250 : 180);
        tm_after(width == 80 ? "d" : "g");
        assert(strstr(tm_cell[11], width == 80 ? "Enter runs: D" : "Enter runs: G"));                     /* the match, in the status row's slot */
        assert(strstr(tm_cell[11], width == 80 ? "Download" : "Goodbye"));
        assert(strstr(tm_cell[12], width == 80 ? "Go: d" : "Go: g"));      /* the typed text stays on the prompt row */
        assert(strstr(tm_cell[2], "Messages"));                             /* the window still starts where it did */
        /* a match ON the window keeps the cell repaint: the old cell, the new cell, the status row, the prompt row */
        key_bytes("", width == 80 ? "m" : "e", "");
        AT_MOST("first letter of an on-window entry", (long)strlen(delta_text), width == 80 ? 455 : 337);
        assert(has(delta_text, "\033[K") == (width == 80));
        /* the highlight did not move: Backspace empties the line, Esc leaves, and the board is asked for row 0 */
        assert(DRIVE(width == 80 ? "d\x08\x1b" : "g\x08\x1b") == 0);
        assert(strstr(requests, "ROW 0|"));
        /* Enter still runs what was TYPED, as always */
        assert(DRIVE(width == 80 ? "d\r" : "g\r") == 0);
        assert(typed_calls == 1 && strcmp(typed_line, width == 80 ? "d" : "g") == 0 && activations == 0);
        /* Tab shows it: one window rewrite, no clear, the highlight lands on the match */
        key_bytes(width == 80 ? "d" : "g", "\t", "");
        tab = (long)strlen(delta_text);
        assert(!has(delta_text, "\033[2J") && has(delta_text, "\033[2;1H"));
        AT_MOST("Tab to the off-window match", tab, width == 80 ? 845 : 1150);   /* 40: a scrolled two-column window, 1110 measured */
        assert(DRIVE(width == 80 ? "d\t\x08\x1b" : "g\t\x08\x1b") == 0);
        assert(strstr(requests, width == 80 ? "ROW 6|" : "ROW 13|"));
        /* Tab with the match already in view moves nothing */
        key_bytes("r", "\t", "");
        assert(strlen(delta_text) == 0);
        /* Backspace off a second letter re-evaluates: "do" names DOORS, "d" names Download again; nothing is repainted in the grid */
        if (width == 80) {
            key_bytes("do", "\x08", "");
            assert(addresses_only_on(delta_text, 11, 12));
            tm_after("do\x08");
            assert(strstr(tm_cell[11], "Enter runs: D  Download"));
        }
        printf("  [OK] %d columns: an off-window first letter costs %ld bytes in the status and prompt rows only; Tab shows it for %ld\n", width, first, tab);
    }
    big_long_label = 0; big_wipes = "-\t-\t-"; big_prompt = "AmiExpress Web BBS [1:Demoscene] Menu (99 mins. left): ";
    size_reply = "80\t25";
}

static void the_typing_key_bar_names_tab_and_shortens_itself_to_fit_forty_columns(void)
{
    const char *row;
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    big_long_label = 0; big_prompt = "Go: "; write_big_catalogue("scroll");
    wrote("r");
    row = last_prompt_row();
    assert(row && strstr(row, "Enter Run  Tab Show  Esc Clear"));
    size_reply = "40\t25"; write_big_catalogue("pages");
    wrote("r");
    row = last_prompt_row();
    assert(row && strstr(row, "Enter Run  Tab Show  Esc Clear"));             /* "Go: r" + 2 + 30 = 37 columns: it fits, so it is said in full */
    big_prompt = "Menu [1:Main]: "; write_big_catalogue("pages");
    wrote("r");
    row = last_prompt_row();
    assert(row && strstr(row, "Tab Show  Esc Clear") && !strstr(row, "Enter Run"));   /* 16 + 2 + 30 is too wide: the shorter bar keeps Tab (Enter is the obvious key) */
    assert(strlen("Menu [1:Main]: r") + 2 + strlen("Tab Show  Esc Clear") <= 39);
    big_prompt = "AmiExpress Web BBS [1:Demoscene] Menu (99 mins. left): "; size_reply = "80\t25";
    printf("  [OK] the typing key bar says Tab Show where it fits, and drops to Tab Show / Esc Clear where it does not\n");
}


/* ---- 2026-10-15 sysop: the masthead rail is the DIVIDER under the header logo; the cursor is hidden in navigation mode --- */

static void use_screen(int cols, int rows, const char *theme, int logo_rows, const char *wipes, const char *pages)
{
    static char size[16];
    sprintf(size, "%d\t%d", cols, rows);
    size_reply = size; theme_name = theme; mouse_queue = 0; silent_board = 0;
    big_header_rows = logo_rows; big_header_cols = cols; big_wipes = wipes; big_prompt = "Go: ";
    write_big_catalogue(pages);
}

static void restore_screen(void)
{
    size_reply = "80\t25"; theme_name = ""; big_header_rows = 0; big_wipes = "-\t-\t-";
    big_prompt = "AmiExpress Web BBS [1:Demoscene] Menu (99 mins. left): "; logo_shows_cursor = 0;
}

static int tm_nonblank(int row, int cols)
{
    int c, n = 0;
    for (c = 0; c < cols; c++) if (tm_cell[row][c] != ' ') n++;
    return n;
}

static void a_header_logo_is_followed_by_the_rail_as_a_divider_and_the_grid_starts_under_it(void)
{
    static const int COLS[3] = { 80, 132, 40 };
    static const int HEIGHT[2] = { 3, 6 };
    int ci, hi, r;
    for (ci = 0; ci < 3; ci++) for (hi = 0; hi < 2; hi++) {
        int cols = COLS[ci], h = HEIGHT[hi], rows = 25, div = 2 + h;
        int rail = cols >= 80;                                   /* effects: none at 40 columns */
        md_layout_out with, without;
        char title_row[160];

        use_screen(cols, rows, rail ? "uprough-neon" : "", h, "-\t-\t-", "scroll");
        reset(); logo("header", h, cols, 0);
        md_layout(&menu, cols, rows, &with);
        reset();
        md_layout(&menu, cols, rows, &without);
        assert(with.divider_row == div && with.rail_row == div && with.grid_top == 4 + h && with.masthead_row == 0);
        assert(with.grid_height == without.grid_height - h - 3);                   /* the logo takes the title row and h - 1 more; the divider, its two blank rows and the blank row above the status row four */
        assert(without.divider_row == 0 && without.rail_row == 1 && without.grid_top == 2);

        tm_after("\x1b[B");
        sprintf(title_row, "%.*s", cols, tm_cell[1]);
        assert(!strstr(screen_text, "MAIN MENU"));               /* sysop 2026-10-15: the logo replaces the title */
        for (r = 1; r < 1 + h; r++) assert(tm_nonblank(r, cols) == 0);          /* the logo rows are the board's: not drawn here */
        if (rail) assert(tm_nonblank(div, cols) >= cols / 2);    /* the rail runs the width of the divider row */
        else for (r = 0; r < cols; r++) assert(tm_cell[div][r] == '-');         /* no rail: a static rule, never blank */
        assert(tm_nonblank(1 + h, cols) == 0 && tm_nonblank(3 + h, cols) == 0);  /* sysop 2026-10-15: one empty row over and under the rail */
        assert(tm_nonblank(rows - 2, cols) == 0);                /* and one between the list and the status row */
        assert(strstr(tm_cell[4 + h], "Messages"));              /* the first section header sits under the blank row */
        assert(!strstr(tm_cell[div], "Messages"));
        assert(strstr(tm_cell[rows - 1], "Page") || tm_nonblank(rows - 1, cols) > 0);   /* status row unchanged */
        assert(strstr(tm_cell[rows], "Go: ") || tm_nonblank(rows, cols) > 0);          /* prompt row unchanged */
    }
    restore_screen();
    printf("  [OK] a header logo is followed by the rail as a divider (a static rule without one) and the grid starts under it, at 80, 132 and 40\n");
}

/* ---- sysop 2026-10-15: the list adapts to the logo; a long list under a 10-row header scrolls in an 8-row grid ---- */

static void a_long_list_under_a_tall_header_scrolls_in_the_short_grid(void)
{
    char cat[8192], line[160];
    int i;
    mouse_queue = 0; silent_board = 0; theme_name = ""; size_reply = "80\t25";
    sprintf(cat, "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Go: \nO scroll\nW -\t-\t-\nR 0\nL header\t10\t78\t0\nS Everything\n");
    for (i = 1; i <= 34; i++) {
        sprintf(line, "E Z%02d\tItem %02d\tDescription %02d\t\t\n", i, i, i);
        strcat(cat, line);
    }
    strcat(cat, ".\n");
    write_catalogue(cat);

    tm_after("\x1b[B");
    {
        int r;
        for (r = 1; r <= 25; r++) assert(!strstr(tm_cell[r], "Everything"));   /* sysop 2026-10-15: a lone section under a logo has no header row */
    }
    assert(strstr(tm_cell[14], "Item 01") && strstr(tm_cell[21], "Item 29"));  /* grid_top 14: four columns, 9 lines, the 8-row window starts right under the divider */
    {
        int r, seen = 0;
        for (r = 14; r <= 21; r++) if (strstr(tm_cell[r], "Item 34")) seen = 1;
        assert(!seen);                                                   /* the last entry is off the 8-row window */
    }
    tm_after("\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B");    /* Down 8: the line of Item 33, one past the window */
    assert(strstr(tm_cell[14], "Item 05") && strstr(tm_cell[21], "Item 33"));  /* sysop 2026-10-15: the window moved ONE row, not a page */
    {
        int r, seen;
        tm_after("\x1b[F");                                              /* End */
        for (seen = 0, r = 14; r <= 21; r++) if (strstr(tm_cell[r], "Item 34")) seen = 1;
        assert(seen);
        for (seen = 0, r = 14; r <= 21; r++) if (strstr(tm_cell[r], "Item 01")) seen = 1;
        assert(!seen);
        tm_after("\x1b[F\x1b[H");                                        /* Home comes back */
        for (seen = 0, r = 14; r <= 21; r++) if (strstr(tm_cell[r], "Item 01")) seen = 1;
        assert(seen);
        {
            char downs[128] = "";
            for (i = 0; i < 20; i++) strcat(downs, "\x1b[B");           /* Down past the last visible row, to the end */
            tm_after(downs);
            for (seen = 0, r = 14; r <= 21; r++) if (strstr(tm_cell[r], "Item 34")) seen = 1;
            assert(seen);
        }
        tm_after("\x1b[6~");                                             /* PgDn from the top */
        for (seen = 0, r = 14; r <= 21; r++) if (strstr(tm_cell[r], "Item 01")) seen = 1;
        assert(!seen);
        tm_after("Z34");                                                 /* type-ahead to an entry off the window: named in the status row */
        assert(strstr(tm_cell[24], "Z34") || strstr(tm_cell[24], "Item 34"));
        tm_after("Z34\t");                                               /* Tab brings the window to it */
        for (seen = 0, r = 14; r <= 21; r++) if (strstr(tm_cell[r], "Item 34")) seen = 1;
        assert(seen);
    }
    restore_screen();
    printf("  [OK] a 34-entry list under a 10-row header scrolls in the 8-row grid: Down, PgDn, Home, End and type-ahead reach every entry\n");
}

static void without_a_header_logo_the_rail_stays_on_the_masthead_row_and_no_row_is_added(void)
{
    static const int COLS[2] = { 80, 132 };
    int ci;
    for (ci = 0; ci < 2; ci++) {
        use_screen(COLS[ci], 25, "uprough-neon", 0, "-\t-\t-", "scroll");
        tm_after("\x1b[B");
        assert(tm_nonblank(1, COLS[ci]) > 8);                   /* the rail beside the title, as before */
        assert(strstr(tm_cell[2], "Messages"));                  /* and the grid directly under the masthead */
    }
    restore_screen();
    printf("  [OK] without a header logo the rail stays on row one and the grid starts on row two\n");
}

static void a_theme_without_a_rail_gets_a_static_divider_under_a_logo(void)
{
    int c;
    /* Every theme the board offers has a rail since classic went (sysop, 2026-10-17); the rail-less divider is now
       what 40 columns get, where effects are off. */
    use_screen(40, 25, "", 3, "-\t-\t-", "scroll");
    tm_after("\x1b[B");
    for (c = 0; c < 40; c++) assert(tm_cell[5][c] == '-');     /* logo 1-3, blank 4, divider 5 */
    assert(strstr(tm_cell[7], "Messages"));
    assert(!strstr(screen_text, "\0337"));                        /* nothing animates: no tick at all */
    restore_screen();
    printf("  [OK] a theme without a rail gets a static divider rule under a logo\n");
}

static void the_idle_tick_touches_the_divider_row_only_under_a_header_logo(void)
{
    static const int COLS[2] = { 80, 132 };
    static const int HEIGHT[2] = { 3, 6 };
    int ci, hi, ticks = 0;
    for (ci = 0; ci < 2; ci++) for (hi = 0; hi < 2; hi++) {
        const char *p, *stop;
        use_screen(COLS[ci], 25, "uprough-neon", HEIGHT[hi], "-\t-\t-", "scroll");
        wrote("\x1b[B\x1b[B");
        stop = closing_clear();
        for (p = screen_text; (p = strstr(p, "\0337")) != 0 && p < stop; p++) {
            const char *end = strstr(p, "\0338"), *q;
            assert(end && end < stop && end - p < 300);
            for (q = p; q < end; q++) {
                int r = 0, c = 0, n = 0;
                if (q[0] == '\033' && q[1] == '[' && sscanf(q + 2, "%d;%d%n", &r, &c, &n) == 2 && q[2 + n] == 'H') assert(r == 2 + HEIGHT[hi]);
            }
            ticks++;
        }
    }
    assert(ticks >= 4);                                           /* the sentinel: ticks ran under every logo size, each checked */
    restore_screen();
    printf("  [OK] every idle tick (%d) addresses the divider row only under a header logo\n", ticks);
}

static void the_first_frame_with_a_logo_costs_at_most_the_divider_row_more(void)
{
    long with, without, down_plain, type_plain;
    use_screen(80, 25, "uprough-neon", 0, "-\t-\t-", "scroll");
    without = wrote("\x1b");
    big_header_rows = 3; big_header_cols = 80; write_big_catalogue("scroll");
    with = wrote("\x1b");
    assert(with - without <= 250);                                /* a rule/rail row, not a repaint of the grid */
    big_header_rows = 0; write_big_catalogue("scroll");
    down_plain = key_cost("", "\x1b[B", "\x1b"); type_plain = key_cost("x", "y", "\x1b");
    big_header_rows = 3; write_big_catalogue("scroll");
    assert(key_cost("", "\x1b[B", "\x1b") <= down_plain + 4);   /* Down: the same two cells and status text (a row number may gain a digit) */
    assert(key_cost("x", "y", "\x1b") <= type_plain + 2);        /* typing: still the character */
    restore_screen();
    printf("  [OK] a header logo adds at most the divider row to the first frame; Down and typing cost what they did\n");
}

static void hit_testing_uses_the_grid_origin_below_the_divider(void)
{
    /* The big catalogue is two columns at 80: R E / MS OLM / ZOOM, Files header, F D / U WHO, Community header, ... G. */
    static const int HEIGHT[2] = { 3, 6 };
    int hi;
    char reply[24];
    for (hi = 0; hi < 2; hi++) {
        int h = HEIGHT[hi], first = 5 + h;                       /* first entry row: logo h, blank, divider, blank, section header */
        use_screen(80, 25, "", h, "-\t-\t-", "scroll");
#define HOVER(col, row, want) do { mouse_queue = 1; sprintf(reply, "M\t%d\t%d", (col), (row)); mouse_reply = reply; \
        assert(DRIVE("\x1e\x1b") == 0 && has(requests, want)); } while (0)
        HOVER(50, first, "ROW 1|");                              /* the first visible entry row, second column: E */
        HOVER(1, first + 1, "ROW 2|");                           /* MS: one row down */
        HOVER(1, first + 4, "ROW 5|");                           /* F, under the Files header */
        HOVER(1, first + 9, "ROW 13|");                          /* G: the last visible entry row */
        HOVER(1, 2 + h, "ROW 0|");                               /* the divider is not a grid row: nothing is selected */
        HOVER(50, first + 3, "ROW 0|");                          /* the Files section header: no entry under it */
#undef HOVER
    }
    mouse_reply = "M\t1\t8";
    restore_screen();
    printf("  [OK] hover hit tests use the grid origin below the divider (first, last visible row, divider, section header)\n");
}

/* The final cursor state a script leaves, read off the terminal model before the door's closing clear. */
static void cursor_ends(const char *keys, int visible, int prompt_row)
{
    tm_after(keys);
    assert(tm_cursor == visible);
    if (visible) assert(tm_row == prompt_row);
}

static void the_cursor_is_hidden_in_navigation_mode_after_every_board_write_and_parked_when_typing(void)
{
    static const int COLS[3] = { 80, 132, 40 };
    int ci, wipes = 0;
    for (ci = 0; ci < 3; ci++) {
        int cols = COLS[ci];
        const char *theme = cols >= 80 ? "uprough-neon" : "";
        /* the opening wipe: the board's replay ends with SHOW CURSOR */
        use_screen(cols, 25, theme, 3, "X\tV\t-", "scroll");
        cursor_ends("\x1b[B", 0, 0);                              /* navigation: hidden again */
        assert(has(requests, "WIPE IN X|") && has(requests, "WIPE END|")); wipes++;
        cursor_ends("x", 1, 25);                                  /* typing: visible, parked on the prompt row */
        /* a logo draw (no wipe at all) that shows the cursor */
        use_screen(cols, 25, theme, 3, "-\t-\t-", "scroll");
        logo_shows_cursor = 1;
        cursor_ends("\x1b[B", 0, 0);
        assert(!has(requests, "WIPE")); wipes++;
        cursor_ends("x", 1, 25);
        logo_shows_cursor = 0;
    }
    assert(wipes == 6);                                           /* the sentinel: every case ran (the page wipe went with Pages) */
    restore_screen();
    printf("  [OK] the cursor is hidden in navigation mode after the open wipe and a logo draw, and parked when typing, at 80, 132 and 40\n");
}

int main(void)
{
    ae_native_set_exchange(board, 0);
    door = run_menu;
    the_palette_ranks_key_then_label_then_description_and_keeps_catalogue_order_in_ties();
    type_ahead_prefers_the_exact_key_and_ignores_case();
    digits_act_at_once_only_when_nothing_else_could_follow();
    layout_puts_things_where_the_screen_has_room();
    a_picked_entry_runs_through_the_whole_shell();
    a_greyed_entry_cannot_be_chosen_and_a_typed_line_goes_to_the_door();
    hovering_moves_the_real_selection_and_esc_leaves();
    a_click_selects_and_runs_the_entry_under_it();
    forty_columns_get_the_caret_the_short_key_bar_and_one_column();
    a_click_on_a_greyed_entry_still_clears_the_typed_line_on_screen();
    typing_stops_at_what_the_caller_can_see();
    no_screen_draws_outside_its_box_however_short();
    the_settings_screen_asks_without_opening_a_catalogue();
    a_silent_board_runs_the_fallback_and_draws_nothing();
    the_key_bar_says_what_escape_does_at_each_depth();
    a_one_row_terminal_puts_the_settings_status_on_row_one();
    one_binary_runs_the_settings_under_its_second_name_and_the_menu_otherwise();
    q_on_an_empty_line_leaves_only_when_no_entry_starts_with_q();
    the_settings_bar_names_q_because_q_leaves();
    the_first_frame_sends_nothing_twice();
    the_palette_is_an_overlay_the_board_gives_back();
    a_key_repaints_two_cells_and_the_description_only();
    the_boards_page_bytes_turn_the_page();
    nothing_is_sent_when_nothing_changed();
    a_typed_character_costs_the_character_not_the_row();
    the_idle_tick_touches_the_masthead_rail_only();
    the_prompt_row_is_a_hint_until_something_is_typed();
    esc_clears_the_line_and_only_an_empty_line_leaves();
    backspacing_to_an_empty_line_returns_to_the_hint();
    the_row_text_fits_forty_columns_in_both_states();
    an_identical_description_is_not_sent_again();
    a_shorter_description_leaves_no_tail_of_the_longer_one();
    backspacing_leaves_no_stale_character_on_the_prompt_row();
    a_cell_is_one_cursor_move_and_one_run();
    every_idle_tick_stays_on_the_masthead_row();
    a_long_board_prompt_is_clipped_once_for_drawing_parking_and_room();
    a_cell_tail_is_erased_to_the_end_of_the_line_not_written_as_spaces();
    a_moved_selection_leaves_the_screen_a_fresh_frame_would_show();
    typing_costs_the_character_and_a_jump_costs_what_it_changes();
    the_door_plays_the_catalogues_wipes_at_forty_columns_as_at_eighty();
    type_ahead_to_an_entry_below_the_window_names_it_in_the_status_row_and_repaints_no_grid();
    the_typing_key_bar_names_tab_and_shortens_itself_to_fit_forty_columns();
    a_header_logo_is_followed_by_the_rail_as_a_divider_and_the_grid_starts_under_it();
    a_long_list_under_a_tall_header_scrolls_in_the_short_grid();
    without_a_header_logo_the_rail_stays_on_the_masthead_row_and_no_row_is_added();
    a_theme_without_a_rail_gets_a_static_divider_under_a_logo();
    the_idle_tick_touches_the_divider_row_only_under_a_header_logo();
    the_first_frame_with_a_logo_costs_at_most_the_divider_row_more();
    hit_testing_uses_the_grid_origin_below_the_divider();
    the_cursor_is_hidden_in_navigation_mode_after_every_board_write_and_parked_when_typing();
    cover_flow_turns_a_page_with_right_and_one_slide();
    cover_flow_is_one_column_and_pages_wrap();
    tab_cycles_the_menu_style();
    catalogue_notice_is_said_on_open();
    a_page_turn_paints_the_region_once();
    cover_flow_without_the_slide_or_with_one_section();
    remove(CAT_PATH); remove("build/test_menudoor_keys.bin"); remove("build/test_menudoor_screen.bin");
    puts("test_menudoor_model: OK");
    return 0;
}
