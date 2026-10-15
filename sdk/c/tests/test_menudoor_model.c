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
    assert(o.header_rows == 3 && o.header_top == 2 && o.grid_top == 5);      /* masthead 1, logo 2-4 */
    assert(o.status_row == 24 && o.prompt_row == 25 && o.grid_height == 18 && o.grid_width == 80);

    reset();
    logo("side", 10, 30, 0);
    md_layout(&menu, 40, 25, &o);
    assert(o.side_cols == 0 && o.grid_width == 40);                          /* no side logo at 40 columns */
    md_layout(&menu, 80, 25, &o);
    assert(o.side_cols == 0 && o.grid_width == 80);                          /* nor at 80 */
    md_layout(&menu, 132, 40, &o);
    assert(o.side_cols == 30 && o.grid_width == 132 - 32 && o.side_left == 132 - 30 + 1 && o.side_top == o.grid_top);

    reset();
    logo("header", 9, 40, 0);                                                /* taller than 25 / 3 */
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

static void write_catalogue(const char *text)
{
    FILE *f = fopen(CAT_PATH, "wb");
    assert(f); fputs(text, f); fclose(f);
}

static char requests[4096];
static int mouse_queue, silent_board;
static const char *size_reply = "80\t25";
static const char *mouse_reply = "M\t1\t6";
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

static int board(void *ctx, int field, const char *request, char *out, int cap)
{
    (void)ctx;
    out[0] = '\0';
    if (field == AE_FIELD_SCREEN) {
        strcat(requests, request); strcat(requests, "|");
        if (strcmp(request, "SIZE") == 0) return answer(size_reply, out, cap);
        if (strncmp(request, "WIPE", 4) == 0 || strncmp(request, "MOUSE O", 7) == 0) return answer("OK", out, cap);
        if (strcmp(request, "MOUSE?") == 0 && mouse_queue > 0) { mouse_queue--; return answer(mouse_reply, out, cap); }
        return 0;
    }
    if (field == AE_FIELD_THEME) return answer(theme_name, out, cap);
    if (field != AE_FIELD_MENU) return 0;
    strcat(requests, request); strcat(requests, "|");
    if (silent_board) return 0;
    if (strcmp(request, "OVERFLOW?") == 0) return answer("default\tpages", out, cap);
    if (strncmp(request, "OVERFLOW ", 9) == 0) return answer("OK\tpages", out, cap);
    if (strncmp(request, "OPEN ", 5) == 0) return answer("OK\t" CAT_PATH, out, cap);
    if (strncmp(request, "LOGO ", 5) == 0) return answer("OK\t3", out, cap);
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
                                    0, on_activate, on_typed };

static char screen_text[65536];

/* One door run: `keys` on stdin, everything the door wrote captured. Returns the door's exit code. */
static int (*door)(void);
static int run_menu(void) { return menudoor_run(&SPEC, 1); }
static int run_settings(void) { return menudoor_settings_run(1); }
static int run_main(void) { return menudoor_main(&SPEC, "MENUSETTINGS", 1); }

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
    assert(strstr(requests, "WIPE IN X|") && strstr(requests, "LOGO header 2 1 3 80|"));
    assert(strstr(requests, "MOUSE ON|"));
    assert(activations == 1 && activated_entry == 2);                        /* the sentinel: the callback RAN */
    assert(strstr(requests, "RUN MS|"));
    assert(strstr(requests, "ROW 2|"));                                      /* on leave */
    assert(strstr(requests, "WIPE OUT V|") && strstr(requests, "MOUSE OFF|"));
    assert(strstr(screen_text, "MAIN MENU") && strstr(screen_text, "Read Mail") && strstr(screen_text, "Scan for new mail"));
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
    /* Down (entry 3, greyed), the wake byte (a hover at row 6 column 1 = entry 0), Esc. */
    assert(DRIVE("\x1b[B\x1e\x1b") == 0);
    assert(activations == 0 && typed_calls == 0);
    assert(strstr(requests, "MOUSE?|"));
    assert(strstr(requests, "ROW 0|"));
    printf("  [OK] a hover moves the real selection; Esc on an empty line leaves\n");
}

