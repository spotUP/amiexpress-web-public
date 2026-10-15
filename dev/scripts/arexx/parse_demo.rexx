/* PARSE Command Demonstration */
/* Shows various PARSE capabilities in AREXX */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║                 PARSE COMMAND DEMONSTRATION                    ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* PARSE VAR - Parse variable into parts */
SAY "\x1b[33m━━━ PARSE VAR Example ━━━\x1b[0m"
fullname = "John Q Public"
PARSE VAR fullname firstname middle lastname

SAY "Full name: " || fullname
SAY "First: \x1b[32m" || firstname || "\x1b[0m"
SAY "Middle: \x1b[32m" || middle || "\x1b[0m"
SAY "Last: \x1b[32m" || lastname || "\x1b[0m"
SAY ""

/* PARSE VALUE ... WITH - Parse expression result */
SAY "\x1b[33m━━━ PARSE VALUE...WITH Example ━━━\x1b[0m"
datetime = DATE() || " " || TIME()
PARSE VALUE datetime WITH datepart timepart

SAY "Date/Time: " || datetime
SAY "Date: \x1b[32m" || datepart || "\x1b[0m"
SAY "Time: \x1b[32m" || timepart || "\x1b[0m"
SAY ""

/* Parse user input */
SAY "\x1b[33m━━━ Parsing User Info ━━━\x1b[0m"
username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()
userinfo = username || " Level:" || userlevel

PARSE VALUE userinfo WITH uname rest
SAY "User info: " || userinfo
SAY "Parsed name: \x1b[32m" || uname || "\x1b[0m"
SAY "Parsed rest: \x1b[32m" || rest || "\x1b[0m"
SAY ""

/* Parse conference info */
SAY "\x1b[33m━━━ Parsing Conference Data ━━━\x1b[0m"
confid = BBSGETCONF()
confname = BBSGETCONFNAME()
confdata = "Conference " || confid || " is " || confname

PARSE VALUE confdata WITH w1 w2 w3 w4
SAY "Data: " || confdata
SAY "Word 1: \x1b[32m" || w1 || "\x1b[0m"
SAY "Word 2: \x1b[32m" || w2 || "\x1b[0m"
SAY "Word 3: \x1b[32m" || w3 || "\x1b[0m"
SAY "Word 4: \x1b[32m" || w4 || "\x1b[0m"
SAY ""

SAY "\x1b[32m✓ PARSE demonstration complete!\x1b[0m"
SAY ""

CALL BBSLOG "info" "User completed PARSE demo"
