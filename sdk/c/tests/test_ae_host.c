/*
 * The door's side of the host contract.
 *
 * Run on the host, where getenv() stands in for GetVar(); the parsing and
 * the defaults are the same code that runs on the 68K.
 *
 * The case that matters most is the empty one: a door on classic AmiExpress
 * finds nothing, and must come away believing it has an 80x25 ANSI terminal
 * and nothing else. Everything else here is an addition to that.
 */

#include "../include/ae_host.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void clear_env(void)
{
    unsetenv("AE_HOST");
    unsetenv("AE_HOST_VERSION");
    unsetenv("AE_CONNECTION");
    unsetenv("AE_CLIENT");
    unsetenv("AE_CAPS");
    ae_host_reset();
}

static void a_classic_board_says_nothing_and_that_is_the_safe_answer(void)
{
    clear_env();

    assert(ae_host() == AE_HOST_CLASSIC);
    assert(ae_can(AE_CAP_ANSI));
    assert(!ae_can(AE_CAP_PETSCII));
    assert(!ae_can(AE_CAP_WIDE));
    assert(!ae_can(AE_CAP_MOUSE));
    assert(ae_host_info()->client == AE_CLIENT_ANSI);
    assert(ae_host_info()->version[0] == '\0');
    printf("  [OK] a classic board says nothing, and that is the safe answer\n");
}

static void a_host_we_do_not_know_is_treated_as_classic(void)
{
    clear_env();
    setenv("AE_HOST", "some-other-bbs", 1);
    setenv("AE_CAPS", "ansi,petscii,wide,mouse", 1);
    ae_host_reset();

    /* It said PETSCII. We have never heard of it, so we believe none of it. */
    assert(ae_host() == AE_HOST_CLASSIC);
    assert(!ae_can(AE_CAP_PETSCII));
    assert(!ae_can(AE_CAP_WIDE));
    printf("  [OK] a host we do not know is treated as classic\n");
}

static void a_c64_caller_is_named(void)
{
    clear_env();
    setenv("AE_HOST", "amiexpress-web", 1);
    setenv("AE_HOST_VERSION", "1.0.0", 1);
    setenv("AE_CONNECTION", "telnet", 1);
    setenv("AE_CLIENT", "petscii", 1);
    setenv("AE_CAPS", "ansi,petscii,c64adapt", 1);
    ae_host_reset();

    assert(ae_host() == AE_HOST_WEB);
    assert(ae_host_info()->connection == AE_CONNECTION_TELNET);
    assert(ae_host_info()->client == AE_CLIENT_PETSCII);
    assert(ae_can(AE_CAP_PETSCII));
    assert(ae_can(AE_CAP_C64ADAPT));
    assert(!ae_can(AE_CAP_WIDE));
    assert(strcmp(ae_host_info()->version, "1.0.0") == 0);
    printf("  [OK] a C64 caller is named, and gets no wide terminal\n");
}

static void a_browser_caller_gets_the_room_and_the_mouse(void)
{
    clear_env();
    setenv("AE_HOST", "amiexpress-web", 1);
    setenv("AE_CONNECTION", "web", 1);
    setenv("AE_CLIENT", "ansi", 1);
    setenv("AE_CAPS", "ansi,wide,mouse", 1);
    ae_host_reset();

    assert(ae_can(AE_CAP_WIDE));
    assert(ae_can(AE_CAP_MOUSE));
    assert(!ae_can(AE_CAP_PETSCII));
    printf("  [OK] a browser caller gets the room and the mouse\n");
}

static void a_capability_is_matched_whole(void)
{
    /* A door asking for "pet" must not be told it has "petscii". */
    assert(ae_caps_parse("ansi,petscii") == (AE_CAP_ANSI | AE_CAP_PETSCII));
    assert((ae_caps_parse("ansi,petsciiX") & AE_CAP_PETSCII) == 0);
    assert((ae_caps_parse("Xansi") & AE_CAP_ANSI) == 0);
    assert(ae_caps_parse("") == 0);
    assert(ae_caps_parse(NULL) == 0);

    /* Order and unknown entries do not matter: the list will grow. */
    assert((ae_caps_parse("mouse,ansi,something-new") & AE_CAP_MOUSE) == AE_CAP_MOUSE);
    printf("  [OK] a capability is matched whole, in any order\n");
}

static void the_answer_is_read_once(void)
{
    clear_env();
    setenv("AE_HOST", "amiexpress-web", 1);
    setenv("AE_CAPS", "ansi,wide", 1);
    ae_host_reset();
    assert(ae_can(AE_CAP_WIDE));

    /* The environment changing under a running door does not change the
       answer: a door that asked once has already drawn its screen. */
    setenv("AE_CAPS", "ansi", 1);
    assert(ae_can(AE_CAP_WIDE));

    ae_host_reset();
    assert(!ae_can(AE_CAP_WIDE));
    printf("  [OK] the answer is read once, and reset is explicit\n");
}

int main(void)
{
    printf("ae_host\n");
    a_classic_board_says_nothing_and_that_is_the_safe_answer();
    a_host_we_do_not_know_is_treated_as_classic();
    a_c64_caller_is_named();
    a_browser_caller_gets_the_room_and_the_mouse();
    a_capability_is_matched_whole();
    the_answer_is_read_once();
    printf("ae_host: all passed\n");
    return 0;
}
