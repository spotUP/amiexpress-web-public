/* Advanced BBS Statistics */
/* Demonstrates new BBS functions */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║              ADVANCED BBS STATISTICS & INFO                    ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* Current user info */
username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()

SAY "\x1b[33m━━━ YOUR ACCOUNT ━━━\x1b[0m"
SAY "Username: \x1b[32m" || username || "\x1b[0m"
SAY "Security Level: \x1b[32m" || userlevel || "\x1b[0m"

/* Access level check */
IF BBSCHECKLEVEL(100) = 1 THEN SAY "Access: \x1b[35m★ PRIVILEGED USER\x1b[0m"
IF BBSCHECKLEVEL(250) = 1 THEN SAY "Access: \x1b[31m★★★ SYSOP\x1b[0m"
SAY ""

/* Online users */
SAY "\x1b[33m━━━ WHO'S ONLINE ━━━\x1b[0m"
onlinecount = BBSGETONLINECOUNT()
SAY "Users online: \x1b[32m" || onlinecount || "\x1b[0m"

onlineusers = BBSGETONLINEUSERS()
SAY "Online users: \x1b[32m" || onlineusers || "\x1b[0m"
SAY ""

/* Last caller */
SAY "\x1b[33m━━━ LAST CALLER ━━━\x1b[0m"
lastcaller = BBSGETLASTCALLER()
SAY "Last caller: \x1b[32m" || lastcaller || "\x1b[0m"
SAY ""

/* Conference information */
SAY "\x1b[33m━━━ CONFERENCE INFO ━━━\x1b[0m"
conference = BBSGETCONF()
confname = BBSGETCONFNAME()
totalconfs = BBSGETCONFERENCES()

SAY "Current conference: \x1b[32m" || conference || " - " || confname || "\x1b[0m"
SAY "Total conferences: \x1b[32m" || totalconfs || "\x1b[0m"
SAY ""

/* Message statistics */
SAY "\x1b[33m━━━ MESSAGE STATISTICS ━━━\x1b[0m"
msgcount = BBSGETMSGCOUNT()
SAY "Messages in current conference: \x1b[32m" || msgcount || "\x1b[0m"
SAY ""

/* System information */
SAY "\x1b[33m━━━ SYSTEM INFO ━━━\x1b[0m"
SAY "BBS Name: \x1b[32mAmiExpress Web\x1b[0m"
SAY "Version: \x1b[32m1.0\x1b[0m"
currenttime = TIME()
currentdate = DATE()
SAY "Current time: \x1b[32m" || currenttime || "\x1b[0m"
SAY "Current date: \x1b[32m" || currentdate || "\x1b[0m"
SAY ""

/* Activity chart */
SAY "\x1b[33m━━━ ACTIVITY CHART ━━━\x1b[0m"
DO i = 0 TO 23
  SELECT
    WHEN i >= 0 THEN IF i < 6 THEN SAY "  " || i || ":00 - Night   ░░░"
    WHEN i >= 6 THEN IF i < 12 THEN SAY "  " || i || ":00 - Morning ████"
    WHEN i >= 12 THEN IF i < 18 THEN SAY "  " || i || ":00 - Day     ██████"
    OTHERWISE SAY "  " || i || ":00 - Evening ███████"
  END
END
SAY ""

SAY "\x1b[32m✓ Statistics display complete!\x1b[0m"
SAY ""

CALL BBSLOG "info" "User " || username || " viewed advanced statistics"
