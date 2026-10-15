/* AREXX SELECT/WHEN/OTHERWISE Demonstration */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║                SELECT/WHEN/OTHERWISE DEMO                      ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* Get current hour for time-based examples */
hour = TIME("H")

/* Basic SELECT example */
SAY "\x1b[33m1. Basic SELECT statement (time of day)\x1b[0m"
SELECT
  WHEN hour >= 5 THEN IF hour < 12 THEN SAY "  ☀ Good morning!"
  WHEN hour >= 12 THEN IF hour < 17 THEN SAY "  ☼ Good afternoon!"
  WHEN hour >= 17 THEN IF hour < 21 THEN SAY "  ★ Good evening!"
  OTHERWISE SAY "  ✧ Good night!"
END
SAY ""

/* Security level example */
SAY "\x1b[33m2. SELECT based on user level\x1b[0m"
userlevel = BBSGETUSERLEVEL()
SELECT
  WHEN userlevel >= 250 THEN SAY "  \x1b[31m★★★ SYSOP ACCESS ★★★\x1b[0m"
  WHEN userlevel >= 100 THEN SAY "  \x1b[35m★★ CO-SYSOP ACCESS ★★\x1b[0m"
  WHEN userlevel >= 50 THEN SAY "  \x1b[33m★ TRUSTED USER ★\x1b[0m"
  OTHERWISE SAY "  \x1b[32m○ STANDARD USER\x1b[0m"
END
SAY ""

/* Message count example */
SAY "\x1b[33m3. SELECT based on message count\x1b[0m"
msgcount = BBSGETMSGCOUNT()
SELECT
  WHEN msgcount = 0 THEN SAY "  No messages waiting"
  WHEN msgcount = 1 THEN SAY "  You have 1 message"
  WHEN msgcount < 5 THEN SAY "  You have " || msgcount || " messages"
  WHEN msgcount < 10 THEN SAY "  You have several messages (" || msgcount || ")"
  OTHERWISE SAY "  You have many messages! (" || msgcount || ")"
END
SAY ""

/* Online users example */
SAY "\x1b[33m4. SELECT based on online user count\x1b[0m"
onlinecount = BBSGETONLINECOUNT()
SELECT
  WHEN onlinecount = 1 THEN SAY "  You are alone on the BBS"
  WHEN onlinecount = 2 THEN SAY "  One other user is online"
  WHEN onlinecount < 5 THEN SAY "  " || (onlinecount - 1) || " other users online"
  OTHERWISE SAY "  BBS is busy! " || (onlinecount - 1) || " other users online"
END
SAY ""

/* Random selection example */
SAY "\x1b[33m5. Random selection (random quote)\x1b[0m"
randomnum = RANDOM(1, 4)
SELECT
  WHEN randomnum = 1 THEN SAY "  \"The only way to do great work is to love what you do.\" - Jobs"
  WHEN randomnum = 2 THEN SAY "  \"Stay hungry, stay foolish.\" - Jobs"
  WHEN randomnum = 3 THEN SAY "  \"Innovation distinguishes leaders from followers.\" - Jobs"
  OTHERWISE SAY "  \"Think different.\" - Apple"
END
SAY ""

SAY "\x1b[32m✓ SELECT/WHEN/OTHERWISE demonstration complete!\x1b[0m"
SAY ""

CALL BBSLOG "info" "User viewed SELECT statement demonstrations"
