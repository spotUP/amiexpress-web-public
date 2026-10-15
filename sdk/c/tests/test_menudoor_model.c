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
int ae_field_read(int field, char *out, int cap) { (void)field; if (cap > 0) out[0] = '\0'; return 0; }
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
    if (field != AE_FIELD_MENU) return 0;
    strcat(requests, request); strcat(requests, "|");
    if (silent_board) return 0;
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
    rc = menudoor_run(&SPEC, 1);
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
    assert(strstr(screen_text, "BBS [1:Main] Menu: "));
    assert(strstr(screen_text, "Arrows Move  Enter Run  Esc Prompt"));       /* the key bar at 80 columns */
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
    assert(DRIVE("\x1b") == 0);                                            /* the long prompt leaves no room for a bar */
    assert(strstr(screen_text, "BBS [1:Main] Menu: ") && !strstr(screen_text, "Esc Prompt"));
    write_catalogue(CATALOGUE_SHORT_PROMPT);
    assert(DRIVE("\x1b") == 0);
    write_catalogue(CATALOGUE);
    size_reply = "80\t25";
    assert(strstr(screen_text, ">>"));                                      /* the caret marks the selection */
    assert(strstr(screen_text, "Enter Run  Esc Prompt") && !strstr(screen_text, "Arrows Move"));
    printf("  [OK] 40 columns get the caret and the short key bar\n");
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

int main(void)
{
    ae_native_set_exchange(board, 0);
    type_ahead_prefers_the_exact_key_and_ignores_case();
    digits_act_at_once_only_when_nothing_else_could_follow();
    layout_puts_things_where_the_screen_has_room();
    a_picked_entry_runs_through_the_whole_shell();
    a_greyed_entry_cannot_be_chosen_and_a_typed_line_goes_to_the_door();
    hovering_moves_the_real_selection_and_esc_leaves();
    a_click_selects_and_runs_the_entry_under_it();
    forty_columns_get_the_caret_the_short_key_bar_and_one_column();
    a_silent_board_runs_the_fallback_and_draws_nothing();
    remove(CAT_PATH); remove("build/test_menudoor_keys.bin"); remove("build/test_menudoor_screen.bin");
    puts("test_menudoor_model: OK");
    return 0;
}
