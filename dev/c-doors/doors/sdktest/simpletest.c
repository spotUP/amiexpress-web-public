/*
 * Simple C Door SDK Test - Basic functionality verification
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../../includes/amiexpress.h"

int main(int argc, char *argv[]) {
    int node_num = 1;

    if (argc > 1) {
        node_num = atoi(argv[1]);
    }

    // Test basic registration
    Register(node_num);

    // Test basic output
    sendmessage("Hello from C Door SDK Test!\r\n", 1);

    // Test basic input
    char buffer[100];
    prompt("Enter something: ", buffer, 50);
    sendmessage("You entered: ", 0);
    sendmessage(buffer, 1);
    sendmessage("\r\n", 1);

    // Test user data
    getuserstring(buffer, DT_NAME);
    sendmessage("User name: ", 0);
    sendmessage(buffer, 1);
    sendmessage("\r\n", 1);

    // Test system info
    int expert = GetInfo(DT_EXPERT);
    char numbuf[10];
    sprintf(numbuf, "%d", expert);
    sendmessage("Expert mode: ", 0);
    sendmessage(numbuf, 1);
    sendmessage("\r\n", 1);

    // Test file operations
    showfile("WELCOME.TXT");
    sendmessage("showfile() completed\r\n", 0);

    // Test transfer functions
    int dl_result = Download("test.txt");
    sprintf(numbuf, "%d", dl_result);
    sendmessage("Download result: ", 0);
    sendmessage(numbuf, 1);
    sendmessage("\r\n", 1);

    // Test account functions
    int last_acc = LastAccountNum();
    sprintf(numbuf, "%d", last_acc);
    sendmessage("Last account: ", 0);
    sendmessage(numbuf, 1);
    sendmessage("\r\n", 1);

    // Clean shutdown
    sendmessage("SDK test completed successfully!\r\n", 0);
    ShutDown();

    return 0;
}