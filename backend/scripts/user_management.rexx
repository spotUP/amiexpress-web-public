/* User Management Demonstration */
/* Shows BBSGETUSER, BBSSETUSER, and related functions */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║                  USER MANAGEMENT DEMO                          ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()

/* Display current user info */
SAY "\x1b[33m━━━ CURRENT USER INFO ━━━\x1b[0m"
SAY "Username: \x1b[32m" || username || "\x1b[0m"
SAY "Security Level: \x1b[32m" || userlevel || "\x1b[0m"
SAY ""

/* Access level checks */
SAY "\x1b[33m━━━ ACCESS PRIVILEGES ━━━\x1b[0m"

/* Check various access levels */
levels = 10
DO level = 0 TO 250 BY 50
  hasaccess = BBSCHECKLEVEL(level)
  IF hasaccess = 1 THEN SAY "\x1b[32m✓\x1b[0m Level " || level || " access granted"
  IF hasaccess = 0 THEN SAY "\x1b[31m✗\x1b[0m Level " || level || " access denied"
END
SAY ""

/* Demonstrate access-restricted features */
SAY "\x1b[33m━━━ FEATURE ACCESS ━━━\x1b[0m"

SELECT
  WHEN BBSCHECKLEVEL(250) = 1 THEN
    DO
      SAY "\x1b[31m★ SYSOP FEATURES:\x1b[0m"
      SAY "  • User management"
      SAY "  • System configuration"
      SAY "  • Log viewing"
      SAY "  • All BBS functions"
    END
  WHEN BBSCHECKLEVEL(100) = 1 THEN
    DO
      SAY "\x1b[35m★ CO-SYSOP FEATURES:\x1b[0m"
      SAY "  • Message moderation"
      SAY "  • User viewing"
      SAY "  • Limited system access"
    END
  WHEN BBSCHECKLEVEL(50) = 1 THEN
    DO
      SAY "\x1b[33m★ TRUSTED USER FEATURES:\x1b[0m"
      SAY "  • File uploads"
      SAY "  • Extended messaging"
      SAY "  • Special conferences"
    END
  OTHERWISE
    DO
      SAY "\x1b[32m○ STANDARD USER FEATURES:\x1b[0m"
      SAY "  • Read messages"
      SAY "  • Post messages"
      SAY "  • Download files"
    END
END
SAY ""

/* Online user list */
SAY "\x1b[33m━━━ ONLINE USERS ━━━\x1b[0m"
onlinecount = BBSGETONLINECOUNT()
SAY "Total users online: \x1b[32m" || onlinecount || "\x1b[0m"

onlineusers = BBSGETONLINEUSERS()
SAY "Users: \x1b[32m" || onlineusers || "\x1b[0m"
SAY ""

/* Last caller info */
SAY "\x1b[33m━━━ LAST CALLER ━━━\x1b[0m"
lastcaller = BBSGETLASTCALLER()
SAY "Last user to call: \x1b[32m" || lastcaller || "\x1b[0m"
SAY ""

/* Send a private message example (commented out) */
SAY "\x1b[33m━━━ MESSAGING EXAMPLE ━━━\x1b[0m"
SAY "You can send private messages with:"
SAY "  BBSSENDPRIVATE(username, subject, body)"
SAY ""
SAY "\x1b[90m/* Example (commented):"
SAY "result = BBSSENDPRIVATE(\"Sysop\", \"Hello\", \"Testing AREXX!\")"
SAY "*/\x1b[0m"
SAY ""

/* Conference management */
SAY "\x1b[33m━━━ CONFERENCE INFO ━━━\x1b[0m"
currentconf = BBSGETCONF()
confname = BBSGETCONFNAME(currentconf)
totalconfs = BBSGETCONFERENCES()

SAY "Current: \x1b[32m" || currentconf || " - " || confname || "\x1b[0m"
SAY "Total conferences: \x1b[32m" || totalconfs || "\x1b[0m"

SAY ""
SAY "Available conferences:"
DO i = 1 TO totalconfs
  cname = BBSGETCONFNAME(i)
  IF i = currentconf THEN SAY "  → \x1b[32m" || i || ". " || cname || " (current)\x1b[0m"
  IF i ~= currentconf THEN SAY "    " || i || ". " || cname
END
SAY ""

SAY "\x1b[32m✓ User management demonstration complete!\x1b[0m"
SAY ""

CALL BBSLOG "info" "User " || username || " viewed user management demo"
