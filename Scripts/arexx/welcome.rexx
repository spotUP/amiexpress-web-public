/* AmiExpress Welcome Script */
/* Executed when user first logs in */

SAY ""
SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║                  WELCOME TO AMIEXPRESS WEB                     ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* Get user information */
username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()
conference = BBSGETCONF()

/* Welcome message */
SAY "\x1b[32mWelcome back, " || username || "!\x1b[0m"
SAY "Security Level: \x1b[33m" || userlevel || "\x1b[0m"
SAY "Current Conference: \x1b[36m" || conference || "\x1b[0m"
SAY ""

/* Check message count */
msgcount = BBSGETMSGCOUNT()
IF msgcount > 0 THEN SAY "\x1b[33mYou have " || msgcount || " messages waiting.\x1b[0m"

/* Time and date */
currenttime = TIME()
currentdate = DATE()
SAY "Current time: " || currenttime || " on " || currentdate
SAY ""

/* Log the login */
CALL BBSLOG "info" "User " || username || " logged in successfully"

SAY "\x1b[32mPress any key to continue...\x1b[0m"
