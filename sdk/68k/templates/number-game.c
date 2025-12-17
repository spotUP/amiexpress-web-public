/*
 * Number Guessing Game Door Template
 * XIM door demonstrating game logic, scoring, and user interaction
 */

#include "../includes/amiexpress.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAX_GUESSES 10
#define MIN_NUMBER 1
#define MAX_NUMBER 100

void main(int argc, char *argv[]) {
    char username[200], input[50];
    int target_number, guess_count = 0;
    int current_guess, game_over = 0;
    int user_score = 0;

    if (argc < 2) {
        printf("Run from AmiExpress BBS\n");
        exit(0);
    }

    Register(atoi(argv[1]));

    // Get user information
    getuserstring(username, DT_NAME);

    sendmessage("\r\n", 1);
    sendmessage("╔══════════════════════════════════════╗\r\n", 1);
    sendmessage("║        Number Guessing Game          ║\r\n", 1);
    sendmessage("╚══════════════════════════════════════╝\r\n", 1);
    sendmessage("\r\n", 1);

    sendmessage("Welcome ", 0);
    sendmessage(username, 0);
    sendmessage("!\r\n\r\n", 1);

    sendmessage("I'm thinking of a number between ", 0);
    sprintf(input, "%d", MIN_NUMBER);
    sendmessage(input, 0);
    sendmessage(" and ", 0);
    sprintf(input, "%d", MAX_NUMBER);
    sendmessage(input, 0);
    sendmessage(".\r\n", 1);

    sendmessage("You have ", 0);
    sprintf(input, "%d", MAX_GUESSES);
    sendmessage(input, 0);
    sendmessage(" guesses to find it!\r\n\r\n", 1);

    // Seed random number generator and pick target
    // Note: In real Amiga code, would use system timer
    srand(time(NULL));
    target_number = (rand() % (MAX_NUMBER - MIN_NUMBER + 1)) + MIN_NUMBER;

    // Main game loop
    while (!game_over && guess_count < MAX_GUESSES) {
        sprintf(input, "%d", guess_count + 1);
        sendmessage("Guess #", 0);
        sendmessage(input, 0);
        sendmessage(": ", 0);

        // Get user guess
        prompt("", input, 10);

        // Validate input
        current_guess = atoi(input);
        if (current_guess < MIN_NUMBER || current_guess > MAX_NUMBER) {
            sendmessage("Please enter a number between ", 0);
            sprintf(input, "%d", MIN_NUMBER);
            sendmessage(input, 0);
            sendmessage(" and ", 0);
            sprintf(input, "%d", MAX_NUMBER);
            sendmessage(input, 0);
            sendmessage(".\r\n", 1);
            continue;
        }

        guess_count++;

        // Check guess
        if (current_guess == target_number) {
            // Winner!
            sendmessage("🎉 CORRECT! You guessed it in ", 0);
            sprintf(input, "%d", guess_count);
            sendmessage(input, 0);
            sendmessage(" guesses!\r\n", 1);

            // Calculate score (higher for fewer guesses)
            user_score = (MAX_GUESSES - guess_count + 1) * 10;
            sendmessage("Your score: ", 0);
            sprintf(input, "%d", user_score);
            sendmessage(input, 0);
            sendmessage(" points!\r\n", 1);

            game_over = 1;

        } else if (current_guess < target_number) {
            sendmessage("📈 Too low! Try higher.\r\n", 1);

            if (guess_count < MAX_GUESSES) {
                sendmessage("Hint: The number is between ", 0);
                sprintf(input, "%d", current_guess + 1);
                sendmessage(input, 0);
                sendmessage(" and ", 0);
                sprintf(input, "%d", MAX_NUMBER);
                sendmessage(input, 0);
                sendmessage(".\r\n", 1);
            }

        } else {
            sendmessage("📉 Too high! Try lower.\r\n", 1);

            if (guess_count < MAX_GUESSES) {
                sendmessage("Hint: The number is between ", 0);
                sprintf(input, "%d", MIN_NUMBER);
                sendmessage(input, 0);
                sendmessage(" and ", 0);
                sprintf(input, "%d", current_guess - 1);
                sendmessage(input, 0);
                sendmessage(".\r\n", 1);
            }
        }

        sendmessage("\r\n", 1);
    }

    // Game end
    if (!game_over) {
        // Lost the game
        sendmessage("💔 Sorry, you're out of guesses!\r\n", 1);
        sendmessage("The number was: ", 0);
        sprintf(input, "%d", target_number);
        sendmessage(input, 1);
        sendmessage("Better luck next time!\r\n", 1);
        user_score = 0;
    }

    // Show final statistics
    sendmessage("\r\n📊 Game Statistics:\r\n", 1);
    sendmessage("─────────────────\r\n", 1);

    sendmessage("Player: ", 0);
    sendmessage(username, 1);

    sendmessage("Guesses used: ", 0);
    sprintf(input, "%d", guess_count);
    sendmessage(input, 1);

    sendmessage("Final score: ", 0);
    sprintf(input, "%d", user_score);
    sendmessage(input, 0);
    sendmessage(" points\r\n", 1);

    // Show performance rating
    sendmessage("Performance: ", 0);
    if (user_score >= 80) {
        sendmessage("🏆 EXCELLENT!\r\n", 1);
    } else if (user_score >= 60) {
        sendmessage("🎯 Very Good!\r\n", 1);
    } else if (user_score >= 40) {
        sendmessage("👍 Good Job!\r\n", 1);
    } else if (user_score >= 20) {
        sendmessage("🤔 Not bad!\r\n", 1);
    } else if (user_score > 0) {
        sendmessage("😅 Keep practicing!\r\n", 1);
    } else {
        sendmessage("💪 Try again!\r\n", 1);
    }

    // Ask to play again
    sendmessage("\r\nWould you like to play again?\r\n", 1);
    hotkey("(Y/N): ", input);

    if (input[0] == 'y' || input[0] == 'Y') {
        sendmessage("🎮 Great! Restarting the game...\r\n\r\n", 1);

        // Recursive call (in real door, would loop or chain)
        sendmessage("Please exit and re-enter the door to play again.\r\n", 1);
    } else {
        sendmessage("🙂 Thanks for playing!\r\n", 1);
    }

    // Show BBS info before exit
    char bbs_name[200];
    getuserstring(bbs_name, JH_BBSNAME);
    sendmessage("\r\nCome back to ", 0);
    sendmessage(bbs_name, 0);
    sendmessage(" for more games!\r\n", 1);

    ShutDown();
}