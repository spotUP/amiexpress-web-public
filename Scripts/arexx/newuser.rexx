/* AmiExpress New User Script */
/* Executed for first-time users */

SAY ""
SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║              WELCOME NEW USER TO AMIEXPRESS!                   ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

username = BBSGETUSERNAME()
SAY "\x1b[32mGreetings, " || username || "!\x1b[0m"
SAY ""
SAY "Thank you for joining our BBS community. Here's what you need to know:"
SAY ""
SAY "\x1b[33m1. COMMANDS\x1b[0m"
SAY "   Type \x1b[36m?\x1b[0m to see available commands at any time."
SAY ""
SAY "\x1b[33m2. MESSAGES\x1b[0m"
SAY "   Press \x1b[36mR\x1b[0m to read messages"
SAY "   Press \x1b[36mA\x1b[0m to post a public message"
SAY "   Press \x1b[36mE\x1b[0m to send a private message"
SAY ""
SAY "\x1b[33m3. FILES\x1b[0m"
SAY "   Press \x1b[36mF\x1b[0m to browse file areas"
SAY "   Press \x1b[36mN\x1b[0m to see new files"
SAY "   Press \x1b[36mD\x1b[0m to download files"
SAY ""
SAY "\x1b[33m4. CONFERENCES\x1b[0m"
SAY "   Press \x1b[36mJ\x1b[0m to join a conference"
SAY "   Different conferences have different topics"
SAY ""
SAY "\x1b[33m5. HELP & SUPPORT\x1b[0m"
SAY "   Press \x1b[36mC\x1b[0m to comment to the Sysop"
SAY "   Press \x1b[36mO\x1b[0m to page the Sysop (if online)"
SAY ""

/* Post a welcome message to the user */
welcometext = "Welcome to AmiExpress BBS! We're glad to have you here."
msgid = BBSPOSTMSG("Welcome!", welcometext, 1, username)
IF msgid > 0 THEN SAY "\x1b[32mA welcome message has been posted to you.\x1b[0m"

/* Log new user */
CALL BBSLOG "info" "New user " || username || " completed orientation"

SAY ""
SAY "\x1b[32mPress any key to continue to the BBS...\x1b[0m"
