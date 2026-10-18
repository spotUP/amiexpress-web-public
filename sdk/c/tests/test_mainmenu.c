/* test_mainmenu.c - the MAINMENU door's own answers, driven through its real main():
   an entry runs its key, a typed line runs as typed, the second registration opens the settings screen,
   a cover flow catalogue (the legacy D line) is one column and turns a page with Right, and the PALETTE registration is the search palette. */
#define main mainmenu_main
#include "../examples/mainmenu/mainmenu.c"
#undef main
#include "../include/ae_transport_native.h"
#include "../include/ae_session.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static const char *invoked_name = "";
static const char *main_line = "";   /* 131: what the caller typed at the board prompt, the palette's starting filter */
static const char *is_ansi = "";     /* 541: "" is a silent board, which ae_user_is_ansi reads as colour off */
static int ansi_asks;
int ae_field_read(int field, char *out, int cap)
{
    const char *text = field == 605 ? invoked_name : field == AE_FIELD_MAIN_LINE ? main_line : field == 541 ? is_ansi : "";
    int n = (int)strlen(text);
    if (field == 541) ansi_asks++;
    if (n > cap - 1) n = cap - 1;
    if (cap > 0) { memcpy(out, text, (size_t)n); out[n] = '\0'; }
    return n;
}
int ae_field_write(int field, const char *value) { (void)field; (void)value; return 0; }
int ae_query_bit(int acs) { (void)acs; return 1; }

#define CAT_PATH "build/test_mainmenu.cat"
static const char *size_text = "80\t25";
static char requests[2048];
static char screen_text[65536];

static int answer(const char *text, char *out, int cap)
{
    int n = (int)strlen(text);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, text, (size_t)n); out[n] = '\0';
    return n;
}

static int board(void *ctx, int field, const char *request, char *out, int cap)
{
    (void)ctx;
    out[0] = '\0';
    if (field != AE_FIELD_MENU && field != AE_FIELD_SCREEN) return 0;
    strcat(requests, request); strcat(requests, "|");
    if (field == AE_FIELD_SCREEN) return strcmp(request, "SIZE") == 0 ? answer(size_text, out, cap) : 0;
    if (strcmp(request, "STYLE?") == 0) return answer("default\tpages", out, cap);
    if (strncmp(request, "OPEN ", 5) == 0) return answer("OK\t" CAT_PATH, out, cap);
    if (strncmp(request, "RUN ", 4) == 0) return answer("OK", out, cap);
    return 0;
}

static void drive(const char *keys, size_t n, int *rc)
{
    FILE *f = fopen("build/test_mainmenu_keys.bin", "wb");
    int saved = dup(1);
    size_t got;
    char *argv[] = { (char *)"mainmenu", (char *)"1", 0 };
    assert(f); fwrite(keys, 1, n, f); fclose(f);
    requests[0] = '\0';
    fflush(stdout);
    assert(freopen("build/test_mainmenu_screen.bin", "wb", stdout));
    assert(freopen("build/test_mainmenu_keys.bin", "rb", stdin));
    *rc = mainmenu_main(2, argv);
    fflush(stdout);
    dup2(saved, 1); close(saved); clearerr(stdout);
    f = fopen("build/test_mainmenu_screen.bin", "rb"); assert(f);
    got = fread(screen_text, 1, sizeof screen_text - 1, f); screen_text[got] = '\0'; fclose(f);
}


/* The palette is a modal box (sysop 2026-10-17): every printable byte the door sends lands inside the box, nothing
   clears or erases a row, and the box's top line is the theme's animated rail. A small terminal walk: cursor
   addresses, save/restore, CR/LF; printables advance the column; the walk ends at the closing clear. Returns the number of separate runs written on
   the top row that carry a '/', or -1 when a byte lands outside the box or the screen is cleared. */
static unsigned char pal_glyph[40][100];   /* the last byte written at each cell of the walk, [row][col] */
static int pal_writes[40][100];            /* how many times each cell was written */

