/*
 * Advanced Functions Test Door
 *
 * Tests advanced functionality:
 * - Account management (Load_Account, Save_Account, etc.)
 * - Date/Time functions (GetTheDate, GetTheTime, etc.)
 * - Utility functions (Chain, AcpCommand, etc.)
 * - System functions (getsignal, GetSemaphore, etc.)
 * - Access control (AcsStat, IsAccess)
 *
 * Demonstrates advanced capabilities of C doors.
 */

#include "../../includes/amiexpress.h"

void display_menu(void) {
    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("   Advanced Functions Test Menu\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("\r\n", 0);
    sendmessage("1) Date/Time Functions\r\n", 0);
    sendmessage("2) Account Management\r\n", 0);
    sendmessage("3) Access Control Tests\r\n", 0);
    sendmessage("4) System Functions\r\n", 0);
    sendmessage("5) Utility Functions\r\n", 0);
    sendmessage("6) Conference Functions\r\n", 0);
    sendmessage("Q) Quit\r\n", 0);
    sendmessage("\r\n", 0);
    sendmessage("Select: ", 0);
}

void test_datetime(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Date/Time Functions ===\r\n", 0);
    sendmessage("\r\n", 0);

    /* Test GetTheDate */
    STRPTR date = GetTheDate(0);
    sendmessage("GetTheDate(): ", 0);
    sendmessage(date ? date : "(null)", 0);
    sendmessage("\r\n", 0);

    /* Test GetTheTime */
    STRPTR time = GetTheTime(0);
    sendmessage("GetTheTime(): ", 0);
    sendmessage(time ? time : "(null)", 0);
    sendmessage("\r\n", 0);

    /* Test DateToString */
    char datebuf[32];
    DateToString(0, datebuf);
    sendmessage("DateToString(): ", 0);
    sendmessage(datebuf, 0);
    sendmessage("\r\n", 0);

    /* Test TimeToString */
    char timebuf[32];
    TimeToString(0, timebuf);
    sendmessage("TimeToString(): ", 0);
    sendmessage(timebuf, 0);
    sendmessage("\r\n", 0);

    /* Test getsystime */
    char sysdate[32];
    char systime[32];
    getsystime(0, sysdate, systime);
    sendmessage("getsystime():\r\n", 0);
    sendmessage("  Date: ", 0);
    sendmessage(sysdate, 0);
    sendmessage("\r\n  Time: ", 0);
    sendmessage(systime, 0);
    sendmessage("\r\n", 0);

    sendmessage("\r\nAll date/time functions executed.\r\n", 0);
}

void test_account_management(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Account Management ===\r\n", 0);
    sendmessage("\r\n", 0);

    /* Test LastAccountNum */
    int lastnum = LastAccountNum();
    sendmessage("LastAccountNum(): ", 0);
    char buffer[32];
    int n = lastnum;
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

    /* Test Search_Account */
    char usernum_str[32];
    prompt("Enter user number to search (0 to skip): ", usernum_str, 31);

    if (usernum_str[0] != '0') {
        /* Convert string to int */
        int usernum = 0;
        char *p = usernum_str;
        while (*p >= '0' && *p <= '9') {
            usernum = usernum * 10 + (*p - '0');
            p++;
        }

        int found = Search_Account(usernum, NULL);
        sendmessage("Search_Account(", 0);
        sendmessage(usernum_str, 0);
        sendmessage("): ", 0);
        sendmessage(found ? "FOUND" : "NOT FOUND", 0);
        sendmessage("\r\n", 0);
    }

    sendmessage("\r\nNote: Load_Account/Save_Account require\r\n", 0);
    sendmessage("user structure buffers and should be used\r\n", 0);
    sendmessage("carefully to avoid data corruption.\r\n", 0);
}

void test_access_control(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Access Control ===\r\n", 0);
    sendmessage("\r\n", 0);

    /* Display current level */
    int level = getlevel();
    sendmessage("Current Security Level: ", 0);
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
    sendmessage("\r\n\r\n", 0);

    /* Test IsAccess with various levels */
    int test_levels[] = {0, 10, 50, 100, 200, 255};
    for (i = 0; i < 6; i++) {
        int test_level = test_levels[i];
        int has_access = IsAccess(test_level);

        sendmessage("IsAccess(", 0);
        n = test_level;
        int k = 0;
        do {
            temp[k++] = '0' + (n % 10);
            n /= 10;
        } while (n > 0);
        j = 0;
        while (k > 0) buffer[j++] = temp[--k];
        buffer[j] = '\0';
        sendmessage(buffer, 0);
        sendmessage("): ", 0);
        sendmessage(has_access ? "YES" : "NO", 0);
        sendmessage("\r\n", 0);
    }

    /* Test AcsStat */
    sendmessage("\r\nTesting AcsStat(1, 0)...\r\n", 0);
    int acs_result = AcsStat(1, 0);
    sendmessage("Result: ", 0);
    n = acs_result;
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
}

void test_system_functions(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing System Functions ===\r\n", 0);
    sendmessage("\r\n", 0);

    /* Test getsignal */
    int signal = getsignal();
    sendmessage("getsignal(): ", 0);
    char buffer[32];
    int n = signal;
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

    /* Test GetSemaphore */
    APTR sem = GetSemaphore();
    sendmessage("GetSemaphore(): 0x", 0);
    unsigned long addr = (unsigned long)sem;
    for (i = 7; i >= 0; i--) {
        int nibble = (addr >> (i * 4)) & 0xF;
        char hex = nibble < 10 ? '0' + nibble : 'A' + (nibble - 10);
        buffer[0] = hex;
        buffer[1] = '\0';
        sendmessage(buffer, 0);
    }
    sendmessage("\r\n", 0);

    /* Test CheckToDisplay */
    int should_display = CheckToDisplay("test string");
    sendmessage("CheckToDisplay('test string'): ", 0);
    sendmessage(should_display ? "YES" : "NO", 0);
    sendmessage("\r\n", 0);

    /* Test TLock */
    int lock_result = TLock("testlock");
    sendmessage("TLock('testlock'): ", 0);
    n = lock_result;
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
}

void test_utility_functions(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Utility Functions ===\r\n", 0);
    sendmessage("\r\n", 0);

    /* Test FetchKey */
    sendmessage("FetchKey() test - press a key: ", 0);
    int key = FetchKey();
    sendmessage("\r\nKey code: ", 0);
    char buffer[32];
    int n = key;
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

    /* Test sigkey */
    sendmessage("sigkey() - check for key: ", 0);
    int sig = sigkey();
    sendmessage(sig ? "KEY PRESSED" : "NO KEY", 0);
    sendmessage("\r\n", 0);

    /* Test QuicKey */
    sendmessage("QuicKey() test: ", 0);
    int qkey = QuicKey();
    n = qkey;
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

    /* Test LastCommand */
    sendmessage("LastCommand() - querying last command\r\n", 0);
    LastCommand();

    sendmessage("\r\nNote: Chain() and AcpCommand() are\r\n", 0);
    sendmessage("available but not tested here to avoid\r\n", 0);
    sendmessage("unexpected door exits or system changes.\r\n", 0);
}

void test_conference_functions(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Conference Functions ===\r\n", 0);
    sendmessage("\r\n", 0);

    char conf_name[80];
    char conf_loc[80];

    /* Test Get_ConfName for first few conferences */
    sendmessage("Conference List:\r\n", 0);
    int i;
    for (i = 1; i <= 5; i++) {
        int result = Get_ConfName(conf_name, conf_loc, i);

        sendmessage("  Conf ", 0);
        char buffer[32];
        int n = i;
        char temp[32];
        int j = 0;
        do {
            temp[j++] = '0' + (n % 10);
            n /= 10;
        } while (n > 0);
        int k = 0;
        while (j > 0) buffer[k++] = temp[--j];
        buffer[k] = '\0';
        sendmessage(buffer, 0);
        sendmessage(": ", 0);

        if (result) {
            sendmessage(conf_name, 0);
            sendmessage(" (", 0);
            sendmessage(conf_loc, 0);
            sendmessage(")", 0);
        } else {
            sendmessage("(not found)", 0);
        }
        sendmessage("\r\n", 0);
    }

    sendmessage("\r\nNote: Load_ConfDB/Save_ConfDB are\r\n", 0);
    sendmessage("available for conference-specific data.\r\n", 0);
}

int main(int argc, char *argv[]) {
    char choice[10];

    /* Register with BBS */
    Register(1);

    /* Display welcome */
    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("   Advanced Functions Test Door\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("\r\n", 0);
    sendmessage("Tests advanced capabilities including\r\n", 0);
    sendmessage("account management, date/time, access\r\n", 0);
    sendmessage("control, and system functions.\r\n", 0);

    /* Main menu loop */
    while (1) {
        display_menu();

        /* Get user choice */
        char key = Hotkey();
        sendmessage("\r\n", 0);

        /* Process choice */
        if (key == '1') {
            test_datetime();
        } else if (key == '2') {
            test_account_management();
        } else if (key == '3') {
            test_access_control();
        } else if (key == '4') {
            test_system_functions();
        } else if (key == '5') {
            test_utility_functions();
        } else if (key == '6') {
            test_conference_functions();
        } else if (key == 'q' || key == 'Q') {
            break;
        } else {
            sendmessage("Invalid choice. Try again.\r\n", 0);
        }

        sendmessage("\r\nPress any key to continue...", 0);
        Hotkey();
    }

    /* Exit */
    sendmessage("\r\nExiting Advanced Functions Test Door...\r\n", 0);
    ShutDown();
    return 0;
}
