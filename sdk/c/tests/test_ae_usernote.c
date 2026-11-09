/* test_ae_usernote.c - ae_user_note against a stand-in board. */
#include "../include/ae_usernote.h"
#include "../include/ae_transport_native.h"
#include "../include/ae_session.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static char last_request[256];
static const char *next_answer = "";

static int stand_in(void *ctx, int field, const char *request, char *out, int cap)
{
    int n;
    (void)ctx;
    assert(field == AE_FIELD_USERNOTE && field == 11200);
    strncpy(last_request, request, sizeof(last_request) - 1);
    n = (int)strlen(next_answer);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, next_answer, (size_t)n);
    out[n] = '\0';
    return n;
}

int main(void)
{
    char longtext[400];
    printf("ae_usernote\n");
    ae_native_set_exchange(stand_in, 0);

    next_answer = "OK";
    assert(ae_user_note("Bob", "G\xf6teborg ok") == 1);
    assert(strcmp(last_request, "NOTE\tBob\tG\xf6teborg ok") == 0);
    printf("  [OK] request is NOTE TAB user TAB text, saved = 1\n");

    next_answer = "NO";
    assert(ae_user_note("Nobody", "hi") == 0);
    printf("  [OK] NO = 0\n");

    next_answer = "";
    assert(ae_user_note("Bob", "hi") == -1);
    printf("  [OK] empty reply = -1 (board cannot take notes)\n");

    next_answer = "OK";
    assert(ae_user_note("Bo\tb", "a\tb\x1b" "c") == 1);
    assert(strcmp(last_request, "NOTE\tBo b\ta b c") == 0);
    printf("  [OK] TAB and controls inside a field become spaces\n");

    memset(longtext, 'x', sizeof(longtext) - 1);
    longtext[sizeof(longtext) - 1] = '\0';
    assert(ae_user_note("Bob", longtext) == 1);
    assert(strlen(last_request) == 198 && strncmp(last_request, "NOTE\tBob\txx", 11) == 0);
    printf("  [OK] long text is clipped to fit the String\n");
    printf("ae_usernote: all passed\n");
    return 0;
}
