/*
 * Simple Amiga 68K Door Test - Minimal version for cross-compilation
 * Tests basic C SDK functions without standard library dependencies
 */

#include "../../includes/amiexpress.h"

int main(int argc, char *argv[]) {
    int node_num = 1;

    if (argc > 1) {
        /* Simple atoi implementation */
        char *p = argv[1];
        node_num = 0;
        while (*p >= '0' && *p <= '9') {
            node_num = node_num * 10 + (*p - '0');
            p++;
        }
    }

    /* Test basic registration */
    Register(node_num);

    /* Test basic output functions */
    sendmessage("Hello from 68K Amiga Door!\r\n", 1);
    mciputstr("MCIPUTSTR test", 1);
    MciSendStr("MCISENDSTR test", 1);
    sendMessage("SENDMESSAGE test", 1);
    ConOnly("CONONLY test", 1);
    SerOnly("SERONLY test", 1);

    /* Test input functions with minimal implementation */
    char buffer[100];
    prompt("Enter test: ", buffer, 50);
    sendmessage("You entered: ", 0);
    sendmessage(buffer, 1);
    sendmessage("\r\n", 1);

    /* Test user data access */
    getuserstring(buffer, 100); /* DT_NAME */
    sendmessage("User: ", 0);
    sendmessage(buffer, 1);
    sendmessage("\r\n", 1);

    getuserstring(buffer, 102); /* DT_LOCATION */
    sendmessage("Location: ", 0);
    sendmessage(buffer, 1);
    sendmessage("\r\n", 1);

    /* Test system info */
    int expert = GetInfo(121); /* DT_EXPERT */
    char numbuf[10];
    /* Simple itoa */
    int i = 0;
    int temp = expert;
    if (temp == 0) {
        numbuf[i++] = '0';
    } else {
        int digits = 0;
        int t = temp;
        while (t > 0) { t /= 10; digits++; }
        t = temp;
        for (int j = digits - 1; j >= 0; j--) {
            numbuf[i + j] = '0' + (t % 10);
            t /= 10;
        }
        i += digits;
    }
    numbuf[i] = '\0';

    sendmessage("Expert mode: ", 0);
    sendmessage(numbuf, 1);
    sendmessage("\r\n", 1);

    /* Test file operations */
    showfile("WELCOME.TXT");
    sendmessage("showfile() executed\r\n", 0);

    int dl_result = Download("test.txt");
    /* Convert int to string */
    i = 0;
    temp = dl_result;
    if (temp == 0) {
        numbuf[i++] = '0';
    } else {
        int is_negative = 0;
        if (temp < 0) { is_negative = 1; temp = -temp; }
        int digits = 0;
        int t = temp;
        while (t > 0) { t /= 10; digits++; }
        if (is_negative) digits++;
        t = temp;
        for (int j = digits - 1; j >= (is_negative ? 1 : 0); j--) {
            numbuf[i + j] = '0' + (t % 10);
            t /= 10;
        }
        if (is_negative) numbuf[i] = '-';
        i += digits;
    }
    numbuf[i] = '\0';

    sendmessage("Download result: ", 0);
    sendmessage(numbuf, 1);
    sendmessage("\r\n", 1);

    /* Test account functions */
    int last_acc = LastAccountNum();
    i = 0;
    temp = last_acc;
    if (temp == 0) {
        numbuf[i++] = '0';
    } else {
        int digits = 0;
        int t = temp;
        while (t > 0) { t /= 10; digits++; }
        t = temp;
        for (int j = digits - 1; j >= 0; j--) {
            numbuf[i + j] = '0' + (t % 10);
            t /= 10;
        }
        i += digits;
    }
    numbuf[i] = '\0';

    sendmessage("Last account: ", 0);
    sendmessage(numbuf, 1);
    sendmessage("\r\n", 1);

    /* Success message */
    sendmessage("68K Amiga Door Test Completed Successfully!\r\n", 0);

    /* Clean shutdown */
    ShutDown();

    return 0;
}