static int palette_runs_on_top(const char *text, int top, int left, int rows, int cols)
{
    const unsigned char *p = (const unsigned char *)text;
    int row = 1, col = 1, srow = 1, scol = 1, runs = 0, in_run = 0, slash = 0;
    memset(pal_glyph, 0, sizeof pal_glyph); memset(pal_writes, 0, sizeof pal_writes);
    while (*p) {
        if (*p == 0x1b && p[1] == '[') {
            int a = 0, b = 0, which = 0;
            p += 2;
            if (*p == '?') p++;
            while ((*p >= '0' && *p <= '9') || *p == ';') {
                if (*p == ';') which++;
                else if (which == 0) a = a * 10 + (*p - '0');
                else b = b * 10 + (*p - '0');
                p++;
            }
            if (*p == 'H' || *p == 'f') { row = a ? a : 1; col = b ? b : 1; }
            else if (*p == 's') { srow = row; scol = col; }
            else if (*p == 'u') { row = srow; col = scol; }
            else if (*p == 'J') break;                   /* the close after the caller has gone (this board holds no cells) */
            else if (*p == 'K') return -1;
            if (*p) p++;
            if (in_run && slash) runs++;
            in_run = 0; slash = 0;
            continue;
        }
        if (*p == 0x1b && (p[1] == '7' || p[1] == '8')) {
            if (p[1] == '7') { srow = row; scol = col; } else { row = srow; col = scol; }
            p += 2; continue;
        }
        if (*p == '\r') { col = 1; p++; continue; }
        if (*p == '\n') { row++; p++; continue; }
        if (*p >= 32 && *p != 127) {
            if (row < top || row >= top + rows || col < left || col >= left + cols) return -1;
            pal_glyph[row][col] = *p; pal_writes[row][col]++;
            if (row == top + 1) { in_run = 1; if (*p == '/') slash = 1; }
            col++;
        }
        p++;
    }
    if (in_run && slash) runs++;
    return runs;
}

/* The last byte written at a cell, over the whole stream (no box bounds): what the caller sees there at the end. */
static int last_glyph(const char *text, int row, int col)
{
    const unsigned char *p = (const unsigned char *)text;
    const char *close = text, *at, *from = text;
    int r = 1, c = 1, sr = 1, sc = 1, g = 0;
    while ((at = strstr(from, "\x1b[2J\x1b[H\x1b[?25h")) != 0) { close = at; from = at + 1; }   /* the door's closing clear is not what the caller saw */
    while (*p && (const char *)p < close) {
        if (*p == 0x1b && p[1] == '[') {
            int a = 0, b = 0, which = 0;
            p += 2;
            if (*p == '?') p++;
            while ((*p >= '0' && *p <= '9') || *p == ';') {
                if (*p == ';') which++; else if (which == 0) a = a * 10 + (*p - '0'); else b = b * 10 + (*p - '0');
                p++;
            }
            if (*p == 'H' || *p == 'f') { r = a ? a : 1; c = b ? b : 1; }
            else if (*p == 's') { sr = r; sc = c; }
            else if (*p == 'u') { r = sr; c = sc; }
            else if (*p == 'J' && a == 2) g = 0;
            if (*p) p++;
            continue;
        }
        if (*p == 0x1b && (p[1] == '7' || p[1] == '8')) { if (p[1] == '7') { sr = r; sc = c; } else { r = sr; c = sc; } p += 2; continue; }
        if (*p == '\r') { c = 1; p++; continue; }
        if (*p == '\n') { r++; p++; continue; }
        if (*p >= 32 && *p != 127) { if (r == row && c == col) g = *p; c++; }
        p++;
    }
    return g;
}

/* The box keeps its ordinary border on all four sides; with a rail it is the first row INSIDE the box. */
static void palette_rail_is_inside_the_box(int top, int left, int rows, int cols, int rail)
{
    int c, r;
    assert(pal_glyph[top][left] == '+' && pal_glyph[top][left + cols - 1] == '+');       /* corners intact */
    assert(pal_glyph[top + rows - 1][left] == '+' && pal_glyph[top + rows - 1][left + cols - 1] == '+');
    for (c = left + 1; c < left + cols - 1; c++) {                  /* the top border is the border glyph, never a rail glyph */
        assert(pal_glyph[top][c] == '-' || pal_glyph[top][c] == ' ' || (pal_glyph[top][c] >= 'A' && pal_glyph[top][c] <= 'z'));
        assert(pal_glyph[top][c] != '/');
    }
    for (r = top + 1; r < top + rows - 1; r++)                      /* the side borders */
        assert(pal_glyph[r][left] == '|' && pal_glyph[r][left + cols - 1] == '|');
    if (rail) {
        int slashes = 0;
        for (c = left + 1; c < left + cols - 1; c++) if (pal_glyph[top + 1][c] == '/') slashes++;
        assert(slashes > 0);                                        /* rail glyphs between the side borders on the row below */
    }
    /* Every border cell was written exactly once (the first paint): a rail tick wrote none of them. */
    for (c = left; c < left + cols; c++) assert(pal_writes[top][c] == 1 && pal_writes[top + rows - 1][c] == 1);
    for (r = top; r < top + rows; r++) assert(pal_writes[r][left] == 1 && pal_writes[r][left + cols - 1] == 1);
}

