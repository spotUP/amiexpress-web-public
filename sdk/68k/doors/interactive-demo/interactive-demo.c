/*
 * Interactive C Door Demo
 *
 * A comprehensive, user-friendly demo that showcases ALL capabilities
 * of C doors in the 68K SDK. This demonstrates that C doors are
 * feature-complete and can do everything XIM/SIM doors can do.
 *
 * Features:
 * - User information display
 * - Interactive menu system
 * - File operations
 * - Input/output demonstrations
 * - MCI color codes
 * - System information
 * - All SDK functions working together
 */

#include "../../includes/amiexpress.h"

/* Helper function to convert int to string */
void int_to_str(int value, char *buffer) {
    int n = value;
    int negative = 0;

    if (n < 0) {
        negative = 1;
        n = -n;
    }

    char temp[32];
    int i = 0;
    do {
        temp[i++] = '0' + (n % 10);
        n /= 10;
    } while (n > 0);

    int j = 0;
    if (negative) buffer[j++] = '-';
    while (i > 0) buffer[j++] = temp[--i];
    buffer[j] = '\0';
}

void display_header(void) {
    mciputstr("\r\n", 0);
    mciputstr("~c6=====================================~c7\r\n", 0);
    mciputstr("~c2  Interactive C Door Demo~c7\r\n", 0);
    mciputstr("~c6=====================================~c7\r\n", 0);
    mciputstr("\r\n", 0);
    mciputstr("~c3This door demonstrates ALL features\r\n", 0);
    mciputstr("of the 68K C SDK in action!~c7\r\n", 0);
}

