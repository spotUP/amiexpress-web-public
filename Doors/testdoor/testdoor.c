/*
 * Basic Test Door - Minimal working example
 * This demonstrates the basic structure of a C door
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Simplified stub functions for testing */
void Register(int node) {
    printf("Door registered on node %d\n", node);
}

void ShutDown(void) {
    printf("Door shutting down\n");
    exit(0);
}

void sendmessage(char *text, int newline) {
    printf("%s", text);
    if (newline) printf("\n");
}

void prompt(char *prompt_text, char *result, int max_len) {
    printf("%s", prompt_text);
    fgets(result, max_len, stdin);
    /* Remove trailing newline */
    char *newline = strchr(result, '\n');
    if (newline) *newline = '\0';
}

void hotkey(char *prompt_text, char *result) {
    if (prompt_text && *prompt_text) {
        printf("%s", prompt_text);
    }
    int ch = getchar();
    if (result) {
        result[0] = (char)ch;
        result[1] = '\0';
    }
    /* Consume rest of line */
    while (getchar() != '\n');
}

void getuserstring(char *result, int field_id) {
    switch (field_id) {
        case 100: /* DT_NAME */
            strcpy(result, "TestUser");
            break;
        case 102: /* DT_LOCATION */
            strcpy(result, "TestCity");
            break;
        case 11: /* JH_BBSNAME */
            strcpy(result, "TestBBS");
            break;
        default:
            strcpy(result, "Unknown");
            break;
    }
}

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