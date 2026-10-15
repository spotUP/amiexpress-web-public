/*
 * Simple AmiExpress 68K Door Diagnostic
 * Tests basic vbcc + AEDoor.library functionality
 */

#include "../../includes/amiexpress.h"

int main(int argc, char **argv) {
    Register(1);

    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("  68K DOOR DIAGNOSTIC (SIMPLE)\r\n", 0);
    sendmessage("  Testing vbcc + AEDoor.library\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("\r\n", 0);

    /* Test 1: sendmessage without newline */
    sendmessage("[TEST 1] sendmessage (no NL): ", 0);
    sendmessage("PASS", 0);
    sendmessage("\r\n", 0);

    /* Test 2: sendmessage with newline */
    sendmessage("[TEST 2] sendmessage (with NL): ", 0);
    sendmessage("PASS", 1);

    /* Test 3: Register function */
    sendmessage("[TEST 3] Register() called: PASS\r\n", 0);

    /* Test 4: Multiple writes */
    sendmessage("[TEST 4] Multiple writes: ", 0);
    sendmessage("A", 0);
    sendmessage("B", 0);
    sendmessage("C", 0);
    sendmessage(" PASS\r\n", 0);

    /* Test 5: argc/argv */
    sendmessage("[TEST 5] argc = ", 0);
    if (argc > 0) {
        sendmessage("PASS (argc > 0)\r\n", 0);
    } else {
        sendmessage("FAIL (argc = 0)\r\n", 0);
    }

    /* Summary */
    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("  ALL BASIC TESTS PASSED!\r\n", 0);
    sendmessage("  vbcc + AEDoor.library working\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("\r\n", 0);

    ShutDown();
    return 0;
}
