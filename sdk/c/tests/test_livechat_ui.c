/* test_livechat_ui.c - draws the LIVECHAT68 main chat state and compares every cell
 * (character, fg, bg, bold) with grids captured from the TS LIVECHAT door. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ui_cells.h"
#include "livechat_ui.h"

static void add_line(lc_model *m, int kind, const char *time, const char *nick, const char *text)
{
    lc_line *l = &m->lines[m->nlines++];
    memset(l, 0, sizeof *l);
    l->kind = kind;
    strcpy(l->time, time);
    strcpy(l->nick, nick);
    strcpy(l->text, text);
}

static void add_side(lc_model *m, int kind, int joined, const char *label)
{
    lc_side *s = &m->side[m->nside++];
    memset(s, 0, sizeof *s);
    s->kind = kind;
    s->joined = joined;
    strcpy(s->label, label);
}

static void main_state(lc_model *m, int cols, int rows)
{
    lc_model_init(m, cols, rows);
    m->focus = -1;                 /* the TS grids were captured with no panel focused: every border idle */
    strcpy(m->handle, "Guest");
    strcpy(m->room, "general");
    strcpy(m->pane_label, "general - General chat");
    add_side(m, LC_SIDE_HEAD, 0, "TEXT CHANNELS");
    add_side(m, LC_SIDE_ROOM, 1, "general");
    add_side(m, LC_SIDE_USER, 0, "carol");
    add_side(m, LC_SIDE_ROOM, 0, "amiga");
    add_side(m, LC_SIDE_ROOM, 0, "secret");
    m->side_sel = 1;
    add_line(m, LC_SYSTEM, "", "", "Found 3 rooms");
    add_line(m, LC_SYSTEM, "", "", "Auto-joining #general...");
    add_line(m, LC_SYSTEM, "", "", "Joined #general (3 users)");
    add_line(m, LC_ACTIVITY_LINE, "17:03", "", "Joined #general");
    add_line(m, LC_SYSTEM, "", "", "--- 2 earlier messages ---");
    add_line(m, LC_HISTORY, "11:01", "alice", "hello world");
    add_line(m, LC_HISTORY, "11:02", "bob", "this is a long line that should wrap around the chat pane width for sure yes indeed");
    add_line(m, LC_LIVE, "17:03", "alice", "hi sysop, how are you?");
    add_line(m, LC_LIVE, "17:03", "bob", "nice **bold** and :D");
    add_line(m, LC_SYSTEM, "", "", "carol joined the room");
    add_line(m, LC_ACTIVITY_LINE, "17:03", "", "carol joined");
    add_line(m, LC_SYSTEM, "", "", "bob left the room");
    add_line(m, LC_ACTIVITY_LINE, "17:03", "", "bob left");
}

/* Returns the number of cells that differ; prints the first few. */
static int compare(const char *path)
{
    static char line[4096];
    FILE *f = fopen(path, "r");
    int cols = 0, rows = 0, row = -1, diff = 0, shown = 0, cr, cc;
    ui_cells c;
    lc_model *m = (lc_model *)malloc(sizeof *m);
    if (f == 0 || m == 0 || fgets(line, sizeof line, f) == 0 || sscanf(line, "%d %d", &cols, &rows) != 2) {
        printf("FAIL cannot read %s\n", path);
        return -1;
    }
    ui_cells_open(&c, cols, rows);
    main_state(m, cols, rows);
    lc_draw(&c, m, &cr, &cc);
    while (fgets(line, sizeof line, f) != 0) {
        if (line[0] == 'T') {
            int k;
            row++;
            for (k = 0; k < cols; k++) {
                char want = line[1 + k] == '\n' || line[1 + k] == '\0' ? ' ' : line[1 + k];
                ui_cell *got = &c.back[row * cols + k];
                if (row == rows - 1 && k == cols - 1) break;   /* ui_cells_flush never sends the bottom-right cell */
                if ((char)got->ch != want) {
                    diff++;
                    if (shown++ < 6) printf("  %s r%d c%d char want '%c' got '%c'\n", path, row, k, want, got->ch);
                }
                if (line[1 + k] == '\n' || line[1 + k] == '\0') break;
            }
        } else if (line[0] == 'A') {
            char *p = line + 1;
            int a, b, fg, bg, bold, n, k;
            while (sscanf(p, "%d-%d:%d/%d/%d%n", &a, &b, &fg, &bg, &bold, &n) == 5) {
                for (k = a; k <= b && k < cols; k++) {
                    ui_cell *got = &c.back[row * cols + k];
                    int gbg = (got->flags & UI_CELLS_BG_DEFAULT) ? -1 : got->bg;
                    int gbold = (got->flags & UI_CELLS_BOLD) ? 1 : 0;
                    if (got->ch == ' ' && bg == gbg) continue;   /* fg of a blank cell does not show */
                    if (got->fg != fg || gbg != bg || gbold != bold) {
                        diff++;
                        if (shown++ < 6) printf("  %s r%d c%d attr want %d/%d/%d got %d/%d/%d\n", path, row, k, fg, bg, bold, got->fg, gbg, gbold);
                    }
                }
                p += n;
                while (*p == ' ') p++;
            }
        }
    }
    fclose(f);
    ui_cells_close(&c);
    free(m);
    printf("%s: %d differing cells\n", path, diff);
    return diff;
}