static void a_click_selects_and_runs_the_entry_under_it(void)
{
    mouse_queue = 1; silent_board = 0; mouse_reply = "P\t1\t6";
    assert(DRIVE("\x1e") == 0);
    mouse_reply = "M\t1\t6";
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
    mouse_queue = 1; silent_board = 0; mouse_reply = "P\t1\t8";          /* the greyed File Listings */
    assert(DRIVE("x\x1e\x1b") == 0);
    mouse_reply = "M\t1\t6";
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
    assert(strstr(requests, "OVERFLOW?|"));
    assert(!strstr(requests, "OPEN"));
    assert(strstr(requests, "OVERFLOW pages|"));
    assert(strstr(screen_text, "LONG MENUS") && strstr(screen_text, "Board default (pages)"));
    printf("  [OK] the settings screen asks OVERFLOW? without opening a catalogue\n");
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
    assert(strstr(requests, "OVERFLOW?|") && !strstr(requests, "OPEN"));
    assert(strstr(screen_text, "LONG MENUS"));

    invoked_name = "MENU";
    assert(DRIVE("\x1b") == 0);
    assert(strstr(requests, "OPEN MAIN|") && !strstr(screen_text, "LONG MENUS"));

    invoked_name = "";                                /* a board that does not say: the menu, never the settings */
    assert(DRIVE("\x1b") == 0);
    assert(strstr(requests, "OPEN MAIN|") && !strstr(screen_text, "LONG MENUS"));

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
static void write_big_catalogue(const char *pages)
{
    static const char *const SECTION[3] = { "Messages", "Files", "Community" };
    static const char *const LABEL[14] = { "Read Mail", "Enter Message", "Mail Scan", "Online Messages", "Zoom Mail",
        "File Listings", "Download", "Upload", "Who is Online", "Live Chat", "Bulletins", "Door Games", "Statistics", "Goodbye" };
    static const char *const KEY[14] = { "R", "E", "MS", "OLM", "ZOOM", "F", "D", "U", "WHO", "LIVECHAT", "B", "DOORS", "STATS", "G" };
    char line[160];
    int i;
    strcpy(big_catalogue, "AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP AmiExpress Web BBS [1:Demoscene] Menu (99 mins. left): \nO ");
    strcat(big_catalogue, pages);
    strcat(big_catalogue, "\nW -\t-\t-\nR 0\n");
    for (i = 0; i < 14; i++) {
        if (i == 0 || i == 5 || i == 9) { sprintf(line, "S %s\n", SECTION[i == 0 ? 0 : i == 5 ? 1 : 2]); strcat(big_catalogue, line); }
        sprintf(line, "E %s\t%s\tDescription of %s for the caller\t\t\n", KEY[i], LABEL[i], LABEL[i]);
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
    assert(frame80 < 2100);                                   /* was 4673: every row blank-then-written, every bar filled-then-written */
    size_reply = "40\t25"; write_big_catalogue("pages");
    frame40 = wrote("\x1b");
    assert(count_of(screen_text, "\033[2J") == 2);
    assert(frame40 < 1850);                                   /* was 3597 */
    size_reply = "80\t25";
    printf("  [OK] the first frame sends nothing twice: %ld bytes at 80 columns, %ld at 40\n", frame80, frame40);
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
    write_big_catalogue("scroll");
    wrote("\x1b[B");
    assert(!strstr(screen_text, "\0337"));                     /* a theme with no rail has nothing to animate */
    printf("  [OK] the idle tick touches the masthead rail only, and not at all at 40 columns or without a rail\n");
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
    assert(strstr(row, "\033[?25l") && !strstr(row, "\033[?25h"));

    /* Typing: the first printable character makes the row the prompt, with the typed text, the typing bar, the cursor. */
    wrote("m");
    row = last_prompt_row();
    assert(row && strstr(row, "BBS [1:Main] Menu: m") && !strstr(row, MENUDOOR_HINT_WIDE));
    assert(strstr(row, "Enter Run  Esc Clear") && !strstr(row, "Esc/q"));      /* the bar is true for THIS mode: q is text now */
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
static char tm_cell[TM_ROWS + 1][TM_COLS + 2];
static int tm_row, tm_col, tm_saved_row, tm_saved_col, tm_addresses;

static void tm_clear(void)
{
    int r;
    for (r = 0; r <= TM_ROWS; r++) { memset(tm_cell[r], ' ', TM_COLS); tm_cell[r][TM_COLS] = '\0'; }
    tm_row = 1; tm_col = 1; tm_addresses = 0;
}

/* Plays bytes [from, to) of `text`: cursor addressing, save/restore, clear, printable characters. SGR and modes are ignored. */
static void tm_play(const char *text, const char *to)
{
    const char *p = text;
    while (p < to) {
        if (*p == '\033' && p[1] == '7') { tm_saved_row = tm_row; tm_saved_col = tm_col; p += 2; }
        else if (*p == '\033' && p[1] == '8') { tm_row = tm_saved_row; tm_col = tm_saved_col; p += 2; }
        else if (*p == '\033' && p[1] == '[') {
            const char *q = p + 2;
            int a = 0, b = 0, have_b = 0, priv = 0;
            if (*q == '?') { priv = 1; q++; }
            while (*q >= '0' && *q <= '9') a = a * 10 + (*q++ - '0');
            if (*q == ';') { q++; have_b = 1; while (*q >= '0' && *q <= '9') b = b * 10 + (*q++ - '0'); }
            while (*q && ((*q >= '0' && *q <= '9') || *q == ';')) q++;
            if (!priv && *q == 'H') { tm_row = a ? a : 1; tm_col = have_b && b ? b : 1; tm_addresses++; }
            else if (!priv && *q == 'J' && a == 2) { int r = tm_row, c = tm_col, n = tm_addresses; tm_clear(); tm_row = r; tm_col = c; tm_addresses = n; }
            p = *q ? q + 1 : q;
        } else {
            if ((unsigned char)*p >= 32 && tm_row >= 1 && tm_row <= TM_ROWS && tm_col >= 1 && tm_col <= TM_COLS) tm_cell[tm_row][tm_col - 1] = *p;
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
    tm_clear();
    tm_play(screen_text, closing_clear());
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

int main(void)
{
    ae_native_set_exchange(board, 0);
    door = run_menu;
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
    a_key_repaints_two_cells_and_the_description_only();
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
    remove(CAT_PATH); remove("build/test_menudoor_keys.bin"); remove("build/test_menudoor_screen.bin");
    puts("test_menudoor_model: OK");
    return 0;
}