int main(void)
{
    FILE *f;
    int rc;
    ae_native_set_exchange(board, 0);
    f = fopen(CAT_PATH, "wb");
    assert(f);
    fputs("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Menu: \nO scroll\nW -\t-\t-\nR 0\nS Messages\n"
          "E R\tRead Mail\tRead your mail\t\t\nE MS\tMail Scan\tScan for new mail\t\t\n.\n", f);
    fclose(f);

    invoked_name = "MENU";
    drive("\r", 1, &rc);                                    /* Enter on the first entry */
    assert(rc == 0 && strstr(requests, "OPEN MAIN|") == requests && strstr(requests, "RUN R|"));
    assert(strstr(screen_text, "Read Mail") && strstr(screen_text, "Esc/q Prompt"));
    printf("  [OK] an entry picked in the door runs its key through the board\n");

    drive("ms\r", 3, &rc);                                  /* a typed line */
    assert(rc == 0 && strstr(requests, "RUN ms|"));
    printf("  [OK] a typed line runs as typed\n");

    /* Colour off (541 = 0) at 80 columns: the board strips every SGR, so the
       selected entry must carry a character marker. The door's own screen
       measure asks the board; with colour on there is no marker at 80. */
    is_ansi = "0"; ansi_asks = 0;
    drive("\x1b", 1, &rc);
    assert(rc == 0 && ansi_asks >= 1 && strstr(screen_text, ">>R"));
    is_ansi = "1"; ansi_asks = 0;
    drive("\x1b", 1, &rc);
    assert(rc == 0 && ansi_asks >= 1 && !strstr(screen_text, ">>"));
    is_ansi = "";
    printf("  [OK] colour off marks the selected entry with >> at 80 columns; colour on does not\n");

    /* A C64 caller (40 columns, no cell backgrounds): the caret row is the
       mark, drawn in a pen that shows on the black screen - never the
       selection ink, which is black in five themes and made the row vanish. */
    size_text = "40\t25"; is_ansi = "1";
    drive("\x1b", 1, &rc);
    {
        const char *caret = strstr(screen_text, ">>");
        const char *sgr = caret;
        assert(rc == 0 && caret);
        /* the colour the caret row is drawn in: the last SGR before it (a cursor move may sit between) */
        while (sgr > screen_text && !(sgr[0] == '\x1b' && sgr[1] == '[' && strcspn(sgr + 2, "ABCDHJKm") == strspn(sgr + 2, "0123456789;") && sgr[2 + strspn(sgr + 2, "0123456789;")] == 'm')) sgr--;
        assert(sgr > screen_text);
        assert(strncmp(sgr, "\x1b[0;38;2;0;0;0m", 15) != 0 && strncmp(sgr, "\x1b[1;38;2;0;0;0m", 15) != 0);
        assert(strncmp(sgr, "\x1b[0;30m", 7) != 0 && strncmp(sgr, "\x1b[1;30m", 7) != 0);
        /* ...and it is a bar: reverse video is on at the caret, the C64's inverted characters, since its cells
           carry no background. The caret alone left the row unmarked but for two characters (sysop, 2026-10-18). */
        {
            const char *p, *on = 0, *off = 0;
            for (p = screen_text; p < caret; p++) {
                if (!strncmp(p, "\x1b[7m", 4)) on = p;
                else if (!strncmp(p, "\x1b[27m", 5)) off = p;
            }
            assert(on && (!off || off < on));
            assert(strncmp(sgr, "\x1b[0;", 4) != 0 || strncmp(sgr, "\x1b[0;7;", 6) == 0);   /* a colour after it keeps it */
        }
    }
    size_text = "80\t25"; is_ansi = "";
    printf("  [OK] the selected row at 40 columns is a reverse bar, never drawn in black\n");

    /* The board prompt keeps its colours in the typing row (express.e:28417-28420),
       and the cursor sits after the columns the caller sees, not after the bytes. */
    f = fopen(CAT_PATH, "wb");
    assert(f);
    fputs("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP \x1b[35mBBS \x1b[36m1\x1b[0m: \nO scroll\nW -\t-\t-\nR 0\nS Messages\n"
          "E R\tRead Mail\tRead your mail\t\t\n.\n", f);
    fclose(f);
    is_ansi = "1";
    drive("ms\r", 3, &rc);
    assert(rc == 0 && strstr(requests, "RUN ms|") && strstr(screen_text, "\x1b[35mBBS \x1b[36m1\x1b[0m"));
    assert(strstr(screen_text, ";10H"));                    /* "BBS 1: " is 7 columns, "ms" 2: the cursor is at column 10 */
    is_ansi = "";
    printf("  [OK] the board prompt keeps its colours and the cursor follows its visible width\n");

    drive("qms\r", 4, &rc);                                 /* q on an empty line leaves; nothing after it is read */
    assert(rc == 0 && !strstr(requests, "RUN"));
    printf("  [OK] q on an empty line leaves the door without running anything\n");

    /* A catalogue still on disk with the retired Pages style (O pages) scrolls: no page number, PgDn scrolls. */
    f = fopen(CAT_PATH, "wb");
    assert(f);
    fputs("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Menu: \nO pages\nW -\t-\t-\nR 0\nS Messages\n", f);
    {
        int i;
        for (i = 0; i < 30; i++) fprintf(f, "E K%d\tLabel %d\tA long description of what this entry does for the caller\t\t\n", i, i);
    }
    fputs(".\n", f);
    fclose(f);
    size_text = "40\t25";
    invoked_name = "MENU";
    drive("\x1b", 1, &rc);
    assert(rc == 0 && strstr(screen_text, "Label 0") && !strstr(screen_text, "Page 1 of"));
    drive("\x1b[6~\x1b", 5, &rc);
    assert(rc == 0 && !strstr(screen_text, "Page 2 of"));
    printf("  [OK] an O pages catalogue (Pages was retired) scrolls: no page number\n");
    size_text = "80\t25";
    f = fopen(CAT_PATH, "wb");
    assert(f);
    fputs("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Menu: \nO scroll\nW -\t-\t-\nR 0\nS Messages\nE R\tRead Mail\tRead your mail\t\t\n.\n", f);
    fclose(f);
    drive("\x1b", 1, &rc);
    assert(rc == 0 && !strstr(screen_text, "Page "));
    printf("  [OK] scroll mode shows no page number\n");

    /* Scroll: Left and Right page at every width, not only on a one-column grid (sysop 2026-10-17). Short labels
       make the 80-column grid several columns wide; Right must land where PageDown lands, not on the cell beside. */
    {
        char paged[64], rightward[64];
        int i;
        f = fopen(CAT_PATH, "wb");
        assert(f);
        fputs("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Menu: \nO scroll\nW -\t-\t-\nR 0\nS Many\n", f);
        for (i = 0; i < 120; i++) fprintf(f, "E K%d\tN%d\t\t\t\n", i, i);
        fputs(".\n", f);
        fclose(f);
        invoked_name = "MENU";
        drive("\x1b[6~\r", 5, &rc);
        assert(rc == 0 && strstr(requests, "RUN K"));
        snprintf(paged, sizeof paged, "%s", strstr(requests, "RUN K"));
        *strchr(paged, '|') = '\0';
        drive("\x1b[C\r", 4, &rc);
        assert(rc == 0 && strstr(requests, "RUN K"));
        snprintf(rightward, sizeof rightward, "%s", strstr(requests, "RUN K"));
        *strchr(rightward, '|') = '\0';
        assert(strcmp(paged, "RUN K0") != 0 && strcmp(paged, "RUN K1") != 0);   /* a screen, not a row or a cell */
        assert(strcmp(rightward, paged) == 0);
        printf("  [OK] a multi-column Scroll grid: Right pages like PageDown, it does not step to the cell beside\n");
    }

    /* The legacy drill line (D 1, slide off) means cover flow: Enter runs the page's entry, Right turns to page 2. */
    f = fopen(CAT_PATH, "wb");
    assert(f);
    fputs("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Menu: \nO scroll\nW -\t-\t-\nD 1\t0\nR 0\nS Messages\n"
          "E R\tRead Mail\tRead your mail\t\t\nE E\tEnter Message\tWrite a message\t\t\nS Conferences\nE J\tJoin Conference\tJoin another conference\t\t\n.\n", f);
    fclose(f);
    invoked_name = "MENU";
    drive("\r", 1, &rc);
    assert(rc == 0 && strstr(requests, "RUN R|") && strstr(screen_text, "< 1/2 Messages >"));
    drive("\x1b[C\r", 4, &rc);
    assert(rc == 0 && strstr(requests, "RUN J|") && strstr(screen_text, "< 2/2 Conferences >") && !strstr(requests, "WIPE IN P "));
    printf("  [OK] the legacy drill line opens cover flow: Enter runs, Right turns the page\n");
    printf("  [OK] cover flow is one column: Right on a page of two entries turns the page, it does not step sideways\n");

    /* The palette: the same catalogue flattened, the board's main line after the name is the filter. */
    invoked_name = "PALETTE";
    main_line = "PALETTE join";
    drive("\r", 1, &rc);
    assert(rc == 0 && strstr(requests, "OPEN MAIN|") && strstr(requests, "RUN J|") && strstr(screen_text, "1 of 3"));
    printf("  [OK] the palette starts from the board's main line and Enter runs the match\n");
    main_line = "PALETTE";
    drive("mail\x1b\x1b", 6, &rc);                       /* Esc clears the text, the second Esc leaves */
    assert(rc == 0 && !strstr(requests, "RUN") && !strstr(requests, "ROW") && strstr(screen_text, "Type to search")
           && strstr(screen_text, "3 of 3"));
    drive("q\x1b\x1b", 3, &rc);                           /* q types; it does not leave */
    assert(rc == 0 && !strstr(requests, "RUN"));
    printf("  [OK] the palette counts its matches, q is a letter, and Esc leaves without running\n");
    drive("r\r", 2, &rc);                                  /* the exact key beats a label that contains it */
    assert(rc == 0 && strstr(requests, "RUN R|"));
    drive("J 3.1\r", 6, &rc);                              /* nothing matches: the line runs as typed */
    assert(rc == 0 && strstr(requests, "RUN J 3.1|") && strstr(screen_text, "Nothing matches"));
    printf("  [OK] Enter runs the exact key first, and an unlisted line runs as typed\n");
    drive("mail", 4, &rc);                                 /* no leaving key: the wait before the lost carrier ticks the rail */
    assert(rc == 0 && strstr(requests, "SAVE 5 11 16 60|") && palette_runs_on_top(screen_text, 5, 11, 16, 60) >= 2);
    palette_rail_is_inside_the_box(5, 11, 16, 60, 1);
    size_text = "40\t25";
    drive("mail", 4, &rc);                                 /* 40 columns: no rail, the static frame, still only the box */
    assert(rc == 0 && strstr(requests, "SAVE 6 2 14 38|") && palette_runs_on_top(screen_text, 6, 2, 14, 38) >= 0);
    palette_rail_is_inside_the_box(6, 2, 14, 38, 0);
    size_text = "80\t25";
    printf("  [OK] the palette is a modal: nothing outside the box, and its top line is the animated rail\n");
    main_line = "";

    invoked_name = "MENU";
    drive("\x0b", 1, &rc);
                                  /* Ctrl-K in the menu: the palette box opens over it, in this process */
    assert(rc == 0 && !strstr(requests, "RUN") && last_glyph(screen_text, 5, 11) == '+' && last_glyph(screen_text, 5, 70) == '+'
           && strstr(screen_text, "Type to search"));
    drive("\x0b\x1b", 2, &rc);                             /* Esc closes it: the menu is painted whole again, the box is gone */
    assert(rc == 0 && last_glyph(screen_text, 5, 11) != '+' && strstr(strstr(screen_text, "Type to search"), "MAIN MENU"));
    drive("\x0b\x1b\r", 3, &rc);                          /* the door is still running: Enter runs the menu's first entry */
    assert(rc == 0 && strstr(requests, "RUN R|") && last_glyph(screen_text, 5, 11) != '+');
    drive("\x0bjoin\r", 6, &rc);                          /* a pick in the palette runs like a menu pick */
    assert(rc == 0 && strstr(requests, "RUN J|"));
    printf("  [OK] Ctrl-K in the menu opens the palette over it, Esc repaints the menu and the door runs on, a pick runs\n");

    invoked_name = "MENUSETTINGS";
    drive("\x1b", 1, &rc);
    assert(rc == 0 && strstr(requests, "STYLE?|") && !strstr(requests, "OPEN") && strstr(screen_text, "MENU STYLE"));
    printf("  [OK] the second registration name opens the settings, not the menu\n");

    remove(CAT_PATH); remove("build/test_mainmenu_keys.bin"); remove("build/test_mainmenu_screen.bin");
    puts("test_mainmenu: OK");
    return 0;
}
