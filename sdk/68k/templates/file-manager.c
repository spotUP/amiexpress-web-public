/*
 * Advanced File Manager Door Template
 * XIM door demonstrating file operations, downloads, and user management
 */

#include "amiexpress.h"

#define MAX_FILES 50
#define MAX_FILENAME 100

void main(int argc, char *argv[]) {
    char username[200], location[200], level[20];
    char current_dir[200] = "doors/files/"; // BBS file area

    if (argc < 2) {
        printf("Run from AmiExpress BBS\n");
        exit(0);
    }

    Register(atoi(argv[1]));

    // Get comprehensive user info
    getuserstring(username, DT_NAME);
    getuserstring(location, DT_LOCATION);
    getuserstring(level, DT_SECSTATUS);

    sendmessage("\r\n", 1);
    sendmessage("================================\r\n", 1);
    sendmessage("    Advanced File Manager\r\n", 1);
    sendmessage("================================\r\n", 1);
    sendmessage("\r\n", 1);

    sendmessage("Welcome ", 0);
    sendmessage(username, 0);
    sendmessage(" (Level ", 0);
    sendmessage(level, 0);
    sendmessage(")\r\n\r\n", 1);

    int running = 1;
    while (running) {
        sendmessage("File Manager Menu:\r\n", 1);
        sendmessage("1. List files in current directory\r\n", 1);
        sendmessage("2. Download a file\r\n", 1);
        sendmessage("3. View file information\r\n", 1);
        sendmessage("4. Show BBS statistics\r\n", 1);
        sendmessage("Q. Quit\r\n\r\n", 1);

        char choice[10];
        hotkey("Choice: ", choice);

        switch (choice[0]) {
            case '1': {
                sendmessage("Current directory: ", 0);
                sendmessage(current_dir, 1);
                sendmessage("Files available:\r\n", 1);

                // Show some example files (in real door, would scan directory)
                sendmessage("  example.txt\r\n", 1);
                sendmessage("  readme.doc\r\n", 1);
                sendmessage("  game.zip\r\n", 1);
                sendmessage("  music.mod\r\n", 1);

                hotkey("\r\nPress any key to continue...", NULL);
                break;
            }

            case '2': {
                char filename[200];
                prompt("Enter filename to download: ", filename, 50);

                sendmessage("Attempting to download: ", 0);
                sendmessage(filename, 1);

                int result = Download(filename);
                if (result == 1) {
                    sendmessage("✅ Download completed successfully!\r\n", 1);

                    // Update user stats (XIM feature)
                    char uploads[20], downloads[20];
                    getuserstring(uploads, DT_UPLOADS);
                    getuserstring(downloads, DT_DOWNLOADS);

                    sendmessage("Your stats - Uploads: ", 0);
                    sendmessage(uploads, 0);
                    sendmessage(", Downloads: ", 0);
                    sendmessage(downloads, 1);

                } else if (result == 0) {
                    sendmessage("❌ Download cancelled.\r\n", 1);
                } else {
                    sendmessage("❌ Download failed.\r\n", 1);
                }

                hotkey("Press any key to continue...", NULL);
                break;
            }

            case '3': {
                char filename[200];
                prompt("Enter filename to view: ", filename, 50);

                sendmessage("Contents of ", 0);
                sendmessage(filename, 0);
                sendmessage(":\r\n", 1);
                sendmessage("─────────────────────\r\n", 1);

                // Try to show the file (XIM feature)
                showfile(filename);

                sendmessage("─────────────────────\r\n", 1);
                hotkey("Press any key to continue...", NULL);
                break;
            }

            case '4': {
                // Show BBS statistics using various XIM queries
                sendmessage("BBS Statistics:\r\n", 1);
                sendmessage("───────────────\r\n", 1);

                char bbs_name[200], sysop[200], conf[200];
                getuserstring(bbs_name, JH_BBSNAME);
                getuserstring(sysop, JH_Sysop);
                getuserstring(conf, BB_CONFNAME);

                sendmessage("BBS Name: ", 0);
                sendmessage(bbs_name, 1);
                sendmessage("Sysop: ", 0);
                sendmessage(sysop, 1);
                sendmessage("Current Conference: ", 0);
                sendmessage(conf, 1);

                // Show some user statistics
                char time_used[20], time_limit[20];
                getuserstring(time_used, DT_TIMEUSED);
                getuserstring(time_limit, DT_TIMELIMIT);

                sendmessage("Your Time Used: ", 0);
                sendmessage(time_used, 0);
                sendmessage(" minutes\r\n", 1);
                sendmessage("Time Limit: ", 0);
                sendmessage(time_limit, 0);
                sendmessage(" minutes\r\n", 1);

                hotkey("\r\nPress any key to continue...", NULL);
                break;
            }

            case 'q':
            case 'Q':
                sendmessage("Thanks for using the File Manager!\r\n", 1);
                running = 0;
                break;

            default:
                sendmessage("Invalid choice. Please try again.\r\n", 1);
                break;
        }

        if (running) {
            sendmessage("\r\n", 1);
        }
    }

    ShutDown();
}