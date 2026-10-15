/* test_bulletins.c - the BULLETINS door's own answers, driven through its real main():
   an entry runs its key, a typed line runs as typed, and q or Esc leaves. Bulletins has one registration. */
#define main bulletins_main
#include "../examples/bulletins/bulletins.c"
#undef main
#include "../include/ae_transport_native.h"
#include "../include/ae_session.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static int cat_answers = 1;
int ae_field_read(int field, char *out, int cap) { (void)field; if (cap > 0) out[0] = '\0'; return 0; }
int ae_field_write(int field, const char *value) { (void)field; (void)value; return 0; }
int ae_query_bit(int acs) { (void)acs; return 1; }

#define CAT_PATH "build/test_bulletins.cat"
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
    if (strncmp(request, "OPEN ", 5) == 0) return cat_answers ? answer("OK\t" CAT_PATH, out, cap) : 0;
    if (strncmp(request, "SHOW ", 5) == 0) return answer("OK", out, cap);
    return 0;
}

static void drive(const char *keys, size_t n, int *rc)
{
    FILE *f = fopen("build/test_bulletins_keys.bin", "wb");
    int saved = dup(1);
    size_t got;
    char *argv[] = { (char *)"bulletins", (char *)"1", 0 };
    assert(f); fwrite(keys, 1, n, f); fclose(f);
    requests[0] = '\0';
    fflush(stdout);
    assert(freopen("build/test_bulletins_screen.bin", "wb", stdout));
    assert(freopen("build/test_bulletins_keys.bin", "rb", stdin));
    *rc = bulletins_main(2, argv);
    fflush(stdout);
    dup2(saved, 1); close(saved); clearerr(stdout);
    f = fopen("build/test_bulletins_screen.bin", "rb"); assert(f);
    got = fread(screen_text, 1, sizeof screen_text - 1, f); screen_text[got] = '\0'; fclose(f);
}

int main(void)
{
    FILE *f;
    int rc;
    ae_native_set_exchange(board, 0);
    f = fopen(CAT_PATH, "wb");
    assert(f);
    fputs("AEMENU 1\nK BULLETINS\t-\nT BULLETINS\nP Bulletin: \nO scroll\nW -\t-\t-\nR 0\nS Bulletins\n"
          "E 1\tTop Uploaders\tThe best uploaders\t\t\nE 2\tBoard News\tWhat is new\t\t\nE 12\tRules\tHouse rules\t\t\n.\n", f);
    fclose(f);

    drive("\r", 1, &rc);                                    /* Enter on the first bulletin */
    assert(rc == 0 && strstr(requests, "OPEN BULLETINS|") == requests && strstr(requests, "SHOW 1|"));
    assert(strstr(screen_text, "Top Uploaders") && strstr(screen_text, "Enter Read"));
    printf("  [OK] Enter shows the picked bulletin through the board\n");

    drive("2", 1, &rc);                                     /* a unique number acts without Enter */
    assert(rc == 0 && strstr(requests, "SHOW 2|"));
    drive("1\x15q", 3, &rc);                                /* 1 is a prefix of 12: waits for Enter (Ctrl-U, q leaves) */
    assert(!strstr(requests, "SHOW"));
    drive("12\r", 3, &rc);
    assert(strstr(requests, "SHOW 12|"));
    printf("  [OK] a number shows its bulletin; a prefix of another waits\n");

    drive("9\rq", 3, &rc);                                  /* no such bulletin: a status line, the door stays */
    assert(rc == 0 && !strstr(requests, "SHOW") && strstr(screen_text, "Sorry, there is no such bulletin."));
    printf("  [OK] an unknown number says so and shows nothing\n");

    drive("q2", 2, &rc);                                    /* keys are digits, so q leaves; nothing after it is read */
    assert(rc == 0 && !strstr(requests, "SHOW"));
    drive("\x1b", 1, &rc);
    assert(rc == 0 && !strstr(requests, "SHOW"));
    assert(strstr(screen_text, "Esc/q Leave") && !strstr(screen_text, "Esc Prompt"));
    assert(strstr(screen_text, MENUDOOR_HINT_NUMBER_WIDE) && !strstr(screen_text, MENUDOOR_HINT_WIDE));   /* its typing is numbers */
    printf("  [OK] q and Esc leave, and the key bar says both; the hint says number\n");

    drive("x", 1, &rc);                                     /* a script that runs out of keys is a lost carrier: the door ends, not spins */
    assert(rc == 0);
    printf("  [OK] a key script with no leaving key ends the door at end of input\n");

    cat_answers = 0;                                        /* an old board that does not know AEW_MENU */
    drive("", 0, &rc);
    assert(rc == 0 && strstr(screen_text, "[ae_return_command] BULLS"));
    printf("  [OK] a silent board hands B to the old Bulls door\n");

    remove(CAT_PATH); remove("build/test_bulletins_keys.bin"); remove("build/test_bulletins_screen.bin");
    puts("test_bulletins: OK");
    return 0;
}
