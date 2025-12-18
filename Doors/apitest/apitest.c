/*
 * API Test Door
 * Tests all AmiExpress API functions
 */

#include "../../dev/c-doors/includes/amiexpress.h"

/* Main door function */
int main(int argc, char *argv[]) {
    char username[200];
    char location[200];
    char input[200];

    /* Check arguments - BBS passes node number */
    if (argc < 2) {
        printf("This is a BBS door - run from AmiExpress!\n");
        return 1;
    }

    /* Register with BBS */
    Register(atoi(argv[1]));

    /* Get user information */
    getuserstring(username, 100);  /* DT_NAME */
    getuserstring(location, 102);  /* DT_LOCATION */

    /* Display welcome message */
    sendmessage("\r\n", 1);
    sendmessage("================================\r\n", 1);
    sendmessage("    Welcome to the C Door!\r\n", 1);
    sendmessage("================================\r\n", 1);
    sendmessage("\r\n", 1);

    /* Show user info */
    sendmessage("Hello ", 0);
    sendmessage(username, 0);
    sendmessage(" from ", 0);
    sendmessage(location, 0);
    sendmessage("!\r\n", 1);
    sendmessage("\r\n", 1);

    /* Simple input example */
    prompt("What's your favorite programming language? ", input, 50);
    sendmessage("\r\nYou said: ", 0);
    sendmessage(input, 1);
    sendmessage("\r\n", 1);

    /* Hotkey example */
    sendmessage("Press any key to continue...", 1);
    hotkey("", NULL);

    /* Display system info */
    getuserstring(username, 11); /* JH_BBSNAME */
    sendmessage("\r\nBBS Name: ", 0);
    sendmessage(username, 1);

    /* Clean shutdown */
    ShutDown();
    return 0;
}