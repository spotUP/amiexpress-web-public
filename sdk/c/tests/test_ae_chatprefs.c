/* test_ae_chatprefs.c - ae_chat_prefs_* against a stand-in board. */
#include "../include/ae_chatprefs.h"
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
    assert(field == AE_FIELD_CHATPREFS && field == 11300);
    strncpy(last_request, request, sizeof(last_request) - 1);
    n = (int)strlen(next_answer);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, next_answer, (size_t)n);
    out[n] = '\0';
    return n;
}

int main(void)
{
    char out[200], big[400], name[64];
    const char *line = "showLogins=0;muteAllEvents=1;pinned=general,dev";
    printf("ae_chatprefs\n");
    ae_native_set_exchange(stand_in, 0);

    next_answer = line;
    assert(ae_chat_prefs_get(out, sizeof(out)) == (int)strlen(line));
    assert(strcmp(last_request, "GET") == 0 && strcmp(out, line) == 0);
    printf("  [OK] GET returns the line and its length\n");

    next_answer = "";
    assert(ae_chat_prefs_get(out, sizeof(out)) == -1 && out[0] == '\0');
    printf("  [OK] empty reply = -1\n");

    next_answer = "general,dev,ops";
    assert(ae_chat_prefs_get_pinned(out, sizeof(out)) == 15);
    assert(strcmp(last_request, "GET\tpinned") == 0 && strcmp(out, "general,dev,ops") == 0);
    printf("  [OK] GET pinned\n");

    next_answer = line;
    assert(ae_chat_prefs_get(out, 10) == 9 && strlen(out) == 9);
    printf("  [OK] short caller buffer is clipped and terminated\n");

    next_answer = "OK";
    assert(ae_chat_prefs_set("showLogins", "0") == 1);
    assert(strcmp(last_request, "SET\tshowLogins\t0") == 0);
    next_answer = "NO";
    assert(ae_chat_prefs_set("bogus", "1") == 0);
    next_answer = "";
    assert(ae_chat_prefs_set("showLogins", "1") == -1);
    printf("  [OK] SET: saved 1, refused 0, no reply -1\n");

    next_answer = "OK";
    assert(ae_chat_prefs_set("pinned\tChannels", "a\tb,c\x1b" "d") == 1);
    assert(strcmp(last_request, "SET\tpinned Channels\ta b,c d") == 0);
    printf("  [OK] TAB and controls inside a field become spaces\n");

    memset(big, 'x', sizeof(big) - 1);
    big[sizeof(big) - 1] = '\0';
    assert(ae_chat_prefs_set("pinnedChannels", big) == 1);
    assert(strlen(last_request) == 198);
    printf("  [OK] long value is clipped to the String\n");

    assert(ae_chat_prefs_bool(line, "showLogins", 1) == 0);
    assert(ae_chat_prefs_bool(line, "muteAllEvents", 0) == 1);
    assert(ae_chat_prefs_bool(line, "compactMode", 1) == 1);
    assert(ae_chat_prefs_bool(line, "Logins", 1) == 1);
    assert(ae_chat_prefs_bool(0, "x", 1) == 1);
    printf("  [OK] bool parser: values, default, whole-key match\n");

    assert(ae_chat_prefs_str(line, "pinned", name, sizeof(name)) == name && strcmp(name, "general,dev") == 0);
    assert(ae_chat_prefs_str(line, "showLogins", name, sizeof(name)) == name && strcmp(name, "0") == 0);
    assert(ae_chat_prefs_str(line, "nothere", name, sizeof(name)) == 0);
    assert(ae_chat_prefs_str(line, "pinned", name, 4) == name && strcmp(name, "gen") == 0);
    printf("  [OK] string parser\n");
    printf("ae_chatprefs: all passed\n");
    return 0;
}
