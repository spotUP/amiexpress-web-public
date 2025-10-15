/* AmiExpress Logout Script */
/* Executed when user logs off */

username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()

SAY ""
SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║                    LOGGING OFF AMIEXPRESS                      ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

SAY "\x1b[32mGoodbye, " || username || "!\x1b[0m"
SAY ""
SAY "Thank you for calling AmiExpress Web BBS."
SAY ""

/* Random logout message */
randomnum = RANDOM(1, 5)
IF randomnum = 1 THEN SAY "\x1b[33mCome back soon!\x1b[0m"
IF randomnum = 2 THEN SAY "\x1b[33mSee you next time!\x1b[0m"
IF randomnum = 3 THEN SAY "\x1b[33mHave a great day!\x1b[0m"
IF randomnum = 4 THEN SAY "\x1b[33mThanks for visiting!\x1b[0m"
IF randomnum = 5 THEN SAY "\x1b[33mUntil next time!\x1b[0m"

SAY ""

/* Log the logout */
CALL BBSLOG "info" "User " || username || " logged off"

/* Show final time */
logofftime = TIME()
SAY "Logout time: " || logofftime
SAY ""
