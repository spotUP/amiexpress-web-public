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

int main(void)
{
    int r = react_suffix_matches_ts() | stamps_follow_the_pref();
    int a = compare("tests/fixtures/lc68-ts-main-80x25.grid");
    int b = compare("tests/fixtures/lc68-ts-main-40x25.grid");
    int d = compare("tests/fixtures/lc68-ts-main-80x15.grid");
    if (r != 0 || a != 0 || b != 0 || d != 0) { printf("FAIL livechat_ui fixtures\n"); return 1; }
    printf("PASS livechat_ui fixtures\n");
    return 0;
}