/* The reaction suffix, byte for byte what the TS door prints for the same counts
 * (board/Doors/livechat/tests/reactions.test.ts pins ' [<3 2] [*F* 1]' for {heart:2, fire:1}). */
static int react_suffix_matches_ts(void)
{
    lc_line l;
    char out[96];
    memset(&l, 0, sizeof l);
    l.kind = LC_LIVE;
    strcpy(l.react[0].emoji, "heart"); l.react[0].count = 2;
    strcpy(l.react[1].emoji, "fire"); l.react[1].count = 1;
    l.nreact = 2;
    lc_react_suffix(&l, out, sizeof out);
    if (strcmp(out, " [<3 2] [*F* 1]") != 0) { printf("react suffix: '%s'\n", out); return 1; }
    strcpy(l.react[0].emoji, "+1"); l.react[0].count = 1; l.nreact = 1;
    lc_react_suffix(&l, out, sizeof out);
    if (strcmp(out, " [[+] 1]") != 0) { printf("react suffix +1: '%s'\n", out); return 1; }
    l.nreact = 0;
    lc_react_suffix(&l, out, sizeof out);
    if (out[0] != '\0') { printf("react suffix empty: '%s'\n", out); return 1; }
    return 0;
}

/* B3: /timestamps and /compact decide whether the time column is drawn. */
static int stamps_follow_the_pref(void)
{
    lc_line l;
    char on[256], off[256];
    memset(&l, 0, sizeof l);
    l.kind = LC_LIVE;
    strcpy(l.time, "17:03"); strcpy(l.nick, "bob"); strcpy(l.text, "hi");
    lc_line_marked(&l, on, sizeof on, 1);
    lc_line_marked(&l, off, sizeof off, 0);
    if (strstr(on, "17:03") == 0 || strstr(off, "17:03") != 0 || strstr(off, "hi") == 0) {
        printf("stamps: on='%s' off='%s'\n", on, off);
        return 1;
    }
    return 0;
}

/* The focused panel's border is the bright one (TS PANEL_BORDER_FOCUS), the others stay accent,
 * and moving focus moves it. Cells: sidebar top-left corner (row 1, col 0), input top-left. */
static int focus_border(int focus, int *side, int *input)
{
    static lc_model m;
    ui_cells c;
    int ir, cr, cc;
    main_state(&m, 80, 25);
    m.focus = focus;
    if (ui_cells_open(&c, 80, 25) != 0) return 1;
    lc_draw(&c, &m, &cr, &cc);
    ir = c.rows - 4;
    *side = c.back[1 * c.cols + 0].fg;
    *input = c.back[ir * c.cols + 0].fg;
    ui_cells_close(&c);
    return 0;
}

static int active_panel_is_highlighted(void)
{
    int s, i;
    if (focus_border(LC_FOCUS_INPUT, &s, &i) || s != LC_ACCENT || i != LC_BORDER_FOCUS) { printf("focus input: side %d input %d\n", s, i); return 1; }
    if (focus_border(LC_FOCUS_SIDEBAR, &s, &i) || s != LC_BORDER_FOCUS || i != LC_ACCENT) { printf("focus sidebar: side %d input %d\n", s, i); return 1; }
    if (focus_border(LC_FOCUS_MENU, &s, &i) || s != LC_ACCENT || i != LC_ACCENT) { printf("focus menu: side %d input %d\n", s, i); return 1; }
    return 0;
}

