/* test_ae_board_screen_save.c - SAVE / RESTORE on AEW_SCREEN (10800), against a stand-in board. */
#include "../include/ae_board_screen.h"
#include "../include/ae_transport_native.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static char last_request[256];
static int requests;
static int silent;
static int held;

static int answer(const char *text, char *out, int cap)
{
    int n = (int)strlen(text);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, text, (size_t)n);
    out[n] = '\0';
    return n;
}

static int stand_in(void *ctx, int field, const char *request, char *out, int cap)
{
    (void)ctx; (void)field;
    out[0] = '\0';
    strncpy(last_request, request, sizeof(last_request) - 1);
    requests++;
    if (silent) return 0;
    if (strncmp(request, "SAVE ", 5) == 0) { held = 1; return answer("OK", out, cap); }
    if (strcmp(request, "RESTORE") == 0) {
        if (!held) return answer("NO", out, cap);
        held = 0;
        return answer("OK", out, cap);
    }
    return 0;
}

static void a_save_sends_its_region_and_a_restore_releases_it(void)
{
    held = 0;
    assert(ae_bs_save(3, 10, 5, 40) == 1);
    assert(strcmp(last_request, "SAVE 3 10 5 40") == 0);
    assert(ae_bs_restore() == 1);
    assert(strcmp(last_request, "RESTORE") == 0);
    assert(ae_bs_restore() == 0);
    printf("  [OK] a save sends its region and a restore releases it\n");
}

static void a_bad_region_is_never_sent(void)
{
    int before = requests;
    assert(ae_bs_save(0, 1, 1, 1) == 0);
    assert(ae_bs_save(1, 0, 1, 1) == 0);
    assert(ae_bs_save(1, 1, 0, 1) == 0);
    assert(ae_bs_save(1, 1, 1, 0) == 0);
    assert(ae_bs_save(1, 1, 1, 1000) == 0);
    assert(requests == before);
    printf("  [OK] a bad region is never sent\n");
}

static void a_silent_board_holds_nothing(void)
{
    silent = 1;
    assert(ae_bs_save(1, 1, 2, 2) == 0);
    assert(ae_bs_restore() == 0);
    silent = 0;
    printf("  [OK] a silent board holds nothing\n");
}

int main(void)
{
    ae_native_set_exchange(stand_in, 0);
    a_save_sends_its_region_and_a_restore_releases_it();
    a_bad_region_is_never_sent();
    a_silent_board_holds_nothing();
    puts("test_ae_board_screen_save: OK");
    return 0;
}
