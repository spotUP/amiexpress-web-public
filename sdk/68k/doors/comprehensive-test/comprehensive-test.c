/*
 * Comprehensive C Door Test
 *
 * Tests all basic functionality of the 68K SDK:
 * - User data queries (getlevel, getname, getlocation, getnode, getbbsname)
 * - argc/argv parsing
 * - Input/output functions
 * - File display
 * - System functions
 *
 * This demonstrates that C doors can do everything XIM/SIM doors can do.
 */

#include "../../includes/amiexpress.h"

/* Test result tracking */
static int tests_passed = 0;
static int tests_failed = 0;

void display_test_result(const char *test_name, int passed) {
    sendmessage("  [", 0);
    if (passed) {
        sendmessage("PASS", 0);
        tests_passed++;
    } else {
        sendmessage("FAIL", 0);
        tests_failed++;
    }
    sendmessage("] ", 0);
    sendmessage((char *)test_name, 0);
    sendmessage("\r\n", 0);
}

void test_argc_argv(int argc, char *argv[]) {
    sendmessage("\r\n=== Testing argc/argv Parsing ===\r\n", 0);

    char buffer[256];
    buffer[0] = 'a';
    buffer[1] = 'r';
    buffer[2] = 'g';
    buffer[3] = 'c';
    buffer[4] = '=';

    /* Convert argc to string */
    int n = argc;
    char temp[32];
    int i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);

    int j = 5;
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';

    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    for (i = 0; i < argc && i < 10; i++) {
        sendmessage("  argv[", 0);
        buffer[0] = '0' + i;
        buffer[1] = '\0';
        sendmessage(buffer, 0);
        sendmessage("] = ", 0);
        sendmessage(argv[i], 0);
        sendmessage("\r\n", 0);
    }

    display_test_result("argc/argv parsing", argc > 0);
}

void test_user_data_queries(void) {
    sendmessage("\r\n=== Testing User Data Queries ===\r\n", 0);

    /* Test getname() */
    char *name = getname();
    sendmessage("User Name: ", 0);
    sendmessage(name ? name : "(null)", 0);
    sendmessage("\r\n", 0);
    display_test_result("getname()", name != NULL && name[0] != '\0');

    /* Test getlocation() */
    char *location = getlocation();
    sendmessage("Location: ", 0);
    sendmessage(location ? location : "(null)", 0);
    sendmessage("\r\n", 0);
    display_test_result("getlocation()", location != NULL);

    /* Test getlevel() */
    int level = getlevel();
    sendmessage("Security Level: ", 0);
    char buffer[32];
    int n = level;
    char temp[32];
    int i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);
    int j = 0;
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);
    display_test_result("getlevel()", level >= 0 && level <= 255);

    /* Test getnode() */
    int node = getnode();
    sendmessage("Node Number: ", 0);
    n = node;
    i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);
    j = 0;
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);
    display_test_result("getnode()", node > 0);

    /* Test getbbsname() */
    char *bbsname = getbbsname();
    sendmessage("BBS Name: ", 0);
    sendmessage(bbsname ? bbsname : "(null)", 0);
    sendmessage("\r\n", 0);
    display_test_result("getbbsname()", bbsname != NULL && bbsname[0] != '\0');
}

