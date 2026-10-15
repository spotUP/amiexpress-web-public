/* File Operations Demonstration */
/* Shows BBSREADFILE and BBSWRITEFILE functions */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║              FILE OPERATIONS DEMONSTRATION                     ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()

/* Write to a file */
SAY "\x1b[33m━━━ Writing to File ━━━\x1b[0m"

logdata = "User: " || username || " (Level " || userlevel || ")"
logdata = logdata || "\n" || "Date: " || DATE()
logdata = logdata || "\n" || "Time: " || TIME()
logdata = logdata || "\n" || "Action: File operations demo"

filename = "user_log.txt"
success = BBSWRITEFILE(filename, logdata, 0)

IF success = 1 THEN SAY "\x1b[32m✓ Successfully wrote to " || filename || "\x1b[0m"
IF success = 0 THEN SAY "\x1b[31m✗ Failed to write to " || filename || "\x1b[0m"
SAY ""

/* Append to a file */
SAY "\x1b[33m━━━ Appending to File ━━━\x1b[0m"

appenddata = "\n" || "Conference: " || BBSGETCONF()
appenddata = appenddata || "\n" || "Messages: " || BBSGETMSGCOUNT()
appenddata = appenddata || "\n" || "---"

success = BBSWRITEFILE(filename, appenddata, 1)

IF success = 1 THEN SAY "\x1b[32m✓ Successfully appended to " || filename || "\x1b[0m"
IF success = 0 THEN SAY "\x1b[31m✗ Failed to append to " || filename || "\x1b[0m"
SAY ""

/* Read from a file */
SAY "\x1b[33m━━━ Reading from File ━━━\x1b[0m"

content = BBSREADFILE(filename)

IF LENGTH(content) > 0 THEN
  DO
    SAY "\x1b[32m✓ Successfully read " || filename || "\x1b[0m"
    SAY ""
    SAY "\x1b[36mFile Contents:\x1b[0m"
    SAY "\x1b[90m─────────────────────────────────────\x1b[0m"
    SAY content
    SAY "\x1b[90m─────────────────────────────────────\x1b[0m"
  END

IF LENGTH(content) = 0 THEN SAY "\x1b[31m✗ Failed to read " || filename || "\x1b[0m"
SAY ""

/* Create a bulletin file */
SAY "\x1b[33m━━━ Creating Bulletin File ━━━\x1b[0m"

bulletin = "\x1b[36m╔════════════════════════════════════╗\x1b[0m\n"
bulletin = bulletin || "\x1b[36m║       SYSTEM BULLETIN              ║\x1b[0m\n"
bulletin = bulletin || "\x1b[36m╚════════════════════════════════════╝\x1b[0m\n"
bulletin = bulletin || "\n"
bulletin = bulletin || "Welcome to AmiExpress Web!\n"
bulletin = bulletin || "\n"
bulletin = bulletin || "Posted by: " || username || "\n"
bulletin = bulletin || "Date: " || DATE() || " " || TIME() || "\n"
bulletin = bulletin || "\n"
bulletin = bulletin || "This bulletin was created using AREXX\n"
bulletin = bulletin || "file operations.\n"

bulletinfile = "bulletin.txt"
success = BBSWRITEFILE(bulletinfile, bulletin, 0)

IF success = 1 THEN SAY "\x1b[32m✓ Created bulletin: " || bulletinfile || "\x1b[0m"
IF success = 0 THEN SAY "\x1b[31m✗ Failed to create bulletin\x1b[0m"
SAY ""

SAY "\x1b[32m✓ File operations demonstration complete!\x1b[0m"
SAY ""
SAY "\x1b[33mFiles created:\x1b[0m"
SAY "  • " || filename
SAY "  • " || bulletinfile
SAY ""

CALL BBSLOG "info" "User " || username || " completed file operations demo"
