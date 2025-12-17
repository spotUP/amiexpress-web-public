/*
 * File Operations Test Door
 *
 * Tests all file-related functionality:
 * - showfile() - Display text files
 * - showgfile() - Display graphics files
 * - Download() - File downloads
 * - Upload() - File uploads
 * - Editfile() - File editing
 * - FlagFile() - File flagging
 * - showfilensf() / showgfilensf() - Non-stop display
 *
 * Demonstrates that C doors have full file operation capabilities.
 */

#include "../../includes/amiexpress.h"

void display_menu(void) {
    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("    File Operations Test Menu\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("\r\n", 0);
    sendmessage("1) Show text file (showfile)\r\n", 0);
    sendmessage("2) Show graphics file (showgfile)\r\n", 0);
    sendmessage("3) Download file\r\n", 0);
    sendmessage("4) Upload file\r\n", 0);
    sendmessage("5) Edit file\r\n", 0);
    sendmessage("6) Flag file\r\n", 0);
    sendmessage("7) Show file non-stop\r\n", 0);
    sendmessage("Q) Quit\r\n", 0);
    sendmessage("\r\n", 0);
    sendmessage("Select: ", 0);
}

void test_showfile(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing showfile() ===\r\n", 0);
    sendmessage("\r\n", 0);

    char filename[80];
    prompt("Enter filename to display: ", filename, 79);

    if (filename[0] == '\0') {
        sendmessage("Cancelled.\r\n", 0);
        return;
    }

    sendmessage("\r\nDisplaying: ", 0);
    sendmessage(filename, 0);
    sendmessage("\r\n", 0);
    sendmessage("-----------------------------------\r\n", 0);

    showfile(filename);

    sendmessage("-----------------------------------\r\n", 0);
    sendmessage("Done displaying file\r\n", 0);
}

void test_showgfile(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing showgfile() ===\r\n", 0);
    sendmessage("\r\n", 0);

    char filename[80];
    prompt("Enter graphics filename (ANSI/ASCII art): ", filename, 79);

    if (filename[0] == '\0') {
        sendmessage("Cancelled.\r\n", 0);
        return;
    }

    sendmessage("\r\nDisplaying: ", 0);
    sendmessage(filename, 0);
    sendmessage("\r\n", 0);

    showgfile(filename);

    sendmessage("\r\nDone displaying graphics file\r\n", 0);
}

void test_download(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Download() ===\r\n", 0);
    sendmessage("\r\n", 0);

    char filename[80];
    prompt("Enter filename to download: ", filename, 79);

    if (filename[0] == '\0') {
        sendmessage("Cancelled.\r\n", 0);
        return;
    }

    sendmessage("\r\nInitiating download: ", 0);
    sendmessage(filename, 0);
    sendmessage("\r\n", 0);

    int result = Download(filename);

    sendmessage("Download result: ", 0);
    char buffer[32];
    int n = result;
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

    if (result) {
        sendmessage("Download request sent to BBS\r\n", 0);
    } else {
        sendmessage("Download failed\r\n", 0);
    }
}

void test_upload(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Upload() ===\r\n", 0);
    sendmessage("\r\n", 0);

    char filename[80];
    prompt("Enter destination filename for upload: ", filename, 79);

    if (filename[0] == '\0') {
        sendmessage("Cancelled.\r\n", 0);
        return;
    }

    sendmessage("\r\nInitiating upload to: ", 0);
    sendmessage(filename, 0);
    sendmessage("\r\n", 0);

    int result = Upload(filename);

    sendmessage("Upload result: ", 0);
    char buffer[32];
    int n = result;
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

    if (result) {
        sendmessage("Upload request sent to BBS\r\n", 0);
    } else {
        sendmessage("Upload failed\r\n", 0);
    }
}

void test_editfile(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing Editfile() ===\r\n", 0);
    sendmessage("\r\n", 0);

    char filename[80];
    prompt("Enter filename to edit: ", filename, 79);

    if (filename[0] == '\0') {
        sendmessage("Cancelled.\r\n", 0);
        return;
    }

    sendmessage("\r\nOpening editor for: ", 0);
    sendmessage(filename, 0);
    sendmessage("\r\n", 0);

    int result = Editfile(filename, 1024);

    sendmessage("Edit result: ", 0);
    if (result) {
        sendmessage("Editor invoked\r\n", 0);
    } else {
        sendmessage("Edit failed\r\n", 0);
    }
}

void test_flagfile(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing FlagFile() ===\r\n", 0);
    sendmessage("\r\n", 0);

    char filename[80];
    prompt("Enter filename to flag: ", filename, 79);

    if (filename[0] == '\0') {
        sendmessage("Cancelled.\r\n", 0);
        return;
    }

    sendmessage("\r\nFlagging file: ", 0);
    sendmessage(filename, 0);
    sendmessage("\r\n", 0);

    FlagFile(filename);

    sendmessage("File flagged successfully\r\n", 0);
}

void test_showfilensf(void) {
    sendmessage("\r\n", 0);
    sendmessage("=== Testing showfilensf() (non-stop) ===\r\n", 0);
    sendmessage("\r\n", 0);

    char filename[80];
    prompt("Enter filename to display (non-stop): ", filename, 79);

    if (filename[0] == '\0') {
        sendmessage("Cancelled.\r\n", 0);
        return;
    }

    sendmessage("\r\nDisplaying (non-stop): ", 0);
    sendmessage(filename, 0);
    sendmessage("\r\n", 0);
    sendmessage("-----------------------------------\r\n", 0);

    showfilensf(filename);

    sendmessage("-----------------------------------\r\n", 0);
    sendmessage("Display complete\r\n", 0);
}

int main(int argc, char *argv[]) {
    char choice[10];

    /* Register with BBS */
    Register(1);

    /* Display welcome */
    sendmessage("\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("    File Operations Test Door\r\n", 0);
    sendmessage("=====================================\r\n", 0);
    sendmessage("\r\n", 0);
    sendmessage("This door tests all file operation\r\n", 0);
    sendmessage("functions available to C doors.\r\n", 0);

    /* Main menu loop */
    while (1) {
        display_menu();

        /* Get user choice */
        char key = Hotkey();
        sendmessage("\r\n", 0);

        /* Process choice */
        if (key == '1') {
            test_showfile();
        } else if (key == '2') {
            test_showgfile();
        } else if (key == '3') {
            test_download();
        } else if (key == '4') {
            test_upload();
        } else if (key == '5') {
            test_editfile();
        } else if (key == '6') {
            test_flagfile();
        } else if (key == '7') {
            test_showfilensf();
        } else if (key == 'q' || key == 'Q') {
            break;
        } else {
            sendmessage("Invalid choice. Try again.\r\n", 0);
        }

        sendmessage("\r\nPress any key to continue...", 0);
        Hotkey();
    }

    /* Exit */
    sendmessage("\r\nExiting File Operations Test Door...\r\n", 0);
    ShutDown();
    return 0;
}
