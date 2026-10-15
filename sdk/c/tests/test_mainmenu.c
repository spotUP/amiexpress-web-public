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
int ae_field_read(int field, char *out, int cap)
{
    int n = (field == 605) ? (int)strlen(invoked_name) : 0;
    if (n > cap - 1) n = cap - 1;
    if (cap > 0) { memcpy(out, invoked_name, (size_t)n); out[n] = '\0'; }
    return n;
}
int ae_field_write(int field, const char *value) { (void)field; (void)value; return 0; }
int ae_query_bit(int acs) { (void)acs; return 1; }

#define CAT_PATH "build/test_mainmenu.cat"
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
    if (field == AE_FIELD_SCREEN) return strcmp(request, "SIZE") == 0 ? answer("80\t25", out, cap) : 0;
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
    assert(strstr(screen_text, "Read Mail") && strstr(screen_text, "Esc Prompt"));
    printf("  [OK] an entry picked in the door runs its key through the board\n");

    drive("ms\r", 3, &rc);                                  /* a typed line */
    assert(rc == 0 && strstr(requests, "RUN ms|"));
    printf("  [OK] a typed line runs as typed\n");

    invoked_name = "MENUSETTINGS";
    drive("\x1b", 1, &rc);
    assert(rc == 0 && strstr(requests, "OVERFLOW?|") && !strstr(requests, "OPEN") && strstr(screen_text, "LONG MENUS"));
    printf("  [OK] the second registration name opens the settings, not the menu\n");

    remove(CAT_PATH); remove("build/test_mainmenu_keys.bin"); remove("build/test_mainmenu_screen.bin");
    puts("test_mainmenu: OK");
    return 0;
}
