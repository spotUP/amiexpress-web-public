/* AmiExpress Statistics Script */
/* Shows BBS statistics */

SAY ""
SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║                    AMIEXPRESS BBS STATISTICS                   ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* User stats */
username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()

SAY "\x1b[33mYOUR STATISTICS:\x1b[0m"
SAY "Username: \x1b[32m" || username || "\x1b[0m"
SAY "Security Level: \x1b[32m" || userlevel || "\x1b[0m"
SAY ""

/* Conference stats */
conference = BBSGETCONF()
msgcount = BBSGETMSGCOUNT()

SAY "\x1b[33mCURRENT CONFERENCE:\x1b[0m"
SAY "Conference #: \x1b[32m" || conference || "\x1b[0m"
SAY "Total Messages: \x1b[32m" || msgcount || "\x1b[0m"
SAY ""

/* System stats */
currenttime = TIME()
currentdate = DATE()

SAY "\x1b[33mSYSTEM INFORMATION:\x1b[0m"
SAY "BBS Name: \x1b[32mAmiExpress Web\x1b[0m"
SAY "Version: \x1b[32m1.0\x1b[0m"
SAY "Current Time: \x1b[32m" || currenttime || "\x1b[0m"
SAY "Current Date: \x1b[32m" || currentdate || "\x1b[0m"
SAY ""

/* Log stats view */
CALL BBSLOG "info" "User " || username || " viewed statistics"
