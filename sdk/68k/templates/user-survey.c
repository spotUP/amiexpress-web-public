/*
 * User Survey Door Template
 * XIM door demonstrating advanced user interaction and data collection
 */

#include "../includes/amiexpress.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_QUESTIONS 5
#define MAX_RESPONSE 100

typedef struct {
    char question[200];
    char responses[10][MAX_RESPONSE];
    int response_count;
} SurveyQuestion;

void main(int argc, char *argv[]) {
    char username[200], location[200], level[20];
    char input[MAX_RESPONSE];

    SurveyQuestion questions[MAX_QUESTIONS] = {
        {"What is your favorite programming language?", {}},
        {"How many years have you been programming?", {}},
        {"What BBS software do you prefer?", {}},
        {"Rate this BBS from 1-10:", {}},
        {"Any suggestions for improvements?", {}}
    };

    if (argc < 2) {
        printf("Run from AmiExpress BBS\n");
        exit(0);
    }

    Register(atoi(argv[1]));

    // Get comprehensive user information
    getuserstring(username, DT_NAME);
    getuserstring(location, DT_LOCATION);
    getuserstring(level, DT_SECSTATUS);

    sendmessage("\r\n", 1);
    sendmessage("╔══════════════════════════════════════╗\r\n", 1);
    sendmessage("║         BBS User Survey              ║\r\n", 1);
    sendmessage("╚══════════════════════════════════════╝\r\n", 1);
    sendmessage("\r\n", 1);

    sendmessage("Hello ", 0);
    sendmessage(username, 0);
    sendmessage(" from ", 0);
    sendmessage(location, 1);
    sendmessage("Access Level: ", 0);
    sendmessage(level, 1);
    sendmessage("\r\n", 1);

    sendmessage("Please help us improve by answering a few questions:\r\n\r\n", 1);

    // Ask survey questions
    int i;
    for (i = 0; i < MAX_QUESTIONS; i++) {
        sendmessage("Question ", 0);
        sprintf(input, "%d", i + 1);
        sendmessage(input, 0);
        sendmessage("/", 0);
        sprintf(input, "%d", MAX_QUESTIONS);
        sendmessage(input, 0);
        sendmessage(": ", 0);
        sendmessage(questions[i].question, 1);

        // Get user response
        prompt("Your answer: ", input, MAX_RESPONSE - 1);

        // Store response (in real door, would save to file/database)
        strcpy(questions[i].responses[questions[i].response_count++], input);

        sendmessage("✓ Recorded: ", 0);
        sendmessage(input, 1);
        sendmessage("\r\n", 1);

        // Show progress
        if (i < MAX_QUESTIONS - 1) {
            hotkey("Press ENTER for next question...", NULL);
            sendmessage("\r\n", 1);
        }
    }

    sendmessage("\r\n╔══════════════════════════════════════╗\r\n", 1);
    sendmessage("║        Survey Complete!              ║\r\n", 1);
    sendmessage("╚══════════════════════════════════════╝\r\n", 1);

    sendmessage("Thank you for your valuable feedback, ", 0);
    sendmessage(username, 0);
    sendmessage("!\r\n\r\n", 1);

    // Show summary statistics (would be stored in real implementation)
    sendmessage("📊 Survey Statistics:\r\n", 1);
    sendmessage("─────────────────────\r\n", 1);

    char uploads[20], downloads[20], time_used[20];
    getuserstring(uploads, DT_UPLOADS);
    getuserstring(downloads, DT_DOWNLOADS);
    getuserstring(time_used, DT_TIMEUSED);

    sendmessage("Your BBS Activity:\r\n", 1);
    sendmessage("  Files Uploaded: ", 0);
    sendmessage(uploads, 1);
    sendmessage("  Files Downloaded: ", 0);
    sendmessage(downloads, 1);
    sendmessage("  Time Used Today: ", 0);
    sendmessage(time_used, 0);
    sendmessage(" minutes\r\n", 1);

    // Offer to save survey results
    sendmessage("\r\nWould you like to save your survey responses?\r\n", 1);
    hotkey("(Y/N): ", input);

    if (input[0] == 'y' || input[0] == 'Y') {
        sendmessage("✅ Survey responses saved!\r\n", 1);

        // In a real implementation, this would save to a file
        // For demo, just show what would be saved
        sendmessage("📝 Your responses have been recorded.\r\n", 1);

        // Demonstrate file operation (would create survey data file)
        char filename[200];
        sprintf(filename, "survey_%s.txt", username);
        sendmessage("Data file: ", 0);
        sendmessage(filename, 1);

    } else {
        sendmessage("❌ Survey responses discarded.\r\n", 1);
    }

    sendmessage("\r\nThank you for participating in our survey!\r\n", 1);
    sendmessage("Your feedback helps us make this BBS better.\r\n\r\n", 1);

    // Final statistics
    char bbs_name[200];
    getuserstring(bbs_name, JH_BBSNAME);
    sendmessage("Visit ", 0);
    sendmessage(bbs_name, 0);
    sendmessage(" again soon!\r\n", 1);

    ShutDown();
}