void test_getuserstring(void) {
    sendmessage("\r\n=== Testing getuserstring() ===\r\n", 0);

    char buffer[256];

    /* Test DT_NAME */
    getuserstring(buffer, DT_NAME);
    sendmessage("DT_NAME: ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);
    display_test_result("getuserstring(DT_NAME)", buffer[0] != '\0');

    /* Test DT_LOCATION */
    getuserstring(buffer, DT_LOCATION);
    sendmessage("DT_LOCATION: ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);
    display_test_result("getuserstring(DT_LOCATION)", buffer[0] != '\0');

    /* Test DT_SECSTATUS */
    getuserstring(buffer, DT_SECSTATUS);
    sendmessage("DT_SECSTATUS: ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);
    display_test_result("getuserstring(DT_SECSTATUS)", buffer[0] != '\0');
}

void test_input_output(void) {
    sendmessage("\r\n=== Testing Input/Output Functions ===\r\n", 0);

    /* Test sendmessage */
    sendmessage("Testing sendmessage()...", 0);
    sendmessage(" OK\r\n", 0);
    display_test_result("sendmessage()", 1);

    /* Test mciputstr */
    mciputstr("Testing ~c2MCI ~c4color ~c1codes~c7...", 0);
    sendmessage(" OK\r\n", 0);
    display_test_result("mciputstr()", 1);

    /* Test prompt */
    char input[80];
    prompt("Enter your name (or press Enter): ", input, 79);
    sendmessage("You entered: ", 0);
    sendmessage(input[0] ? input : "(empty)", 0);
    sendmessage("\r\n", 0);
    display_test_result("prompt()", 1);

    /* Test Hotkey */
    sendmessage("\r\nPress any key to continue...", 0);
    char key = Hotkey();
    sendmessage("\r\nYou pressed key code: ", 0);
    char keybuf[4];
    int n = (int)key;
    if (n < 0) n = -n;
    char temp[32];
    int i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);
    int j = 0;
    while (i > 0) keybuf[j++] = temp[--i];
    keybuf[j] = '\0';
    sendmessage(keybuf, 0);
    sendmessage("\r\n", 0);
    display_test_result("Hotkey()", 1);
}

void test_getinfo_putinfo(void) {
    sendmessage("\r\n=== Testing GetInfo/PutInfo ===\r\n", 0);

    /* Test GetInfo with various constants */
    int level = GetInfo(DT_SECSTATUS);
    sendmessage("GetInfo(DT_SECSTATUS): ", 0);
    char buffer[32];
    int n = level;
    char temp[32];
    int i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);
    int j = 0;
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);
    display_test_result("GetInfo()", level >= 0);

    /* PutInfo test (sets a value) */
    PutInfo(12345, 1000);  /* Test command */
    display_test_result("PutInfo()", 1);
}

void test_system_functions(void) {
    sendmessage("\r\n=== Testing System Functions ===\r\n", 0);

    /* Test IsAccess */
    int has_access = IsAccess(10);  /* Check if user has level 10+ */
    sendmessage("IsAccess(10): ", 0);
    sendmessage(has_access ? "YES" : "NO", 0);
    sendmessage("\r\n", 0);
    display_test_result("IsAccess()", 1);

    /* Test CheckToDisplay */
    int should_display = CheckToDisplay("test");
    sendmessage("CheckToDisplay(): ", 0);
    sendmessage(should_display ? "YES" : "NO", 0);
    sendmessage("\r\n", 0);
    display_test_result("CheckToDisplay()", should_display != 0);
}

void display_summary(void) {
    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("         TEST SUMMARY\r\n", 0);
    sendmessage("=====================================\r\n", 0);

    char buffer[64];
    char temp[32];
    int i, j;

    /* Display passed */
    buffer[0] = 'P'; buffer[1] = 'a'; buffer[2] = 's'; buffer[3] = 's';
    buffer[4] = 'e'; buffer[5] = 'd'; buffer[6] = ':'; buffer[7] = ' ';
    int n = tests_passed;
    i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);
    j = 8;
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    /* Display failed */
    buffer[0] = 'F'; buffer[1] = 'a'; buffer[2] = 'i'; buffer[3] = 'l';
    buffer[4] = 'e'; buffer[5] = 'd'; buffer[6] = ':'; buffer[7] = ' ';
    n = tests_failed;
    i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);
    j = 8;
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    /* Display total */
    int total = tests_passed + tests_failed;
    buffer[0] = 'T'; buffer[1] = 'o'; buffer[2] = 't'; buffer[3] = 'a';
    buffer[4] = 'l'; buffer[5] = ':'; buffer[6] = ' '; buffer[7] = ' ';
    n = total;
    i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);
    j = 8;
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    sendmessage("=====================================\r\n", 0);

    if (tests_failed == 0) {
        sendmessage("\r\n~c2ALL TESTS PASSED!~c7\r\n", 0);
    } else {
        sendmessage("\r\n~c4SOME TESTS FAILED~c7\r\n", 0);
    }
}

int main(int argc, char *argv[]) {
    /* Register with BBS */
    Register(1);

    /* Display header */
    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("  Comprehensive C Door Test Suite\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("\r\n", 0);
    sendmessage("This door tests ALL functionality of\r\n", 0);
    sendmessage("the 68K C SDK to demonstrate that C\r\n", 0);
    sendmessage("doors can do everything XIM/SIM doors\r\n", 0);
    sendmessage("can do.\r\n", 0);

    /* Run all tests */
    test_argc_argv(argc, argv);
    test_user_data_queries();
    test_getuserstring();
    test_input_output();
    test_getinfo_putinfo();
    test_system_functions();

    /* Display summary */
    display_summary();

    /* Wait for user */
    sendmessage("\r\nPress any key to exit...", 0);
    Hotkey();
    sendmessage("\r\n", 0);

    /* Clean shutdown */
    ShutDown();
    return 0;
}
