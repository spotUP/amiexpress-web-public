/* AREXX Phase 4 Demo: SIGNAL and Label Control Flow */
/* Demonstrates goto-style jumps using SIGNAL */

SAY "\x1b[36m=== SIGNAL Demo ===\x1b[0m"
SAY ""

/* Example 1: Simple SIGNAL jump */
SAY "Starting execution..."
counter = 0

CheckValue:
counter = counter + 1
SAY "Counter: " || counter

IF counter < 3 THEN SIGNAL CheckValue

SAY "Counter reached 3, continuing..."
SAY ""

/* Example 2: Error handling with SIGNAL */
SAY "\x1b[33mDemonstrating error handling:\x1b[0m"
errorMode = 0

IF errorMode = 1 THEN SIGNAL ErrorHandler

SAY "No error occurred"
SIGNAL SkipError

ErrorHandler:
SAY "\x1b[31m[ERROR] An error was detected!\x1b[0m"
SAY "Handling error gracefully..."

SkipError:
SAY "Continuing after error check"
SAY ""

/* Example 3: Menu system using SIGNAL */
SAY "\x1b[36mSimulated menu navigation:\x1b[0m"
choice = 2

IF choice = 1 THEN SIGNAL Option1
IF choice = 2 THEN SIGNAL Option2
IF choice = 3 THEN SIGNAL Option3
SIGNAL InvalidChoice

Option1:
SAY "→ You selected Option 1: View Files"
SIGNAL MenuEnd

Option2:
SAY "→ You selected Option 2: Send Message"
SIGNAL MenuEnd

Option3:
SAY "→ You selected Option 3: Logoff"
SIGNAL MenuEnd

InvalidChoice:
SAY "→ Invalid choice!"

MenuEnd:
SAY ""

/* Example 4: Complex flow control */
SAY "\x1b[33mComplex flow control demo:\x1b[0m"
stage = "init"

MainLoop:
IF stage = "init" THEN DO
  SAY "Initializing..."
  stage = "process"
  SIGNAL MainLoop
END

IF stage = "process" THEN DO
  SAY "Processing data..."
  stage = "complete"
  SIGNAL MainLoop
END

IF stage = "complete" THEN DO
  SAY "Operation complete!"
  stage = "done"
END

IF stage = "done" THEN SIGNAL Finished

SAY "This should not appear"

Finished:
SAY ""
SAY "\x1b[32m✓ SIGNAL demo completed successfully!\x1b[0m"
SAY ""
SAY "SIGNAL allows for:"
SAY "  • Conditional jumps to labels"
SAY "  • Error handling workflows"
SAY "  • State machine implementations"
SAY "  • Menu navigation systems"
