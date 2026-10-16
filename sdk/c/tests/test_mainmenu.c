/* test_mainmenu.c - the MAINMENU door's own two answers, driven through its real main():
   an entry runs its key, a typed line runs as typed, and the second registration opens the settings screen. */
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
static const char *is_ansi = "";     /* 541: "" is a silent board, which ae_user_is_ansi reads as colour off */
static int ansi_asks;
int ae_field_read(int field, char *out, int cap)
{
    const char *text = field == 605 ? invoked_name : field == 541 ? is_ansi : "";
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
    if (strcmp(request, "OVERFLOW?") == 0) return answer("default\tpages", out, cap);
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

    drive("qms\r", 4, &rc);                                 /* q on an empty line leaves; nothing after it is read */
    assert(rc == 0 && !strstr(requests, "RUN"));
    printf("  [OK] q on an empty line leaves the door without running anything\n");

    /* Pages mode: the status row says which page the caller is on, and the description gives way to it. */
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
    assert(rc == 0 && strstr(screen_text, "Page 1 of 2"));
    printf("  [OK] pages mode names the page in the status row\n");
    drive("\x1b[6~\x1b", 5, &rc);                          /* PgDn turns the page: the status row follows */
    assert(rc == 0 && strstr(screen_text, "Page 2 of 2"));
    printf("  [OK] a page turn updates the page number\n");
    size_text = "80\t25";
    f = fopen(CAT_PATH, "wb");
    assert(f);
    fputs("AEMENU 1\nK MAIN\t-\nT MAIN MENU\nP Menu: \nO scroll\nW -\t-\t-\nR 0\nS Messages\nE R\tRead Mail\tRead your mail\t\t\n.\n", f);
    fclose(f);
    drive("\x1b", 1, &rc);
    assert(rc == 0 && !strstr(screen_text, "Page "));
    printf("  [OK] scroll mode shows no page number\n");

    invoked_name = "MENUSETTINGS";
    drive("\x1b", 1, &rc);
    assert(rc == 0 && strstr(requests, "OVERFLOW?|") && !strstr(requests, "OPEN") && strstr(screen_text, "LONG MENUS"));
    printf("  [OK] the second registration name opens the settings, not the menu\n");

    remove(CAT_PATH); remove("build/test_mainmenu_keys.bin"); remove("build/test_mainmenu_screen.bin");
    puts("test_mainmenu: OK");
    return 0;
}