void display_user_info(void) {
    mciputstr("\r\n~c6=== Your Information ===~c7\r\n\r\n", 0);

    /* Name */
    char *name = getname();
    mciputstr("~c3Name:~c7 ", 0);
    sendmessage(name, 0);
    sendmessage("\r\n", 0);

    /* Location */
    char *location = getlocation();
    mciputstr("~c3Location:~c7 ", 0);
    sendmessage(location, 0);
    sendmessage("\r\n", 0);

    /* Security Level */
    int level = getlevel();
    char buffer[32];
    int_to_str(level, buffer);
    mciputstr("~c3Security Level:~c7 ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    /* Node */
    int node = getnode();
    int_to_str(node, buffer);
    mciputstr("~c3Node Number:~c7 ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    /* BBS Name */
    char *bbsname = getbbsname();
    mciputstr("~c3BBS:~c7 ", 0);
    sendmessage(bbsname, 0);
    sendmessage("\r\n", 0);

    /* Date/Time */
    STRPTR date = GetTheDate(0);
    STRPTR time = GetTheTime(0);
    mciputstr("~c3Date:~c7 ", 0);
    sendmessage(date ? date : "Unknown", 0);
    sendmessage("\r\n", 0);
    mciputstr("~c3Time:~c7 ", 0);
    sendmessage(time ? time : "Unknown", 0);
    sendmessage("\r\n", 0);
}

void display_main_menu(void) {
    mciputstr("\r\n~c6=== Main Menu ===~c7\r\n\r\n", 0);
    mciputstr("~c21~c7) Display User Information\r\n", 0);
    mciputstr("~c22~c7) Interactive Input Demo\r\n", 0);
    mciputstr("~c23~c7) MCI Color Demo\r\n", 0);
    mciputstr("~c24~c7) File Operations\r\n", 0);
    mciputstr("~c25~c7) System Information\r\n", 0);
    mciputstr("~c26~c7) Access Level Test\r\n", 0);
    mciputstr("~c2Q~c7) Quit\r\n", 0);
    mciputstr("\r\n~c3Select:~c7 ", 0);
}

void interactive_input_demo(void) {
    mciputstr("\r\n~c6=== Interactive Input Demo ===~c7\r\n\r\n", 0);

    /* Test prompt */
    char input[80];
    mciputstr("~c3Prompt Test:~c7\r\n", 0);
    prompt("Enter your favorite color: ", input, 79);
    mciputstr("\r\n~c2You entered:~c7 ", 0);
    sendmessage(input[0] ? input : "(nothing)", 0);
    sendmessage("\r\n\r\n", 0);

    /* Test Hotkey */
    mciputstr("~c3Hotkey Test:~c7\r\n", 0);
    mciputstr("Press any key: ", 0);
    char key = Hotkey();
    char buffer[32];
    int_to_str((int)key, buffer);
    mciputstr("\r\n~c2You pressed key code:~c7 ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n\r\n", 0);

    /* Test lineinput */
    mciputstr("~c3Line Input Test:~c7\r\n", 0);
    lineinput("Enter a sentence: ", input, 79);
    mciputstr("\r\n~c2You wrote:~c7 ", 0);
    sendmessage(input, 0);
    sendmessage("\r\n", 0);
}

void mci_color_demo(void) {
    mciputstr("\r\n~c6=== MCI Color Demo ===~c7\r\n\r\n", 0);

    mciputstr("~c0Color 0 (Black)~c7\r\n", 0);
    mciputstr("~c1Color 1 (Blue)~c7\r\n", 0);
    mciputstr("~c2Color 2 (Green)~c7\r\n", 0);
    mciputstr("~c3Color 3 (Cyan)~c7\r\n", 0);
    mciputstr("~c4Color 4 (Red)~c7\r\n", 0);
    mciputstr("~c5Color 5 (Magenta)~c7\r\n", 0);
    mciputstr("~c6Color 6 (Yellow)~c7\r\n", 0);
    mciputstr("~c7Color 7 (White)~c7\r\n", 0);
    mciputstr("\r\n", 0);

    mciputstr("~c2Combined ~c3colors ~c4in ~c5one ~c6line!~c7\r\n", 0);
    mciputstr("\r\n", 0);

    mciputstr("~c3MCI codes work perfectly in C doors!~c7\r\n", 0);
}

void file_operations_demo(void) {
    mciputstr("\r\n~c6=== File Operations ===~c7\r\n\r\n", 0);

    mciputstr("~c31~c7) Display a file (showfile)\r\n", 0);
    mciputstr("~c32~c7) Download a file\r\n", 0);
    mciputstr("~c33~c7) Upload a file\r\n", 0);
    mciputstr("~c3X~c7) Back to main menu\r\n", 0);
    mciputstr("\r\n~c3Select:~c7 ", 0);

    char key = Hotkey();
    sendmessage("\r\n", 0);

    if (key == '1') {
        char filename[80];
        prompt("\r\nEnter filename to display: ", filename, 79);

        if (filename[0]) {
            mciputstr("\r\n~c2Displaying:~c7 ", 0);
            sendmessage(filename, 0);
            sendmessage("\r\n", 0);
            mciputstr("~c6---------------------------~c7\r\n", 0);
            showfile(filename);
            mciputstr("~c6---------------------------~c7\r\n", 0);
        } else {
            mciputstr("~c4Cancelled.~c7\r\n", 0);
        }
    } else if (key == '2') {
        char filename[80];
        prompt("\r\nEnter filename to download: ", filename, 79);

        if (filename[0]) {
            mciputstr("\r\n~c2Initiating download:~c7 ", 0);
            sendmessage(filename, 0);
            sendmessage("\r\n", 0);
            int result = Download(filename);
            if (result) {
                mciputstr("~c2Download request sent!~c7\r\n", 0);
            } else {
                mciputstr("~c4Download failed.~c7\r\n", 0);
            }
        } else {
            mciputstr("~c4Cancelled.~c7\r\n", 0);
        }
    } else if (key == '3') {
        char filename[80];
        prompt("\r\nEnter destination filename: ", filename, 79);

        if (filename[0]) {
            mciputstr("\r\n~c2Initiating upload to:~c7 ", 0);
            sendmessage(filename, 0);
            sendmessage("\r\n", 0);
            int result = Upload(filename);
            if (result) {
                mciputstr("~c2Upload request sent!~c7\r\n", 0);
            } else {
                mciputstr("~c4Upload failed.~c7\r\n", 0);
            }
        } else {
            mciputstr("~c4Cancelled.~c7\r\n", 0);
        }
    }
}

void system_information(void) {
    mciputstr("\r\n~c6=== System Information ===~c7\r\n\r\n", 0);

    /* Signal */
    int signal = getsignal();
    char buffer[32];
    int_to_str(signal, buffer);
    mciputstr("~c3Signal:~c7 ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    /* Semaphore */
    APTR sem = GetSemaphore();
    mciputstr("~c3Semaphore:~c7 0x", 0);
    unsigned long addr = (unsigned long)sem;
    int i;
    for (i = 7; i >= 0; i--) {
        int nibble = (addr >> (i * 4)) & 0xF;
        char hex = nibble < 10 ? '0' + nibble : 'A' + (nibble - 10);
        buffer[0] = hex;
        buffer[1] = '\0';
        sendmessage(buffer, 0);
    }
    sendmessage("\r\n", 0);

    /* Last Account Number */
    int lastacct = LastAccountNum();
    int_to_str(lastacct, buffer);
    mciputstr("~c3Last Account #:~c7 ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n", 0);

    /* Using getuserstring for additional data */
    char userbuf[256];

    getuserstring(userbuf, DT_TIMESCALLED);
    mciputstr("~c3Times Called:~c7 ", 0);
    sendmessage(userbuf, 0);
    sendmessage("\r\n", 0);

    getuserstring(userbuf, DT_TIMEUSED);
    mciputstr("~c3Time Used:~c7 ", 0);
    sendmessage(userbuf, 0);
    sendmessage(" minutes\r\n", 0);

    getuserstring(userbuf, DT_UPLOADS);
    mciputstr("~c3Uploads:~c7 ", 0);
    sendmessage(userbuf, 0);
    sendmessage("\r\n", 0);

    getuserstring(userbuf, DT_DOWNLOADS);
    mciputstr("~c3Downloads:~c7 ", 0);
    sendmessage(userbuf, 0);
    sendmessage("\r\n", 0);
}

void access_level_test(void) {
    mciputstr("\r\n~c6=== Access Level Test ===~c7\r\n\r\n", 0);

    int current_level = getlevel();
    char buffer[32];
    int_to_str(current_level, buffer);
    mciputstr("~c3Your current level:~c7 ", 0);
    sendmessage(buffer, 0);
    sendmessage("\r\n\r\n", 0);

    /* Test various access levels */
    int test_levels[] = {0, 10, 50, 100, 200, 255};
    int i;

    mciputstr("~c3Testing access levels:~c7\r\n", 0);
    for (i = 0; i < 6; i++) {
        int level = test_levels[i];
        int has_access = IsAccess(level);

        mciputstr("  Level ", 0);
        int_to_str(level, buffer);
        sendmessage(buffer, 0);
        mciputstr(": ", 0);

        if (has_access) {
            mciputstr("~c2GRANTED~c7", 0);
        } else {
            mciputstr("~c4DENIED~c7", 0);
        }
        sendmessage("\r\n", 0);
    }

    mciputstr("\r\n~c3Access control works perfectly!~c7\r\n", 0);
}

int main(int argc, char *argv[]) {
    /* Register with BBS */
    Register(1);

    /* Display welcome header */
    display_header();

    /* Show argc/argv if provided */
    if (argc > 1) {
        mciputstr("\r\n~c3Command line arguments received:~c7\r\n", 0);
        int i;
        for (i = 0; i < argc && i < 10; i++) {
            char buffer[32];
            mciputstr("  argv[", 0);
            buffer[0] = '0' + i;
            buffer[1] = '\0';
            sendmessage(buffer, 0);
            mciputstr("] = ", 0);
            sendmessage(argv[i], 0);
            sendmessage("\r\n", 0);
        }
    }

    /* Main menu loop */
    while (1) {
        display_main_menu();

        /* Get user choice */
        char key = Hotkey();
        sendmessage("\r\n", 0);

        /* Process choice */
        if (key == '1') {
            display_user_info();
        } else if (key == '2') {
            interactive_input_demo();
        } else if (key == '3') {
            mci_color_demo();
        } else if (key == '4') {
            file_operations_demo();
        } else if (key == '5') {
            system_information();
        } else if (key == '6') {
            access_level_test();
        } else if (key == 'q' || key == 'Q') {
            break;
        } else {
            mciputstr("~c4Invalid choice. Try again.~c7\r\n", 0);
        }

        mciputstr("\r\n~c3Press any key to continue...~c7", 0);
        Hotkey();
    }

    /* Exit message */
    mciputstr("\r\n", 0);
    mciputstr("~c6=====================================~c7\r\n", 0);
    mciputstr("~c2 Thank you for trying the C Door!\r\n", 0);
    mciputstr("~c3 C doors can do EVERYTHING that\r\n", 0);
    mciputstr("~c3 XIM/SIM doors can do!~c7\r\n", 0);
    mciputstr("~c6=====================================~c7\r\n", 0);
    mciputstr("\r\n", 0);

    /* Clean shutdown */
    ShutDown();
    return 0;
}
