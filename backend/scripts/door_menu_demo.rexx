/* Door and Menu Functions Demonstration */
/* Shows BBSSHOWMENU, BBSLAUNCHDOOR, and file area functions */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║          DOOR & MENU FUNCTIONS DEMONSTRATION                   ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()

/* File Area Information */
SAY "\x1b[33m━━━ FILE AREA INFORMATION ━━━\x1b[0m"

totalareas = BBSGETFILEAREAS()
SAY "Total file areas: \x1b[32m" || totalareas || "\x1b[0m"

areaname = BBSGETAREANAME()
SAY "Current area: \x1b[32m" || areaname || "\x1b[0m"

filecount = BBSGETFILECOUNT()
SAY "Files in current area: \x1b[32m" || filecount || "\x1b[0m"
SAY ""

/* List all file areas */
SAY "\x1b[33m━━━ Available File Areas ━━━\x1b[0m"
DO i = 1 TO totalareas
  name = BBSGETAREANAME(i)
  count = BBSGETFILECOUNT(i)
  SAY "  " || i || ". \x1b[32m" || name || "\x1b[0m (" || count || " files)"
END
SAY ""

/* Search for files */
SAY "\x1b[33m━━━ File Search ━━━\x1b[0m"

/* Search for text files */
results = BBSSEARCHFILES("*.txt", 1)
IF LENGTH(results) > 0 THEN SAY "Text files: \x1b[32m" || results || "\x1b[0m"
IF LENGTH(results) = 0 THEN SAY "No text files found"
SAY ""

/* Menu Display */
SAY "\x1b[33m━━━ Menu System ━━━\x1b[0m"
SAY "Attempting to display menu..."
SAY ""

/* This would display a menu file if it exists */
/* CALL BBSSHOWMENU "main" */
SAY "\x1b[90m(Menu files would be displayed here)\x1b[0m"
SAY ""

/* Door Launching */
SAY "\x1b[33m━━━ Door/Game Launcher ━━━\x1b[0m"

/* Check access level for doors */
IF BBSCHECKLEVEL(50) = 1 THEN
  DO
    SAY "\x1b[32m✓ You have access to launch doors\x1b[0m"
    SAY ""
    SAY "Available Doors:"
    SAY "  1. \x1b[36mTradeWars 2002\x1b[0m - Space trading game"
    SAY "  2. \x1b[36mLord\x1b[0m - Legend of the Red Dragon"
    SAY "  3. \x1b[36mPirates\x1b[0m - High seas adventure"
    SAY "  4. \x1b[36mFossil Frenzy\x1b[0m - Puzzle game"
    SAY ""

    /* Example door launch (would actually launch door) */
    SAY "Example: Launching TradeWars 2002..."
    exitcode = BBSLAUNCHDOOR("tradewars", username, userlevel)

    IF exitcode = 0 THEN SAY "\x1b[32m✓ Door exited normally\x1b[0m"
    IF exitcode ~= 0 THEN SAY "\x1b[31m✗ Door error (code " || exitcode || ")\x1b[0m"
  END

IF BBSCHECKLEVEL(50) = 0 THEN
  DO
    SAY "\x1b[31m✗ Insufficient access level for doors\x1b[0m"
    SAY "  Required: Level 50+"
    SAY "  Your level: " || userlevel
  END

SAY ""

/* File Operations Summary */
SAY "\x1b[33m━━━ File Operations Summary ━━━\x1b[0m"
SAY "Statistics:"

onlinecount = BBSGETONLINECOUNT()
SAY "  • Users online: \x1b[32m" || onlinecount || "\x1b[0m"

conferences = BBSGETCONFERENCES()
SAY "  • Total conferences: \x1b[32m" || conferences || "\x1b[0m"

SAY "  • Total file areas: \x1b[32m" || totalareas || "\x1b[0m"
SAY "  • Current area files: \x1b[32m" || filecount || "\x1b[0m"
SAY ""

SAY "\x1b[32m✓ Door and menu demonstration complete!\x1b[0m"
SAY ""

CALL BBSLOG "info" "User " || username || " completed door/menu demo"