/* TS message-picker.ts: Up on an empty input picks the newest message, Up/Down step one message
 * and stop at either end, local lines are skipped. While picking, the chat border is the focus
 * colour, the picked rows are the accent bar, and the input label says how to drive the picker. */
static int picker_selects_and_draws(void)
{
    static lc_model m;
    ui_cells c;
    int cr, cc, sw, r, k, ir, tinted = 0, fail = 0;
    char label[48];
    main_state(&m, 80, 25);
    m.focus = LC_FOCUS_INPUT;
    if (lc_pick_index(&m) != -1 || lc_pick_start(&m) != 0) { printf("picker: started with no messages\n"); return 1; }
    for (k = 5; k <= 8; k++) { m.lines[k].number = k - 4; sprintf(m.lines[k].id, "m%d", k - 4); }
    if (!lc_pick_start(&m) || lc_pick_index(&m) != 8) { printf("picker: start %d\n", lc_pick_index(&m)); fail = 1; }
    lc_pick_move(&m, 1);
    if (lc_pick_index(&m) != 8) { printf("picker: moved past the newest\n"); fail = 1; }
    lc_pick_move(&m, -1); lc_pick_move(&m, -1); lc_pick_move(&m, -1); lc_pick_move(&m, -1);
    if (lc_pick_index(&m) != 5) { printf("picker: oldest %d\n", lc_pick_index(&m)); fail = 1; }
    lc_pick_move(&m, 1);
    if (lc_pick_index(&m) != 6 || strcmp(m.pick, "m2") != 0) { printf("picker: move %d\n", lc_pick_index(&m)); fail = 1; }
    if (ui_cells_open(&c, 80, 25) != 0) return 1;
    lc_draw(&c, &m, &cr, &cc);
    sw = lc_sidebar_width(&m);
    if (c.back[1 * c.cols + sw].fg != LC_BORDER_FOCUS) { printf("picker: chat border %d\n", c.back[1 * c.cols + sw].fg); fail = 1; }
    for (r = 2; r < c.rows - 4; r++) {
        ui_cell *p = &c.back[r * c.cols + sw + 1];
        if (p->fg == LC_BAR_INK && p->bg == LC_ACCENT) tinted++;
    }
    if (tinted != 2) { printf("picker: %d tinted rows, want the 2 rows of bob's wrapped line\n", tinted); fail = 1; }
    ir = c.rows - 4;
    for (k = 0; k < 40; k++) label[k] = (char)c.back[ir * c.cols + 3 + k].ch;
    label[40] = '\0';
    if (strstr(label, "[PICK MESSAGE: Up/Down, Enter, Esc]") == 0) { printf("picker: label '%s'\n", label); fail = 1; }
    lc_pick_stop(&m);
    m.editing = 1;
    lc_draw(&c, &m, &cr, &cc);
    if (c.back[1 * c.cols + sw].fg != LC_ACCENT) { printf("picker: border after stop %d\n", c.back[1 * c.cols + sw].fg); fail = 1; }
    for (k = 0; k < 40; k++) label[k] = (char)c.back[ir * c.cols + 3 + k].ch;
    if (strstr(label, "[EDITING]") == 0) { printf("editing: label '%s'\n", label); fail = 1; }
    ui_cells_close(&c);
    return fail;
}

int main(void)
{
    int r = react_suffix_matches_ts() | stamps_follow_the_pref() | active_panel_is_highlighted() | picker_selects_and_draws();
    int a = compare("tests/fixtures/lc68-ts-main-80x25.grid");
    int b = compare("tests/fixtures/lc68-ts-main-40x25.grid");
    int d = compare("tests/fixtures/lc68-ts-main-80x15.grid");
    if (r != 0 || a != 0 || b != 0 || d != 0) { printf("FAIL livechat_ui fixtures\n"); return 1; }
    printf("PASS livechat_ui fixtures\n");
    return 0;
}
